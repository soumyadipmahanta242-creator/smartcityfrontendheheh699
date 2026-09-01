import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
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

// Esri World Imagery — free, no API key required, true satellite/aerial tiles.
const SATELLITE_TILE_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const SATELLITE_ATTRIBUTION =
  'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community';

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

// --- Map view control ---------------------------------------------------
// Lives inside <MapContainer> so it can grab the underlying Leaflet map
// instance via useMap() and imperatively fly to the user's own position
// as it updates — react-leaflet doesn't re-pan the map on prop changes.
function MapViewController({ position }) {
  const map = useMap();
  const hasFitOnce = useRef(false);

  useEffect(() => {
    if (!position) return;
    map.flyTo([position.latitude, position.longitude], 17, {
      duration: hasFitOnce.current ? 1 : 0
    });
    hasFitOnce.current = true;
  }, [position, map]);

  return null;
}

export default function App() {
  const [isConnected, setIsConnected] = useState(false);
  const [isTracking, setIsTracking] = useState(false);
  const [geoError, setGeoError] = useState(null);
  const [myPosition, setMyPosition] = useState(null);

  const socketRef = useRef(null);
  const watchIdRef = useRef(null);
  const lastSentRef = useRef({ position: null, time: 0 });

  // Connect once on mount — no room/join step, this connection only ever
  // sends this device's own location to the server for logging. The
  // server never broadcasts any location back to any client.
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
        setGeoError(null); // a successful reading clears any prior warning

        const current = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        };

        setMyPosition(current); // always update the on-screen marker

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
          latitude: current.latitude,
          longitude: current.longitude
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

      <div className="h-[500px] rounded-xl overflow-hidden border shadow-sm">
        <MapContainer
          center={myPosition ? [myPosition.latitude, myPosition.longitude] : [26.7271, 88.3953]}
          zoom={myPosition ? 17 : 5}
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            attribution={SATELLITE_ATTRIBUTION}
            url={SATELLITE_TILE_URL}
            maxZoom={19}
          />

          <MapViewController position={myPosition} />

          {myPosition && (
            <Marker position={[myPosition.latitude, myPosition.longitude]}>
              <Popup>
                <strong>You</strong>
                <br />
                <strong>Lat:</strong> {myPosition.latitude.toFixed(4)}
                <br />
                <strong>Lng:</strong> {myPosition.longitude.toFixed(4)}
              </Popup>
            </Marker>
          )}
        </MapContainer>
      </div>
    </div>
  );
}
