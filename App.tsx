import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Activity, Lock, Printer, Upload, HelpCircle, Filter, X, Calendar, Download, FileJson, FileWarning, Settings, Cloud } from 'lucide-react';
import { ResidentData, ParseType, ComplianceStatus, ReviewHistoryItem, AuditEntry, AppSettings, ManualGdrData } from './types';
import { parseCensus, parseMeds, parseConsults, parseCarePlans, parseGdr, parseBehaviors, parsePsychMdOrders, parseEpisodicBehaviors } from './services/parserService';
import { evaluateResidentCompliance } from './services/complianceService';
import { DEFAULT_SETTINGS, normalizeSettings } from './services/settingsService';
import { LockScreen } from './components/LockScreen';
import { ParserModal } from './components/ParserModal';
import { ResidentList } from './components/ResidentList';
import { ResidentProfileModal } from './components/ResidentProfileModal';
import { Dashboard } from './components/Dashboard';
import { DeficiencyReport } from './components/DeficiencyReport';
import { SettingsModal } from './components/SettingsModal';

const PrintStyles = () => (
  <style>{`
    @media print {
      @page { margin: 0.5in; size: landscape; }
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .no-print { display: none !important; }
      .print-only { display: block !important; }
      
      .max-w-7xl, .container { 
        max-width: none !important; 
        width: 100% !important; 
        padding: 0 !important;
        margin: 0 !important;
      }
    }
  `}</style>
);

const createDefaultManualGdr = (): ManualGdrData => ({
  status: 'NOT_SET',
  contraindications: {
    symptomsReturned: false,
    additionalGdrLikelyToImpair: false,
    riskToSelfOrOthers: false,
    other: false,
    otherText: ''
  },
  note: '',
  updatedAt: undefined,
  updatedBy: ''
});

const STORAGE_KEY = 'gdr-compliance-tool:data';
const STORAGE_VERSION = 1;

type StoredPayload = {
  version: number;
  savedAt: string;
  reviews: Record<string, Record<string, ResidentData>>;
  settings: AppSettings;
};

type MapValidationError = {
  line: number;
  message: string;
  content: string;
};

const KNOWN_INDICATION_CLASSES = Object.keys(DEFAULT_SETTINGS.indicationMap);

const formatIndicationMap = (settings: AppSettings): string => {
  return Object.entries(settings.indicationMap)
    .map(([cls, items]) => `${cls}: ${items.join(', ')}`)
    .join('\n');
};

const validateIndicationMap = (raw: string): MapValidationError[] => {
  const errors: MapValidationError[] = [];
  raw.split(/\r?\n/).forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    const separatorIndex = trimmed.indexOf(':');
    if (separatorIndex === -1) {
      errors.push({ line: index + 1, message: 'Missing ":" separator.', content: line });
      return;
    }
    const cls = trimmed.slice(0, separatorIndex).trim();
    const rest = trimmed.slice(separatorIndex + 1).trim();
    if (!cls) {
      errors.push({ line: index + 1, message: 'Missing class name before ":".', content: line });
      return;
    }
    if (!rest) {
      errors.push({ line: index + 1, message: 'Provide at least one indication after ":".', content: line });
      return;
    }
    const values = rest.split(',').map((value) => value.trim()).filter(Boolean);
    if (values.length === 0) {
      errors.push({ line: index + 1, message: 'Provide at least one indication after ":".', content: line });
      return;
    }
    if (!KNOWN_INDICATION_CLASSES.includes(cls)) {
      errors.push({ line: index + 1, message: `Unknown class "${cls}".`, content: line });
    }
  });
  return errors;
};

const parseIndicationMap = (raw: string, fallback: AppSettings): AppSettings['indicationMap'] => {
  const map = { ...fallback.indicationMap };
  raw.split(/\r?\n/).forEach(line => {
    const trimmed = line.trim();
    if (!trimmed) return;
    const [cls, rest] = trimmed.split(':');
    if (!cls || rest === undefined) return;
    const key = cls.trim() as keyof AppSettings['indicationMap'];
    const values = rest.split(',').map(v => v.trim()).filter(Boolean);
    if (key) {
      map[key] = values;
    }
  });
  return map;
};

const formatCustomMedMap = (settings: AppSettings): string => {
  return Object.entries(settings.customMedicationMap)
    .map(([drug, cls]) => `${drug} = ${cls}`)
    .join('\n');
};

const validateCustomMedMap = (raw: string): MapValidationError[] => {
  const errors: MapValidationError[] = [];
  raw.split(/\r?\n/).forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) {
      errors.push({ line: index + 1, message: 'Missing "=" separator.', content: line });
      return;
    }
    const drug = trimmed.slice(0, separatorIndex).trim();
    const cls = trimmed.slice(separatorIndex + 1).trim();
    if (!drug) {
      errors.push({ line: index + 1, message: 'Missing drug name before "=".', content: line });
      return;
    }
    if (!cls) {
      errors.push({ line: index + 1, message: 'Missing class name after "=".', content: line });
    }
  });
  return errors;
};

const parseCustomMedMap = (raw: string, fallback: AppSettings): AppSettings['customMedicationMap'] => {
  const map = { ...fallback.customMedicationMap };
  raw.split(/\r?\n/).forEach(line => {
    const trimmed = line.trim();
    if (!trimmed) return;
    const [drug, cls] = trimmed.split('=');
    if (!drug || !cls) return;
    map[drug.trim().toLowerCase()] = cls.trim() as AppSettings['customMedicationMap'][string];
  });
  return map;
};

const normalizeMedicationClass = (value?: string): string => {
  if (!value) return 'Other';
  if (value === 'Hypnotic' || value === 'Hypnotic/Sedative') return 'HYPNOTICS/SEDATIVES/SLEEP DISORDER AGENTS';
  if (value === 'Antipsychotic') return 'ANTIPSYCHOTICS/ANTIMANIC AGENTS';
  if (value === 'Antidepressant') return 'ANTIDEPRESSANTS';
  if (value === 'Anxiolytic') return 'ANTIANXIETY AGENTS';
  if (value === 'Mood stabilizer' || value === 'Mood Stabilizer') return 'PSYCHOTHERAPEUTIC AND NEUROLOGICAL AGENTS - MISC.';
  if (value === 'Cognitive Enhancer') return 'PSYCHOTHERAPEUTIC AND NEUROLOGICAL AGENTS - MISC.';
  return value;
};

function App() {
  const appRef = useRef<HTMLDivElement>(null);
  const [reviews, setReviews] = useState<Record<string, Record<string, ResidentData>>>({});
  const [selectedMonth, setSelectedMonth] = useState<string>(new Date().toISOString().slice(0, 7));
  const [selectedMrn, setSelectedMrn] = useState<string | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  const [showParser, setShowParser] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [indicationMapText, setIndicationMapText] = useState(() => formatIndicationMap(DEFAULT_SETTINGS));
  const [customMedMapText, setCustomMedMapText] = useState(() => formatCustomMedMap(DEFAULT_SETTINGS));
  const [indicationMapErrors, setIndicationMapErrors] = useState<MapValidationError[]>(() => validateIndicationMap(formatIndicationMap(DEFAULT_SETTINGS)));
  const [customMedMapErrors, setCustomMedMapErrors] = useState<MapValidationError[]>(() => validateCustomMedMap(formatCustomMedMap(DEFAULT_SETTINGS)));
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);


  const [, setAuditLog] = useState<string[]>([]);
  const [, setShowComplianceModal] = useState(false);
  const [filterText, setFilterText] = useState("");
  const [unitFilter, setUnitFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [psychOnly, setPsychOnly] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hasHydrated = useRef(false);

  useEffect(() => {
    const element = appRef.current;
    if (!element) return undefined;

    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;

    const applyScale = () => {
      const { innerWidth, innerHeight } = window;
      const rect = element.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      const scale = Math.min(1, innerWidth / rect.width, innerHeight / rect.height);
      element.style.transform = `scale(${scale})`;
      element.style.transformOrigin = 'top left';
      element.style.width = scale < 1 ? `${(1 / scale) * 100}%` : '100%';
      element.style.height = scale < 1 ? `${(1 / scale) * 100}%` : 'auto';
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
    };

    applyScale();
    const resizeObserver = new ResizeObserver(() => applyScale());
    resizeObserver.observe(element);
    window.addEventListener('resize', applyScale);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', applyScale);
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      element.style.transform = '';
      element.style.transformOrigin = '';
      element.style.width = '';
      element.style.height = '';
    };
  }, []);

  useEffect(() => {
    const nextIndicationText = formatIndicationMap(settings);
    const nextCustomMedText = formatCustomMedMap(settings);
    setIndicationMapText(nextIndicationText);
    setCustomMedMapText(nextCustomMedText);
    setIndicationMapErrors(validateIndicationMap(nextIndicationText));
    setCustomMedMapErrors(validateCustomMedMap(nextCustomMedText));
  }, [settings]);

  const addGlobalLog = useCallback((action: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setAuditLog((prev: string[]) => [`[${timestamp}] ${action}`, ...prev]);
  }, []);

  const createAuditEntry = (message: string, type: AuditEntry['type'] = 'info'): AuditEntry => ({
    timestamp: new Date().toLocaleString(),
    message,
    type
  });

  const normalizeResident = (resident: ResidentData): ResidentData => {
    const normalizedMeds = (resident.meds || []).map((med) => ({
      ...med,
      nameRaw: med.nameRaw || med.display || med.drug,
      nameNorm: med.nameNorm || (med.drug || '').toLowerCase(),
      class: normalizeMedicationClass(med.class) as ResidentData['meds'][number]['class'],
      classOverride: med.classOverride ? (normalizeMedicationClass(med.classOverride) as ResidentData['meds'][number]['class']) : med.classOverride
    }));
    return {
      ...resident,
      meds: normalizedMeds,
      consults: resident.consults || [],
      behaviors: resident.behaviors || [],
      gdr: resident.gdr || [],
      carePlan: resident.carePlan || [],
      diagnoses: resident.diagnoses || [],
      logs: resident.logs || [],
      psychMdOrders: resident.psychMdOrders || [],
      episodicBehaviors: resident.episodicBehaviors || [],
      manualGdr: resident.manualGdr || createDefaultManualGdr(),
      compliance: {
        status: resident.compliance?.status || ComplianceStatus.UNKNOWN,
        issues: resident.compliance?.issues || [],
        lastGdrDate: resident.compliance?.lastGdrDate,
        firstAntipsychoticDate: resident.compliance?.firstAntipsychoticDate,
        gdrOverdue: resident.compliance?.gdrOverdue || false,
        missingCarePlan: resident.compliance?.missingCarePlan || false,
        missingConsent: resident.compliance?.missingConsent || false,
        behaviorNotesCount: resident.compliance?.behaviorNotesCount,
        carePlanPsychPresent: resident.compliance?.carePlanPsychPresent,
        indicationStatus: resident.compliance?.indicationStatus,
        consultStatus: resident.compliance?.consultStatus,
        manualGdrStatus: resident.compliance?.manualGdrStatus
      }
    };
  };

  const hydrateFromPayload = useCallback((payload: StoredPayload) => {
    const nextSettings = normalizeSettings(payload.settings || {});
    const normalizedReviews: Record<string, Record<string, ResidentData>> = {};

    Object.entries(payload.reviews || {}).forEach(([month, data]) => {
      const monthData: Record<string, ResidentData> = {};
      Object.entries(data as Record<string, ResidentData>).forEach(([mrn, resident]) => {
        monthData[mrn] = normalizeResident(resident);
      });
      recalculateCompliance(monthData, month, nextSettings);
      normalizedReviews[month] = monthData;
    });

    setSettings(nextSettings);
    setReviews(normalizedReviews);
    setLastSavedAt(payload.savedAt || null);
  }, [normalizeResident, recalculateCompliance]);

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      hasHydrated.current = true;
      return;
    }
    try {
      const parsed = JSON.parse(raw) as StoredPayload;
      if (!parsed || parsed.version !== STORAGE_VERSION) {
        hasHydrated.current = true;
        return;
      }
      hydrateFromPayload(parsed);
      addGlobalLog("Local auto-save loaded.");
    } catch {
      // ignore malformed local storage data
    } finally {
      hasHydrated.current = true;
    }
  }, [hydrateFromPayload, addGlobalLog]);

  useEffect(() => {
    if (!hasHydrated.current) return;
    const payload: StoredPayload = {
      version: STORAGE_VERSION,
      savedAt: new Date().toISOString(),
      reviews,
      settings
    };
    const timeout = window.setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
        setLastSavedAt(payload.savedAt);
      } catch {
        // ignore storage errors (quota, etc.)
      }
    }, 500);
    return () => window.clearTimeout(timeout);
  }, [reviews, settings]);

  const recalculateCompliance = useCallback((monthData: Record<string, ResidentData>, month: string, settingsToUse: AppSettings) => {
    const [y, m] = month.split('-').map(Number);
    const lastDay = new Date(y, m, 0);
    Object.keys(monthData).forEach(mrn => {
      monthData[mrn] = evaluateResidentCompliance(monthData[mrn], lastDay, settingsToUse);
    });
  }, []);

  const handleParse = useCallback((type: ParseType, rawText: string, targetMonth: string) => {
    const currentMonthData = { ...(reviews[targetMonth] || {}) };
    let count = 0;

    const ensureResident = (mrn: string) => {
      if (!currentMonthData[mrn]) {
        currentMonthData[mrn] = {
          mrn, name: 'Unknown', room: '', unit: '',
          meds: [], consults: [], behaviors: [], gdr: [], carePlan: [], diagnoses: [],
          psychMdOrders: [], episodicBehaviors: [], manualGdr: createDefaultManualGdr(),
          logs: [createAuditEntry("Partial record created", "info")],
          compliance: { status: ComplianceStatus.UNKNOWN, issues: [], gdrOverdue: false, missingCarePlan: false, missingConsent: false, manualGdrStatus: 'NOT_SET' }
        };
      }
      if (!currentMonthData[mrn].logs) currentMonthData[mrn].logs = [];
      if (!currentMonthData[mrn].diagnoses) currentMonthData[mrn].diagnoses = [];
      if (!currentMonthData[mrn].behaviors) currentMonthData[mrn].behaviors = [];
      if (!currentMonthData[mrn].gdr) currentMonthData[mrn].gdr = [];
      if (!currentMonthData[mrn].carePlan) currentMonthData[mrn].carePlan = [];
      if (!currentMonthData[mrn].consults) currentMonthData[mrn].consults = [];
      if (!currentMonthData[mrn].psychMdOrders) currentMonthData[mrn].psychMdOrders = [];
      if (!currentMonthData[mrn].episodicBehaviors) currentMonthData[mrn].episodicBehaviors = [];
      if (!currentMonthData[mrn].manualGdr) currentMonthData[mrn].manualGdr = createDefaultManualGdr();
    };

    switch (type) {
      case ParseType.CENSUS:
        const parsedCensus = parseCensus(rawText);
        parsedCensus.forEach(p => {
          ensureResident(p.mrn);
          currentMonthData[p.mrn] = { ...currentMonthData[p.mrn], ...p, logs: currentMonthData[p.mrn].logs };
        });
        count = parsedCensus.length;
        break;
      
      case ParseType.MEDS:
        const parsedMeds = parseMeds(rawText, settings.customMedicationMap);
        const medsByMrn = parsedMeds.reduce((acc, med) => {
            if(!acc[med.mrn]) acc[med.mrn] = [];
            acc[med.mrn].push(med);
            return acc;
        }, {} as Record<string, typeof parsedMeds>);

        Object.entries(medsByMrn).forEach(([mrn, meds]) => {
            ensureResident(mrn);
            currentMonthData[mrn].meds = meds;
            
            const firstAP = meds.filter(m => (m.classOverride || m.class) === 'ANTIPSYCHOTICS/ANTIMANIC AGENTS' && m.startDate)
                                .sort((a, b) => new Date(a.startDate!).getTime() - new Date(b.startDate!).getTime())[0];
            
            if (firstAP && !currentMonthData[mrn].compliance.firstAntipsychoticDate) {
                currentMonthData[mrn].compliance.firstAntipsychoticDate = firstAP.startDate;
                currentMonthData[mrn].logs.push(createAuditEntry(`First antipsychotic date set: ${firstAP.startDate}`, 'update'));
            }
            currentMonthData[mrn].logs.push(createAuditEntry(`Medications updated (${meds.length} active)`, 'update'));
        });
        count = parsedMeds.length;
        break;

      case ParseType.BEHAVIORS:
        const parsedBehaviors = parseBehaviors(rawText);
        parsedBehaviors.forEach(({mrn, event}) => {
            ensureResident(mrn);
             if (!currentMonthData[mrn].behaviors.some(b => b.date === event.date)) {
                currentMonthData[mrn].behaviors.push(event);
            }
        });
        count = parsedBehaviors.length;
        if(count > 0) addGlobalLog(`${count} behavior logs parsed.`);
        break;

       case ParseType.CAREPLAN:
           const parsedCP = parseCarePlans(rawText);
           parsedCP.forEach(cp => {
               ensureResident(cp.mrn);
               if(!currentMonthData[cp.mrn].carePlan.some(i => i.text === cp.item.text)) {
                   currentMonthData[cp.mrn].carePlan.push(cp.item);
                   currentMonthData[cp.mrn].logs.push(createAuditEntry(`Care Plan item added`, 'update'));
               }
           });
           count = parsedCP.length;
           break;
      
      case ParseType.CONSULTS:
           const parsedConsults = parseConsults(rawText);
           parsedConsults.forEach(c => {
               ensureResident(c.mrn);
               if(!currentMonthData[c.mrn].consults.some(e => e.date === c.event.date && e.snippet === c.event.snippet)) {
                   currentMonthData[c.mrn].consults.push(c.event);
                   currentMonthData[c.mrn].logs.push(createAuditEntry(`Consult added: ${c.event.date}`, 'update'));
               }
           });
           count = parsedConsults.length;
           break;

      case ParseType.PSYCH_MD_ORDERS:
           const parsedOrders = parsePsychMdOrders(rawText, Object.values(currentMonthData));
           parsedOrders.forEach(order => {
               ensureResident(order.mrn);
               if (!currentMonthData[order.mrn].psychMdOrders.some(o => o.date === order.event.date && o.orderText === order.event.orderText)) {
                 currentMonthData[order.mrn].psychMdOrders.push(order.event);
                 currentMonthData[order.mrn].logs.push(createAuditEntry(`Psych MD order added: ${order.event.date}`, 'update'));
               }
           });
           count = parsedOrders.length;
           break;

      case ParseType.EPISODIC_BEHAVIORS:
           const parsedEpisodes = parseEpisodicBehaviors(rawText);
           parsedEpisodes.forEach(({ mrn, event }) => {
             ensureResident(mrn);
             if (!currentMonthData[mrn].episodicBehaviors.some(b => b.date === event.date && b.snippet === event.snippet)) {
               currentMonthData[mrn].episodicBehaviors.push(event);
               currentMonthData[mrn].logs.push(createAuditEntry(`Episodic behavior added: ${event.date}`, 'update'));
             }
           });
           count = parsedEpisodes.length;
           break;
      
      case ParseType.GDR:
           const parsedGdr = parseGdr(rawText);
           parsedGdr.forEach(g => {
               ensureResident(g.mrn);
               if(!currentMonthData[g.mrn].gdr.some(e => e.date === g.event.date)) {
                   currentMonthData[g.mrn].gdr.push(g.event);
                   currentMonthData[g.mrn].logs.push(createAuditEntry(`GDR event added: ${g.event.date}`, 'update'));
               }
           });
           count = parsedGdr.length;
           break;
    }

    recalculateCompliance(currentMonthData, targetMonth, settings);

    setReviews(prev => ({ ...prev, [targetMonth]: currentMonthData }));
    setSelectedMonth(targetMonth);
    addGlobalLog(`Parsed ${type} for ${targetMonth} - processed ${count} items.`);
  }, [reviews, settings, recalculateCompliance]);

  const currentResidents = useMemo(() => Object.values(reviews[selectedMonth] || {}), [reviews, selectedMonth]);

  const units = useMemo(() => Array.from(new Set(currentResidents.map(r => r.unit).filter(Boolean))).sort(), [currentResidents]);

  const handleSettingsChange = (updates: Partial<AppSettings>) => {
    const nextSettings = normalizeSettings({ ...settings, ...updates });
    setSettings(nextSettings);
    setReviews(prev => {
      const monthData = prev[selectedMonth];
      if (!monthData) return prev;
      const updatedMonth = { ...monthData };
      const customEntries = Object.entries(nextSettings.customMedicationMap);
      if (customEntries.length > 0) {
        Object.keys(updatedMonth).forEach(mrn => {
          updatedMonth[mrn] = {
            ...updatedMonth[mrn],
            meds: updatedMonth[mrn].meds.map(med => {
              const match = customEntries.find(([drug]) => med.nameNorm.includes(drug));
              if (!match) return med;
              return { ...med, class: match[1] };
            })
          };
        });
      }
      recalculateCompliance(updatedMonth, selectedMonth, nextSettings);
      return { ...prev, [selectedMonth]: updatedMonth };
    });
  };

  const filteredResidents = useMemo(() => {
    const term = filterText.toLowerCase();
    return currentResidents.filter(r => 
      (r.name.toLowerCase().includes(term) || r.mrn.toLowerCase().includes(term)) &&
      (unitFilter === "ALL" || r.unit === unitFilter) &&
      (statusFilter === "ALL" || r.compliance.status === statusFilter) &&
      (!psychOnly || r.meds.length > 0)
    ).sort((a,b) => a.name.localeCompare(b.name));
  }, [currentResidents, filterText, unitFilter, statusFilter, psychOnly]);

  const filteredNonCompliantResidents = useMemo(() => {
    return filteredResidents.filter(r => r.compliance.status === ComplianceStatus.WARNING || r.compliance.status === ComplianceStatus.CRITICAL);
  }, [filteredResidents]);

  const selectedResidentData = selectedMrn && reviews[selectedMonth] ? reviews[selectedMonth][selectedMrn] : null;

  const getResidentHistory = useCallback((mrn: string): ReviewHistoryItem[] => {
      return Object.keys(reviews).sort().reverse().map(month => {
          const r = reviews[month][mrn];
          return r ? { month, status: r.compliance.status, issueCount: r.compliance.issues.length } : null;
      }).filter((item): item is ReviewHistoryItem => item !== null);
  }, [reviews]);

  const handleExport = () => {
      const payload: StoredPayload = {
        version: STORAGE_VERSION,
        savedAt: new Date().toISOString(),
        reviews,
        settings
      };
      const dataStr = JSON.stringify(payload, null, 2);
      const blob = new Blob([dataStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `compliance_backup_${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      addGlobalLog("Data exported to JSON.");
  };

  const handleImportClick = () => fileInputRef.current?.click();

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
          try {
              const json = JSON.parse(event.target?.result as string);
              const payload: StoredPayload = json.reviews
                ? {
                    version: json.version || STORAGE_VERSION,
                    savedAt: json.savedAt || new Date().toISOString(),
                    reviews: json.reviews,
                    settings: json.settings || DEFAULT_SETTINGS
                  }
                : {
                    version: STORAGE_VERSION,
                    savedAt: new Date().toISOString(),
                    reviews: json,
                    settings: DEFAULT_SETTINGS
                  };
              hydrateFromPayload(payload);
              addGlobalLog("Database restored from backup.");
              alert("Import successful.");
          } catch (err) { alert("Failed to parse JSON file."); }
      };
      reader.readAsText(file);
      e.target.value = '';
  };

  const handleOpenOneDriveFolder = () => {
    if (!settings.oneDriveFolderUrl) {
      alert("Add a OneDrive folder URL in Settings to open your backup location.");
      return;
    }
    window.open(settings.oneDriveFolderUrl, "_blank", "noopener,noreferrer");
  };

  const handleCloudSync = () => {
    if (!settings.oneDriveFolderUrl) {
      alert("Add a OneDrive folder URL in Settings to sync backups.");
      return;
    }
    handleExport();
    handleOpenOneDriveFolder();
    addGlobalLog("Backup exported for OneDrive sync.");
  };

  const handleDownloadReport = () => {
    const content = document.getElementById('main-content')?.innerHTML;
    if (!content) return;
    
    // Create a standalone HTML document for the report
    const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Compliance Report - ${selectedMonth}</title><script src="https://cdn.tailwindcss.com"></script><script>tailwind.config={theme:{extend:{colors:{primary:'#0b4ea2',secondary:'#0a3f85',bg:'#f6f8fc'}}}}</script><style>@media print{@page{margin:0.5in;size:landscape}.no-print{display:none!important}} .no-print{display:none!important}</style></head><body class="bg-white p-8">${content}</body></html>`;
    
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Compliance_Report_${selectedMonth}.html`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const updateResident = (mrn: string, updater: (resident: ResidentData) => ResidentData) => {
    setReviews(prev => {
      const monthData = prev[selectedMonth];
      if (!monthData || !monthData[mrn]) return prev;
      const updatedMonth = { ...monthData };
      updatedMonth[mrn] = updater(updatedMonth[mrn]);
      recalculateCompliance(updatedMonth, selectedMonth, settings);
      return { ...prev, [selectedMonth]: updatedMonth };
    });
  };

  return (
    <div ref={appRef} className="min-h-screen pb-12 print:bg-white print:pb-0">
      <PrintStyles />
      <LockScreen isLocked={isLocked} onUnlock={() => setIsLocked(false)} />
      <input type="file" ref={fileInputRef} onChange={handleImportFile} accept=".json" className="hidden" />

      {showParser && <ParserModal isOpen={showParser} onClose={() => setShowParser(false)} onParse={handleParse} />}
      {showSettingsModal && (
        <SettingsModal
          isOpen={showSettingsModal}
          onClose={() => setShowSettingsModal(false)}
          settings={settings}
          indicationMapText={indicationMapText}
          customMedMapText={customMedMapText}
          indicationMapErrors={indicationMapErrors}
          customMedMapErrors={customMedMapErrors}
          onSettingsChange={handleSettingsChange}
          onIndicationMapTextChange={(value) => {
            setIndicationMapText(value);
            setIndicationMapErrors(validateIndicationMap(value));
          }}
          onCustomMedMapTextChange={(value) => {
            setCustomMedMapText(value);
            setCustomMedMapErrors(validateCustomMedMap(value));
          }}
          onIndicationMapBlur={() => {
            if (indicationMapErrors.length === 0) {
              handleSettingsChange({ indicationMap: parseIndicationMap(indicationMapText, settings) });
            }
          }}
          onCustomMedMapBlur={() => {
            if (customMedMapErrors.length === 0) {
              handleSettingsChange({ customMedicationMap: parseCustomMedMap(customMedMapText, settings) });
            }
          }}
        />
      )}
      {showReport && <DeficiencyReport residents={filteredNonCompliantResidents} month={selectedMonth} onClose={() => setShowReport(false)} />}
      {selectedResidentData && (
          <ResidentProfileModal 
              resident={selectedResidentData} 
              history={getResidentHistory(selectedResidentData.mrn)} 
              settings={settings}
              onUpdateResident={updateResident}
              onClose={() => setSelectedMrn(null)} 
          />
      )}

      <header className="bg-gradient-to-r from-primary to-secondary text-white shadow-lg sticky top-0 z-30 no-print">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
             <div className="bg-white/10 p-2 rounded-lg"><Activity className="w-6 h-6 text-white" /></div>
             <div>
               <h1 className="text-xl font-bold tracking-tight">GDR & Psychotropic Compliance Review</h1>
               <p className="text-xs text-blue-100 opacity-90">CMS F758/F740 & NYSDOH 415.12 Tool</p>
             </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowParser(true)} className="flex items-center gap-2 bg-white/20 hover:bg-white/30 px-4 py-2 rounded-full text-sm font-bold transition-all border border-white/20"><Upload className="w-4 h-4" /> Input Data</button>
            <div className="h-6 w-px bg-white/20 mx-1"></div>
            <button onClick={handleExport} className="p-2 hover:bg-white/20 rounded-full" title="Export Backup"><Download className="w-5 h-5" /></button>
            <button onClick={handleImportClick} className="p-2 hover:bg-white/20 rounded-full" title="Import Backup"><FileJson className="w-5 h-5" /></button>
            <button onClick={handleCloudSync} className="p-2 hover:bg-white/20 rounded-full" title="Sync Backup to OneDrive"><Cloud className="w-5 h-5" /></button>
            <div className="h-6 w-px bg-white/20 mx-1"></div>
            <button onClick={() => setShowSettingsModal(true)} className="p-2 hover:bg-white/20 rounded-full" title="Settings"><Settings className="w-5 h-5" /></button>
            <button onClick={() => setShowComplianceModal(true)} className="p-2 hover:bg-white/20 rounded-full" title="Regulatory Info"><HelpCircle className="w-5 h-5" /></button>
            <button onClick={() => setIsLocked(true)} className="p-2 hover:bg-white/20 rounded-full text-yellow-300" title="Lock Screen"><Lock className="w-5 h-5" /></button>
          </div>
        </div>
        {lastSavedAt && (
          <div className="max-w-7xl mx-auto px-4 pb-2 flex justify-end text-[11px] text-blue-100 opacity-80">
            Auto-saved {new Date(lastSavedAt).toLocaleString()}
          </div>
        )}
      </header>

      <main id="main-content" className="max-w-7xl mx-auto px-4 py-8 print:p-0 print:mx-0">
        <div className="hidden print:block mb-8 border-b border-black pb-4">
            <h1 className="text-2xl font-bold text-black">Compliance Review Report</h1>
            <p className="text-sm text-gray-600">Review Month: {selectedMonth} | Generated: {new Date().toLocaleString()}</p>
            <div className="text-xs text-gray-500 mt-2 flex gap-4">
                <span>Filter: {filterText || "None"}</span>
                <span>Unit: {unitFilter}</span>
                <span>Status: {statusFilter}</span>
                <span>Count: {filteredResidents.length}</span>
            </div>
        </div>

        <div className="flex flex-col gap-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 no-print">
              <div className="flex items-center gap-3">
                  <div className="bg-white p-1.5 rounded-lg shadow-sm border border-slate-200"><Calendar className="w-5 h-5 text-slate-500" /></div>
                  <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase">Review Period</label>
                      <input type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className="bg-transparent font-bold text-lg text-slate-800 outline-none cursor-pointer hover:text-primary transition-colors" />
                  </div>
              </div>
              <div className="bg-white p-2 rounded-xl border border-slate-200 shadow-sm flex flex-col lg:flex-row gap-2 flex-1 w-full lg:w-auto">
                  <div className="flex-1 relative">
                      <input type="text" placeholder="Search Resident, MRN..." className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-primary focus:border-transparent outline-none" value={filterText} onChange={(e) => setFilterText(e.target.value)} />
                      <Filter className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                      {filterText && (<button onClick={() => setFilterText("")} className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>)}
                  </div>
                  <div className="flex flex-wrap gap-2 items-center">
                      <select value={unitFilter} onChange={(e) => setUnitFilter(e.target.value)} className="px-4 py-2 rounded-lg border border-slate-300 bg-slate-50 text-sm focus:ring-2 focus:ring-primary outline-none cursor-pointer hover:bg-white transition-colors"><option value="ALL">All Units</option>{units.map(u => <option key={u} value={u}>{u}</option>)}</select>
                      <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-4 py-2 rounded-lg border border-slate-300 bg-slate-50 text-sm focus:ring-2 focus:ring-primary outline-none cursor-pointer hover:bg-white transition-colors">
                        <option value="ALL">All Statuses</option>
                        <option value={ComplianceStatus.COMPLIANT}>Compliant</option>
                        <option value={ComplianceStatus.WARNING}>Warning</option>
                        <option value={ComplianceStatus.CRITICAL}>Critical</option>
                      </select>
                      <label className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm cursor-pointer hover:bg-white transition-colors">
                          <input type="checkbox" checked={psychOnly} onChange={e => setPsychOnly(e.target.checked)} className="form-checkbox h-4 w-4 rounded text-primary focus:ring-primary/50" />
                          Meds Parsed Only
                      </label>
                      <button onClick={handleDownloadReport} className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-800 text-white rounded-lg font-bold text-sm transition-colors shadow-sm ml-2">
                        <Printer className="w-4 h-4"/> Download Printable Report
                      </button>
                  </div>
              </div>
          </div>

          <div className="no-print">
             <Dashboard residents={filteredResidents} />
          </div>

          <div className="flex justify-between items-center no-print">
            <h2 className="text-xl font-bold text-slate-700">Resident Compliance List ({filteredResidents.length})</h2>
            <button 
              onClick={() => setShowReport(true)}
              disabled={filteredNonCompliantResidents.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-700 hover:bg-red-100 rounded-lg font-bold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FileWarning className="w-4 h-4"/> View Deficiency Report ({filteredNonCompliantResidents.length})
            </button>
          </div>

          <ResidentList residents={filteredResidents} onSelect={(r) => setSelectedMrn(r.mrn)} />
        </div>
      </main>
    </div>
  );
}

export default App;
