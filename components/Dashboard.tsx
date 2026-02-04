import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { ResidentData, ComplianceStatus } from '../types';
import { ShieldCheck, AlertOctagon, Users, Pill } from 'lucide-react';

interface Props {
  residents: ResidentData[];
}

export const Dashboard: React.FC<Props> = ({ residents }) => {
  const total = residents.length;
  const psychParams = residents.filter(r => r.meds.length > 0);
  const compliant = psychParams.filter(r => r.compliance.status === ComplianceStatus.COMPLIANT).length;
  const warnings = psychParams.filter(r => r.compliance.status === ComplianceStatus.WARNING).length;
  const critical = psychParams.filter(r => r.compliance.status === ComplianceStatus.CRITICAL).length;

  // GDR Specific Calculations
  const gdrCohort = psychParams;
  const gdrDone = gdrCohort.filter(r => r.manualGdr.status === 'DONE').length;
  const gdrContra = gdrCohort.filter(r => r.manualGdr.status === 'CONTRAINDICATED').length;
  const gdrNotSet = gdrCohort.filter(r => r.manualGdr.status === 'NOT_SET').length;

  const data = [
    { name: 'Compliant', value: compliant, color: '#22c55e' }, // green-500
    { name: 'Warnings', value: warnings, color: '#eab308' },  // yellow-500
    { name: 'Critical', value: critical, color: '#ef4444' },  // red-500
  ];

  if (total === 0) {
    return (
      <div className="p-8 text-center text-slate-400 bg-white rounded-xl border border-slate-200 border-dashed">
        <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
        <p>No Census Data Loaded. Use "Input Data" to begin.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
      {/* Stat Cards */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
        <div>
          <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">Psych Cohort</p>
          <h3 className="text-3xl font-bold text-slate-800 mt-1">{psychParams.length}</h3>
        </div>
        <div className="mt-4 flex items-center text-sm text-slate-400">
           <Pill className="w-4 h-4 mr-1" />
           <span>{Math.round((psychParams.length / total) * 100)}% of Census</span>
        </div>
      </div>

      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
        <div>
          <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">Overall Compliant</p>
          <h3 className="text-3xl font-bold text-green-600 mt-1">{compliant}</h3>
        </div>
        <div className="mt-4 flex items-center text-sm text-green-700 bg-green-50 w-fit px-2 py-1 rounded-md">
           <ShieldCheck className="w-4 h-4 mr-1" />
           <span>CMS F758 Met</span>
        </div>
      </div>

      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
        <div>
          <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">Manual GDR Status</p>
          <h3 className={`text-3xl font-bold mt-1 ${gdrNotSet > 0 ? 'text-red-600' : 'text-blue-600'}`}>
            {gdrDone + gdrContra}/{gdrCohort.length}
          </h3>
        </div>
        <div className="mt-2 space-y-1">
          <div className="flex justify-between text-[10px] font-bold uppercase text-slate-400 tracking-tight">
             <span className="text-green-600">Done: {gdrDone}</span>
             <span className="text-amber-600">Contra: {gdrContra}</span>
             <span className="text-red-600">Not Set: {gdrNotSet}</span>
          </div>
          <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden flex">
            <div style={{ width: `${gdrCohort.length ? (gdrDone / gdrCohort.length) * 100 : 0}%` }} className="bg-green-500 h-full"></div>
            <div style={{ width: `${gdrCohort.length ? (gdrContra / gdrCohort.length) * 100 : 0}%` }} className="bg-amber-500 h-full"></div>
            <div style={{ width: `${gdrCohort.length ? (gdrNotSet / gdrCohort.length) * 100 : 0}%` }} className="bg-red-500 h-full"></div>
          </div>
        </div>
      </div>

      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
        <div>
          <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">Critical Items</p>
          <h3 className="text-3xl font-bold text-red-600 mt-1">{critical}</h3>
        </div>
        <div className="mt-4 flex items-center text-sm text-red-700 bg-red-50 w-fit px-2 py-1 rounded-md">
           <AlertOctagon className="w-4 h-4 mr-1" />
           <span>Priority Review</span>
        </div>
      </div>

      {/* Mini Chart */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
        <p className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-2">Compliance Map</p>
        <div className="h-24">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical">
              <XAxis type="number" hide />
              <YAxis dataKey="name" type="category" width={70} tick={{fontSize: 10}} interval={0} />
              <Tooltip cursor={{fill: 'transparent'}} contentStyle={{fontSize: '12px'}} />
              <Bar dataKey="value" barSize={15} radius={[0, 4, 4, 0]}>
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};
