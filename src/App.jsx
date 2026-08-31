import React, { useState, useEffect } from 'react';
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

const socket = io('https://smart-city-backend-l3n3.onrender.com/', {
  transports: ['websocket', 'polling']
});

export default function App() {
  // Store multiple devices by socket.id: { socketId: { latitude, longitude, ip } }
  const [activeClients, setActiveClients] = useState({});
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [isTracking, setIsTracking] = useState(false);

  useEffect(() => {
    socket.on('connect', () => setIsConnected(true));
    socket.on('disconnect', () => setIsConnected(false));

    // Listen for location updates from ANY client
    socket.on('receive-location', (data) => {
      setActiveClients((prev) => ({
        ...prev,
        [data.id]: {
          latitude: data.latitude,
          longitude: data.longitude,
          ip: data.ip || 'Unknown'
        }
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
      alert("Geolocation is not supported by your browser");
      return;
    }

    setIsTracking(true);

    navigator.geolocation.watchPosition(
      (position) => {
        const payload = {
          id: socket.id, // Sends their unique socket ID
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        };
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

  const clientList = Object.entries(activeClients);

  return (
    <div className="min-h-screen bg-slate-50 p-6 space-y-4 font-sans">
      <header className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border">
        <div>
          <h1 className="text-xl font-bold text-rose-800">ALOO PIYAZZZZ GPS</h1>
          <p className="text-xs text-slate-500">
            Status: {isConnected ? '🟢 Connected to Server' : '🔴 Disconnected'}
          </p>
          <p className="text-xs text-slate-400">
            Active Tracked Devices: {clientList.length}
          </p>
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
        <MapContainer center={[26.7271, 88.3953]} zoom={5} style={{ height: '100%', width: '100%' }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {/* Render a marker for EVERY active client */}
          {clientList.map(([id, client]) => (
            <Marker key={id} position={[client.latitude, client.longitude]}>
              <Popup>
                <strong>ID:</strong> {id}<br />
                <strong>IP:</strong> {client.ip}<br />
                <strong>Lat:</strong> {client.latitude.toFixed(4)}<br />
                <strong>Lng:</strong> {client.longitude.toFixed(4)}
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}