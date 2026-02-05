/// <reference lib="webworker" />
import { ParseType, MedicationClass, Resident } from '../types';
import {
  parseCensus,
  parseMeds,
  parseConsults,
  parseCarePlans,
  parseGdr,
  parseBehaviors,
  parsePsychMdOrders,
  parseEpisodicBehaviors,
  setDateParseWarningHandler
} from './parserService';

type ParserRequest = {
  requestId: number;
  type: ParseType;
  rawText: string;
  targetMonth: string;
  customMedicationMap?: Record<string, MedicationClass>;
  residents?: Resident[];
};

type ParserResponse = {
  requestId: number;
  type: ParseType;
  targetMonth: string;
  parsed: unknown;
  warnings: string[];
};

self.onmessage = (event: MessageEvent<ParserRequest>) => {
  const { requestId, type, rawText, targetMonth, customMedicationMap, residents } = event.data;
  const warnings: string[] = [];
  setDateParseWarningHandler((value) => warnings.push(value));

  let parsed: unknown = null;

  switch (type) {
    case ParseType.CENSUS:
      parsed = parseCensus(rawText);
      break;
    case ParseType.MEDS:
      parsed = parseMeds(rawText, customMedicationMap);
      break;
    case ParseType.CONSULTS:
      parsed = parseConsults(rawText);
      break;
    case ParseType.BEHAVIORS:
      parsed = parseBehaviors(rawText);
      break;
    case ParseType.CAREPLAN:
      parsed = parseCarePlans(rawText);
      break;
    case ParseType.GDR:
      parsed = parseGdr(rawText);
      break;
    case ParseType.PSYCH_MD_ORDERS:
      parsed = parsePsychMdOrders(rawText, residents || []);
      break;
    case ParseType.EPISODIC_BEHAVIORS:
      parsed = parseEpisodicBehaviors(rawText);
      break;
    default:
      parsed = null;
  }

  setDateParseWarningHandler(null);

  const response: ParserResponse = {
    requestId,
    type,
    targetMonth,
    parsed,
    warnings
  };

  self.postMessage(response);
};
