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
  GDR = 'gdr'
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

export interface Resident {
  mrn: string;
  name:string;
  room: string;
  unit: string;
}

export interface Medication {
  mrn: string;
  drug: string;
  display: string;
  class: 'Antipsychotic' | 'Antidepressant' | 'Anxiolytic' | 'Hypnotic' | 'Mood stabilizer' | 'Other';
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
}

export interface Diagnosis {
    code: string;
    description: string;
}

export interface ResidentData extends Resident {
  meds: Medication[];
  consults: ConsultEvent[];
  behaviors: BehaviorEvent[];
  gdr: GdrEvent[];
  carePlan: CarePlanItem[];
  diagnoses: Diagnosis[];
  logs: AuditEntry[];
  compliance: {
    status: ComplianceStatus;
    issues: string[];
    lastGdrDate?: string;
    firstAntipsychoticDate?: string;
    gdrOverdue: boolean;
    missingCarePlan: boolean;
    missingConsent: boolean; // NYSDOH specific
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
