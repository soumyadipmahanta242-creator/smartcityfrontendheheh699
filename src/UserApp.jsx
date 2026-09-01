import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

// --- Config -----------------------------------------------------------
// This is a Vite project, so env vars must be prefixed VITE_ and read via
// import.meta.env — NOT process.env.
//
// Set these in a .env file at your project root:
// VITE_BACKEND_URL=...
// VITE_GOOGLE_MAPS_API_KEY=...
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
// Separate localStorage key from the ambulance app so the same browser
// can be used to test both roles without id collisions.
function getOrCreateUserId() {
  const KEY = 'gps-app-user-id';
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

// A short two-pulse beep so an alert is noticeable even if you're not
// looking at the screen. Uses the Web Audio API, no asset files needed.
function playAlertBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const pulse = (startTime) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.001, startTime);
      gain.gain.exponentialRampToValueAtTime(0.2, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + 0.2);
    };
    pulse(ctx.currentTime);
    pulse(ctx.currentTime + 0.25);
  } catch {
    // Web Audio not available — fail silently, the visual banner still shows.
  }
}

// Builds the Maps Embed API iframe URL for the current view mode.
// - roadmap/satellite, no active ambulance: "place" mode drops a pin at
//   the user's own position.
// - roadmap/satellite, WITH an active ambulance alert: "directions" mode,
//   so the user can actually see the ambulance's position relative to
//   theirs and the route between them (this is the closest the free Embed
//   API gets to "show two live markers on one map").
// - streetview: always centered on the user's own live position.
function buildMapSrc(mode, position, ambulancePosition) {
  const center = position || DEFAULT_CENTER;
  const centerStr = `${center.lat},${center.lng}`;

  if (mode === 'streetview') {
    return `https://www.google.com/maps/embed/v1/streetview?key=${GOOGLE_MAPS_API_KEY}&location=${centerStr}&heading=0&pitch=0&fov=90`;
  }

  const maptype = mode === 'satellite' ? 'satellite' : 'roadmap';

  if (ambulancePosition && position) {
    const origin = `${ambulancePosition.lat},${ambulancePosition.lng}`;
    return `https://www.google.com/maps/embed/v1/directions?key=${GOOGLE_MAPS_API_KEY}&origin=${origin}&destination=${centerStr}&mode=driving&maptype=${maptype}`;
  }

  if (position) {
    return `https://www.google.com/maps/embed/v1/place?key=${GOOGLE_MAPS_API_KEY}&q=${centerStr}&zoom=18&maptype=${maptype}`;
  }

  return `https://www.google.com/maps/embed/v1/view?key=${GOOGLE_MAPS_API_KEY}&center=${centerStr}&zoom=13&maptype=${maptype}`;
}

const userId = getOrCreateUserId();

export default function UserApp({ onSwitchRole }) {
  const [isConnected, setIsConnected] = useState(false);
  const [isTracking, setIsTracking] = useState(false);
  const [geoError, setGeoError] = useState(null);
  const [myPosition, setMyPosition] = useState(null);
  const [viewMode, setViewMode] = useState('satellite');

  // Keyed by ambulanceId, so more than one approaching ambulance is
  // handled sanely: { [ambulanceId]: { lat, lng, distance, speedKmh,
  // heading, alertedAt } }
  const [activeAmbulances, setActiveAmbulances] = useState({});

  // For requesting the (optional) OS-level notification once.
  const notifPermissionRequested = useRef(false);

  const socketRef = useRef(null);
  const watchIdRef = useRef(null);
  const lastSentRef = useRef({ position: null, time: 0 });

  useEffect(() => {
    const socket = io(BACKEND_URL, {
      transports: ['websocket', 'polling']
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
      socket.emit('register-user', { userId });
    });
    socket.on('disconnect', () => setIsConnected(false));

    socket.on('ambulance-alert', (data) => {
      setActiveAmbulances((prev) => ({
        ...prev,
        [data.ambulanceId]: { ...data, alertedAt: Date.now() }
      }));
      playAlertBeep();
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification('🚨 Ambulance approaching', {
          body: `About ${data.distance}m away and closing in on your route.`
        });
      }
    });

    socket.on('ambulance-update', (data) => {
      setActiveAmbulances((prev) =>
        prev[data.ambulanceId]
          ? { ...prev, [data.ambulanceId]: { ...prev[data.ambulanceId], ...data } }
          : prev
      );
    });

    socket.on('ambulance-cleared', ({ ambulanceId }) => {
      setActiveAmbulances((prev) => {
        const next = { ...prev };
        delete next[ambulanceId];
        return next;
      });
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('ambulance-alert');
      socket.off('ambulance-update');
      socket.off('ambulance-cleared');
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

    // Best-effort ask for OS notification permission so alerts can still
    // reach the user if they've switched tabs/apps. Not required — the
    // in-app banner + beep work regardless of the answer.
    if (!notifPermissionRequested.current && typeof Notification !== 'undefined') {
      notifPermissionRequested.current = true;
      Notification.requestPermission().catch(() => {});
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

        // Throttle BOTH the on-screen marker and the server emit together
        // so the map iframe (which reloads on every position change)
        // doesn't reload on every raw GPS reading.
        if (moved < MOVE_THRESHOLD_METERS && elapsed < MIN_EMIT_INTERVAL_MS) {
          return;
        }

        lastSentRef.current = { position: current, time: now };
        setMyPosition(current);

        socketRef.current?.emit('user-location', {
          userId,
          latitude: current.lat,
          longitude: current.lng,
          heading: typeof position.coords.heading === 'number' ? position.coords.heading : null
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

  const ambulanceList = Object.entries(activeAmbulances).map(([id, a]) => ({ id, ...a }));
  // If more than one ambulance is active, route the map to the nearest one.
  const nearestAmbulance = ambulanceList.length
    ? ambulanceList.reduce((a, b) => (a.distance <= b.distance ? a : b))
    : null;

  const mapSrc = buildMapSrc(
    viewMode,
    myPosition,
    nearestAmbulance ? { lat: nearestAmbulance.lat, lng: nearestAmbulance.lng } : null
  );

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
            onClick={startLiveTracking}
            disabled={isTracking}
            className={`px-4 py-2 text-xs font-bold rounded-lg text-white transition-all ${
              isTracking ? 'bg-emerald-600 cursor-default' : 'bg-rose-600 hover:bg-rose-700'
            }`}
          >
            {isTracking ? 'Streaming My GPS...' : 'Share My Live Location'}
          </button>
        </div>
      </header>

      {ambulanceList.length > 0 && (
        <div className="space-y-2">
          {ambulanceList.map((amb) => (
            <div
              key={amb.id}
              className="bg-red-600 text-white p-4 rounded-xl shadow-sm border border-red-700 animate-pulse"
            >
              <p className="font-bold text-sm">🚨 Ambulance approaching your route</p>
              <p className="text-xs mt-1 opacity-90">
                Distance: <strong>{amb.distance}m</strong>
                {amb.speedKmh != null && (
                  <>
                    {' '}
                    · Speed: <strong>{amb.speedKmh} km/h</strong>
                  </>
                )}
                {amb.speedKmh > 0 && (
                  <>
                    {' '}
                    · ETA: <strong>~{Math.max(1, Math.round(amb.distance / (amb.speedKmh * 1000 / 3600)))}s</strong>
                  </>
                )}
              </p>
              <p className="text-xs mt-1 opacity-75">Please pull over safely and let it pass.</p>
            </div>
          ))}
        </div>
      )}

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
          key={`${viewMode}-${nearestAmbulance ? nearestAmbulance.id : 'none'}`}
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
