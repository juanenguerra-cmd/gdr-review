import React from 'react';
import { ResidentData, ComplianceStatus } from '../types';
import { AlertCircle, CheckCircle, Clock, ChevronRight, XCircle } from 'lucide-react';

interface Props {
  residents: ResidentData[];
  onSelect: (resident: ResidentData) => void;
}

export const ResidentList: React.FC<Props> = ({ residents, onSelect }) => {
  const getStatusBadge = (status: ComplianceStatus) => {
    switch (status) {
      case ComplianceStatus.COMPLIANT:
        return <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-bold bg-green-100 text-green-800 print:bg-transparent print:text-black print:border print:border-black"><CheckCircle className="w-3 h-3 mr-1"/> Compliant</span>;
      case ComplianceStatus.WARNING:
        return <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-bold bg-yellow-100 text-yellow-800 print:bg-transparent print:text-black print:border print:border-black"><Clock className="w-3 h-3 mr-1"/> Review</span>;
      case ComplianceStatus.CRITICAL:
        return <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-bold bg-red-100 text-red-800 print:bg-transparent print:text-black print:border print:border-black"><AlertCircle className="w-3 h-3 mr-1"/> Critical</span>;
      default:
        return <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-600 print:bg-transparent print:text-black">Neutral</span>;
    }
  };

  const getGdrBadge = (r: ResidentData) => {
    // Only relevant if they have psych meds
    if (r.meds.length === 0) return <span className="text-slate-300 text-xs print:text-black">—</span>;

    const hasAntipsychotic = r.meds.some(m => m.class === 'Antipsychotic');
    if (!hasAntipsychotic) return <span className="text-slate-300 text-xs print:text-black">N/A</span>;

    if (r.compliance.gdrOverdue) {
        return <span className="inline-flex items-center text-xs font-bold text-red-600 bg-red-50 px-2 py-1 rounded border border-red-100 print:border-black print:bg-transparent print:text-black"><XCircle className="w-3 h-3 mr-1"/> Overdue</span>;
    }
    
    // Sort logic is inside compliance service, we rely on the object state if populated
    // But compliance service populates issues, not 'lastGdrDate' directly in simple object
    // Wait, type def has 'lastGdrDate'. Let's see if compliance service populates it.
    // It seems evaluateResidentCompliance populates issues but doesn't explicitly set lastGdrDate in the return.
    // We should probably rely on checking the GDR array here or update service to populate it. 
    // Given the constraints, I'll calculate simply here for display.
    const sortedGdr = [...r.gdr].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const last = sortedGdr[0];
    
    if (last) {
        return <span className="inline-flex items-center text-xs font-medium text-green-700 bg-green-50 px-2 py-1 rounded border border-green-100 print:border-black print:bg-transparent print:text-black"><CheckCircle className="w-3 h-3 mr-1"/> {last.date}</span>;
    }
    
    return <span className="inline-flex items-center text-xs font-medium text-slate-500 bg-slate-100 px-2 py-1 rounded border border-slate-200 print:border-black print:bg-transparent print:text-black">None</span>;
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden print:shadow-none print:border-black print:rounded-none">
      <div className="overflow-x-auto print:overflow-visible">
        <table className="w-full text-left border-collapse print:text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500 font-bold print:bg-gray-100 print:text-black print:border-black">
              <th className="p-4 print:p-2">Resident</th>
              <th className="p-4 print:p-2">Location</th>
              <th className="p-4 print:p-2">Psych Meds</th>
              <th className="p-4 print:p-2">GDR Status</th>
              <th className="p-4 print:p-2">Compliance Status</th>
              <th className="p-4 print:p-2">Issues</th>
              <th className="p-4 print:p-2 no-print"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 print:divide-black">
            {residents.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-slate-400 text-sm print:text-black">No residents found matching filters.</td>
              </tr>
            ) : (
              residents.map((r) => (
                <tr 
                  key={r.mrn} 
                  onClick={() => onSelect(r)}
                  className="hover:bg-slate-50 transition-colors cursor-pointer group print:break-inside-avoid print:cursor-default print:hover:bg-transparent"
                >
                  <td className="p-4 print:p-2">
                    <div className="font-bold text-primary group-hover:underline print:text-black print:group-hover:no-underline">{r.name}</div>
                    <div className="text-xs text-slate-400 print:text-black">MRN: {r.mrn}</div>
                  </td>
                  <td className="p-4 text-sm text-slate-600 print:text-black print:p-2">
                    <div>{r.unit}</div>
                    <div className="text-xs text-slate-400 print:hidden">{r.room}</div>
                  </td>
                  <td className="p-4 print:p-2">
                    {r.meds.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {r.meds.map((m, i) => (
                          <span key={i} className={`text-xs px-2 py-0.5 rounded border ${m.class === 'Antipsychotic' ? 'bg-purple-50 border-purple-200 text-purple-700' : 'bg-slate-50 border-slate-200 text-slate-600'} print:border-black print:text-black print:bg-transparent`}>
                            {m.drug}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-slate-300 text-xs print:text-black">—</span>
                    )}
                  </td>
                  <td className="p-4 print:p-2">
                      {getGdrBadge(r)}
                  </td>
                  <td className="p-4 print:p-2">
                    {r.meds.length > 0 ? getStatusBadge(r.compliance.status) : <span className="text-slate-400 text-xs print:text-black">N/A</span>}
                  </td>
                  <td className="p-4 text-xs text-red-600 max-w-xs print:text-black print:max-w-none print:p-2">
                    <ul className="list-disc list-inside truncate print:whitespace-normal">
                      {r.compliance.issues.length > 0 ? (
                         <span>{r.compliance.issues.length} Issue{r.compliance.issues.length > 1 ? 's' : ''}</span>
                      ) : (
                         <span className="text-green-600 print:text-black">None</span>
                      )}
                    </ul>
                  </td>
                  <td className="p-4 text-slate-400 no-print">
                    <ChevronRight className="w-5 h-5 group-hover:text-primary transition-colors" />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};