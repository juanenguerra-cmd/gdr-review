import { Resident, Medication, ConsultEvent, CarePlanItem, GdrEvent, BehaviorEvent, MedicationClass, PsychMdOrder, EpisodicBehaviorEvent } from '../types';

// --- Helpers & Regex ---

const REGEX_DATE_SLASH = /(\d{1,2})[-\/](\d{1,2})[-\/](\d{2,4})/;
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

const parseDateString = (dateStr: string): string => {
  if (!dateStr) return "";
  const t = dateStr.trim();
  const match = t.match(REGEX_DATE_SLASH);
  
  if (match) {
    const p1 = parseInt(match[1], 10);
    const p2 = parseInt(match[2], 10);
    const p3 = parseInt(match[3], 10);

    // Standardizing on MM/DD/YYYY input assumption for US Healthcare
    const mm = p1;
    const dd = p2;
    let yy = p3;
    
    if (yy < 100) {
      yy = yy < 50 ? 2000 + yy : 1900 + yy;
    }

    if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return "";

    return `${yy}-${mm.toString().padStart(2, '0')}-${dd.toString().padStart(2, '0')}`;
  }
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

const classifyMedication = (medName: string, customMap?: Record<string, MedicationClass>): MedicationClass => {
  const nameNorm = normalizeDrugName(medName);
  const combinedMap: Record<string, MedicationClass> = {
    ...PSYCH_MAP,
    ...(customMap || {})
  };
  if (combinedMap[nameNorm]) return combinedMap[nameNorm];

  const entry = Object.entries(combinedMap).find(([key]) => nameNorm.includes(key));
  if (entry) return entry[1];

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
    
    const dateMatch = cleanText.match(REGEX_DATE_SLASH);
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
      class: classifyMedication(nameRaw, customMap),
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
    return []; 
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
      .replace(/What behavior was observed\??/i, "")
      .replace(/What time did the behavior start\??[^.]*\.?/i, "")
      .replace(/Location where behavior was observed\??[^.]*\.?/i, "")
      .trim();
    const immediate = cleanSection(immediateRaw)
      .replace(/Immediate action\/?s? were taken to ensure safety:?/i, "")
      .trim();
    const intervention = cleanSection(interventionRaw)
      .replace(/The following non-pharmacological interventions were attempted:?/i, "")
      .trim();
    const response = cleanSection(responseRaw)
      .replace(/Resident response to non-pharmacological intervention\/?s?:?/i, "")
      .trim();

    const parts = [
      situation ? `Situation: ${situation}` : "",
      immediate ? `Immediate action: ${immediate}` : "",
      intervention ? `Intervention: ${intervention}` : "",
      response ? `Response: ${response}` : ""
    ].filter(Boolean);

    const summary = parts.length > 0 ? parts.join(" ") : normalized;
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
