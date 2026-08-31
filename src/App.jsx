import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { io } from 'socket.io-client';
import 'leaflet/dist/leaflet.css';

import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

const DefaultIcon = L.icon({
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

// --- Config -----------------------------------------------------------
// Move this to a .env file: REACT_APP_BACKEND_URL / VITE_BACKEND_URL
const BACKEND_URL =
  process.env.REACT_APP_BACKEND_URL ||
  'https://smart-city-backend-l3n3.onrender.com/';

const MOVE_THRESHOLD_METERS = 15; // don't emit unless moved at least this far
const MIN_EMIT_INTERVAL_MS = 5000; // ...or at least this much time has passed

// --- Stable per-device identity ----------------------------------------
// socket.id changes on every reconnect, so we generate our own persistent
// id once and store it locally. This is who "the user" is on the map,
// independent of the underlying transport connection.
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
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const clientId = getOrCreateClientId();

export default function App() {
  const [activeClients, setActiveClients] = useState({});
  const [isConnected, setIsConnected] = useState(false);
  const [isTracking, setIsTracking] = useState(false);
  const [geoError, setGeoError] = useState(null);

  const [roomInput, setRoomInput] = useState('');
  const [room, setRoom] = useState(null); // room the user has actually joined

  const socketRef = useRef(null);
  const watchIdRef = useRef(null);
  const lastSentRef = useRef({ position: null, time: 0 });

  // Connect the socket only once we have a room to join.
  useEffect(() => {
    if (!room) return;

    const socket = io(BACKEND_URL, {
      transports: ['websocket', 'polling']
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
      socket.emit('join-room', { room, clientId });
    });

    socket.on('disconnect', () => setIsConnected(false));

    socket.on('receive-location', (data) => {
      setActiveClients((prev) => ({
        ...prev,
        [data.clientId]: {
          latitude: data.latitude,
          longitude: data.longitude
        }
      }));
    });

    // Server tells everyone in the room when a member leaves.
    socket.on('member-left', ({ clientId: leftId }) => {
      setActiveClients((prev) => {
        const next = { ...prev };
        delete next[leftId];
        return next;
      });
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('receive-location');
      socket.off('member-left');
      socket.disconnect();
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [room]);

  const joinRoom = () => {
    const trimmed = roomInput.trim();
    if (!trimmed) return;
    setActiveClients({});
    setRoom(trimmed);
  };

  const leaveRoom = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setIsTracking(false);
    setActiveClients({});
    setRoom(null);
    setGeoError(null);
  };

  const startLiveTracking = () => {
    if (!navigator.geolocation) {
      setGeoError('Geolocation is not supported by your browser.');
      return;
    }

    setGeoError(null);
    setIsTracking(true);

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const current = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        };

        const now = Date.now();
        const { position: lastPos, time: lastTime } = lastSentRef.current;
        const moved = distanceMeters(lastPos, current);
        const elapsed = now - lastTime;

        // Throttle: only emit if the device moved enough, or enough
        // time has passed since the last emit (whichever comes first).
        if (moved < MOVE_THRESHOLD_METERS && elapsed < MIN_EMIT_INTERVAL_MS) {
          return;
        }

        lastSentRef.current = { position: current, time: now };

        socketRef.current?.emit('send-location', {
          clientId,
          room,
          latitude: current.latitude,
          longitude: current.longitude
        });
      },
      (err) => {
        setIsTracking(false);
        setGeoError(
          err.code === err.PERMISSION_DENIED
            ? 'Location permission denied. Enable it in your browser settings to share your position.'
            : `GPS error: ${err.message}`
        );
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 10000
      }
    );
  };

  const clientList = Object.entries(activeClients);

  // --- Room join screen --------------------------------------------------
  if (!room) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 font-sans">
        <div className="bg-white p-6 rounded-xl shadow-sm border w-full max-w-sm space-y-4">
          <h1 className="text-xl font-bold text-rose-800">Live GPS Sharing</h1>
          <p className="text-sm text-slate-500">
            Enter a room code to see and share locations only with people who
            know the same code. Anyone with the code can join, so treat it
            like a shared password.
          </p>
          <input
            type="text"
            value={roomInput}
            onChange={(e) => setRoomInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && joinRoom()}
            placeholder="Room code"
            className="w-full border rounded-lg px-3 py-2 text-sm"
          />
          <button
            onClick={joinRoom}
            disabled={!roomInput.trim()}
            className="w-full px-4 py-2 text-sm font-bold rounded-lg text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50"
          >
            Join Room
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6 space-y-4 font-sans">
      <header className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border">
        <div>
          <h1 className="text-xl font-bold text-rose-800">Live GPS Sharing</h1>
          <p className="text-xs text-slate-500">
            Room: <span className="font-mono">{room}</span> &middot; Status:{' '}
            {isConnected ? '🟢 Connected' : '🔴 Disconnected'}
          </p>
          <p className="text-xs text-slate-400">
            Active devices in room: {clientList.length}
          </p>
          {geoError && (
            <p className="text-xs text-rose-600 mt-1">{geoError}</p>
          )}
        </div>

        <div className="flex gap-2">
          <button
            onClick={startLiveTracking}
            disabled={isTracking}
            className={`px-4 py-2 text-xs font-bold rounded-lg text-white transition-all ${
              isTracking
                ? 'bg-emerald-600 cursor-default'
                : 'bg-rose-600 hover:bg-rose-700'
            }`}
          >
            {isTracking ? 'Streaming My GPS...' : 'Share My Live Location'}
          </button>
          <button
            onClick={leaveRoom}
            className="px-4 py-2 text-xs font-bold rounded-lg text-slate-600 bg-slate-100 hover:bg-slate-200"
          >
            Leave Room
          </button>
        </div>
      </header>

      <div className="h-[500px] rounded-xl overflow-hidden border shadow-sm">
        <MapContainer
          center={[26.7271, 88.3953]}
          zoom={5}
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {clientList.map(([id, client]) => (
            <Marker key={id} position={[client.latitude, client.longitude]}>
              <Popup>
                <strong>Device:</strong> {id === clientId ? 'You' : id.slice(0, 8)}
                <br />
                <strong>Lat:</strong> {client.latitude.toFixed(4)}
                <br />
                <strong>Lng:</strong> {client.longitude.toFixed(4)}
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}