import React from 'react';
import { Lock } from 'lucide-react';

interface Props {
  isLocked: boolean;
  onUnlock: () => void;
}

export const LockScreen: React.FC<Props> = ({ isLocked, onUnlock }) => {
  if (!isLocked) return null;

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
        <button
          onClick={onUnlock}
          className="w-full bg-primary hover:bg-secondary text-white font-bold py-3 px-6 rounded-xl transition-all shadow-lg shadow-blue-900/20"
        >
          Unlock Application
        </button>
      </div>
    </div>
  );
};