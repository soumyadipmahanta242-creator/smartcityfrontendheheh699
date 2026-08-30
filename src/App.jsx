import React, { useState, useEffect } from 'react';

export default function App() {
  const [activeAmbulance, setActiveAmbulance] = useState(null);

  useEffect(() => {
    // Fetch telemetry from express backend
    fetch('http://localhost:5000/api/ambulance')
      .then((res) => res.json())
      .then((data) => setActiveAmbulance(data))
      .catch((err) => console.error("Error connecting to backend:", err));
  }, []);

  if (!activeAmbulance) {
    return <div className="p-6 text-center text-slate-500">Connecting to Emergency Server...</div>;
  }

  return (
    <div>
      <h1>{activeAmbulance.id}</h1>
      <p>Distance: {activeAmbulance.distance}</p>
      <p>Status: {activeAmbulance.status}</p>
    </div>
  );
}

import React, { useState } from 'react';
import { 
  Siren, 
  MapPin, 
  Navigation, 
  PhoneCall, 
  Volume2, 
  ShieldAlert, 
  Clock, 
  Gauge,
  Activity,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';

export default function App() {
  const [activeAmbulance] = useState({
    id: "AMB-9110",
    distance: "1.2 km",
    eta: "3 mins",
    speed: "78 km/h",
    status: "Priority Response",
    driver: "Rajesh Kumar",
    hospital: "City Care Hospital"
  });

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans antialiased">
      {/* Top Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50 px-6 py-4 shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-rose-100 p-2.5 rounded-xl text-rose-600 border border-rose-200">
              <Siren className="h-6 w-6 animate-pulse" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight" style={{ color: '#e11d48' }}>
  Emergency Vehicle Update System
  
</h1>
              <p className="text-xs text-slate-500 font-medium">Emergency Corridor Tracking System</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-emerald-50 text-emerald-700 text-xs font-semibold px-3 py-1.5 rounded-full border border-emerald-200">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              System Online
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="p-6 max-w-7xl mx-auto space-y-6">

        {/* Priority Emergency Notification */}
        <div className="bg-rose-600 rounded-2xl p-5 text-white shadow-lg shadow-rose-200 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="bg-white/20 p-3 rounded-xl backdrop-blur-md">
              <ShieldAlert className="h-7 w-7 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider bg-white text-rose-700 px-2 py-0.5 rounded">
                  Active Priority
                </span>
                <span className="text-xs text-rose-100">Zone: Sector 4 Highway</span>
              </div>
              <h2 className="text-lg font-bold mt-0.5">
                Ambulance Approaching — Please Clear the Corridor
              </h2>
            </div>
          </div>
          <button className="w-full md:w-auto bg-white hover:bg-slate-100 text-rose-700 font-semibold text-xs px-5 py-3 rounded-xl transition-all shadow-sm flex items-center justify-center gap-2">
            <Volume2 className="h-4 w-4" /> Mute Alarm
          </button>
        </div>

        {/* Key Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Target Vehicle</p>
                <h3 className="text-2xl font-bold mt-1 text-slate-900">{activeAmbulance.id}</h3>
              </div>
              <div className="p-2.5 bg-rose-50 text-rose-600 rounded-lg border border-rose-100">
                <Siren className="h-5 w-5" />
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-500 pt-2 border-t border-slate-100">Driver: <span className="text-slate-800 font-semibold">{activeAmbulance.driver}</span></p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Distance</p>
                <h3 className="text-2xl font-bold mt-1 text-amber-600">{activeAmbulance.distance}</h3>
              </div>
              <div className="p-2.5 bg-amber-50 text-amber-600 rounded-lg border border-amber-100">
                <MapPin className="h-5 w-5" />
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-500 pt-2 border-t border-slate-100">Estimated Arrival: <span className="text-amber-600 font-bold">{activeAmbulance.eta}</span></p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Speed</p>
                <h3 className="text-2xl font-bold mt-1 text-blue-600">{activeAmbulance.speed}</h3>
              </div>
              <div className="p-2.5 bg-blue-50 text-blue-600 rounded-lg border border-blue-100">
                <Gauge className="h-5 w-5" />
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-500 pt-2 border-t border-slate-100">Status: <span className="text-blue-600 font-semibold">{activeAmbulance.status}</span></p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Destination</p>
                <h3 className="text-lg font-bold mt-1 text-emerald-600 truncate">{activeAmbulance.hospital}</h3>
              </div>
              <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-lg border border-emerald-100">
                <Navigation className="h-5 w-5" />
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-500 pt-2 border-t border-slate-100">Signal Clearance: <span className="text-emerald-600 font-bold">Enabled</span></p>
          </div>

        </div>

        {/* Dashboard Main View */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Radar / Tracking Map Placeholder */}
          <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-6 min-h-[360px] flex flex-col justify-between shadow-sm relative overflow-hidden">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <Activity className="h-5 w-5 text-rose-600" /> Sensor Radar View
              </h3>
              <span className="text-xs bg-slate-100 text-slate-600 font-medium px-3 py-1 rounded-full">
                RF Frequency: 433.92 MHz
              </span>
            </div>

            {/* Radar Center Content */}
            <div className="my-auto text-center py-8">
              <div className="inline-flex p-4 rounded-full bg-rose-50 text-rose-600 mb-3 border border-rose-100 shadow-inner">
                <Siren className="h-10 w-10 animate-pulse" />
              </div>
              <h4 className="text-lg font-bold text-slate-800">Tracking Unit AMB-9110</h4>
              <p className="text-slate-500 text-xs max-w-md mx-auto mt-1">
                Acoustic and radio sensors verifying distance and speed in real-time.
              </p>
            </div>

            <div className="flex justify-between items-center bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs">
              <span className="text-slate-600">Current Corridor: <strong className="text-slate-900">Sector 4 Interconnection</strong></span>
              <span className="text-emerald-700 font-semibold flex items-center gap-1">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Traffic Light Override Active
              </span>
            </div>
          </div>

          {/* Active Incidents Panel */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2 text-sm border-b border-slate-100 pb-3">
              <Clock className="h-4 w-4 text-amber-500" /> Active Emergency Logs
            </h3>
            
            <div className="space-y-3">
              <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-rose-700 flex items-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5" /> AMB-9110 (CRITICAL)
                  </span>
                  <span className="text-slate-600 font-semibold">1.2 km</span>
                </div>
                <p className="text-xs text-slate-600">Route: Central Expressway → Hospital</p>
                <div className="flex justify-between items-center text-[11px] pt-1 border-t border-rose-100">
                  <span className="text-slate-500">Priority: Maximum</span>
                  <button className="text-rose-700 hover:text-rose-800 font-bold flex items-center gap-1">
                    <PhoneCall className="h-3 w-3" /> Call Driver
                  </button>
                </div>
              </div>

              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2 opacity-75">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-slate-700">AMB-4082 (STANDBY)</span>
                  <span className="text-slate-500">4.8 km</span>
                </div>
                <p className="text-xs text-slate-500">Route: Station Road North</p>
                <div className="text-[11px] text-slate-500 pt-1 border-t border-slate-200">
                  <span>Priority: Standard</span>
                </div>
              </div>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix default marker icon missing issue in React-Leaflet
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

const DefaultIcon = L.icon({
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

// Helper component to auto-recenter map when coordinates change
function ChangeView({ center }) {
  const map = useMap();
  map.setView(center);
  return null;
}

export default function App() {
  const [gpsData, setGpsData] = useState({
    latitude: 26.7271,
    longitude: 88.3953,
    id: "AMB-9110"
  });
  const [isBroadcasting, setIsBroadcasting] = useState(false);

  // 1. Poll Backend every 3 seconds for updated location
  useEffect(() => {
    const fetchLocation = () => {
      fetch('http://localhost:5000/api/ambulance')
        .then(res => res.json())
        .then(data => setGpsData(data))
        .catch(err => console.error("GPS Fetch Error:", err));
    };

    fetchLocation();
    const interval = setInterval(fetchLocation, 3000);
    return () => clearInterval(interval);
  }, []);

  // 2. Broadcast browser's live device location to backend
  const startGPSBroadcast = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser");
      return;
    }

    setIsBroadcasting(true);

    navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        
        // Send updated GPS coordinates to backend
        fetch('http://localhost:5000/api/ambulance/gps', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ latitude, longitude })
        });
      },
      (error) => console.error("Error getting location:", error),
      { enableHighAccuracy: true }
    );
  };

  const centerPosition = [gpsData.latitude, gpsData.longitude];

  return (
    <div className="min-h-screen bg-slate-50 p-6 space-y-4">
      <header className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border">
        <div>
          <h1 className="text-xl font-bold text-rose-600">Ambulance GPS Tracker</h1>
          <p className="text-xs text-slate-500">
            Lat: {gpsData.latitude} | Lng: {gpsData.longitude}
          </p>
        </div>
        
        <button 
          onClick={startGPSBroadcast}
          className={`px-4 py-2 text-xs font-bold rounded-lg text-white transition-all ${
            isBroadcasting ? 'bg-emerald-600' : 'bg-rose-600 hover:bg-rose-700'
          }`}
        >
          {isBroadcasting ? 'Broadcasting Device GPS...' : 'Enable Live Device GPS'}
        </button>
      </header>

      {/* Interactive Map */}
      <div className="h-[500px] rounded-xl overflow-hidden border shadow-sm">
        <MapContainer center={centerPosition} zoom={15} style={{ height: '100%', width: '100%' }}>
          <ChangeView center={centerPosition} />
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Marker position={centerPosition}>
            <Popup>
              <strong>{gpsData.id}</strong><br />
              Status: Priority Active
            </Popup>
          </Marker>
        </MapContainer>
      </div>
    </div>
  );
}