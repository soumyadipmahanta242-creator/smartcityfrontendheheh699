import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

// --- Config -----------------------------------------------------------
// This is a Vite project, so env vars must be prefixed VITE_ and read via
// import.meta.env — NOT process.env.
//
// Set these in a .env file at your project root:
// VITE_BACKEND_URL=...
// VITE_GOOGLE_MAPS_API_KEY=...
//
// The Maps Embed API key just needs "Maps Embed API" enabled in Google
// Cloud Console — no billing account required, it's free.
const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL ||
  'https://smart-city-backend-l3n3.onrender.com/';

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

const MOVE_THRESHOLD_METERS = 20; // don't emit unless moved at least this far
const MIN_EMIT_INTERVAL_MS = 8000; // ...or at least this much time has passed

// Shown before the user ever shares their location, and as the fallback
// center whenever there's no live position yet.
const DEFAULT_CENTER = { lat: 26.7271, lng: 88.3953 };

const VIEW_MODES = [
  { id: 'streetview', label: 'Street View' },
  { id: 'roadmap', label: 'Roadmap (Drive/Walk)' },
  { id: 'satellite', label: 'Satellite' }
];

// --- Stable per-device identity ----------------------------------------
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

// Builds the Maps Embed API iframe URL for the current view mode.
// Note: the Embed API only supports "roadmap" and "satellite" as maptype
// values — "hybrid" isn't available here (that's a full JS API feature),
// so "roadmap" (roads + labels, the same style Google Maps navigation
// itself uses) stands in for a drive/walk-friendly view.
// - roadmap/satellite: uses "place" mode once a real position exists, which
//   drops a pin (pointer) at that exact coordinate and moves as it updates.
//   Before that, falls back to plain "view" mode centered on DEFAULT_CENTER
//   with no pin, so there's always something sensible on screen.
// - streetview: centers the panorama on the live position, or the default
//   center before tracking starts.
function buildMapSrc(mode, position) {
  const center = position || DEFAULT_CENTER;
  const centerStr = `${center.lat},${center.lng}`;

  if (mode === 'streetview') {
    return `https://www.google.com/maps/embed/v1/streetview?key=${GOOGLE_MAPS_API_KEY}&location=${centerStr}&heading=0&pitch=0&fov=90`;
  }

  const maptype = mode === 'satellite' ? 'satellite' : 'roadmap';

  if (position) {
    return `https://www.google.com/maps/embed/v1/place?key=${GOOGLE_MAPS_API_KEY}&q=${centerStr}&zoom=18&maptype=${maptype}`;
  }

  return `https://www.google.com/maps/embed/v1/view?key=${GOOGLE_MAPS_API_KEY}&center=${centerStr}&zoom=13&maptype=${maptype}`;
}

const clientId = getOrCreateClientId();

export default function App() {
  const [isConnected, setIsConnected] = useState(false);
  const [isTracking, setIsTracking] = useState(false);
  const [geoError, setGeoError] = useState(null);
  const [myPosition, setMyPosition] = useState(null);
  const [viewMode, setViewMode] = useState('satellite');

  const socketRef = useRef(null);
  const watchIdRef = useRef(null);
  const lastSentRef = useRef({ position: null, time: 0 });

  // One-way feed: this device's own location goes to the server for
  // logging, nothing is ever broadcast back.
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

        const now = Date.now();
        const { position: lastPos, time: lastTime } = lastSentRef.current;
        const moved = distanceMeters(lastPos, current);
        const elapsed = now - lastTime;

        // Throttle BOTH the on-screen marker and the server emit together.
        // The satellite/hybrid iframe does a full reload every time
        // myPosition changes, so updating it on every raw GPS reading
        // (which can fire every second or two) was causing constant heavy
        // reloads — that's what was making the app feel slow.
        if (moved < MOVE_THRESHOLD_METERS && elapsed < MIN_EMIT_INTERVAL_MS) {
          return;
        }

        lastSentRef.current = { position: current, time: now };
        setMyPosition(current);

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
          <code className="bg-slate-100 px-1 rounded">VITE_GOOGLE_MAPS_API_KEY</code>{' '}
          in your environment. Just enable "Maps Embed API" for it in Google
          Cloud Console — no billing account needed, it's free.
        </div>
      </div>
    );
  }

  const mapSrc = buildMapSrc(viewMode, myPosition);

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

      <div className="flex gap-2 bg-white p-3 rounded-xl shadow-sm border">
        {VIEW_MODES.map((mode) => (
          <button
            key={mode.id}
            onClick={() => setViewMode(mode.id)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-full transition-all ${
              viewMode === mode.id
                ? 'bg-rose-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {mode.label}
          </button>
        ))}
      </div>

      <div className="h-[600px] rounded-xl overflow-hidden border shadow-sm bg-white">
        <iframe
          key={viewMode} // force a clean reload when switching modes
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
