import {
  ParseType,
  Resident,
  Medication,
  ConsultEvent,
  CarePlanItem,
  GdrEvent,
  BehaviorEvent,
  PsychMdOrder,
  EpisodicBehaviorEvent,
  MedicationClass
} from '../types';

export type ParserWorkerRequest = {
  id: number;
  type: ParseType;
  rawText: string;
  customMedicationMap?: Record<string, MedicationClass>;
  residents?: Resident[];
};

export type ParserWorkerResultMap = {
  [ParseType.CENSUS]: Resident[];
  [ParseType.MEDS]: Medication[];
  [ParseType.CONSULTS]: { mrn: string; event: ConsultEvent }[];
  [ParseType.CAREPLAN]: { mrn: string; item: CarePlanItem }[];
  [ParseType.GDR]: { mrn: string; event: GdrEvent }[];
  [ParseType.BEHAVIORS]: { mrn: string; event: BehaviorEvent }[];
  [ParseType.PSYCH_MD_ORDERS]: { mrn: string; event: PsychMdOrder }[];
  [ParseType.EPISODIC_BEHAVIORS]: { mrn: string; event: EpisodicBehaviorEvent }[];
};

export type ParserWorkerSuccess<T extends ParseType = ParseType> = {
  id: number;
  type: T;
  data: ParserWorkerResultMap[T];
};

export type ParserWorkerError = {
  id: number;
  type: ParseType;
  error: string;
};

export type ParserWorkerResponse = ParserWorkerSuccess | ParserWorkerError;
