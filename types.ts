export enum ComplianceStatus {
  COMPLIANT = 'COMPLIANT',
  WARNING = 'WARNING',
  CRITICAL = 'CRITICAL',
  UNKNOWN = 'UNKNOWN'
}

export enum ParseType {
  CENSUS = 'census',
  MEDS = 'meds',
  CONSULTS = 'consults',
  BEHAVIORS = 'behaviors',
  CAREPLAN = 'careplan',
  GDR = 'gdr',
  PSYCH_MD_ORDERS = 'psych_md_orders',
  EPISODIC_BEHAVIORS = 'episodic_behaviors'
}

export interface AuditEntry {
  timestamp: string;
  message: string;
  type: 'info' | 'update' | 'alert';
}

export interface ReviewHistoryItem {
  month: string;
  status: ComplianceStatus;
  issueCount: number;
}

export interface ComplianceExplainabilityEntry {
  ruleId: string;
  severity: 'CRITICAL' | 'WARNING';
  summary: string;
  data: Record<string, string | number | boolean | null | string[]>;
}

export interface Resident {
  mrn: string;
  name:string;
  room: string;
  unit: string;
}

export type MedicationClass =
  | 'ADHD/ANTI-NARCOLEPSY/ANTI-OBESITY/ANOREXIANTS'
  | 'ANTIANXIETY AGENTS'
  | 'ANTIDEPRESSANTS'
  | 'ANTIPSYCHOTICS/ANTIMANIC AGENTS'
  | 'HYPNOTICS/SEDATIVES/SLEEP DISORDER AGENTS'
  | 'PSYCHOTHERAPEUTIC AND NEUROLOGICAL AGENTS - MISC.'
  | 'Other';

export interface Medication {
  mrn: string;
  drug: string;
  display: string;
  nameRaw: string;
  nameNorm: string;
  class: MedicationClass;
  classOverride?: MedicationClass;
  frequency: string;
  dose: string;
  startDate?: string;
  indication?: string;
}

export interface ConsultEvent {
  date: string; // ISO
  status: string;
  snippet: string;
}

export interface BehaviorEvent {
  date: string; // ISO
  snippet: string;
}

export interface PsychMdOrder {
  date: string;
  orderText: string;
  status: string;
}

export interface EpisodicBehaviorEvent {
  date: string;
  snippet: string;
  category?: string;
}

export interface GdrEvent {
  date: string;
  status: string;
  statusDate: string;
  lastPsychEval: string;
  medication?: string;
  dose?: string;
}

export interface CarePlanItem {
  text: string;
  psychRelated?: boolean;
}

export interface Diagnosis {
    code: string;
    description: string;
}

export type ManualGdrStatus = 'NOT_SET' | 'DONE' | 'CONTRAINDICATED';

export interface ManualGdrData {
  status: ManualGdrStatus;
  contraindications: {
    symptomsReturned: boolean;
    additionalGdrLikelyToImpair: boolean;
    riskToSelfOrOthers: boolean;
    other: boolean;
    otherText?: string;
  };
  note?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export interface AppSettings {
  consultRecencyDays: number;
  behaviorThreshold: number;
  behaviorWindowDays: number;
  indicationMap: Record<MedicationClass, string[]>;
  indicationMismatchSeverity: 'WARNING' | 'CRITICAL';
  customMedicationMap: Record<string, MedicationClass>;
  oneDriveFolderUrl: string;
}

export interface ResidentData extends Resident {
  meds: Medication[];
  consults: ConsultEvent[];
  behaviors: BehaviorEvent[];
  gdr: GdrEvent[];
  carePlan: CarePlanItem[];
  diagnoses: Diagnosis[];
  psychMdOrders: PsychMdOrder[];
  episodicBehaviors: EpisodicBehaviorEvent[];
  manualGdr: ManualGdrData;
  logs: AuditEntry[];
  reviewComplete?: boolean;
  reviewCompletedAt?: string;
  compliance: {
    status: ComplianceStatus;
    issues: string[];
    lastGdrDate?: string;
    firstAntipsychoticDate?: string;
    gdrOverdue: boolean;
    missingCarePlan: boolean;
    missingConsent: boolean; // NYSDOH specific
    behaviorNotesCount?: number;
    carePlanPsychPresent?: boolean;
    indicationStatus?: 'OK' | 'MISSING' | 'MISMATCH' | 'NEEDS_REVIEW';
    consultStatus?: 'CONSULT' | 'ORDER' | 'MISSING';
    manualGdrStatus?: ManualGdrStatus;
    explainability?: ComplianceExplainabilityEntry[];
  };
}

export interface AppState {
  reviews: Record<string, Record<string, ResidentData>>; // month -> mrn -> data
  selectedMonth: string;
  lastRefreshed: Date | null;
  auditLog: string[];
  filters: {
    unit: string;
    search: string;
    cohort: 'all' | 'psychOnly';
    medClass: string;
  };
}
