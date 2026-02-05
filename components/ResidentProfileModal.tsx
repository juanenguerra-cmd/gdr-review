import React, { useMemo, useState } from 'react';
import { ResidentData, ComplianceStatus, ReviewHistoryItem, AppSettings, MedicationClass, ManualGdrData } from '../types';
import { X, AlertTriangle, FileText, Activity, Pill, CheckCircle, Clock, AlertCircle, User, Printer, History, LayoutDashboard, RefreshCw, Download, Settings } from 'lucide-react';
import { ManualGdrModal } from './ManualGdrModal';

interface Props {
  resident: ResidentData | null;
  history: ReviewHistoryItem[];
  settings: AppSettings;
  onUpdateResident: (mrn: string, updater: (resident: ResidentData) => ResidentData) => void;
  onClose: () => void;
}

const PrintStyles = () => (
    <style>{`
      @media print {
        @page { margin: 0.5in; size: portrait; }
        html, body {
          height: auto !important;
          overflow: visible !important;
          background: white !important;
        }
        body * {
          visibility: hidden;
        }
        #resident-profile-modal, #resident-profile-modal * {
          visibility: visible !important;
        }
        #resident-profile-modal {
          position: absolute !important;
          left: 0 !important;
          top: 0 !important;
          width: 100% !important;
          margin: 0 !important;
          padding: 0 !important;
          background: white !important;
          z-index: 9999 !important;
          height: auto !important;
          overflow: visible !important;
        }
        .printable-modal {
          position: relative !important;
          left: 0 !important;
          top: 0 !important;
          width: 100% !important;
          max-width: none !important;
          box-shadow: none !important;
          border: none !important;
          height: auto !important;
          overflow: visible !important;
        }
        .modal-content-area {
            overflow: visible !important;
            height: auto !important;
            max-height: none !important;
        }
        .no-print-in-modal {
            display: none !important;
        }
        .print-force-block {
            display: block !important;
        }
        .break-after-section {
            page-break-after: auto;
            margin-bottom: 2rem;
            border-bottom: 1px solid #ddd;
            padding-bottom: 2rem;
        }
        tr {
            break-inside: avoid;
        }
      }
    `}</style>
);


export const ResidentProfileModal: React.FC<Props> = ({ resident, history, settings, onUpdateResident, onClose }) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'history'>('overview');
  const [showManualGdr, setShowManualGdr] = useState(false);

  if (!resident) return null;

  const medClasses: MedicationClass[] = [
    'ADHD/ANTI-NARCOLEPSY/ANTI-OBESITY/ANOREXIANTS',
    'ANTIANXIETY AGENTS',
    'ANTIDEPRESSANTS',
    'ANTIPSYCHOTICS/ANTIMANIC AGENTS',
    'HYPNOTICS/SEDATIVES/SLEEP DISORDER AGENTS',
    'PSYCHOTHERAPEUTIC AND NEUROLOGICAL AGENTS - MISC.',
    'Other'
  ];

  const behaviorWindow = settings.behaviorWindowDays;
  const behaviorCount = useMemo(() => {
    const now = new Date();
    return resident.behaviors.filter(b => now.getTime() - new Date(b.date).getTime() <= behaviorWindow * 24 * 60 * 60 * 1000).length;
  }, [resident.behaviors, behaviorWindow]);

  const mostRecentEpisodic = useMemo(() => {
    const sorted = [...resident.episodicBehaviors].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return sorted[0];
  }, [resident.episodicBehaviors]);

  const mostRecentConsult = useMemo(() => {
    const sorted = [...resident.consults].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return sorted[0];
  }, [resident.consults]);

  const mostRecentOrder = useMemo(() => {
    const sorted = [...resident.psychMdOrders].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return sorted[0];
  }, [resident.psychMdOrders]);

  const handleMedUpdate = (index: number, updates: Partial<ResidentData['meds'][number]>) => {
    onUpdateResident(resident.mrn, (prev) => {
      const meds = [...prev.meds];
      meds[index] = { ...meds[index], ...updates };
      return { ...prev, meds };
    });
  };

  const handleManualGdrSave = (data: ManualGdrData) => {
    onUpdateResident(resident.mrn, (prev) => ({ ...prev, manualGdr: data }));
  };

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleJumpToMissing = () => {
    const issues = resident.compliance.issues.join(' ').toLowerCase();
    if (issues.includes('care plan')) return scrollToSection('careplan-section');
    if (issues.includes('behavior')) return scrollToSection('behaviors-section');
    if (issues.includes('consult') || issues.includes('psychiatry')) return scrollToSection('consults-section');
    if (issues.includes('gdr')) return scrollToSection('gdr-section');
    if (issues.includes('indication')) return scrollToSection('meds-section');
    return scrollToSection('summary-section');
  };

  const medicationWarnings = resident.compliance.issues.filter(issue =>
    /indication|prn|antipsychotic|antimanic/i.test(issue)
  );

  const generalComplianceAlerts = resident.compliance.issues.filter(issue =>
    !medicationWarnings.includes(issue)
  );

  const handleDownload = () => {
    const contentElement = document.getElementById('resident-profile-modal');
    if (!contentElement) return;
    
    let content = contentElement.innerHTML;
    
    // Robust cleanup for static report
    content = content.replace(/fixed inset-0[\s\S]*?z-40/, 'relative mx-auto my-8');
    content = content.replace(/max-h-\[90vh\]/g, '');
    content = content.replace(/overflow-y-auto/g, '');
    content = content.replace(/overflow-hidden/g, '');
    content = content.replace(/h-full/g, '');
    content = content.replace(/shadow-2xl/g, '');
    content = content.replace(/rounded-2xl/g, '');
    content = content.replace(/bg-slate-900\/50/g, 'bg-white');
    content = content.replace(/backdrop-blur-sm/g, '');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Resident Profile - ${resident.name}</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
        tailwind.config = {
            theme: {
                extend: {
                    colors: {
                        primary: '#0b4ea2',
                        secondary: '#0a3f85',
                        bg: '#f6f8fc',
                    }
                }
            }
        }
    </script>
    <style>
        @media print {
            @page { margin: 0.5in; }
            .no-print-in-modal { display: none !important; }
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
        .hidden { display: block !important; } /* Force show hidden tabs */
        .no-print-in-modal { display: none !important; } /* Hide buttons/nav */
    </style>
</head>
<body class="bg-white p-8">
    ${content}
    <div class="text-center mt-8 text-slate-400 text-xs no-print-in-modal">
        Generated by GDR Compliance Tool
    </div>
</body>
</html>`;
    
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Resident_Profile_${resident.mrn}.html`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const getStatusBadge = (status: ComplianceStatus) => {
    switch (status) {
      case ComplianceStatus.COMPLIANT:
        return <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-bold bg-green-100 text-green-800 border border-green-200 print:bg-transparent print:text-black print:border-black"><CheckCircle className="w-4 h-4 mr-2"/> Compliant</span>;
      case ComplianceStatus.WARNING:
        return <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-bold bg-yellow-100 text-yellow-800 border border-yellow-200 print:bg-transparent print:text-black print:border-black"><Clock className="w-4 h-4 mr-2"/> Review Needed</span>;
      case ComplianceStatus.CRITICAL:
        return <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-bold bg-red-100 text-red-800 border border-red-200 print:bg-transparent print:text-black print:border-black"><AlertCircle className="w-4 h-4 mr-2"/> Critical Issues</span>;
      default:
        return <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-bold bg-slate-100 text-slate-600 border border-slate-200 print:bg-transparent print:text-black print:border-black">Neutral</span>;
    }
  };
  
  return (
    <>
    <PrintStyles />
    <ManualGdrModal
      isOpen={showManualGdr}
      manualGdr={resident.manualGdr}
      onClose={() => setShowManualGdr(false)}
      onSave={handleManualGdrSave}
    />
    <div id="resident-profile-modal" className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 print:p-0">
      <div className="bg-white w-full max-w-5xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh] printable-modal print:max-h-none print:rounded-none print:shadow-none">
        {/* Header */}
        <div className="bg-slate-50 p-4 border-b border-slate-200 flex justify-between items-center no-print-in-modal">
            <div className="flex items-center gap-3">
                <User className="w-6 h-6 text-primary"/>
                <div>
                    <h3 className="font-bold text-slate-800 text-lg">Resident Detail View</h3>
                </div>
            </div>
            <div className="flex items-center gap-2">
                <button 
                    onClick={handleDownload}
                    className="flex items-center gap-2 px-3 py-1.5 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg font-bold text-xs transition-colors"
                >
                    <Download className="w-4 h-4" /> Download Printable Report
                </button>
                <button 
                    onClick={() => window.print()}
                    className="flex items-center gap-2 px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg font-bold text-xs transition-colors"
                >
                    <Printer className="w-4 h-4" /> Print
                </button>
                <button onClick={onClose} className="text-slate-400 hover:text-slate-600 ml-2"><X className="w-6 h-6"/></button>
            </div>
        </div>
        
        {/* Content */}
        <div className="p-6 overflow-y-auto modal-content-area print:p-0">
          <div className="space-y-6">
            <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4 print:shadow-none print:border-b print:border-t-0 print:border-x-0 print:border-black print:p-0 print:pb-4 print:mb-4 print:rounded-none">
                <div className="flex items-start gap-4">
                    <div className="p-3 bg-slate-100 rounded-full hidden md:block print:hidden"><User className="w-8 h-8 text-slate-400" /></div>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-800 print:text-black">{resident.name}</h1>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500 mt-1 print:text-black">
                            <span className="font-mono bg-slate-100 px-2 py-0.5 rounded text-xs print:bg-transparent print:border print:border-gray-300">MRN: {resident.mrn}</span>
                            <span>{resident.unit}</span>
                            <span>Room {resident.room}</span>
                        </div>
                    </div>
                </div>
                <div>{getStatusBadge(resident.compliance.status)}</div>
            </div>

            <div className="flex border-b border-slate-200 no-print-in-modal">
                <button onClick={() => setActiveTab('overview')} className={`px-6 py-3 font-medium text-sm flex items-center gap-2 border-b-2 transition-colors ${activeTab === 'overview' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-700'}`}><LayoutDashboard className="w-4 h-4" /> Overview</button>
                <button onClick={() => setActiveTab('history')} className={`px-6 py-3 font-medium text-sm flex items-center gap-2 border-b-2 transition-colors ${activeTab === 'history' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-700'}`}><History className="w-4 h-4" /> History & Logs</button>
            </div>
            
            <div className={`${activeTab === 'overview' ? 'space-y-4' : 'hidden'} print:block print:space-y-4`}>
                {generalComplianceAlerts.length > 0 && (
                     <div className={`border rounded-xl p-6 ${resident.compliance.status === ComplianceStatus.CRITICAL ? 'bg-red-50 border-red-100' : 'bg-yellow-50 border-yellow-100'} print:bg-transparent print:border-black print:p-4 print:mb-4`}>
                        <h3 className={`font-bold flex items-center gap-2 mb-3 ${resident.compliance.status === ComplianceStatus.CRITICAL ? 'text-red-800' : 'text-yellow-800'} print:text-black`}><AlertTriangle className="w-5 h-5"/> Compliance Alerts</h3>
                        <ul className="space-y-2">
                            {generalComplianceAlerts.map((issue, idx) => (
                                <li key={idx} className={`flex items-start gap-2 text-sm ${resident.compliance.status === ComplianceStatus.CRITICAL ? 'text-red-700' : 'text-yellow-800'} print:text-black`}>
                                    <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${resident.compliance.status === ComplianceStatus.CRITICAL ? 'bg-red-500' : 'bg-yellow-500'} print:bg-black`}/>
                                    {issue}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {medicationWarnings.length > 0 && (
                     <div className={`border rounded-xl p-6 bg-purple-50 border-purple-100 print:bg-transparent print:border-black print:p-4 print:mb-4`}>
                        <h3 className={`font-bold flex items-center gap-2 mb-3 text-purple-800 print:text-black`}><Pill className="w-5 h-5"/> Medication Specific Warnings</h3>
                        <ul className="space-y-2">
                            {medicationWarnings.map((issue, idx) => (
                                <li key={idx} className={`flex items-start gap-2 text-sm text-purple-700 print:text-black`}>
                                    <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 bg-purple-500 print:bg-black`}/>
                                    {issue}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>
            
            {/* Overview Section */}
            <div className={activeTab === 'overview' ? 'block' : 'hidden print:block break-after-section'}>
              <div id="summary-section" className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 mb-6 print:shadow-none print:border-black print:break-inside-avoid">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-bold text-slate-700 flex items-center gap-2"><Settings className="w-5 h-5 text-primary" /> Compliance Summary</h3>
                    <p className="text-xs text-slate-500">Snapshot of required compliance elements.</p>
                  </div>
                  <div className="flex flex-wrap gap-2 no-print-in-modal">
                    <button
                      onClick={() => setShowManualGdr(true)}
                      className="px-3 py-2 rounded-lg bg-blue-50 text-blue-700 text-xs font-bold hover:bg-blue-100"
                    >
                      Update GDR
                    </button>
                    <button
                      onClick={() => {
                        setActiveTab('overview');
                        scrollToSection('meds-section');
                      }}
                      className="px-3 py-2 rounded-lg bg-slate-100 text-slate-700 text-xs font-bold hover:bg-slate-200"
                    >
                      Edit Med Indication
                    </button>
                    <button
                      onClick={() => {
                        setActiveTab('overview');
                        handleJumpToMissing();
                      }}
                      className="px-3 py-2 rounded-lg bg-amber-50 text-amber-700 text-xs font-bold hover:bg-amber-100"
                    >
                      Jump to missing items
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4 text-sm text-slate-600">
                  <div>
                    <div className="text-xs uppercase font-bold text-slate-400">Meds Parsed</div>
                    <div className="font-semibold text-slate-700">{resident.meds.length > 0 ? `Yes (${resident.meds.length})` : 'No'}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase font-bold text-slate-400">Indication Status</div>
                    <div className="font-semibold text-slate-700">{resident.meds.length > 0 ? (resident.compliance.indicationStatus || 'Needs Review') : 'N/A'}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase font-bold text-slate-400">Manual GDR</div>
                    <div className="font-semibold text-slate-700">{resident.meds.length > 0 ? resident.manualGdr.status.replace('_', ' ') : 'N/A'}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase font-bold text-slate-400">Psych Consult Status</div>
                    <div className="font-semibold text-slate-700">
                      {resident.meds.length > 0 ? (mostRecentConsult ? `Consult ${mostRecentConsult.date}` : (mostRecentOrder ? `MD Order ${mostRecentOrder.date}` : 'Missing')) : 'N/A'}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs uppercase font-bold text-slate-400">Behavior Monitoring</div>
                    <div className="font-semibold text-slate-700">{resident.meds.length > 0 ? `${behaviorCount} notes in last ${settings.behaviorWindowDays} days` : 'N/A'}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase font-bold text-slate-400">Care Plan</div>
                    <div className="font-semibold text-slate-700">{resident.meds.length > 0 ? (resident.carePlan.some(item => item.psychRelated) ? 'Present' : 'Missing') : 'N/A'}</div>
                  </div>
                  <div className="md:col-span-2 lg:col-span-3">
                    <div className="text-xs uppercase font-bold text-slate-400">Most Recent Episodic Behavior</div>
                    <div className="font-semibold text-slate-700">
                      {mostRecentEpisodic ? `${mostRecentEpisodic.date} — ${mostRecentEpisodic.snippet}` : 'None recorded'}
                    </div>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 print:grid-cols-1 print:gap-8">
                  <div className="lg:col-span-2 space-y-6">
                      <div id="meds-section" className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-full print:shadow-none print:border-black print:break-inside-avoid">
                          <div className="bg-slate-50 p-4 border-b border-slate-200 font-bold text-slate-700 flex items-center gap-2 print:bg-gray-100 print:border-black print:text-black"><Pill className="w-4 h-4 text-purple-600 print:text-black"/> Medications (Parsed)</div>
                          <div className="p-0">
                              {resident.meds.length === 0 ? <div className="p-8 text-center text-slate-400 text-sm print:text-black">No medication list parsed.</div> : 
                              <table className="w-full text-left text-sm">
                                  <thead className="bg-slate-50 text-xs uppercase text-slate-500 print:bg-white print:text-black print:border-b print:border-black">
                                      <tr>
                                          <th className="px-4 py-3 font-semibold print:px-2">Medication</th>
                                          <th className="px-4 py-3 font-semibold print:px-2">Indication</th>
                                          <th className="px-4 py-3 font-semibold print:px-2">Frequency</th>
                                          <th className="px-4 py-3 font-semibold print:px-2">Start</th>
                                          <th className="px-4 py-3 font-semibold print:px-2">Class</th>
                                      </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100 print:divide-black">
                                      {resident.meds.map((med, i) => (
                                          <tr key={i} className="hover:bg-slate-50 print:hover:bg-transparent">
                                              <td className="px-4 py-3 font-medium text-slate-800 print:text-black print:px-2"><div className="max-w-[150px] lg:max-w-none break-words">{med.display}</div></td>
                                              <td className="px-4 py-3 text-slate-600 print:text-black print:px-2">
                                                <div className="space-y-1">
                                                  <input
                                                    type="text"
                                                    value={med.indication || ''}
                                                    onChange={(e) => handleMedUpdate(i, { indication: e.target.value })}
                                                    className="w-full p-1.5 border border-slate-300 rounded text-xs print:hidden"
                                                    placeholder="Indication"
                                                  />
                                                  {med.indicationMatch && (
                                                    <div className="text-[10px] text-slate-500 print:text-black">
                                                      Confidence {Math.round(med.indicationMatch.confidence * 100)}%
                                                      {med.indicationMatch.source !== 'none' && ` · ${med.indicationMatch.source.replace('-', ' ')}`}
                                                    </div>
                                                  )}
                                                  <div className="text-xs print:block hidden">{med.indication || 'Unknown'}</div>
                                                </div>
                                              </td>
                                              <td className="px-4 py-3 text-slate-600 print:text-black print:px-2"><div className="max-w-[150px] lg:max-w-none break-words">{med.frequency}</div></td>
                                              <td className="px-4 py-3 text-slate-600 font-mono text-xs print:text-black print:px-2 whitespace-nowrap">{med.startDate || '—'}</td>
                                              <td className="px-4 py-3 print:px-2">
                                                <div className="space-y-1">
                                                  <select
                                                    value={med.classOverride || ''}
                                                    onChange={(e) => handleMedUpdate(i, { classOverride: (e.target.value || undefined) as MedicationClass | undefined })}
                                                    className="w-full p-1.5 border border-slate-300 rounded text-xs print:hidden"
                                                  >
                                                    <option value="">Auto: {med.class}</option>
                                                    {medClasses.map(cls => (
                                                      <option key={cls} value={cls}>{cls}</option>
                                                    ))}
                                                  </select>
                                                  <span className="bg-purple-50 text-purple-700 px-2 py-0.5 rounded text-xs border border-purple-100 print:bg-transparent print:text-black print:border-0 print:p-0 whitespace-nowrap print:block hidden">
                                                    {med.classOverride || med.class}
                                                  </span>
                                                </div>
                                              </td>
                                          </tr>
                                      ))}
                                  </tbody>
                              </table>}
                          </div>
                      </div>
                      <div id="careplan-section" className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden print:shadow-none print:border-black print:break-inside-avoid">
                          <div className="bg-slate-50 p-4 border-b border-slate-200 font-bold text-slate-700 flex items-center gap-2 print:bg-gray-100 print:border-black print:text-black"><FileText className="w-4 h-4 text-green-600 print:text-black"/> Care Plan Items</div>
                          <div className="p-4">
                              {resident.carePlan.length === 0 ? <div className="p-4 text-center text-red-400 text-sm bg-red-50 rounded-lg border border-red-100 print:bg-transparent print:text-black print:border-black"><AlertTriangle className="w-5 h-5 mx-auto mb-2"/>No Psychotropic Care Plan Found</div> : 
                              <ul className="space-y-3">
                                  {resident.carePlan.map((item, i) => (
                                    <li key={i} className="flex items-start gap-3 text-sm text-slate-600 bg-slate-50 p-3 rounded-lg print:bg-transparent print:text-black print:border-b print:border-gray-200 print:p-2 print:rounded-none">
                                      <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 shrink-0 print:text-black"/>
                                      <div>
                                        <div>{item.text}</div>
                                        {item.psychRelated && <span className="text-[10px] uppercase font-bold text-purple-600">Psychotropic use</span>}
                                      </div>
                                    </li>
                                  ))}
                              </ul>}
                          </div>
                      </div>
                  </div>
                  <div className="space-y-6">
                      <div id="consults-section" className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden print:shadow-none print:border-black print:break-inside-avoid">
                          <div className="bg-slate-50 p-4 border-b border-slate-200 font-bold text-slate-700 flex items-center gap-2 print:bg-gray-100 print:border-black print:text-black"><Activity className="w-4 h-4 text-orange-600 print:text-black"/> Consults & Behaviors</div>
                          <div className="p-0">
                              <div id="behaviors-section" />
                              <div className="max-h-[300px] overflow-y-auto print:max-h-none print:overflow-visible">
                                  {(resident.consults.length === 0 && resident.behaviors.length === 0 && resident.psychMdOrders.length === 0) ? <div className="p-8 text-center text-slate-400 text-sm print:text-black">No consult or behavior history found.</div> : 
                                  <table className="w-full text-left text-sm">
                                      <thead className="bg-slate-50 text-xs uppercase text-slate-500 sticky top-0 print:static print:bg-white print:text-black print:border-b print:border-black"><tr><th className="px-4 py-2 print:px-2">Date</th><th className="px-4 py-2 print:px-2">Type</th><th className="px-4 py-2 print:px-2">Note</th></tr></thead>
                                      <tbody className="divide-y divide-slate-100 print:divide-black">
                                          {resident.consults.map((c, i) => (<tr key={`c-${i}`} className="hover:bg-slate-50 print:hover:bg-transparent"><td className="px-4 py-3 font-mono text-xs print:px-2 print:text-black whitespace-nowrap">{c.date}</td><td className="px-4 py-3 text-xs print:px-2 print:text-black">Consult</td><td className="px-4 py-3 text-slate-500 truncate max-w-[200px] print:text-black print:max-w-none print:whitespace-normal print:px-2" title={c.snippet}>{c.snippet}</td></tr>))}
                                          {resident.psychMdOrders.map((o, i) => (<tr key={`o-${i}`} className="hover:bg-slate-50 print:hover:bg-transparent"><td className="px-4 py-3 font-mono text-xs print:px-2 print:text-black whitespace-nowrap">{o.date}</td><td className="px-4 py-3 text-xs print:px-2 print:text-black">MD Order</td><td className="px-4 py-3 text-slate-500 truncate max-w-[200px] print:text-black print:max-w-none print:whitespace-normal print:px-2" title={o.orderText}>{o.orderText}</td></tr>))}
                                          {resident.behaviors.map((b, i) => (<tr key={`b-${i}`} className="hover:bg-slate-50 print:hover:bg-transparent"><td className="px-4 py-3 font-mono text-xs print:px-2 print:text-black whitespace-nowrap">{b.date}</td><td className="px-4 py-3 text-xs print:px-2 print:text-black">Behavior</td><td className="px-4 py-3 text-slate-500 truncate max-w-[200px] print:text-black print:max-w-none print:whitespace-normal print:px-2" title={b.snippet}>{b.snippet}</td></tr>))}
                                      </tbody>
                                  </table>}
                              </div>
                          </div>
                      </div>
                  </div>
              </div>
            </div>

            {/* History Section */}
            <div className={activeTab === 'history' ? 'block' : 'hidden print:block'}>
              <div className="space-y-6">
                  {/* GDR History - Enhanced Timeline */}
                  <div id="gdr-section" className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden print:shadow-none print:border-black print:break-inside-avoid">
                      <div className="bg-slate-50 p-4 border-b border-slate-200 font-bold text-slate-700 flex items-center gap-2 print:bg-gray-100 print:border-black print:text-black"><RefreshCw className="w-4 h-4 text-blue-600 print:text-black"/> GDR Attempt History</div>
                      <div className="p-6">
                          {(!resident.gdr || resident.gdr.length === 0) ? (
                              <div className="text-center text-slate-400 text-sm print:text-black">No GDR attempts recorded.</div>
                          ) : (
                              <div className="relative border-l-2 border-slate-200 ml-3 my-2 space-y-8 print:border-black">
                                  {resident.gdr.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((gdr, i) => {
                                      const isReduction = /reduc|decreas|discontin/i.test(gdr.status);
                                      const isFail = /fail|unsuccess|unable|decline/i.test(gdr.status);
                                      const isContra = /contra|clinic/i.test(gdr.status);
                                      
                                      let dotClass = "bg-slate-200 border-slate-300";
                                      let textClass = "text-slate-600";
                                      
                                      if (isReduction) {
                                          dotClass = "bg-green-100 border-green-500";
                                          textClass = "text-green-700";
                                      } else if (isFail) {
                                          dotClass = "bg-red-100 border-red-500";
                                          textClass = "text-red-700";
                                      } else if (isContra) {
                                          dotClass = "bg-amber-100 border-amber-500";
                                          textClass = "text-amber-700";
                                      }

                                      return (
                                          <div key={i} className="relative pl-8 print:break-inside-avoid">
                                              <span className={`absolute -left-[9px] top-1.5 w-4 h-4 rounded-full border-2 ${dotClass} print:border-black print:bg-white`}></span>
                                              <div className="flex flex-col gap-1">
                                                  <div className="flex items-center justify-between">
                                                      <span className="font-bold text-slate-800 text-sm print:text-black">{gdr.date}</span>
                                                      <span className={`text-xs font-bold uppercase px-2 py-0.5 rounded ${dotClass.split(' ')[0]} ${textClass} print:bg-transparent print:text-black print:border print:border-black`}>{gdr.status}</span>
                                                  </div>
                                                  <div className="text-sm font-medium text-slate-700 print:text-black">
                                                      {gdr.medication || 'Medication not specified'}
                                                      {gdr.dose && <span className="font-normal text-slate-500 print:text-black"> ({gdr.dose})</span>}
                                                  </div>
                                                  {gdr.lastPsychEval && (
                                                     <div className="text-xs text-slate-400 print:text-black">Ref: Psych Eval {gdr.lastPsychEval}</div>
                                                  )}
                                              </div>
                                          </div>
                                      );
                                  })}
                              </div>
                          )}
                      </div>
                  </div>

                  {/* Monthly Review History */}
                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden print:shadow-none print:border-black print:break-inside-avoid">
                      <div className="bg-slate-50 p-4 border-b border-slate-200 font-bold text-slate-700 flex items-center gap-2 print:bg-gray-100 print:border-black print:text-black"><History className="w-4 h-4 text-slate-500 print:text-black"/> Compliance Review History</div>
                      <div className="p-0">
                          {history.length === 0 ? <div className="p-4 text-center text-slate-400 text-sm print:text-black">No prior monthly reviews found.</div> : 
                          <table className="w-full text-left text-sm">
                              <thead className="bg-slate-50 text-xs uppercase text-slate-500 print:bg-white print:text-black print:border-b print:border-black"><tr><th className="px-4 py-2 print:px-2">Review Month</th><th className="px-4 py-2 print:px-2">Status</th><th className="px-4 py-2 print:px-2">Issues Found</th></tr></thead>
                              <tbody className="divide-y divide-slate-100 print:divide-black">
                                  {history.map((rec, i) => (<tr key={i} className="hover:bg-slate-50 print:hover:bg-transparent"><td className="px-4 py-3 font-mono text-xs font-bold text-slate-700 print:text-black print:px-2">{rec.month}</td><td className="px-4 py-3 print:px-2">{getStatusBadge(rec.status)}</td><td className="px-4 py-3 text-slate-600 print:text-black print:px-2">{rec.issueCount} Issue(s)</td></tr>))}
                              </tbody>
                          </table>}
                      </div>
                  </div>

                  {/* Audit Logs */}
                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden print:shadow-none print:border-black print:break-inside-avoid">
                      <div className="bg-slate-50 p-4 border-b border-slate-200 font-bold text-slate-700 flex items-center gap-2 print:bg-gray-100 print:border-black print:text-black"><FileText className="w-4 h-4 text-slate-500 print:text-black"/> Audit Log & Activity</div>
                      <div className="p-0">
                          {(!resident.logs || resident.logs.length === 0) ? <div className="p-4 text-center text-slate-400 text-sm print:text-black">No recorded history.</div> : 
                          <table className="w-full text-left text-sm">
                              <thead className="bg-slate-50 text-xs uppercase text-slate-500 print:bg-white print:text-black print:border-b print:border-black"><tr><th className="px-4 py-2 print:px-2">Time</th><th className="px-4 py-2 print:px-2">Action</th></tr></thead>
                              <tbody className="divide-y divide-slate-100 print:divide-black">
                                  {resident.logs.map((log, i) => (<tr key={i} className="hover:bg-slate-50 print:hover:bg-transparent"><td className="px-4 py-2 text-xs text-slate-500 w-48 print:text-black print:px-2">{log.timestamp}</td><td className={`px-4 py-2 print:px-2 print:text-black ${log.type === 'alert' ? 'text-red-600 font-medium' : (log.type === 'update' ? 'text-blue-600' : 'text-slate-700')}`}>{log.message}</td></tr>))}
                              </tbody>
                          </table>}
                      </div>
                  </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    </>
  );
};
