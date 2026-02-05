import { MedicationClass } from '../types';

export type IndicationMatchSource = 'clinical-dictionary' | 'indication-map' | 'none';

export interface IndicationMatchResult {
  matched: boolean;
  confidence: number;
  source: IndicationMatchSource;
  label?: string;
  entryId?: string;
}

interface ClinicalIndicationCode {
  system: 'ICD-10' | 'SNOMED';
  code: string;
}

interface ClinicalIndicationEntry {
  id: string;
  label: string;
  medicationClass: MedicationClass;
  codes: ClinicalIndicationCode[];
  synonyms: string[];
}

const CLINICAL_INDICATION_DICTIONARY: ClinicalIndicationEntry[] = [
  {
    id: 'MDD',
    label: 'Major depressive disorder',
    medicationClass: 'ANTIDEPRESSANTS',
    codes: [
      { system: 'ICD-10', code: 'F32' },
      { system: 'ICD-10', code: 'F33' },
      { system: 'SNOMED', code: '370143000' }
    ],
    synonyms: [
      'depression',
      'major depression',
      'mdd',
      'depressive disorder',
      'depressed mood',
      'recurrent depression'
    ]
  },
  {
    id: 'GAD',
    label: 'Generalized anxiety disorder',
    medicationClass: 'ANTIANXIETY AGENTS',
    codes: [
      { system: 'ICD-10', code: 'F41.1' },
      { system: 'SNOMED', code: '21897009' }
    ],
    synonyms: ['anxiety', 'generalized anxiety', 'gad', 'anxiousness', 'excessive worry']
  },
  {
    id: 'BPD',
    label: 'Bipolar disorder',
    medicationClass: 'ANTIPSYCHOTICS/ANTIMANIC AGENTS',
    codes: [
      { system: 'ICD-10', code: 'F31' },
      { system: 'SNOMED', code: '13746004' }
    ],
    synonyms: ['bipolar', 'mania', 'manic episode', 'mood disorder bipolar', 'bipolar depression']
  },
  {
    id: 'PSYCHOSIS',
    label: 'Psychotic disorder',
    medicationClass: 'ANTIPSYCHOTICS/ANTIMANIC AGENTS',
    codes: [
      { system: 'ICD-10', code: 'F29' },
      { system: 'ICD-10', code: 'F20' },
      { system: 'SNOMED', code: '191526005' }
    ],
    synonyms: ['psychosis', 'schizophrenia', 'delusions', 'hallucinations', 'psychotic symptoms']
  },
  {
    id: 'AGITATION',
    label: 'Agitation/aggression in dementia',
    medicationClass: 'ANTIPSYCHOTICS/ANTIMANIC AGENTS',
    codes: [
      { system: 'ICD-10', code: 'F03.91' },
      { system: 'SNOMED', code: '248745006' }
    ],
    synonyms: ['agitation', 'aggressive behavior', 'behavioral disturbance', 'behaviors', 'bPSD', 'dementia behaviors']
  },
  {
    id: 'INSOMNIA',
    label: 'Insomnia',
    medicationClass: 'HYPNOTICS/SEDATIVES/SLEEP DISORDER AGENTS',
    codes: [
      { system: 'ICD-10', code: 'G47.0' },
      { system: 'SNOMED', code: '193462001' }
    ],
    synonyms: ['sleep disturbance', 'sleep disorder', 'difficulty sleeping', 'poor sleep', 'sleep onset insomnia']
  },
  {
    id: 'ANXIETY',
    label: 'Anxiety',
    medicationClass: 'ANTIANXIETY AGENTS',
    codes: [
      { system: 'ICD-10', code: 'F41.9' },
      { system: 'SNOMED', code: '48694002' }
    ],
    synonyms: ['anxiety disorder', 'panic', 'panic disorder', 'restlessness']
  },
  {
    id: 'SEIZURE',
    label: 'Seizure disorder',
    medicationClass: 'PSYCHOTHERAPEUTIC AND NEUROLOGICAL AGENTS - MISC.',
    codes: [
      { system: 'ICD-10', code: 'G40' },
      { system: 'SNOMED', code: '84757009' }
    ],
    synonyms: ['seizures', 'epilepsy', 'convulsions', 'seizure disorder']
  },
  {
    id: 'ADHD',
    label: 'Attention-deficit/hyperactivity disorder',
    medicationClass: 'ADHD/ANTI-NARCOLEPSY/ANTI-OBESITY/ANOREXIANTS',
    codes: [
      { system: 'ICD-10', code: 'F90' },
      { system: 'SNOMED', code: '406506008' }
    ],
    synonyms: ['adhd', 'attention deficit disorder', 'hyperactivity', 'inattention']
  },
  {
    id: 'DEMENTIA',
    label: 'Major neurocognitive disorder',
    medicationClass: 'PSYCHOTHERAPEUTIC AND NEUROLOGICAL AGENTS - MISC.',
    codes: [
      { system: 'ICD-10', code: 'F03' },
      { system: 'SNOMED', code: '52448006' }
    ],
    synonyms: ['dementia', 'alzheimer', 'memory loss', 'cognitive decline']
  }
];

export const normalizeText = (text: string): string => (text || '').trim().toLowerCase();

const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'for',
  'of',
  'or',
  'the',
  'to',
  'with',
  'per',
  'some',
  'agent',
  'agents',
  'short',
  'term',
  'related',
  'dependent',
  'other',
  'cns',
  'condition',
  'conditions',
  'disorder',
  'disorders'
]);

export const tokenize = (text: string): string[] => {
  return normalizeText(text)
    .split(/[^a-z0-9]+/i)
    .map(token => token.trim())
    .filter(token => token.length > 1 && !STOP_WORDS.has(token));
};

const tokenOverlapRatio = (left: string, right: string): number => {
  const leftTokens = tokenize(left);
  const rightTokens = tokenize(right);
  if (leftTokens.length === 0 || rightTokens.length === 0) return 0;
  const overlap = rightTokens.filter(token => leftTokens.includes(token)).length;
  const denominator = Math.max(leftTokens.length, rightTokens.length);
  return overlap / denominator;
};

const scoreTextMatch = (indication: string, candidate: string): number => {
  const normalizedIndication = normalizeText(indication);
  const normalizedCandidate = normalizeText(candidate);
  if (!normalizedIndication || !normalizedCandidate) return 0;
  if (normalizedIndication === normalizedCandidate) return 1;
  if (normalizedIndication.includes(normalizedCandidate) || normalizedCandidate.includes(normalizedIndication)) {
    return 0.85;
  }
  const overlap = tokenOverlapRatio(normalizedIndication, normalizedCandidate);
  if (overlap >= 0.75) return 0.8;
  if (overlap >= 0.5) return 0.65;
  if (overlap >= 0.35) return 0.5;
  return 0;
};

const CODE_REGEX = /\b([A-Z][0-9][0-9A-Z](?:\.[0-9A-Z]+)?)\b/g;
const SNOMED_REGEX = /\b(\d{6,9})\b/g;

const extractCodes = (text: string): string[] => {
  const codes: string[] = [];
  if (!text) return codes;
  const normalized = text.toUpperCase();
  const icdMatches = normalized.match(CODE_REGEX) || [];
  const snomedMatches = normalized.match(SNOMED_REGEX) || [];
  return [...icdMatches, ...snomedMatches];
};

const matchAgainstDictionary = (indication: string, medicationClass: MedicationClass): IndicationMatchResult => {
  let bestMatch: IndicationMatchResult = { matched: false, confidence: 0, source: 'none' };
  const candidates = CLINICAL_INDICATION_DICTIONARY.filter(entry => entry.medicationClass === medicationClass);
  const codes = extractCodes(indication);
  candidates.forEach(entry => {
    const hasCodeMatch = entry.codes.some(code => codes.includes(code.code.toUpperCase()));
    if (hasCodeMatch) {
      bestMatch = {
        matched: true,
        confidence: 0.95,
        source: 'clinical-dictionary',
        label: entry.label,
        entryId: entry.id
      };
      return;
    }
    const terms = [entry.label, ...entry.synonyms];
    const entryScore = terms.reduce((max, term) => Math.max(max, scoreTextMatch(indication, term)), 0);
    if (entryScore > bestMatch.confidence) {
      bestMatch = {
        matched: entryScore >= 0.6,
        confidence: entryScore,
        source: 'clinical-dictionary',
        label: entry.label,
        entryId: entry.id
      };
    }
  });
  if (!bestMatch.matched) {
    return { matched: false, confidence: bestMatch.confidence, source: 'none' };
  }
  return bestMatch;
};

export const matchIndicationMap = (indication: string, allowed: string[]): IndicationMatchResult => {
  if (!indication || allowed.length === 0) {
    return { matched: false, confidence: 0, source: 'none' };
  }
  let bestScore = 0;
  let bestLabel: string | undefined;
  allowed.forEach(entry => {
    const score = scoreTextMatch(indication, entry);
    if (score > bestScore) {
      bestScore = score;
      bestLabel = entry;
    }
  });

  return {
    matched: bestScore >= 0.6,
    confidence: bestScore,
    source: bestScore >= 0.6 ? 'indication-map' : 'none',
    label: bestLabel
  };
};

export const resolveIndicationMatch = (
  indication: string,
  medicationClass: MedicationClass,
  allowed: string[]
): IndicationMatchResult => {
  const dictionaryMatch = matchAgainstDictionary(indication, medicationClass);
  if (dictionaryMatch.matched) return dictionaryMatch;
  return matchIndicationMap(indication, allowed);
};
