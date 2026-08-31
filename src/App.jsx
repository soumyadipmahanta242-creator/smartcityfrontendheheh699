import React, { useState, useEffect } from 'react';
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

// Establish single socket connection to server
// Works 24/7 globally without ngrok or local terminal running!
const socket = io('https://smart-city-backend-l3n3.onrender.com/', {
  transports: ['websocket', 'polling']
});

function ChangeView({ center }) {
  const map = useMap();
  map.setView(center, map.getZoom());
  return null;
}

export default function App() {
  const [gpsData, setGpsData] = useState({
    latitude: 26.7271,
    longitude: 88.3953,
    id: "AMB-9110"
  });
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [isTracking, setIsTracking] = useState(false);

  useEffect(() => {
    // Check connection status
    socket.on('connect', () => setIsConnected(true));
    socket.on('disconnect', () => setIsConnected(false));

    // Listen for incoming broadcast updates from backend
    socket.on('receive-location', (data) => {
      setGpsData((prev) => ({
        ...prev,
        latitude: data.latitude,
        longitude: data.longitude
      }));
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('receive-location');
    };
  }, []);

  const startLiveTracking = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported");
      return;
    }

    setIsTracking(true);

    navigator.geolocation.watchPosition(
      (position) => {
        const payload = {
          id: "AMB-9110",
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        };

        // Emit instant event directly over open socket pipe
        socket.emit('send-location', payload);
      },
      (err) => console.error("GPS Error:", err),
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 5000
      }
    );
  };

  const centerPosition = [gpsData.latitude, gpsData.longitude];

  return (
    <div className="min-h-screen bg-slate-50 p-6 space-y-4 font-sans">
      <header className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border">
        <div>
          <h1 className="text-xl font-bold" style={{ color: '#960505' }}>
  ALOO PIYAZZZZ GPS
</h1>
          <p className="text-xs text-slate-500">
            Status: {isConnected ? '🟢 Connected to Server' : '🔴 Disconnected'}
          </p>
          <p className="text-xs text-slate-400">
            Lat: {gpsData.latitude.toFixed(6)} | Lng: {gpsData.longitude.toFixed(6)}
          </p>
        </div>
        
        <button 
          onClick={startLiveTracking}
          disabled={isTracking}
          className={`px-4 py-2 text-xs font-bold rounded-lg text-white transition-all ${
            isTracking ? 'bg-emerald-600 cursor-default' : 'bg-rose-600 hover:bg-rose-700'
          }`}
        >
          {isTracking ? 'Streaming GPS Live...' : 'Click to enable live location'}
        </button>
      </header>

      <div className="h-[500px] rounded-xl overflow-hidden border shadow-sm">
        <MapContainer center={centerPosition} zoom={16} style={{ height: '100%', width: '100%' }}>
          <ChangeView center={centerPosition} />
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Marker position={centerPosition}>
            <Popup>
              <strong>{gpsData.id}</strong><br />
              Status: Live WebSocket Stream
            </Popup>
          </Marker>
        </MapContainer>
      </div>
    </div>
  );
}