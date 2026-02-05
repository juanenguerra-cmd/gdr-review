import { Resident, Medication, ConsultEvent, CarePlanItem, GdrEvent, BehaviorEvent, MedicationClass, PsychMdOrder, EpisodicBehaviorEvent } from '../types';

// --- Helpers & Regex ---

const REGEX_DATE_SLASH = /(\d{1,2})[-\/](\d{1,2})[-\/](\d{2,4})/;
const REGEX_DATE_ISO = /(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/;
const REGEX_DATE_TEXT = /([A-Za-z]{3,9})\s+(\d{1,2})(?:st|nd|rd|th)?[,]?\s+(\d{2,4})/;
const REGEX_DATE_CANDIDATE = /(\d{4}[-\/]\d{1,2}[-\/]\d{1,2}|\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4}|[A-Za-z]{3,9}\s+\d{1,2}(?:st|nd|rd|th)?[,]?\s+\d{2,4})/;
const REGEX_MRN_PARENS = /\(([A-Za-z0-9]+)\)/;
const REGEX_NAME_MRN = /^(.+?)\s*\(([A-Za-z0-9]+)\)/;

const normalizeText = (text: string): string => {
  return (text || "").replace(/[\u00A0]/g, " ").replace(/\s+/g, " ").trim();
};

export const normalizeDrugName = (text: string): string => {
  const withoutParens = (text || '').replace(/\([^)]*\)/g, ' ');
  return withoutParens
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .replace(/\b(mg|mcg|g|ml|unit|units|tablet|tab|capsule|cap|solution|suspension|susp|inj|injection|iv|im|po|oral|sl|subq|daily|bid|tid|qid|qhs|qam|qpm|prn|patch|spray|drop|drops|puff|puffs|chew|dissolve|take|give|apply|inhale|instill|place)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
};

const PSYCH_MAP: Record<string, MedicationClass> = {
  'haloperidol': 'ANTIPSYCHOTICS/ANTIMANIC AGENTS',
  'haldol': 'ANTIPSYCHOTICS/ANTIMANIC AGENTS',
  'risperidone': 'ANTIPSYCHOTICS/ANTIMANIC AGENTS',
  'quetiapine': 'ANTIPSYCHOTICS/ANTIMANIC AGENTS',
  'olanzapine': 'ANTIPSYCHOTICS/ANTIMANIC AGENTS',
  'aripiprazole': 'ANTIPSYCHOTICS/ANTIMANIC AGENTS',
  'ziprasidone': 'ANTIPSYCHOTICS/ANTIMANIC AGENTS',
  'clozapine': 'ANTIPSYCHOTICS/ANTIMANIC AGENTS',
  'lurasidone': 'ANTIPSYCHOTICS/ANTIMANIC AGENTS',
  'brexpiprazole': 'ANTIPSYCHOTICS/ANTIMANIC AGENTS',
  'cariprazine': 'ANTIPSYCHOTICS/ANTIMANIC AGENTS',
  'paliperidone': 'ANTIPSYCHOTICS/ANTIMANIC AGENTS',
  'chlorpromazine': 'ANTIPSYCHOTICS/ANTIMANIC AGENTS',
  'fluphenazine': 'ANTIPSYCHOTICS/ANTIMANIC AGENTS',
  'citalopram': 'ANTIDEPRESSANTS',
  'sertraline': 'ANTIDEPRESSANTS',
  'fluoxetine': 'ANTIDEPRESSANTS',
  'paroxetine': 'ANTIDEPRESSANTS',
  'escitalopram': 'ANTIDEPRESSANTS',
  'venlafaxine': 'ANTIDEPRESSANTS',
  'trazodone': 'ANTIDEPRESSANTS',
  'mirtazapine': 'ANTIDEPRESSANTS',
  'duloxetine': 'ANTIDEPRESSANTS',
  'bupropion': 'ANTIDEPRESSANTS',
  'amitriptyline': 'ANTIDEPRESSANTS',
  'nortriptyline': 'ANTIDEPRESSANTS',
  'diazepam': 'ANTIANXIETY AGENTS',
  'clonazepam': 'ANTIANXIETY AGENTS',
  'alprazolam': 'ANTIANXIETY AGENTS',
  'lorazepam': 'ANTIANXIETY AGENTS',
  'buspirone': 'ANTIANXIETY AGENTS',
  'hydroxyzine': 'ANTIANXIETY AGENTS',
  'oxazepam': 'ANTIANXIETY AGENTS',
  'temazepam': 'HYPNOTICS/SEDATIVES/SLEEP DISORDER AGENTS',
  'zolpidem': 'HYPNOTICS/SEDATIVES/SLEEP DISORDER AGENTS',
  'eszopiclone': 'HYPNOTICS/SEDATIVES/SLEEP DISORDER AGENTS',
  'melatonin': 'HYPNOTICS/SEDATIVES/SLEEP DISORDER AGENTS',
  'zaleplon': 'HYPNOTICS/SEDATIVES/SLEEP DISORDER AGENTS',
  'suvorexant': 'HYPNOTICS/SEDATIVES/SLEEP DISORDER AGENTS',
  'methylphenidate': 'ADHD/ANTI-NARCOLEPSY/ANTI-OBESITY/ANOREXIANTS',
  'amphetamine': 'ADHD/ANTI-NARCOLEPSY/ANTI-OBESITY/ANOREXIANTS',
  'dextroamphetamine': 'ADHD/ANTI-NARCOLEPSY/ANTI-OBESITY/ANOREXIANTS',
  'lisdexamfetamine': 'ADHD/ANTI-NARCOLEPSY/ANTI-OBESITY/ANOREXIANTS',
  'modafinil': 'ADHD/ANTI-NARCOLEPSY/ANTI-OBESITY/ANOREXIANTS',
  'armodafinil': 'ADHD/ANTI-NARCOLEPSY/ANTI-OBESITY/ANOREXIANTS',
  'phentermine': 'ADHD/ANTI-NARCOLEPSY/ANTI-OBESITY/ANOREXIANTS',
  'divalproex': 'PSYCHOTHERAPEUTIC AND NEUROLOGICAL AGENTS - MISC.',
  'valproate': 'PSYCHOTHERAPEUTIC AND NEUROLOGICAL AGENTS - MISC.',
  'lamotrigine': 'PSYCHOTHERAPEUTIC AND NEUROLOGICAL AGENTS - MISC.',
  'carbamazepine': 'PSYCHOTHERAPEUTIC AND NEUROLOGICAL AGENTS - MISC.',
  'lithium': 'PSYCHOTHERAPEUTIC AND NEUROLOGICAL AGENTS - MISC.',
  'donepezil': 'PSYCHOTHERAPEUTIC AND NEUROLOGICAL AGENTS - MISC.',
  'memantine': 'PSYCHOTHERAPEUTIC AND NEUROLOGICAL AGENTS - MISC.',
  'rivastigmine': 'PSYCHOTHERAPEUTIC AND NEUROLOGICAL AGENTS - MISC.',
  'galantamine': 'PSYCHOTHERAPEUTIC AND NEUROLOGICAL AGENTS - MISC.'
};

const normalizeYear = (value: number): number => {
  if (value < 100) {
    return value < 50 ? 2000 + value : 1900 + value;
  }
  return value;
};

const formatIsoDate = (year: number, month: number, day: number): string => {
  if (month < 1 || month > 12 || day < 1 || day > 31) return "";
  return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
};

const warnDateParseFailure = (value: string): void => {
  if (!value) return;
  console.warn(`Unable to parse date from "${value}".`);
};

const parseDateString = (dateStr: string): string => {
  if (!dateStr) return "";
  const t = dateStr.trim();
  const candidateMatch = t.match(REGEX_DATE_CANDIDATE);
  if (!candidateMatch) return "";

  const candidate = candidateMatch[0];
  let parsed = "";

  const isoMatch = candidate.match(REGEX_DATE_ISO);
  if (isoMatch) {
    const year = normalizeYear(parseInt(isoMatch[1], 10));
    const month = parseInt(isoMatch[2], 10);
    const day = parseInt(isoMatch[3], 10);
    parsed = formatIsoDate(year, month, day);
    if (parsed) return parsed;
  }

  const slashMatch = candidate.match(REGEX_DATE_SLASH);
  if (slashMatch) {
    const p1 = parseInt(slashMatch[1], 10);
    const p2 = parseInt(slashMatch[2], 10);
    const year = normalizeYear(parseInt(slashMatch[3], 10));
    let month = p1;
    let day = p2;

    if (month > 12 && day <= 12) {
      [day, month] = [month, day];
    }

    parsed = formatIsoDate(year, month, day);
    if (parsed) return parsed;
  }

  const textMatch = candidate.match(REGEX_DATE_TEXT);
  if (textMatch) {
    const monthText = textMatch[1].toLowerCase();
    const day = parseInt(textMatch[2], 10);
    const year = normalizeYear(parseInt(textMatch[3], 10));
    const monthMap: Record<string, number> = {
      jan: 1,
      january: 1,
      feb: 2,
      february: 2,
      mar: 3,
      march: 3,
      apr: 4,
      april: 4,
      may: 5,
      jun: 6,
      june: 6,
      jul: 7,
      july: 7,
      aug: 8,
      august: 8,
      sep: 9,
      sept: 9,
      september: 9,
      oct: 10,
      october: 10,
      nov: 11,
      november: 11,
      dec: 12,
      december: 12
    };
    const month = monthMap[monthText];
    if (month) {
      parsed = formatIsoDate(year, month, day);
      if (parsed) return parsed;
    }
  }

  warnDateParseFailure(candidate);
  return "";
};

const extractMrn = (line: string): string | null => {
  const match = line.match(REGEX_MRN_PARENS);
  return match ? match[1].toUpperCase() : null;
};

// --- Parsers ---

export const parseCensus = (raw: string): Resident[] => {
  const residents: Resident[] = [];
  const lines = raw.split(/\r?\n/);
  let currentUnit = "UNKNOWN";

  for (const line of lines) {
    const text = normalizeText(line);
    if (!text || /\bEMPTY\b/i.test(text)) continue;

    const unitMatch = text.match(/(?:Unit\s*[:\-]?\s*Unit\s*|Unit\s+)(\d+)/i);
    if (unitMatch) {
      currentUnit = `Unit ${unitMatch[1]}`;
      continue;
    }

    const complexMatch = text.match(/^([0-9]{2,4}\s*[-–]?\s*[A-Z]?)\s+(.+?)\s*\(([A-Za-z0-9]+)\)/);
    const nameMrnMatch = text.match(REGEX_NAME_MRN);

    if (complexMatch) {
      residents.push({
        room: normalizeText(complexMatch[1]),
        name: normalizeText(complexMatch[2]),
        mrn: normalizeText(complexMatch[3]).toUpperCase(),
        unit: currentUnit
      });
    } else if (nameMrnMatch) {
      residents.push({
        room: '',
        name: normalizeText(nameMrnMatch[1]),
        mrn: normalizeText(nameMrnMatch[2]).toUpperCase(),
        unit: currentUnit
      });
    }
  }
  return residents;
};

type MedicationIndex = {
  exact: Record<string, MedicationClass>;
  prefixIndex: Record<string, string[]>;
};

const buildMedicationIndexFromMap = (map: Record<string, MedicationClass>): MedicationIndex => {
  const index: MedicationIndex = { exact: {}, prefixIndex: {} };

  const addEntry = (key: string, value: MedicationClass) => {
    const normalized = normalizeDrugName(key);
    if (!normalized) return;
    index.exact[normalized] = value;
    const tokens = normalized.split(' ').filter(Boolean);
    for (const token of tokens) {
      const prefix = token.slice(0, 3);
      if (!prefix) continue;
      if (!index.prefixIndex[prefix]) {
        index.prefixIndex[prefix] = [];
      }
      index.prefixIndex[prefix].push(normalized);
    }
  };

  Object.entries(map).forEach(([key, value]) => addEntry(key, value));
  return index;
};

const BASE_MEDICATION_INDEX = buildMedicationIndexFromMap(PSYCH_MAP);

const buildMedicationIndex = (customMap?: Record<string, MedicationClass>): MedicationIndex => {
  const prefixIndex: Record<string, string[]> = {};
  Object.entries(BASE_MEDICATION_INDEX.prefixIndex).forEach(([key, value]) => {
    prefixIndex[key] = [...value];
  });

  const index: MedicationIndex = {
    exact: { ...BASE_MEDICATION_INDEX.exact },
    prefixIndex
  };

  if (customMap) {
    Object.entries(customMap).forEach(([key, value]) => {
      const normalized = normalizeDrugName(key);
      if (!normalized) return;
      index.exact[normalized] = value;
      const tokens = normalized.split(' ').filter(Boolean);
      for (const token of tokens) {
        const prefix = token.slice(0, 3);
        if (!prefix) continue;
        if (!index.prefixIndex[prefix]) {
          index.prefixIndex[prefix] = [];
        }
        index.prefixIndex[prefix].push(normalized);
      }
    });
  }

  return index;
};

const classifyMedication = (medName: string, index: MedicationIndex): MedicationClass => {
  const nameNorm = normalizeDrugName(medName);
  if (index.exact[nameNorm]) return index.exact[nameNorm];

  const tokens = nameNorm.split(' ').filter(Boolean);
  const candidates = new Set<string>();
  for (const token of tokens) {
    const prefix = token.slice(0, 3);
    if (!prefix) continue;
    const matches = index.prefixIndex[prefix];
    if (matches) {
      matches.forEach((value) => candidates.add(value));
    }
  }

  for (const key of candidates) {
    if (nameNorm.includes(key)) return index.exact[key];
  }

  return "Other";
};

const CLASS_LABELS: Array<{ pattern: RegExp; class: MedicationClass }> = [
  { pattern: /adhd\s*\/\s*anti-narcolepsy\s*\/\s*anti-obesity\s*\/\s*anorexiants/i, class: 'ADHD/ANTI-NARCOLEPSY/ANTI-OBESITY/ANOREXIANTS' },
  { pattern: /antianxiety agents/i, class: 'ANTIANXIETY AGENTS' },
  { pattern: /antidepressants/i, class: 'ANTIDEPRESSANTS' },
  { pattern: /antipsychotics\s*\/\s*antimanic agents/i, class: 'ANTIPSYCHOTICS/ANTIMANIC AGENTS' },
  { pattern: /hypnotics\s*\/\s*sedatives\s*\/\s*sleep disorder agents/i, class: 'HYPNOTICS/SEDATIVES/SLEEP DISORDER AGENTS' },
  { pattern: /psychotherapeutic and neurological agents\s*-\s*misc\.?/i, class: 'PSYCHOTHERAPEUTIC AND NEUROLOGICAL AGENTS - MISC.' }
];

const extractMedicationClass = (text: string): { classOverride?: MedicationClass; cleanedText: string } => {
  let cleanedText = text;
  let classOverride: MedicationClass | undefined;

  for (const label of CLASS_LABELS) {
    const match = cleanedText.match(label.pattern);
    if (match) {
      classOverride = label.class;
      cleanedText = cleanedText.replace(match[0], '').trim();
      break;
    }
  }

  return { classOverride, cleanedText };
};

export const parseMeds = (raw: string, customMap?: Record<string, MedicationClass>): Medication[] => {
  const meds: Medication[] = [];
  const lines = raw.split(/\r?\n/);
  const medicationIndex = buildMedicationIndex(customMap);

  for (const line of lines) {
    const text = normalizeText(line);
    if (!text) continue;

    // Expected format: "DrugName Form Strength (MRN) Instructions"
    const match = text.match(/^(.+?)\s*\(([A-Za-z0-9]+)\)\s+(.+)$/);
    if (!match) continue;

    const mrn = match[2].toUpperCase();
    const rawMedText = normalizeText(match[3]);

    // 1. Extract Date first to clean up the string
    let startDate: string | undefined;
    let cleanText = rawMedText;
    
    const dateMatch = cleanText.match(REGEX_DATE_CANDIDATE);
    if (dateMatch) {
        startDate = parseDateString(dateMatch[0]);
        cleanText = cleanText.replace(dateMatch[0], "").trim();
    }

    // 2. Extract Class Label
    const classExtraction = extractMedicationClass(cleanText);
    let classOverride = classExtraction.classOverride;
    cleanText = classExtraction.cleanedText;

    // 3. Extract Indication
    let indication = "Unknown";
    const indicationMatch = cleanText.match(/\bfor\s+([a-zA-Z0-9\s/.,\-]+?)(?=\s*$|\s+(?:Start|Date|Give|Take|Apply|Inject|Inhale|Use|By|Orally|Topically))/i);
    
    if (indicationMatch) {
        const rawIndication = indicationMatch[1].trim();
        cleanText = cleanText.replace(indicationMatch[0], "").trim();
        
        // De-duplicate words
        const words = rawIndication.split(/\s+/);
        const uniqueWords: string[] = [];
        const seen = new Set<string>();
        for (const w of words) {
            const lower = w.toLowerCase();
            if (!seen.has(lower)) {
                seen.add(lower);
                uniqueWords.push(w);
            }
        }
        indication = uniqueWords.join(' ');

        try {
            const escapedIndication = indication.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const duplicateRegex = new RegExp(`\\s+${escapedIndication}$`, 'i');
            cleanText = cleanText.replace(duplicateRegex, '').trim();
        } catch (e) {
            // fallback
        }

    } else {
        const words = cleanText.split(' ');
        if (words.length > 2) {
             const lastWord = words[words.length - 1];
             if (lastWord.length > 3 && /depression|anxiety|psychosis|insomnia|schizophrenia|agitation|bipolar|pain/i.test(lastWord)) {
                 indication = lastWord;
                 cleanText = cleanText.substring(0, cleanText.lastIndexOf(lastWord)).trim();
             }
        }
    }

    // 4. Separate Name/Dose from Sig/Frequency
    // Strategy: Look for the *start* of the instruction (sig).
    // Common starts: "Give", "Take", "Apply", or "1 tablet", "2 puffs", "One capsule"
    
    // Pattern matches the instruction start
    const sigStartRegex = /\b(?:Give|Take|Apply|Inject|Inhale|Infuse|Use|Instill|Place|Patch|Spray|Chew|Swallow|Dissolve)\b|\b(?:\d+|One|Two|Three|Four|Five|Half)\s+(?:Tablet|Tab|Cap|Capsule|Puff|Spray|Drop|Patch|App|Application|Inj|Injection)s?\b/i;
    
    let drugNameAndDose = cleanText;
    let frequency = "Unknown";

    const sigMatch = cleanText.match(sigStartRegex);

    if (sigMatch && sigMatch.index !== undefined && sigMatch.index > 0) {
        drugNameAndDose = cleanText.substring(0, sigMatch.index).trim();
        frequency = cleanText.substring(sigMatch.index).trim();
    } else {
        // Fallback: Use Form/Strength markers to try to find the end of the drug name
        // e.g. "Abilify Oral Tablet 2 MG" -> Name: Abilify, Dose: Oral Tablet 2 MG (roughly)
        // or finding end of dose if instructions are missing explicit verbs
        // Try to split on the last occurrence of a dose-like pattern if no verb found
        // This is tricky without a definitive split. 
        // We will default to keeping the whole string as the "Dose" and guessing the name is the first word.
        drugNameAndDose = cleanText; 
        frequency = "See Order"; // If we can't find a sig, label it.
    }

    // 5. Refine Drug Name vs Dose String
    // drugNameAndDose might be "Abilify Oral Tablet 2 MG"
    // We want drugName="Abilify", Dose="Oral Tablet 2 MG" (or just full display)
    
    // Simple heuristic: Name is the first word, or words before common form/strength indicators
    let drugName = drugNameAndDose.split(' ')[0];
    
    const formStrengthMatch = drugNameAndDose.match(/\b(?:Oral|Tablet|Tab|Capsule|Cap|Soln|Solution|Susp|Inj|MG|MCG|ML|%)\b/i);
    if (formStrengthMatch && formStrengthMatch.index && formStrengthMatch.index > 0) {
        drugName = drugNameAndDose.substring(0, formStrengthMatch.index).trim();
    }

    // Ensure drug name isn't empty if regex gets too aggressive
    if(!drugName) drugName = drugNameAndDose.split(' ')[0];

    // If frequency is still just "See Order", try to grab the tail if distinct
    if (frequency === "See Order" && drugNameAndDose.length > drugName.length) {
         // check if the tail looks like a sig? e.g. "BID", "Daily"
         const tail = drugNameAndDose.substring(drugName.length).trim();
         if (/\b(?:BID|TID|QID|Daily|QAM|QPM|PRN|Once)\b/i.test(tail)) {
             frequency = tail;
             drugNameAndDose = drugName; // reset dose display to just name? No, keep context.
         }
    }

    const nameRaw = drugNameAndDose;
    const nameNorm = normalizeDrugName(nameRaw);

    meds.push({
      mrn,
      drug: drugName, 
      display: drugNameAndDose, // This usually contains "Name + Strength + Form"
      nameRaw,
      nameNorm,
      class: classifyMedication(nameRaw, medicationIndex),
      classOverride,
      frequency: frequency, 
      dose: drugNameAndDose, // Using the full name+strength string as dose/display for now
      startDate,
      indication
    });
  }
  return meds;
};

export const parseConsults = (raw: string): { mrn: string; event: ConsultEvent }[] => {
  const results: { mrn: string; event: ConsultEvent }[] = [];
  const lines = raw.split(/\r?\n/);
  let currentMrn = "";

  for (const line of lines) {
    const text = normalizeText(line);
    if (!text) continue;

    const mrn = extractMrn(text);
    if (mrn) currentMrn = mrn;

    const dateStr = parseDateString(text);
    if (dateStr && currentMrn) {
      const status = /complete/i.test(text) ? "Complete" : (/pending/i.test(text) ? "Pending" : "Unknown");
      results.push({
        mrn: currentMrn,
        event: {
          date: dateStr,
          status,
          snippet: text.substring(0, 150)
        }
      });
    }
  }
  return results;
};

export const parseBehaviors = (raw: string): { mrn: string; event: BehaviorEvent }[] => {
    const results: { mrn: string; event: BehaviorEvent }[] = [];
    const lines = raw.split(/\r?\n/);
    let currentMrn = "";

    for(const line of lines) {
        const text = normalizeText(line);
        if(!text) continue;

        const mrn = extractMrn(text);
        if(mrn) currentMrn = mrn;

        const dateStr = parseDateString(text);
        if(dateStr && currentMrn) {
            results.push({
                mrn: currentMrn,
                event: {
                    date: dateStr,
                    snippet: text
                }
            })
        }
    }
    return results;
};

const CAREPLAN_PSYCH_REGEX = /psychotropic|antipsychotic|behavior management|behavioral|agitation|hallucination|anxiety|insomnia|delusion|mood|depression|bipolar|schiz|psychosis/i;

export const parseCarePlans = (raw: string): { mrn: string; item: CarePlanItem }[] => {
  const results: { mrn: string; item: CarePlanItem }[] = [];
  const lines = raw.split(/\r?\n/);

  for (const line of lines) {
    const text = normalizeText(line);
    const match = text.match(/^(.+?)\s*\(([A-Za-z0-9]+)\)\s+(.+)$/);
    
    if (match) {
      const mrn = match[2].toUpperCase();
      const planText = match[3];
      results.push({ mrn, item: { text: planText, psychRelated: CAREPLAN_PSYCH_REGEX.test(planText) } });
    }
  }
  return results;
};

export const parseGdr = (_raw: string): { mrn: string; event: GdrEvent }[] => {
  const results: { mrn: string; event: GdrEvent }[] = [];
  const lines = _raw.split(/\r?\n/);
  let currentMrn = "";
  let buffer: string[] = [];

  const extractLabeledDate = (text: string, label: RegExp): string => {
    const match = text.match(label);
    if (!match) return "";
    const dateMatch = match[1] || match[2] || "";
    return parseDateString(dateMatch);
  };

  const extractFirstDate = (text: string): string => {
    const match = text.match(REGEX_DATE_SLASH);
    return match ? parseDateString(match[0]) : "";
  };

  const extractStatus = (text: string): string => {
    const statusMatch = text.match(/status[:\s-]*([a-z0-9\s/().-]+)/i);
    if (statusMatch) {
      const cleaned = statusMatch[1]
        .split(/(?:last psych|psych eval|status date|gdr date|date)/i)[0]
        .trim();
      if (cleaned) return cleaned;
    }
    if (/contraindicat/i.test(text)) return "Contraindicated";
    if (/fail|unsuccess|unable|declin|refus/i.test(text)) return "Failed";
    if (/reduc|decreas|discontinu|taper/i.test(text)) return "Reduction";
    if (/pending|due|overdue|scheduled/i.test(text)) return "Pending";
    return "Unknown";
  };

  const extractMedicationAndDose = (text: string): { medication?: string; dose?: string } => {
    const labelMatch = text.match(/(?:medication|drug|psychotropic|med)\s*[:\-]\s*([^;]+?)(?=(?:\bstatus\b|\bdate\b|\bpsych\b|$))/i);
    const source = labelMatch ? labelMatch[1] : text;
    const doseMatch = source.match(/(\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml|units?|tabs?|tablets?|caps?|capsules?))/i);
    const dose = doseMatch ? doseMatch[1].trim() : undefined;
    let medication = source;
    if (doseMatch) medication = source.replace(doseMatch[0], "").trim();
    medication = medication.replace(/^[\s:;-]+|[\s:;-]+$/g, "").trim();
    if (!medication || medication.length < 2) medication = undefined;
    return { medication, dose };
  };

  const flushBuffer = () => {
    if (!currentMrn || buffer.length === 0) return;
    const blockText = normalizeText(buffer.join(" "));
    if (!blockText) return;

    const gdrDate =
      extractLabeledDate(blockText, /(?:last\s+gdr|gdr\s+date|gdr\s+attempt|gdr\s+performed)\s*[:\-]?\s*([0-9/\-]+)/i) ||
      extractFirstDate(blockText);

    if (!gdrDate) {
      buffer = [];
      return;
    }

    const statusDate =
      extractLabeledDate(blockText, /(?:status\s+date|status\s+as\s+of)\s*[:\-]?\s*([0-9/\-]+)/i) ||
      gdrDate;

    const lastPsychEval = extractLabeledDate(
      blockText,
      /(?:last\s+psych\s+eval|psych\s+eval(?:uation)?|psychiatric\s+eval)\s*[:\-]?\s*([0-9/\-]+)/i
    );

    const status = extractStatus(blockText);
    const { medication, dose } = extractMedicationAndDose(blockText);

    results.push({
      mrn: currentMrn,
      event: {
        date: gdrDate,
        status,
        statusDate,
        lastPsychEval,
        medication,
        dose
      }
    });

    buffer = [];
  };

  for (const line of lines) {
    const text = normalizeText(line);
    if (!text) continue;

    const mrn = extractMrn(text);
    if (mrn) {
      flushBuffer();
      currentMrn = mrn;
      buffer = [text];
      continue;
    }

    if (currentMrn) buffer.push(text);
  }

  flushBuffer();
  return results;
};

const PSYCH_ORDER_REGEX = /\b(psychiatry|psychiatric|psych)\b.*\b(consult|eval|evaluation)\b|\b(consult|eval|evaluation)\b.*\b(psychiatry|psychiatric|psych)\b/i;

export const parsePsychMdOrders = (
  raw: string,
  residents: Resident[]
): { mrn: string; event: PsychMdOrder }[] => {
  const results: { mrn: string; event: PsychMdOrder }[] = [];
  const lines = raw.split(/\r?\n/);

  const normalizedResidents = residents.map(r => ({
    mrn: r.mrn.toUpperCase(),
    name: normalizeText(r.name).toLowerCase()
  }));

  for (const line of lines) {
    const text = normalizeText(line);
    if (!text || !PSYCH_ORDER_REGEX.test(text)) continue;

    const mrnMatch = extractMrn(text);
    let matchedMrn = mrnMatch || "";

    if (!matchedMrn) {
      const lowerText = text.toLowerCase();
      const foundResident = normalizedResidents.find(r => r.name && lowerText.includes(r.name));
      if (foundResident) matchedMrn = foundResident.mrn;
    }

    if (!matchedMrn) continue;

    const dateStr = parseDateString(text) || new Date().toISOString().slice(0, 10);
    const orderText = text.substring(0, 200);
    results.push({
      mrn: matchedMrn,
      event: {
        date: dateStr,
        orderText,
        status: /complete|completed/i.test(text) ? "Completed" : "Ordered"
      }
    });
  }

  return results;
};

export const parseEpisodicBehaviors = (raw: string): { mrn: string; event: EpisodicBehaviorEvent }[] => {
  const results: { mrn: string; event: EpisodicBehaviorEvent }[] = [];
  const lines = raw.split(/\r?\n/);
  let currentMrn = "";
  let currentBlock: { mrn: string; lines: string[] } | null = null;

  const cleanSection = (value: string): string => normalizeText(value).replace(/^[:\-]\s*/, "");

  const extractSection = (noteText: string, startLabel: RegExp, endLabels: RegExp[]): string => {
    const startMatch = noteText.match(startLabel);
    if (!startMatch || startMatch.index === undefined) return "";
    const startIndex = startMatch.index + startMatch[0].length;
    const rest = noteText.slice(startIndex);
    const endRegex = new RegExp(endLabels.map(label => label.source).join("|"), "i");
    const endIndex = rest.search(endRegex);
    return cleanSection(endIndex === -1 ? rest : rest.slice(0, endIndex));
  };

  const buildSnippet = (noteText: string): string => {
    const normalized = normalizeText(noteText);
    const situationRaw = extractSection(normalized, /Situation\s*:?/i, [
      /Immediate Action/i,
      /Physical Evaluation/i,
      /Intervention/i,
      /Notification/i,
      /Comments/i,
      /Author/i
    ]);
    const immediateRaw = extractSection(normalized, /Immediate Action\s*:?/i, [
      /Physical Evaluation/i,
      /Intervention/i,
      /Notification/i,
      /Comments/i,
      /Author/i
    ]);
    const interventionRaw = extractSection(normalized, /Intervention\s*:?/i, [
      /Notification/i,
      /Comments/i,
      /Author/i
    ]);
    const responseRaw = extractSection(normalized, /Resident response to non-pharmacological intervention\/?s?\s*:?/i, [
      /Was any medication/i,
      /Notification/i,
      /Comments/i,
      /Author/i
    ]);

    const situation = cleanSection(situationRaw)
      .replace(/What time did the behavior start\??[^.]*\.?/i, "")
      .replace(/Location where behavior was observed\??[^.]*\.?/i, "")
      .trim();
    const immediate = cleanSection(immediateRaw).trim();
    const intervention = cleanSection(interventionRaw)
      .replace(/The following non-pharmacological interventions were attempted:?/i, "")
      .trim();
    const response = cleanSection(responseRaw)
      .replace(/Resident response to non-pharmacological intervention\/?s?:?/i, "")
      .trim();

    const interventionLines: string[] = [];
    if (intervention) {
      interventionLines.push(
        `The following non-pharmacological interventions were attempted:${intervention ? `\n${intervention}` : ""}`
      );
    }
    if (response) {
      interventionLines.push(`Resident response to non-pharmacological intervention/s: ${response}`);
    }

    const parts = [
      situation ? `Situation : ${situation}` : "",
      immediate ? `Immediate Action : ${immediate}` : "",
      interventionLines.length ? `Intervention : ${interventionLines.join("\n")}` : ""
    ].filter(Boolean);

    const summary = parts.length > 0 ? parts.join("\n\n") : normalized;
    return summary.length > 260 ? `${summary.slice(0, 257)}...` : summary;
  };

  const extractEpisodicDate = (noteText: string): string => {
    const effectiveMatch = noteText.match(/Effective Date:\s*([0-9\/-]+)/i);
    if (effectiveMatch) {
      const parsed = parseDateString(effectiveMatch[1]);
      if (parsed) return parsed;
    }
    return parseDateString(noteText);
  };

  const finalizeBlock = () => {
    if (!currentBlock) return;
    const mrn = currentBlock.mrn;
    const noteText = currentBlock.lines.join(" ");
    const dateStr = extractEpisodicDate(noteText);
    if (mrn && dateStr) {
      results.push({
        mrn,
        event: {
          date: dateStr,
          snippet: buildSnippet(noteText)
        }
      });
    }
    currentBlock = null;
  };

  for (const line of lines) {
    const text = normalizeText(line);
    if (!text) continue;

    const mrn = extractMrn(text);
    if (mrn) currentMrn = mrn;

    if (/Episodic Behavior Note/i.test(text) || (/Situation\s*:?/i.test(text) && !currentBlock)) {
      if (currentBlock) finalizeBlock();
      currentBlock = { mrn: currentMrn, lines: [text] };
      continue;
    }

    if (currentBlock) {
      currentBlock.lines.push(text);
    }
  }

  finalizeBlock();
  return results;
};
