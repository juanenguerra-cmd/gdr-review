/// <reference lib="webworker" />

import { parseCensus, parseMeds, parseConsults, parseCarePlans, parseGdr, parseBehaviors, parsePsychMdOrders, parseEpisodicBehaviors } from './parserService';
import { ParseType } from '../types';
import { ParserWorkerRequest, ParserWorkerResponse } from './parserWorkerTypes';

const ctx: DedicatedWorkerGlobalScope = self as DedicatedWorkerGlobalScope;

ctx.onmessage = (event: MessageEvent<ParserWorkerRequest>) => {
  const { id, type, rawText, customMedicationMap, residents } = event.data;

  try {
    let data;
    switch (type) {
      case ParseType.CENSUS:
        data = parseCensus(rawText);
        break;
      case ParseType.MEDS:
        data = parseMeds(rawText, customMedicationMap);
        break;
      case ParseType.CONSULTS:
        data = parseConsults(rawText);
        break;
      case ParseType.CAREPLAN:
        data = parseCarePlans(rawText);
        break;
      case ParseType.GDR:
        data = parseGdr(rawText);
        break;
      case ParseType.BEHAVIORS:
        data = parseBehaviors(rawText);
        break;
      case ParseType.PSYCH_MD_ORDERS:
        data = parsePsychMdOrders(rawText, residents || []);
        break;
      case ParseType.EPISODIC_BEHAVIORS:
        data = parseEpisodicBehaviors(rawText);
        break;
      default:
        throw new Error(`Unsupported parse type: ${type}`);
    }

    const response: ParserWorkerResponse = { id, type, data };
    ctx.postMessage(response);
  } catch (error) {
    const response: ParserWorkerResponse = {
      id,
      type,
      error: error instanceof Error ? error.message : String(error)
    };
    ctx.postMessage(response);
  }
};
