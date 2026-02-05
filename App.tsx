import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Activity, Lock, Printer, Upload, HelpCircle, Filter, X, Calendar, Download, FileJson, FileWarning, Settings, Cloud, CheckCircle } from 'lucide-react';
import { ResidentData, ParseType, ComplianceStatus, ReviewHistoryItem, AppSettings, ManualGdrData, StoredPayload } from './types';
import { parseCensus, parseMeds, parseConsults, parseCarePlans, parseGdr, parseBehaviors, parsePsychMdOrders, parseEpisodicBehaviors, setDateParseWarningHandler } from './services/parserService';
import { evaluateResidentCompliance } from './services/complianceService';
import { DEFAULT_SETTINGS, normalizeSettings } from './services/settingsService';
import { loadAutosave, saveAutosave, uploadToOneDrive } from './services/storageService';
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
  const [lastCloudSavedAt, setLastCloudSavedAt] = useState<string | null>(null);
  const [selectedMrns, setSelectedMrns] = useState<string[]>([]);
  const [, setShowComplianceModal] = useState(false);
  const [filterText, setFilterText] = useState("");
  const [unitFilter, setUnitFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [psychOnly, setPsychOnly] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const parserWorkerRef = useRef<Worker | null>(null);
  const parserRequestIdRef = useRef(0);
  const hasHydrated = useRef(false);
  const cloudSyncRef = useRef<number | null>(null);
  const cloudSyncInFlight = useRef(false);
  const [isMobileDevice, setIsMobileDevice] = useState(false);

  useEffect(() => {
    const nextIndicationText = formatIndicationMap(settings);
    const nextCustomMedText = formatCustomMedMap(settings);
    setIndicationMapText(nextIndicationText);
    setCustomMedMapText(nextCustomMedText);
    setIndicationMapErrors(validateIndicationMap(nextIndicationText));
    setCustomMedMapErrors(validateCustomMedMap(nextCustomMedText));
  }, [settings]);

  useEffect(() => {
    if (typeof navigator === 'undefined') return;
    const userAgent = navigator.userAgent ?? '';
    setIsMobileDevice(/Mobi|Android|iPhone|iPad|iPod/i.test(userAgent));
  }, []);

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
        manualGdrStatus: resident.compliance?.manualGdrStatus,
        explainability: resident.compliance?.explainability || [],
        reviewComplete: resident.compliance?.reviewComplete || false,
        reviewCompletedAt: resident.compliance?.reviewCompletedAt
      }
    };
  };

  const recalculateCompliance = useCallback((
    monthData: Record<string, ResidentData>,
    month: string,
    settingsToUse: AppSettings,
    mrns?: string[]
  ) => {
    const [y, m] = month.split('-').map(Number);
    const lastDay = new Date(y, m, 0);
    const targets = mrns === undefined
      ? Object.keys(monthData)
      : mrns.filter(mrn => monthData[mrn]);
    targets.forEach(mrn => {
      monthData[mrn] = evaluateResidentCompliance(monthData[mrn], lastDay, settingsToUse);
    });
  }, []);

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
    let isMounted = true;
    const hydrate = async () => {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as StoredPayload;
          if (parsed && parsed.version === STORAGE_VERSION) {
            if (isMounted) {
              hydrateFromPayload(parsed);
            }
            return;
          }
        } catch {
          // ignore malformed local storage data
        }
      }

      try {
        const indexedPayload = await loadAutosave();
        if (indexedPayload && indexedPayload.version === STORAGE_VERSION && isMounted) {
          hydrateFromPayload(indexedPayload);
        }
      } catch {
        // ignore IndexedDB errors
      }
    };

    hydrate().finally(() => {
      hasHydrated.current = true;
    });

    return () => {
      isMounted = false;
    };
  }, [hydrateFromPayload]);

  useEffect(() => {
    if (!hasHydrated.current) return;
    const payload: StoredPayload = {
      version: STORAGE_VERSION,
      savedAt: new Date().toISOString(),
      reviews,
      settings
    };
    const timeout = window.setTimeout(() => {
      Promise.allSettled([
        (async () => {
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
          } catch {
            // ignore storage errors (quota, etc.)
          }
        })(),
        saveAutosave(payload).catch(() => {
          // ignore IndexedDB errors
        })
      ]).finally(() => {
        setLastSavedAt(payload.savedAt);
      });

      if (settings.oneDriveFolderUrl) {
        if (cloudSyncRef.current) window.clearTimeout(cloudSyncRef.current);
        cloudSyncRef.current = window.setTimeout(async () => {
          if (cloudSyncInFlight.current) return;
          cloudSyncInFlight.current = true;
          try {
            const response = await uploadToOneDrive(settings.oneDriveFolderUrl, payload);
            if (!response.ok) {
              throw new Error(`OneDrive upload failed (${response.status})`);
            }
            setLastCloudSavedAt(new Date().toISOString());
          } catch {
            // ignore OneDrive auto-backup errors
          } finally {
            cloudSyncInFlight.current = false;
          }
        }, 2500);
      }
    }, 500);
    return () => window.clearTimeout(timeout);
  }, [reviews, settings]);

  const applyParsedResults = useCallback((
    type: ParseType,
    parsed: unknown,
    targetMonth: string,
    warnings: string[] = []
  ) => {
    const affectedMrns = new Set<string>();

    setReviews(prev => {
      const currentMonthData = { ...(prev[targetMonth] || {}) };

      const ensureResident = (mrn: string) => {
        if (!currentMonthData[mrn]) {
          currentMonthData[mrn] = {
            mrn, name: 'Unknown', room: '', unit: '',
            meds: [], consults: [], behaviors: [], gdr: [], carePlan: [], diagnoses: [],
            psychMdOrders: [], episodicBehaviors: [], manualGdr: createDefaultManualGdr(),
            compliance: { status: ComplianceStatus.UNKNOWN, issues: [], gdrOverdue: false, missingCarePlan: false, missingConsent: false, manualGdrStatus: 'NOT_SET', explainability: [], reviewComplete: false }
          };
        }
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
        case ParseType.CENSUS: {
          const parsedCensus = parsed as ReturnType<typeof parseCensus>;
          parsedCensus.forEach(p => {
            ensureResident(p.mrn);
            currentMonthData[p.mrn] = { ...currentMonthData[p.mrn], ...p };
            affectedMrns.add(p.mrn);
          });
          break;
        }
        case ParseType.MEDS: {
          const parsedMeds = parsed as ReturnType<typeof parseMeds>;
          const medsByMrn = parsedMeds.reduce((acc, med) => {
            if (!acc[med.mrn]) acc[med.mrn] = [];
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
            }
            affectedMrns.add(mrn);
          });
          break;
        }
        case ParseType.BEHAVIORS: {
          const parsedBehaviors = parsed as ReturnType<typeof parseBehaviors>;
          parsedBehaviors.forEach(({ mrn, event }) => {
            ensureResident(mrn);
            if (!currentMonthData[mrn].behaviors.some(b => b.date === event.date)) {
              currentMonthData[mrn].behaviors.push(event);
            }
            affectedMrns.add(mrn);
          });
          break;
        }
        case ParseType.CAREPLAN: {
          const parsedCP = parsed as ReturnType<typeof parseCarePlans>;
          parsedCP.forEach(cp => {
            ensureResident(cp.mrn);
            if (!currentMonthData[cp.mrn].carePlan.some(i => i.text === cp.item.text)) {
              currentMonthData[cp.mrn].carePlan.push(cp.item);
            }
            affectedMrns.add(cp.mrn);
          });
          break;
        }
        case ParseType.CONSULTS: {
          const parsedConsults = parsed as ReturnType<typeof parseConsults>;
          parsedConsults.forEach(c => {
            ensureResident(c.mrn);
            if (!currentMonthData[c.mrn].consults.some(e => e.date === c.event.date && e.snippet === c.event.snippet)) {
              currentMonthData[c.mrn].consults.push(c.event);
            }
            affectedMrns.add(c.mrn);
          });
          break;
        }
        case ParseType.PSYCH_MD_ORDERS: {
          const parsedOrders = parsed as ReturnType<typeof parsePsychMdOrders>;
          parsedOrders.forEach(order => {
            ensureResident(order.mrn);
            if (!currentMonthData[order.mrn].psychMdOrders.some(o => o.date === order.event.date && o.orderText === order.event.orderText)) {
              currentMonthData[order.mrn].psychMdOrders.push(order.event);
            }
            affectedMrns.add(order.mrn);
          });
          break;
        }
        case ParseType.EPISODIC_BEHAVIORS: {
          const parsedEpisodes = parsed as ReturnType<typeof parseEpisodicBehaviors>;
          parsedEpisodes.forEach(({ mrn, event }) => {
            ensureResident(mrn);
            if (!currentMonthData[mrn].episodicBehaviors.some(b => b.date === event.date && b.snippet === event.snippet)) {
              currentMonthData[mrn].episodicBehaviors.push(event);
            }
            affectedMrns.add(mrn);
          });
          break;
        }
        case ParseType.GDR: {
          const parsedGdr = parsed as ReturnType<typeof parseGdr>;
          parsedGdr.forEach(g => {
            ensureResident(g.mrn);
            if (!currentMonthData[g.mrn].gdr.some(e => e.date === g.event.date)) {
              currentMonthData[g.mrn].gdr.push(g.event);
            }
            affectedMrns.add(g.mrn);
          });
          break;
        }
      }

      recalculateCompliance(currentMonthData, targetMonth, settings, Array.from(affectedMrns));
      return { ...prev, [targetMonth]: currentMonthData };
    });

    setSelectedMonth(targetMonth);
    if (warnings.length > 0) {
      // warnings are captured for potential UI usage in the parser modal
    }
  }, [recalculateCompliance, settings]);

  useEffect(() => {
    if (parserWorkerRef.current || typeof Worker === 'undefined') return;
    const worker = new Worker(new URL('./services/parserWorker.ts', import.meta.url), { type: 'module' });
    parserWorkerRef.current = worker;
    worker.onmessage = (event: MessageEvent<{ type: ParseType; targetMonth: string; parsed: unknown; warnings: string[] }>) => {
      const { type, targetMonth, parsed, warnings } = event.data;
      applyParsedResults(type, parsed, targetMonth, warnings);
    };

    return () => {
      worker.terminate();
      parserWorkerRef.current = null;
    };
  }, [applyParsedResults]);

  const handleParse = useCallback((type: ParseType, rawText: string, targetMonth: string) => {
    if (parserWorkerRef.current) {
      parserRequestIdRef.current += 1;
      parserWorkerRef.current.postMessage({
        requestId: parserRequestIdRef.current,
        type,
        rawText,
        targetMonth,
        customMedicationMap: settings.customMedicationMap,
        residents: Object.values(reviews[targetMonth] || {})
      });
      return;
    }

    const warnings: string[] = [];
    setDateParseWarningHandler((value) => warnings.push(value));

    switch (type) {
      case ParseType.CENSUS:
        applyParsedResults(type, parseCensus(rawText), targetMonth, warnings);
        break;
      case ParseType.MEDS:
        applyParsedResults(type, parseMeds(rawText, settings.customMedicationMap), targetMonth, warnings);
        break;
      case ParseType.CONSULTS:
        applyParsedResults(type, parseConsults(rawText), targetMonth, warnings);
        break;
      case ParseType.BEHAVIORS:
        applyParsedResults(type, parseBehaviors(rawText), targetMonth, warnings);
        break;
      case ParseType.CAREPLAN:
        applyParsedResults(type, parseCarePlans(rawText), targetMonth, warnings);
        break;
      case ParseType.GDR:
        applyParsedResults(type, parseGdr(rawText), targetMonth, warnings);
        break;
      case ParseType.PSYCH_MD_ORDERS:
        applyParsedResults(type, parsePsychMdOrders(rawText, Object.values(reviews[targetMonth] || {})), targetMonth, warnings);
        break;
      case ParseType.EPISODIC_BEHAVIORS:
        applyParsedResults(type, parseEpisodicBehaviors(rawText), targetMonth, warnings);
        break;
    }
    setDateParseWarningHandler(null);
  }, [applyParsedResults, reviews, settings.customMedicationMap]);

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

  const selectedResidents = useMemo(() => {
    const selectedSet = new Set(selectedMrns);
    return filteredResidents.filter(r => selectedSet.has(r.mrn));
  }, [filteredResidents, selectedMrns]);

  useEffect(() => {
    const filteredSet = new Set(filteredResidents.map(r => r.mrn));
    setSelectedMrns(prev => prev.filter(mrn => filteredSet.has(mrn)));
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
    const payload: StoredPayload = {
      version: STORAGE_VERSION,
      savedAt: new Date().toISOString(),
      reviews,
      settings
    };
    uploadToOneDrive(settings.oneDriveFolderUrl, payload)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`OneDrive upload failed (${response.status})`);
        }
        setLastCloudSavedAt(payload.savedAt);
        alert("Backup uploaded to OneDrive.");
      })
      .catch(() => {
        handleExport();
        handleOpenOneDriveFolder();
        alert("OneDrive upload failed. Exported a local backup instead.");
      });
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

  const exportResidentList = (residentsToExport: ResidentData[], label: string) => {
    if (residentsToExport.length === 0) return;
    const headers = [
      'MRN',
      'Name',
      'Unit',
      'Room',
      'Meds Parsed',
      'Compliance Status',
      'Issues',
      'Review Complete',
      'Review Completed At'
    ];
    const rows = residentsToExport.map(r => [
      r.mrn,
      r.name,
      r.unit,
      r.room,
      r.meds.length > 0 ? 'Yes' : 'No',
      r.compliance.status,
      r.compliance.issues.join('; '),
      r.compliance.reviewComplete ? 'Yes' : 'No',
      r.compliance.reviewCompletedAt || ''
    ]);
    const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const csv = [headers, ...rows].map(row => row.map(cell => escape(String(cell ?? ''))).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${label}_${selectedMonth}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportResidentLabels = (residentsToExport: ResidentData[], label: string) => {
    if (residentsToExport.length === 0) return;
    const headers = ['Name', 'MRN', 'Unit', 'Room'];
    const rows = residentsToExport.map(r => [r.name, r.mrn, r.unit, r.room]);
    const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const csv = [headers, ...rows].map(row => row.map(cell => escape(String(cell ?? ''))).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${label}_${selectedMonth}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExportFiltered = () => {
    exportResidentList(filteredResidents, 'filtered_residents');
  };

  const handleExportSelected = () => {
    exportResidentList(selectedResidents, 'selected_residents');
  };

  const handleExportFilteredLabels = () => {
    exportResidentLabels(filteredResidents, 'filtered_labels');
  };

  const handleExportSelectedLabels = () => {
    exportResidentLabels(selectedResidents, 'selected_labels');
  };

  const handleMarkReviewComplete = () => {
    if (selectedResidents.length === 0) return;
    const timestamp = new Date().toISOString();
    setReviews(prev => {
      const monthData = prev[selectedMonth];
      if (!monthData) return prev;
      const updatedMonth = { ...monthData };
      selectedResidents.forEach(resident => {
        const existing = updatedMonth[resident.mrn];
        if (!existing) return;
        updatedMonth[resident.mrn] = {
          ...existing,
          compliance: {
            ...existing.compliance,
            reviewComplete: true,
            reviewCompletedAt: timestamp
          }
        };
      });
      return { ...prev, [selectedMonth]: updatedMonth };
    });
  };

  const handleMarkFilteredComplete = () => {
    if (filteredResidents.length === 0) return;
    const timestamp = new Date().toISOString();
    setReviews(prev => {
      const monthData = prev[selectedMonth];
      if (!monthData) return prev;
      const updatedMonth = { ...monthData };
      filteredResidents.forEach(resident => {
        const existing = updatedMonth[resident.mrn];
        if (!existing) return;
        updatedMonth[resident.mrn] = {
          ...existing,
          compliance: {
            ...existing.compliance,
            reviewComplete: true,
            reviewCompletedAt: timestamp
          }
        };
      });
      return { ...prev, [selectedMonth]: updatedMonth };
    });
  };

  const toggleResidentSelection = (mrn: string) => {
    setSelectedMrns(prev => prev.includes(mrn) ? prev.filter(id => id !== mrn) : [...prev, mrn]);
  };

  const toggleSelectAll = () => {
    if (filteredResidents.length === 0) return;
    if (selectedMrns.length === filteredResidents.length) {
      setSelectedMrns([]);
    } else {
      setSelectedMrns(filteredResidents.map(r => r.mrn));
    }
  };

  const clearSelection = () => setSelectedMrns([]);

  const updateResident = (mrn: string, updater: (resident: ResidentData) => ResidentData) => {
    setReviews(prev => {
      const monthData = prev[selectedMonth];
      if (!monthData || !monthData[mrn]) return prev;
      const updatedMonth = { ...monthData };
      updatedMonth[mrn] = updater(updatedMonth[mrn]);
      recalculateCompliance(updatedMonth, selectedMonth, settings, [mrn]);
      return { ...prev, [selectedMonth]: updatedMonth };
    });
  };

  return (
    <div ref={appRef} className="min-h-screen w-full overflow-x-hidden pb-12 print:bg-white print:pb-0">
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
        <div className="mx-auto w-full max-w-screen-2xl px-3 sm:px-4 lg:px-6 xl:px-8 2xl:px-12 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex items-center gap-3">
             <div className="bg-white/10 p-2 rounded-lg"><Activity className="w-6 h-6 text-white" /></div>
             <div>
               <h1 className="text-xl font-bold tracking-tight">GDR & Psychotropic Compliance Review</h1>
               <p className="text-xs text-blue-100 opacity-90">CMS F758/F740 & NYSDOH 415.12 Tool</p>
             </div>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 md:w-auto md:justify-end">
            <button onClick={() => setShowParser(true)} className="flex items-center gap-2 bg-white/20 hover:bg-white/30 px-4 py-2 rounded-full text-sm font-bold transition-all border border-white/20">
              <Upload className="w-4 h-4" />
              <span className="sm:hidden">Input</span>
              <span className="hidden sm:inline">Input Data</span>
            </button>
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
        {(lastSavedAt || lastCloudSavedAt) && (
          <div className="mx-auto w-full max-w-screen-2xl px-3 sm:px-4 lg:px-6 xl:px-8 2xl:px-12 pb-2 flex flex-wrap justify-end gap-x-3 text-[11px] text-blue-100 opacity-80">
            {lastSavedAt && <span>Auto-saved {new Date(lastSavedAt).toLocaleString()}</span>}
            {lastCloudSavedAt && <span>OneDrive backup {new Date(lastCloudSavedAt).toLocaleString()}</span>}
          </div>
        )}
      </header>

      <main id="main-content" className="mx-auto w-full max-w-screen-2xl px-3 sm:px-4 lg:px-6 xl:px-8 2xl:px-12 py-8 print:p-0 print:mx-0">
        {isMobileDevice && (
          <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-sm">
            Best viewed on iPhone Safari with Fit to Screen enabled.
          </div>
        )}
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
              <div className="bg-white p-2 rounded-xl border border-slate-200 shadow-sm flex flex-col lg:flex-row gap-3 flex-1 w-full lg:w-auto">
                  <div className="flex-1 relative">
                      <input type="text" placeholder="Search Resident, MRN..." className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-primary focus:border-transparent outline-none" value={filterText} onChange={(e) => setFilterText(e.target.value)} />
                      <Filter className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                      {filterText && (<button onClick={() => setFilterText("")} className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>)}
                  </div>
                  <div className="flex flex-wrap gap-2 items-center">
                      <select value={unitFilter} onChange={(e) => setUnitFilter(e.target.value)} className="w-full sm:w-auto px-4 py-2 rounded-lg border border-slate-300 bg-slate-50 text-sm focus:ring-2 focus:ring-primary outline-none cursor-pointer hover:bg-white transition-colors"><option value="ALL">All Units</option>{units.map(u => <option key={u} value={u}>{u}</option>)}</select>
                      <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-full sm:w-auto px-4 py-2 rounded-lg border border-slate-300 bg-slate-50 text-sm focus:ring-2 focus:ring-primary outline-none cursor-pointer hover:bg-white transition-colors">
                        <option value="ALL">All Statuses</option>
                        <option value={ComplianceStatus.COMPLIANT}>Compliant</option>
                        <option value={ComplianceStatus.WARNING}>Warning</option>
                        <option value={ComplianceStatus.CRITICAL}>Critical</option>
                      </select>
                      <label className="flex w-full sm:w-auto items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm cursor-pointer hover:bg-white transition-colors">
                          <input type="checkbox" checked={psychOnly} onChange={e => setPsychOnly(e.target.checked)} className="form-checkbox h-4 w-4 rounded text-primary focus:ring-primary/50" />
                          Meds Parsed Only
                      </label>
                      <button onClick={handleDownloadReport} className="flex w-full sm:w-auto items-center justify-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-800 text-white rounded-lg font-bold text-sm transition-colors shadow-sm">
                        <Printer className="w-4 h-4"/> Download Printable Report
                      </button>
                  </div>
              </div>
          </div>

          <div className="no-print">
             <Dashboard residents={filteredResidents} />
          </div>

          <div className="flex flex-col gap-3 no-print">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-bold text-slate-700">Resident Compliance List ({filteredResidents.length})</h2>
              <button 
                onClick={() => setShowReport(true)}
                disabled={filteredNonCompliantResidents.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-700 hover:bg-red-100 rounded-lg font-bold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <FileWarning className="w-4 h-4"/> View Deficiency Report ({filteredNonCompliantResidents.length})
              </button>
            </div>
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
              <div className="text-sm text-slate-600">
                <span className="font-semibold text-slate-700">Selected:</span> {selectedMrns.length} of {filteredResidents.length}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={handleExportFiltered}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-100 text-slate-700 text-xs font-bold hover:bg-slate-200"
                >
                  <Download className="w-4 h-4" /> Export filtered list
                </button>
                <button
                  onClick={handleExportFilteredLabels}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-100 text-slate-700 text-xs font-bold hover:bg-slate-200"
                >
                  <Download className="w-4 h-4" /> Export filtered labels
                </button>
                <button
                  onClick={handleExportSelected}
                  disabled={selectedResidents.length === 0}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-50 text-blue-700 text-xs font-bold hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Download className="w-4 h-4" /> Export selected
                </button>
                <button
                  onClick={handleExportSelectedLabels}
                  disabled={selectedResidents.length === 0}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-50 text-blue-700 text-xs font-bold hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Download className="w-4 h-4" /> Export selected labels
                </button>
                <button
                  onClick={handleMarkReviewComplete}
                  disabled={selectedResidents.length === 0}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-50 text-green-700 text-xs font-bold hover:bg-green-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <CheckCircle className="w-4 h-4" /> Mark review complete
                </button>
                <button
                  onClick={handleMarkFilteredComplete}
                  disabled={filteredResidents.length === 0}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-bold hover:bg-emerald-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <CheckCircle className="w-4 h-4" /> Mark filtered complete
                </button>
                <button
                  onClick={clearSelection}
                  disabled={selectedResidents.length === 0}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 text-slate-600 text-xs font-bold hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <X className="w-4 h-4" /> Clear selection
                </button>
              </div>
            </div>
          </div>

          <ResidentList
            residents={filteredResidents}
            onSelect={(r) => setSelectedMrn(r.mrn)}
            selectedMrns={selectedMrns}
            onToggleSelect={toggleResidentSelection}
            onToggleAll={toggleSelectAll}
            allSelected={filteredResidents.length > 0 && selectedMrns.length === filteredResidents.length}
            someSelected={selectedMrns.length > 0 && selectedMrns.length < filteredResidents.length}
          />
        </div>
      </main>
    </div>
  );
}

export default App;
