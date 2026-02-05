import React, { useMemo, useState } from 'react';
import { AuditEntry } from '../types';
import { Download, Filter, X } from 'lucide-react';

interface Props {
  entries: AuditEntry[];
  onClose: () => void;
}

export const AuditLogPanel: React.FC<Props> = ({ entries, onClose }) => {
  const [typeFilter, setTypeFilter] = useState<'ALL' | AuditEntry['type']>('ALL');
  const [search, setSearch] = useState('');

  const filteredEntries = useMemo(() => {
    const term = search.toLowerCase();
    return entries.filter((entry) => {
      const matchesType = typeFilter === 'ALL' || entry.type === typeFilter;
      const matchesSearch = !term || entry.message.toLowerCase().includes(term);
      return matchesType && matchesSearch;
    });
  }, [entries, search, typeFilter]);

  const exportAuditLog = () => {
    if (filteredEntries.length === 0) return;
    const headers = ['Timestamp', 'Type', 'Message'];
    const rows = filteredEntries.map(entry => [entry.timestamp, entry.type, entry.message]);
    const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const csv = [headers, ...rows].map(row => row.map(cell => escape(String(cell ?? ''))).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `audit_log_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="bg-slate-50 p-4 border-b border-slate-200 flex justify-between items-center">
          <div>
            <h3 className="font-bold text-slate-800">Audit Log</h3>
            <p className="text-xs text-slate-500">System activity, parse warnings, and data updates.</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>

        <div className="p-6 flex flex-col gap-4 flex-1 overflow-auto">
          <div className="flex flex-col md:flex-row md:items-center gap-3">
            <div className="flex-1 relative">
              <input
                type="text"
                placeholder="Search audit messages..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
              />
              <Filter className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-3 top-3 text-slate-400 hover:text-slate-600">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <select
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value as 'ALL' | AuditEntry['type'])}
              className="px-4 py-2 rounded-lg border border-slate-300 bg-slate-50 text-sm focus:ring-2 focus:ring-primary outline-none cursor-pointer hover:bg-white transition-colors"
            >
              <option value="ALL">All types</option>
              <option value="info">Info</option>
              <option value="update">Updates</option>
              <option value="alert">Alerts</option>
            </select>
            <button
              onClick={exportAuditLog}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-700 text-white text-sm font-bold hover:bg-slate-800"
            >
              <Download className="w-4 h-4" /> Export CSV
            </button>
          </div>

          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="grid grid-cols-[160px_100px_1fr] gap-2 bg-slate-100 text-xs font-semibold text-slate-500 px-4 py-2 uppercase">
              <span>Timestamp</span>
              <span>Type</span>
              <span>Message</span>
            </div>
            <div className="max-h-[420px] overflow-auto divide-y divide-slate-100 text-sm">
              {filteredEntries.length === 0 ? (
                <div className="p-4 text-slate-500 text-sm">No audit entries match your filters.</div>
              ) : (
                filteredEntries.map((entry, index) => (
                  <div key={`${entry.timestamp}-${entry.message}-${index}`} className="grid grid-cols-[160px_100px_1fr] gap-2 px-4 py-3">
                    <span className="text-slate-500 text-xs">{entry.timestamp}</span>
                    <span
                      className={`text-xs font-semibold ${
                        entry.type === 'alert'
                          ? 'text-rose-600'
                          : entry.type === 'update'
                          ? 'text-blue-600'
                          : 'text-slate-600'
                      }`}
                    >
                      {entry.type.toUpperCase()}
                    </span>
                    <span className="text-slate-700">{entry.message}</span>
                  </div>
                ))
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
