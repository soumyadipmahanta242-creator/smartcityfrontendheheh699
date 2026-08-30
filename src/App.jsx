import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
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

// Dynamic map view centering component
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
  const [isTracking, setIsTracking] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  // Start continuous GPS tracking using Browser Geolocation API
  const startLiveTracking = () => {
    if (!navigator.geolocation) {
      setErrorMessage("Geolocation is not supported by your browser");
      return;
    }

    setIsTracking(true);
    setErrorMessage("");

    // watchPosition fires every time the device's physical location updates
    navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        
        // Update local map state immediately
        setGpsData((prev) => ({
          ...prev,
          latitude,
          longitude
        }));

        // Broadcast coordinates to Node.js backend
        fetch('http://localhost:5000/api/ambulance/gps', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ latitude, longitude })
        }).catch(err => console.error("Error sending GPS data to server:", err));
      },
      (error) => {
        console.error("Geolocation Error:", error);
        setErrorMessage("Please grant location permissions in your browser.");
      },
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
          <h1 className="text-xl font-bold text-rose-600">Ambulance GPS Tracker</h1>
          <p className="text-xs text-slate-500">
            Latitude: {gpsData.latitude.toFixed(6)} | Longitude: {gpsData.longitude.toFixed(6)}
          </p>
        </div>
        
        <button 
          onClick={startLiveTracking}
          disabled={isTracking}
          className={`px-4 py-2 text-xs font-bold rounded-lg text-white transition-all ${
            isTracking ? 'bg-emerald-600 cursor-default' : 'bg-rose-600 hover:bg-rose-700'
          }`}
        >
          {isTracking ? 'Live Tracking Active' : 'Show My Real-Time Location'}
        </button>
      </header>

      {errorMessage && (
        <div className="p-3 bg-rose-100 text-rose-700 text-xs rounded-lg font-medium">
          {errorMessage}
        </div>
      )}

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
              Status: Live Active Location
            </Popup>
          </Marker>
        </MapContainer>
      </div>
    </div>
  );
}