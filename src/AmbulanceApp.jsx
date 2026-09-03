import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

// --- Config -----------------------------------------------------------
const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL ||
  'https://smart-city-backend-l3n3.onrender.com/';

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

// Ambulances move fast, so we emit more eagerly than the user app does.
// SEND_* keeps the server's picture of the ambulance fresh (this directly
// controls how quickly a nearby user's alert fires). MAP_MOVE_THRESHOLD is
// a separate, distance-only gate for redrawing the iframe, so the ambulance's
// own map doesn't blink from GPS jitter even while it's still emitting to
// the server every couple of seconds.
const SEND_MOVE_THRESHOLD_METERS = 10;
const SEND_HEARTBEAT_MS = 3000;
const MAP_MOVE_THRESHOLD_METERS = 15;

// A GPS fix that hasn't moved at least this far from the last one is too
// noisy to trust for a heading calculation (GPS jitter when near-stationary
// can swing the bearing wildly).
const MIN_MOVE_FOR_HEADING_M = 5;

const DEFAULT_CENTER = { lat: 26.7271, lng: 88.3953 };

// --- Stable per-tab identity ---------------------------------------------
// sessionStorage (not localStorage) — see the same note in UserApp.jsx.
// Prevents two ambulance tabs on one device from colliding onto one id.
function getOrCreateAmbulanceId() {
  const KEY = 'gps-app-ambulance-id';
  let id = sessionStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(KEY, id);
  }
  return id;
}

function toRad(d) {
  return (d * Math.PI) / 180;
}
function toDeg(r) {
  return (r * 180) / Math.PI;
}

function distanceMeters(a, b) {
  if (!a || !b) return Infinity;
  const R = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Compass bearing from point a to point b, 0-360, 0 = north. Same formula
// the server uses, so what we send lines up with its "aimed at the user"
// check.
function bearing(a, b) {
  const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat));
  const x =
    Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng));
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function buildMapSrc(position) {
  const center = position || DEFAULT_CENTER;
  const centerStr = `${center.lat},${center.lng}`;
  if (position) {
    return `https://www.google.com/maps/embed/v1/place?key=${GOOGLE_MAPS_API_KEY}&q=${centerStr}&zoom=17&maptype=roadmap`;
  }
  return `https://www.google.com/maps/embed/v1/view?key=${GOOGLE_MAPS_API_KEY}&center=${centerStr}&zoom=13&maptype=roadmap`;
}

const ambulanceId = getOrCreateAmbulanceId();

export default function AmbulanceApp({ onSwitchRole }) {
  const [isConnected, setIsConnected] = useState(false);
  const [isTracking, setIsTracking] = useState(false);
  const [geoError, setGeoError] = useState(null);
  const [myPosition, setMyPosition] = useState(null);
  const [heading, setHeading] = useState(null);
  const [speedKmh, setSpeedKmh] = useState(null);

  const socketRef = useRef(null);
  const watchIdRef = useRef(null);
  const lastFixRef = useRef({ position: null, time: 0 }); // last raw fix, for heading/speed derivation
  const lastSentRef = useRef({ position: null, time: 0 }); // throttles server emits
  const lastMapRef = useRef({ position: null, time: 0 }); // throttles map redraws (distance-only)

  useEffect(() => {
    const socket = io(BACKEND_URL, {
      transports: ['websocket', 'polling']
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
      socket.emit('register-ambulance', { ambulanceId });
    });
    socket.on('disconnect', () => setIsConnected(false));

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.disconnect();
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, []);

  const startLiveTracking = () => {
    if (!navigator.geolocation) {
      setGeoError('Geolocation is not supported by your browser.');
      return;
    }

    setGeoError(null);
    setIsTracking(true);

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        setGeoError(null);

        const current = {
          lat: position.coords.latitude,
          lng: position.coords.longitude
        };
        const now = Date.now();

        // --- Derive heading & speed -------------------------------------
        // Prefer the device-reported values (some phones fill these in
        // reliably while moving); fall back to computing them from
        // consecutive fixes otherwise.
        const { position: lastFixPos, time: lastFixTime } = lastFixRef.current;
        const fixDistance = distanceMeters(lastFixPos, current);
        const fixElapsedSec = (now - lastFixTime) / 1000;

        let nextHeading = heading;
        if (typeof position.coords.heading === 'number' && !Number.isNaN(position.coords.heading)) {
          nextHeading = position.coords.heading;
        } else if (lastFixPos && fixDistance >= MIN_MOVE_FOR_HEADING_M) {
          nextHeading = bearing(lastFixPos, current);
        }

        let nextSpeedMs = null;
        if (typeof position.coords.speed === 'number' && !Number.isNaN(position.coords.speed)) {
          nextSpeedMs = position.coords.speed;
        } else if (lastFixPos && fixElapsedSec > 0) {
          nextSpeedMs = fixDistance / fixElapsedSec;
        }

        lastFixRef.current = { position: current, time: now };
        setHeading(nextHeading);
        setSpeedKmh(nextSpeedMs != null ? Math.round(nextSpeedMs * 3.6) : null);

        // --- Send to server: distance OR heartbeat, whichever first -----
        const { position: lastSentPos, time: lastSentTime } = lastSentRef.current;
        const movedSinceSend = distanceMeters(lastSentPos, current);
        const elapsedSinceSend = now - lastSentTime;
        if (lastSentPos === null || movedSinceSend >= SEND_MOVE_THRESHOLD_METERS || elapsedSinceSend >= SEND_HEARTBEAT_MS) {
          lastSentRef.current = { position: current, time: now };
          socketRef.current?.emit('ambulance-location', {
            ambulanceId,
            latitude: current.lat,
            longitude: current.lng,
            heading: nextHeading,
            speed: nextSpeedMs // server expects m/s, matches coords.speed's unit
          });
        }

        // --- Redraw the map: distance-only, no timer override -----------
        const { position: lastMapPos } = lastMapRef.current;
        const movedSinceMap = distanceMeters(lastMapPos, current);
        if (lastMapPos === null || movedSinceMap >= MAP_MOVE_THRESHOLD_METERS) {
          lastMapRef.current = { position: current, time: now };
          setMyPosition(current);
        }
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          if (watchIdRef.current !== null) {
            navigator.geolocation.clearWatch(watchIdRef.current);
            watchIdRef.current = null;
          }
          setIsTracking(false);
          setGeoError(
            'Location permission denied. Enable it in your browser settings to broadcast your position.'
          );
        } else if (err.code === err.TIMEOUT) {
          setGeoError(
            'Still trying to get a GPS fix — this can take longer with weak signal (indoors, mobile data, etc).'
          );
        } else {
          setGeoError(`GPS signal issue: ${err.message}. Retrying...`);
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 2000,
        timeout: 20000
      }
    );
  };

  const stopBroadcasting = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setIsTracking(false);
    // Tell the server explicitly, rather than just going quiet — this lets
    // it immediately clear the alert on any user who currently has this
    // ambulance flagged, instead of leaving them stuck with a stale banner.
    socketRef.current?.emit('ambulance-stopped', { ambulanceId });
  };

  if (!GOOGLE_MAPS_API_KEY) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 font-sans">
        <div className="bg-white p-6 rounded-xl shadow-sm border max-w-md text-sm text-slate-600">
          Missing Google Maps API key. Set{' '}
          <code className="bg-slate-100 px-1 rounded">VITE_GOOGLE_MAPS_API_KEY</code>{' '}
          in your environment. Just enable "Maps Embed API" for it in Google
          Cloud Console — no billing account needed, it's free.
        </div>
      </div>
    );
  }

  const mapSrc = buildMapSrc(myPosition);

  return (
    <div className="min-h-screen bg-slate-50 p-6 space-y-4 font-sans">
      <header className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border">
        <div>
          <h1 className="text-xl font-bold text-red-800">🚑 Ambulance Broadcast</h1>
          <p className="text-xs text-slate-500">
            Status: {isConnected ? '🟢 Connected' : '🔴 Disconnected'}
          </p>
          {geoError && <p className="text-xs text-red-600 mt-1">{geoError}</p>}
        </div>

        <div className="flex items-center gap-2">
          {onSwitchRole && (
            <button
              onClick={onSwitchRole}
              className="px-3 py-2 text-xs font-semibold rounded-lg text-slate-500 hover:bg-slate-100 transition-all"
            >
              Switch role
            </button>
          )}
          <button
            onClick={isTracking ? stopBroadcasting : startLiveTracking}
            className={`px-4 py-2 text-xs font-bold rounded-lg text-white transition-all ${
              isTracking ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-700 hover:bg-red-800'
            }`}
          >
            {isTracking ? '⏹ Stop Broadcasting' : 'Start Broadcasting'}
          </button>
        </div>
      </header>

      {isTracking && (
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white p-4 rounded-xl shadow-sm border text-center">
            <p className="text-xs text-slate-500">Speed</p>
            <p className="text-2xl font-bold text-slate-800">
              {speedKmh != null ? `${speedKmh}` : '—'}
              <span className="text-sm font-normal text-slate-400"> km/h</span>
            </p>
          </div>
          <div className="bg-white p-4 rounded-xl shadow-sm border text-center">
            <p className="text-xs text-slate-500">Heading</p>
            <p className="text-2xl font-bold text-slate-800">
              {heading != null ? `${Math.round(heading)}°` : '—'}
            </p>
          </div>
        </div>
      )}

      <div className="h-[600px] rounded-xl overflow-hidden border shadow-sm bg-white">
        <iframe
          title="Map"
          width="100%"
          height="100%"
          style={{ border: 0 }}
          loading="lazy"
          src={mapSrc}
        />
      </div>
    </div>
  );
}
