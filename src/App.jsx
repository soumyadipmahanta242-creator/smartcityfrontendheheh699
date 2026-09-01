import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

// --- Config -----------------------------------------------------------
// Move these to a .env file:
// REACT_APP_BACKEND_URL / VITE_BACKEND_URL
// REACT_APP_GOOGLE_MAPS_API_KEY / VITE_GOOGLE_MAPS_API_KEY
//
// The Maps Embed API key just needs "Maps Embed API" enabled in Google
// Cloud Console — no billing account required, it's free.
const BACKEND_URL =
  process.env.REACT_APP_BACKEND_URL ||
  'https://smart-city-backend-l3n3.onrender.com/';

const GOOGLE_MAPS_API_KEY = process.env.REACT_APP_GOOGLE_MAPS_API_KEY || '';

const MOVE_THRESHOLD_METERS = 15; // don't emit unless moved at least this far
const MIN_EMIT_INTERVAL_MS = 5000; // ...or at least this much time has passed

// --- Stable per-device identity ----------------------------------------
// socket.id changes on every reconnect, so we generate our own persistent
// id once and store it locally. Sent along with each location update so
// server-side logs can be correlated to "the same device" over time.
function getOrCreateClientId() {
  const KEY = 'gps-app-client-id';
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
  }
  return id;
}

// Haversine distance in meters between two lat/lng points.
function distanceMeters(a, b) {
  if (!a || !b) return Infinity;
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const clientId = getOrCreateClientId();

export default function App() {
  const [isConnected, setIsConnected] = useState(false);
  const [isTracking, setIsTracking] = useState(false);
  const [geoError, setGeoError] = useState(null);
  const [myPosition, setMyPosition] = useState(null);

  const socketRef = useRef(null);
  const watchIdRef = useRef(null);
  const lastSentRef = useRef({ position: null, time: 0 });

  // Connect once on mount — one-way feed: this device's own location goes
  // to the server for logging, nothing is ever broadcast back.
  useEffect(() => {
    const socket = io(BACKEND_URL, {
      transports: ['websocket', 'polling']
    });
    socketRef.current = socket;

    socket.on('connect', () => setIsConnected(true));
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

        setMyPosition(current);

        const now = Date.now();
        const { position: lastPos, time: lastTime } = lastSentRef.current;
        const moved = distanceMeters(lastPos, current);
        const elapsed = now - lastTime;

        // Throttle what we send to the server (not what we show locally).
        if (moved < MOVE_THRESHOLD_METERS && elapsed < MIN_EMIT_INTERVAL_MS) {
          return;
        }

        lastSentRef.current = { position: current, time: now };

        socketRef.current?.emit('send-location', {
          clientId,
          latitude: current.lat,
          longitude: current.lng
        });
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          if (watchIdRef.current !== null) {
            navigator.geolocation.clearWatch(watchIdRef.current);
            watchIdRef.current = null;
          }
          setIsTracking(false);
          setGeoError(
            'Location permission denied. Enable it in your browser settings to share your position.'
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
        maximumAge: 5000,
        timeout: 20000
      }
    );
  };

  if (!GOOGLE_MAPS_API_KEY) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 font-sans">
        <div className="bg-white p-6 rounded-xl shadow-sm border max-w-md text-sm text-slate-600">
          Missing Google Maps API key. Set{' '}
          <code className="bg-slate-100 px-1 rounded">REACT_APP_GOOGLE_MAPS_API_KEY</code>{' '}
          in your environment. Just enable "Maps Embed API" for it in Google
          Cloud Console — no billing account needed, it's free.
        </div>
      </div>
    );
  }

  // Maps Embed API URLs — plain iframes, no SDK, no billing required.
  const satelliteSrc = myPosition
    ? `https://www.google.com/maps/embed/v1/view?key=${GOOGLE_MAPS_API_KEY}&center=${myPosition.lat},${myPosition.lng}&zoom=18&maptype=satellite`
    : null;

  const streetViewSrc = myPosition
    ? `https://www.google.com/maps/embed/v1/streetview?key=${GOOGLE_MAPS_API_KEY}&location=${myPosition.lat},${myPosition.lng}&heading=0&pitch=0&fov=90`
    : null;

  return (
    <div className="min-h-screen bg-slate-50 p-6 space-y-4 font-sans">
      <header className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border">
        <div>
          <h1 className="text-xl font-bold text-rose-800">My Live Location</h1>
          <p className="text-xs text-slate-500">
            Status: {isConnected ? '🟢 Connected' : '🔴 Disconnected'}
          </p>
          {geoError && (
            <p className="text-xs text-rose-600 mt-1">{geoError}</p>
          )}
        </div>

        <button
          onClick={startLiveTracking}
          disabled={isTracking}
          className={`px-4 py-2 text-xs font-bold rounded-lg text-white transition-all ${
            isTracking ? 'bg-emerald-600 cursor-default' : 'bg-rose-600 hover:bg-rose-700'
          }`}
        >
          {isTracking ? 'Streaming My GPS...' : 'Share My Live Location'}
        </button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="h-[500px] rounded-xl overflow-hidden border shadow-sm bg-white">
          <p className="text-xs font-semibold text-slate-500 px-3 py-2 border-b">
            Satellite
          </p>
          {satelliteSrc ? (
            <iframe
              title="Satellite view"
              width="100%"
              height="100%"
              style={{ border: 0 }}
              loading="lazy"
              src={satelliteSrc}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-xs text-slate-400 text-center px-4">
              Waiting for your location...
            </div>
          )}
        </div>

        <div className="h-[500px] rounded-xl overflow-hidden border shadow-sm bg-white">
          <p className="text-xs font-semibold text-slate-500 px-3 py-2 border-b">
            Street View
          </p>
          {streetViewSrc ? (
            <iframe
              title="Street view"
              width="100%"
              height="100%"
              style={{ border: 0 }}
              loading="lazy"
              src={streetViewSrc}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-xs text-slate-400 text-center px-4">
              Waiting for your location...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
