import React, { useState } from 'react';
import { ParseType } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onParse: (type: ParseType, text: string, targetMonth: string) => void;
}

export const ParserModal: React.FC<Props> = ({ isOpen, onClose, onParse }) => {
  const [type, setType] = useState<ParseType>(ParseType.CENSUS);
  const [text, setText] = useState("");
  const [targetMonth, setTargetMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM

  if (!isOpen) return null;

  const handleSubmit = () => {
    onParse(type, text, targetMonth);
    setText("");
    onClose();
  };

  const getPlaceholder = () => {
    switch(type) {
      case ParseType.CENSUS: return "Paste Daily Census Report (PCC)...";
      case ParseType.MEDS: return "Paste Active Medication Orders (Name, MRN, Drug)...";
      case ParseType.CAREPLAN: return "Paste Care Plan Item Listing...";
      case ParseType.BEHAVIORS: return "Paste Behavior Logs (Name, MRN, Date)...";
      case ParseType.PSYCH_MD_ORDERS: return "Paste MD Orders for Psych Consult/Eval...";
      case ParseType.EPISODIC_BEHAVIORS: return "Paste Episodic Behavior Notes (Name, MRN, Date)...";
      default: return "Paste report text...";
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="bg-slate-50 p-4 border-b border-slate-200 flex justify-between items-center">
          <h3 className="font-bold text-slate-800">Input Data</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>
        
        <div className="p-6 flex flex-col gap-4 flex-1 overflow-auto">
          <div className="grid grid-cols-2 gap-4">
            <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Report Type</label>
                <select 
                value={type} 
                onChange={(e) => setType(e.target.value as ParseType)}
                className="w-full p-2 border border-slate-300 rounded-lg bg-white text-slate-700 focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
                >
                <option value={ParseType.CENSUS}>Census (Daily Census)</option>
                <option value={ParseType.MEDS}>Medication List</option>
                <option value={ParseType.CONSULTS}>Psych Consult History</option>
                <option value={ParseType.CAREPLAN}>Care Plan Items</option>
                <option value={ParseType.BEHAVIORS}>Behavior Logs</option>
                <option value={ParseType.PSYCH_MD_ORDERS}>MD Orders (Psych Consult/Eval)</option>
                <option value={ParseType.EPISODIC_BEHAVIORS}>Episodic Behaviors</option>
                <option value={ParseType.GDR}>Pharmacy GDR Report</option>
                </select>
            </div>
            <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Review Month</label>
                <input 
                    type="month"
                    value={targetMonth}
                    onChange={(e) => setTargetMonth(e.target.value)}
                    className="w-full p-2 border border-slate-300 rounded-lg bg-white text-slate-700 focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
                />
            </div>
          </div>

          <div className="flex-1 min-h-[200px]">
             <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Raw Data</label>
             <textarea
               className="w-full h-full min-h-[300px] p-4 border border-slate-300 rounded-xl font-mono text-xs bg-slate-50 focus:bg-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none resize-none"
               placeholder={getPlaceholder()}
               value={text}
               onChange={(e) => setText(e.target.value)}
             />
          </div>
        </div>

        <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-slate-600 font-bold hover:bg-slate-200 rounded-lg">Cancel</button>
          <button onClick={handleSubmit} className="px-6 py-2 bg-primary hover:bg-secondary text-white font-bold rounded-lg shadow-lg shadow-blue-900/10">Parse & Update</button>
        </div>
      </div>
    </div>
  );
};
