import React from 'react';
import { AppSettings, SettingsLineError } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  indicationMapText: string;
  customMedMapText: string;
  indicationMapErrors: SettingsLineError[];
  customMedMapErrors: SettingsLineError[];
  onSettingsChange: (updates: Partial<AppSettings>) => void;
  onIndicationMapTextChange: (value: string) => void;
  onCustomMedMapTextChange: (value: string) => void;
  onIndicationMapBlur: () => void;
  onCustomMedMapBlur: () => void;
}

export const SettingsModal: React.FC<Props> = ({
  isOpen,
  onClose,
  settings,
  indicationMapText,
  customMedMapText,
  indicationMapErrors,
  customMedMapErrors,
  onSettingsChange,
  onIndicationMapTextChange,
  onCustomMedMapTextChange,
  onIndicationMapBlur,
  onCustomMedMapBlur
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="bg-slate-50 p-4 border-b border-slate-200 flex justify-between items-center">
          <div>
            <h3 className="font-bold text-slate-800">Settings</h3>
            <p className="text-xs text-slate-500">Facility-friendly thresholds and mappings.</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>

        <div className="p-6 flex-1 overflow-auto">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="space-y-3">
              <label className="block text-xs font-bold text-slate-500 uppercase">Psych consult window (days)</label>
              <input
                type="number"
                min={1}
                value={settings.consultRecencyDays}
                onChange={(e) => onSettingsChange({ consultRecencyDays: Number(e.target.value) || 0 })}
                className="w-full p-2 border border-slate-300 rounded-lg text-sm"
              />
              <label className="block text-xs font-bold text-slate-500 uppercase">Behavior threshold (notes)</label>
              <input
                type="number"
                min={1}
                value={settings.behaviorThreshold}
                onChange={(e) => onSettingsChange({ behaviorThreshold: Number(e.target.value) || 0 })}
                className="w-full p-2 border border-slate-300 rounded-lg text-sm"
              />
              <label className="block text-xs font-bold text-slate-500 uppercase">Behavior window (days)</label>
              <input
                type="number"
                min={1}
                value={settings.behaviorWindowDays}
                onChange={(e) => onSettingsChange({ behaviorWindowDays: Number(e.target.value) || 0 })}
                className="w-full p-2 border border-slate-300 rounded-lg text-sm"
              />
              <label className="block text-xs font-bold text-slate-500 uppercase">Indication mismatch severity</label>
              <select
                value={settings.indicationMismatchSeverity}
                onChange={(e) => onSettingsChange({ indicationMismatchSeverity: e.target.value as AppSettings['indicationMismatchSeverity'] })}
                className="w-full p-2 border border-slate-300 rounded-lg text-sm"
              >
                <option value="WARNING">Warning</option>
                <option value="CRITICAL">Critical</option>
              </select>
              <label className="block text-xs font-bold text-slate-500 uppercase">OneDrive backup folder URL</label>
              <input
                type="url"
                value={settings.oneDriveFolderUrl}
                onChange={(e) => onSettingsChange({ oneDriveFolderUrl: e.target.value })}
                className="w-full p-2 border border-slate-300 rounded-lg text-sm"
                placeholder="https://..."
              />
              <p className="text-[11px] text-slate-400">
                Paste the OneDrive folder link where backups should be uploaded/downloaded.
              </p>
            </div>
            <div className="space-y-3">
              <label className="block text-xs font-bold text-slate-500 uppercase">Indication mapping table</label>
              <textarea
                value={indicationMapText}
                onChange={(e) => onIndicationMapTextChange(e.target.value)}
                onBlur={onIndicationMapBlur}
                className="w-full min-h-[180px] p-2 border border-slate-300 rounded-lg text-xs font-mono"
                placeholder="Class: indication1, indication2"
              />
              <p className="text-[11px] text-slate-400">Format: Class: indication1, indication2</p>
              {indicationMapErrors.length > 0 && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-2 text-[11px] text-rose-700">
                  <p className="font-semibold">Line errors</p>
                  <ul className="mt-1 list-disc space-y-1 pl-4">
                    {indicationMapErrors.map((error) => (
                      <li key={`indication-${error.line}`}>Line {error.line}: {error.message}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <div className="space-y-3">
              <label className="block text-xs font-bold text-slate-500 uppercase">Custom medication classification</label>
              <textarea
                value={customMedMapText}
                onChange={(e) => onCustomMedMapTextChange(e.target.value)}
                onBlur={onCustomMedMapBlur}
                className="w-full min-h-[180px] p-2 border border-slate-300 rounded-lg text-xs font-mono"
                placeholder="drug name = Class"
              />
              <p className="text-[11px] text-slate-400">Format: drug name = Class (matches normalized names)</p>
              {customMedMapErrors.length > 0 && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-2 text-[11px] text-rose-700">
                  <p className="font-semibold">Line errors</p>
                  <ul className="mt-1 list-disc space-y-1 pl-4">
                    {customMedMapErrors.map((error) => (
                      <li key={`custom-med-${error.line}`}>Line {error.line}: {error.message}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-slate-600 font-bold hover:bg-slate-200 rounded-lg">Close</button>
        </div>
      </div>
    </div>
  );
};
