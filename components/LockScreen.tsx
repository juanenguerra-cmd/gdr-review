import React, { useState, useEffect } from 'react';
import { Lock } from 'lucide-react';

interface Props {
  isLocked: boolean;
  onUnlock: () => void;
}

export const LockScreen: React.FC<Props> = ({ isLocked, onUnlock }) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (isLocked) {
      setPassword('');
      setError('');
    }
  }, [isLocked]);

  if (!isLocked) return null;

  const handleUnlock = () => {
    if (password.trim() === '120316') {
      setError('');
      setPassword('');
      onUnlock();
      return;
    }
    setError('Incorrect password. Please try again.');
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full text-center border border-slate-200">
        <div className="bg-blue-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6">
          <Lock className="w-8 h-8 text-primary" />
        </div>
        <h2 className="text-2xl font-bold text-slate-800 mb-2">PHI Protected Mode</h2>
        <p className="text-slate-500 mb-8 text-sm leading-relaxed">
          This screen is locked to protect Resident Health Information in compliance with HIPAA and NYSDOH privacy regulations.
        </p>
        <div className="text-left mb-4">
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Unlock Password</label>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') handleUnlock();
            }}
            className="w-full border border-slate-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-primary focus:border-transparent"
            placeholder="Enter password"
          />
          {error && <p className="text-xs text-rose-600 mt-2">{error}</p>}
        </div>
        <button
          onClick={handleUnlock}
          className="w-full bg-primary hover:bg-secondary text-white font-bold py-3 px-6 rounded-xl transition-all shadow-lg shadow-blue-900/20"
        >
          Unlock Application
        </button>
      </div>
    </div>
  );
};
