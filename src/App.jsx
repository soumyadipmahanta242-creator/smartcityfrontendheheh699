import React, { useState } from 'react';
import UserApp from './UserApp';
import AmbulanceApp from './AmbulanceApp';

const ROLE_KEY = 'tracker-app-role';

export default function App() {
  const [role, setRole] = useState(() => localStorage.getItem(ROLE_KEY));

  const chooseRole = (r) => {
    localStorage.setItem(ROLE_KEY, r);
    setRole(r);
  };

  const switchRole = () => {
    localStorage.removeItem(ROLE_KEY);
    setRole(null);
  };

  if (!role) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 font-sans">
        <div className="bg-white p-8 rounded-2xl shadow-sm border max-w-sm w-full text-center space-y-4">
 <h1
  style={{ color: "red", fontSize: "40px" }}
  className="text-xl font-bold"
>
  RAPID LANE
</h1>
          <p className="text-xs text-slate-500">Pick a role to continue — you can switch later.</p>
          <div className="space-y-3 pt-2">
            <button
              onClick={() => chooseRole('user')}
              className="w-full py-3 rounded-xl bg-rose-600 text-white font-bold text-sm hover:bg-rose-700 transition-all"
            >
              🚗 I'm a regular driver
            </button>
            <button
              onClick={() => chooseRole('ambulance')}
              className="w-full py-3 rounded-xl bg-red-700 text-white font-bold text-sm hover:bg-red-800 transition-all"
            >
              🚑 I'm driving the ambulance
            </button>
          </div>
        </div>
      </div>
    );
  }

  return role === 'ambulance' ? (
    <AmbulanceApp onSwitchRole={switchRole} />
  ) : (
    <UserApp onSwitchRole={switchRole} />
  );
}
//updated