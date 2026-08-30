import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';

const socket = io('http://localhost:5000');

export default function App() {
  const [gpsData, setGpsData] = useState({ latitude: 26.7271, longitude: 88.3953 });

  useEffect(() => {
    // Listen for real-time location broadcasts from backend
    socket.on('receive-location', (data) => {
      setGpsData(data);
    });

    return () => socket.off('receive-location');
  }, []);

  const startLiveTracking = () => {
    navigator.geolocation.watchPosition(
      (pos) => {
        const coords = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          timestamp: new Date().toLocaleTimeString()
        };
        
        // Push update immediately over open socket pipe
        socket.emit('send-location', coords);
      },
      (err) => console.error(err),
      { enableHighAccuracy: true, maximumAge: 0 }
    );
  };

  return (
    <button onClick={startLiveTracking}>Start Instant Tracking</button>
  );
}