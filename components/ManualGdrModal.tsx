import React, { useEffect, useState } from 'react';
import { ManualGdrData, ManualGdrStatus } from '../types';

interface Props {
  isOpen: boolean;
  manualGdr: ManualGdrData;
  onClose: () => void;
  onSave: (data: ManualGdrData) => void;
}

export const ManualGdrModal: React.FC<Props> = ({ isOpen, manualGdr, onClose, onSave }) => {
  const [localData, setLocalData] = useState<ManualGdrData>(manualGdr);

  useEffect(() => {
    if (isOpen) {
      setLocalData(manualGdr);
    }
  }, [isOpen, manualGdr]);

  if (!isOpen) return null;

  const updateStatus = (status: ManualGdrStatus) => {
    setLocalData(prev => ({ ...prev, status }));
  };

  const updateContra = (key: keyof ManualGdrData['contraindications'], value: boolean | string) => {
    setLocalData(prev => ({
      ...prev,
      contraindications: {
        ...prev.contraindications,
        [key]: value
      }
    }));
  };

  const handleSave = () => {
    onSave({
      ...localData,
      updatedAt: new Date().toISOString(),
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <div className="bg-white w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden">
        <div className="bg-slate-50 p-4 border-b border-slate-200 flex justify-between items-center">
          <h3 className="font-bold text-slate-800">Manual GDR Status</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Status</label>
            <div className="flex flex-wrap gap-2">
              {(['NOT_SET', 'DONE', 'CONTRAINDICATED'] as ManualGdrStatus[]).map(status => (
                <button
                  key={status}
                  onClick={() => updateStatus(status)}
                  className={`px-3 py-2 rounded-lg text-xs font-bold border ${
                    localData.status === status ? 'bg-primary text-white border-primary' : 'bg-white text-slate-600 border-slate-300'
                  }`}
                >
                  {status.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>

          {localData.status === 'DONE' && (
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-2">GDR Note</label>
              <textarea
                value={localData.note || ''}
                onChange={(e) => setLocalData(prev => ({ ...prev, note: e.target.value }))}
                className="w-full min-h-[120px] p-3 border border-slate-300 rounded-lg text-sm"
                placeholder="Enter GDR note details..."
              />
            </div>
          )}

          {localData.status === 'CONTRAINDICATED' && (
            <div className="space-y-3">
              <label className="block text-xs font-bold text-slate-500 uppercase">Contraindication Reasons</label>
              <label className="flex items-start gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={localData.contraindications.symptomsReturned}
                  onChange={(e) => updateContra('symptomsReturned', e.target.checked)}
                />
                Target symptoms returned/worsened after GDR.
              </label>
              <label className="flex items-start gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={localData.contraindications.additionalGdrLikelyToImpair}
                  onChange={(e) => updateContra('additionalGdrLikelyToImpair', e.target.checked)}
                />
                Additional GDR likely to impair resident.
              </label>
              <label className="flex items-start gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={localData.contraindications.riskToSelfOrOthers}
                  onChange={(e) => updateContra('riskToSelfOrOthers', e.target.checked)}
                />
                Risk to deteriorate and become danger to self/others.
              </label>
              <label className="flex items-start gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={localData.contraindications.other}
                  onChange={(e) => updateContra('other', e.target.checked)}
                />
                Other (requires detail).
              </label>
              {localData.contraindications.other && (
                <textarea
                  value={localData.contraindications.otherText || ''}
                  onChange={(e) => updateContra('otherText', e.target.value)}
                  className="w-full min-h-[80px] p-3 border border-slate-300 rounded-lg text-sm"
                  placeholder="Enter other contraindication detail..."
                />
              )}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Updated By (optional)</label>
            <input
              type="text"
              value={localData.updatedBy || ''}
              onChange={(e) => setLocalData(prev => ({ ...prev, updatedBy: e.target.value }))}
              className="w-full p-2 border border-slate-300 rounded-lg text-sm"
              placeholder="Staff name or initials"
            />
          </div>
        </div>
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-slate-600 font-bold hover:bg-slate-200 rounded-lg">Cancel</button>
          <button onClick={handleSave} className="px-6 py-2 bg-primary hover:bg-secondary text-white font-bold rounded-lg shadow-lg shadow-blue-900/10">Save</button>
        </div>
      </div>
    </div>
  );
};
