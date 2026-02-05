import { ParseType, Resident, MedicationClass } from '../types';
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

type ParseRequest = {
  id: string;
  type: ParseType;
  rawText: string;
  targetMonth: string;
  residents: Resident[];
  customMedicationMap: Record<string, MedicationClass>;
};

type ParseResponse = {
  id: string;
  type: ParseType;
  targetMonth: string;
  warnings: string[];
  result:
    | ReturnType<typeof parseCensus>
    | ReturnType<typeof parseMeds>
    | ReturnType<typeof parseConsults>
    | ReturnType<typeof parseCarePlans>
    | ReturnType<typeof parseGdr>
    | ReturnType<typeof parseBehaviors>
    | ReturnType<typeof parsePsychMdOrders>
    | ReturnType<typeof parseEpisodicBehaviors>;
};

const ctx: DedicatedWorkerGlobalScope = self as DedicatedWorkerGlobalScope;

ctx.onmessage = (event: MessageEvent<ParseRequest>) => {
  const { id, type, rawText, targetMonth, residents, customMedicationMap } = event.data;
  const warningSet = new Set<string>();
  setDateParseWarningHandler((value) => {
    warningSet.add(value);
  });

  let result: ParseResponse['result'];
  switch (type) {
    case ParseType.CENSUS:
      result = parseCensus(rawText);
      break;
    case ParseType.MEDS:
      result = parseMeds(rawText, customMedicationMap);
      break;
    case ParseType.CAREPLAN:
      result = parseCarePlans(rawText);
      break;
    case ParseType.BEHAVIORS:
      result = parseBehaviors(rawText);
      break;
    case ParseType.CONSULTS:
      result = parseConsults(rawText);
      break;
    case ParseType.PSYCH_MD_ORDERS:
      result = parsePsychMdOrders(rawText, residents);
      break;
    case ParseType.EPISODIC_BEHAVIORS:
      result = parseEpisodicBehaviors(rawText);
      break;
    case ParseType.GDR:
      result = parseGdr(rawText);
      break;
    default:
      result = [];
  }

  setDateParseWarningHandler(null);
  ctx.postMessage({
    id,
    type,
    targetMonth,
    warnings: Array.from(warningSet),
    result
  } satisfies ParseResponse);
};
