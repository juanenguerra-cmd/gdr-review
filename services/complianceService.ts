import { ResidentData, ComplianceStatus, Medication } from '../types';

const DAYS_7 = 7 * 24 * 60 * 60 * 1000;
const DAYS_90 = 90 * 24 * 60 * 60 * 1000;
const DAYS_365 = 365 * 24 * 60 * 60 * 1000;
const GDR_ANNUAL_WARNING_WINDOW_DAYS = 60; // 60 days before due date

const INDICATION_MAP: Record<Medication['class'], RegExp> = {
  'Antipsychotic': /schizophrenia|schizoaffective|bipolar|psychosis|psychotic|delusional|tourette|huntington|F20|F25|F31|F23|F22|F95\.2|G10/i,
  'Antidepressant': /depression|mdd|anxiety|ocd|ptsd|panic disorder|F32|F33|F41|F42|F43\.1/i,
  'Anxiolytic': /anxiety|panic|F41|F40/i,
  'Mood stabilizer': /bipolar|mood disorder|cyclothymia|F31/i,
  'Hypnotic': /insomnia|sleep disorder|G47\.0/i,
  'Other': /.*/, // 'Other' class passes by default
};

// Map for common, evidence-based adjunctive or off-label uses (Regex based)
const DRUG_SPECIFIC_INDICATION_MAP: Record<string, RegExp> = {
    'aripiprazole': /depression|mdd/i,
    'quetiapine': /depression|mdd/i,
    'olanzapine': /depression|mdd|anorexia/i,
    'risperidone': /depression|mdd/i,
    'divalproex': /migraine/i,
    'amitriptyline': /pain|neuropathy|migraine/i,
    'duloxetine': /pain|neuropathy|fibromyalgia/i,
    'trazodone': /insomnia|sleep/i,
    'mirtazapine': /insomnia|sleep|appetite/i,
    'prazosin': /nightmare|ptsd/i,
    'clonidine': /anxiety|adhd/i,
    'gabapentin': /pain|neuropathy|anxiety/i
};

// Map for valid indications strings to check if parsed indication is a substring of these
// This handles cases where the order might say "for migraine" and the valid indication is "migraine prophylaxis"
const DRUG_SPECIFIC_VALID_STRINGS: Record<string, string[]> = {
    'aripiprazole': ['major depressive disorder', 'mdd', 'depression', 'adjunctive therapy'],
    'quetiapine': ['major depressive disorder', 'mdd', 'depression'],
    'olanzapine': ['major depressive disorder', 'mdd', 'depression', 'anorexia nervosa'],
    'risperidone': ['major depressive disorder', 'mdd', 'depression'],
    'divalproex': ['migraine prophylaxis', 'migraine'],
    'amitriptyline': ['neuropathic pain', 'migraine', 'fibromyalgia', 'insomnia'],
    'duloxetine': ['neuropathic pain', 'fibromyalgia', 'musculoskeletal pain', 'anxiety'],
    'trazodone': ['insomnia', 'sleep disorder'],
    'mirtazapine': ['insomnia', 'sleep disorder', 'appetite stimulation'],
    'prazosin': ['nightmares', 'ptsd'],
    'clonidine': ['anxiety', 'adhd'],
    'gabapentin': ['neuropathic pain', 'anxiety']
};

const getSuggestedIndications = (med: Medication): string[] => {
    const suggestions: string[] = [];
    const lowerDrug = med.drug.toLowerCase();
    
    // 1. Drug Specific
    for (const [drugKey, validList] of Object.entries(DRUG_SPECIFIC_VALID_STRINGS)) {
        if (lowerDrug.includes(drugKey)) {
            suggestions.push(...validList);
        }
    }

    // 2. Class Specific (Generic) - only add if we don't have drug specific ones or to supplement
    if (suggestions.length === 0) {
        if (med.class === 'Antipsychotic') suggestions.push('Schizophrenia', 'Bipolar Disorder', 'Psychosis');
        else if (med.class === 'Antidepressant') suggestions.push('Major Depressive Disorder', 'Anxiety');
        else if (med.class === 'Anxiolytic') suggestions.push('Generalized Anxiety Disorder');
        else if (med.class === 'Hypnotic') suggestions.push('Insomnia');
        else if (med.class === 'Mood stabilizer') suggestions.push('Bipolar Disorder');
    }

    return [...new Set(suggestions)].slice(0, 3).map(s => s.charAt(0).toUpperCase() + s.slice(1));
};

const validateIndication = (med: Medication): { isValid: boolean; message?: string } => {
    const indicationText = (med.indication || "").trim();
    if (!indicationText || indicationText === "Unknown") {
        return { 
            isValid: false, 
            message: `Inappropriate Indication: Missing diagnosis for ${med.drug}. CMS requires specific clinical indication.` 
        };
    }
    
    const lowerIndication = indicationText.toLowerCase();

    // 1. Check primary class indication
    const classRegex = INDICATION_MAP[med.class];
    if (classRegex && classRegex.test(indicationText)) {
        return { isValid: true };
    }

    // 2. Check drug-specific indications
    const lowerDrugName = med.drug.toLowerCase();
    
    // Check Regex Map
    for (const [drugKey, specificRegex] of Object.entries(DRUG_SPECIFIC_INDICATION_MAP)) {
        if (lowerDrugName.includes(drugKey)) {
            if (specificRegex.test(indicationText)) return { isValid: true };
        }
    }

    // Check String Substring Map (Parsed text is a substring of known valid indication)
    // e.g. Parsed: "migraine" -> Valid: "migraine prophylaxis" (match)
    if (lowerIndication.length > 2) {
        for (const [drugKey, validList] of Object.entries(DRUG_SPECIFIC_VALID_STRINGS)) {
            if (lowerDrugName.includes(drugKey)) {
                // Check if any of the valid strings contains the parsed indication
                if (validList.some(valid => valid.toLowerCase().includes(lowerIndication))) {
                    return { isValid: true };
                }
            }
        }
    }
    
    // If we reach here, it's invalid
    const suggestions = getSuggestedIndications(med);
    const suggestionStr = suggestions.length > 0 ? ` Expected: ${suggestions.join(', ')}.` : ` Expected valid ${med.class} indication.`;

    return { 
        isValid: false, 
        message: `Inappropriate Indication: '${indicationText}' is not a recognized diagnosis for ${med.drug} (${med.class}).${suggestionStr}` 
    };
};

export const evaluateResidentCompliance = (resident: ResidentData, referenceDate: Date = new Date()): ResidentData => {
  const issues: string[] = [];
  const now = referenceDate;
  
  const psychotropics = resident.meds.filter(m => m.class !== 'Other');
  const hasPsychMeds = psychotropics.length > 0;
  const antipsychotics = resident.meds.filter(m => m.class === 'Antipsychotic');
  const hasAntipsychotic = antipsychotics.length > 0;
  
  // Rule 0: General Psych Med Rules
  if (hasPsychMeds) {
    // Missing Care Plan
    if (resident.carePlan.length === 0) {
      issues.push("Missing Care Plan for Psychotropic Use");
    }
    
    // Missing Weekly Behavior Log
    const recentBehavior = resident.behaviors.some(b => now.getTime() - new Date(b.date).getTime() <= DAYS_7);
    if (resident.behaviors.length === 0) {
        issues.push("Missing Weekly Behavior Form");
    } else if (!recentBehavior) {
        issues.push("Behavior Logs outdated (>7 days old)");
    }

    // Missing Quarterly Psych Consult
    const recentConsult = resident.consults.some(c => now.getTime() - new Date(c.date).getTime() <= DAYS_90);
    if (!recentConsult) {
        issues.push("No Psychiatry Consult within last 90 days");
    }

    // NEW: Informed Consent (F740)
    const hasConsent = resident.carePlan.some(i => /consent|risk|benefit/i.test(i.text)) || 
                       resident.consults.some(c => /consent|risk|benefit/i.test(c.snippet));
    if (!hasConsent) {
        issues.push("Missing Informed Consent documentation (CMS F740).");
    }
    
    // NEW: Non-Pharmacological Interventions (F758)
    const hasNonPharm = resident.carePlan.some(i => /non-pharm|intervention|redirection|activity|behavioral|environment/i.test(i.text));
    if (!hasNonPharm) {
        issues.push("No Non-Pharmacological Interventions found in Care Plan (CMS F758).");
    }

    // Check for appropriate indication for each medication
    psychotropics.forEach(med => {
        const validation = validateIndication(med);
        if (!validation.isValid && validation.message) {
            issues.push(validation.message);
        }
    });
  }

  // Rule 1: Antipsychotic-Specific Rules
  if (hasAntipsychotic) {
    // GDR Timing (F758) - REFINED LOGIC
    const sortedGdr = [...(resident.gdr || [])].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const firstAPDate = resident.compliance.firstAntipsychoticDate ? new Date(resident.compliance.firstAntipsychoticDate) : null;

    if (firstAPDate && !isNaN(firstAPDate.getTime())) {
        const daysSinceFirstUse = (now.getTime() - firstAPDate.getTime()) / (1000 * 60 * 60 * 24);
        
        if (daysSinceFirstUse <= 365) { // First Year Rules
            const gdrAttemptsInFirstYear = sortedGdr.filter(g => {
                const gdrDate = new Date(g.date);
                return gdrDate >= firstAPDate && (gdrDate.getTime() - firstAPDate.getTime()) <= DAYS_365;
            });

            if (gdrAttemptsInFirstYear.length < 2) {
                if (gdrAttemptsInFirstYear.length === 1) {
                    if (daysSinceFirstUse > 270) {
                        issues.push("GDR Overdue: Second attempt required within the first year.");
                    }
                } else {
                    if (daysSinceFirstUse > 180) {
                        issues.push("GDR Overdue: First of two attempts required within first year.");
                    }
                }
            }
        } else { // Subsequent Annual Rules
            const lastGdr = sortedGdr[0];
            if (!lastGdr) {
                 issues.push("GDR Overdue: No GDR attempt recorded since first year of use.");
            } else {
                const daysSinceLastGdr = (now.getTime() - new Date(lastGdr.date).getTime()) / (1000 * 60 * 60 * 24);
                if (daysSinceLastGdr > 365) {
                    issues.push("GDR Overdue: Annual attempt required.");
                } else if (daysSinceLastGdr > (365 - GDR_ANNUAL_WARNING_WINDOW_DAYS)) {
                    const dueDate = new Date(new Date(lastGdr.date).getTime() + DAYS_365);
                    issues.push(`GDR Warning: Annual attempt is due by ${dueDate.toLocaleDateString()}.`);
                }
            }
        }
    } else {
        issues.push("GDR Warning: First antipsychotic start date not recorded to track GDR schedule.");
    }

    // PRN Duration
    const prnMeds = antipsychotics.filter(m => m.frequency === 'PRN');
    prnMeds.forEach(med => {
      if (med.startDate) {
        const start = new Date(med.startDate);
        if (!isNaN(start.getTime())) {
          const durationDays = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
          if (durationDays > 14) {
            issues.push(`PRN Antipsychotic (${med.drug}) active > 14 days. Verify rationale.`);
          }
        }
      } else {
        issues.push(`Verify PRN Antipsychotic (${med.drug}) duration (Start date not found).`);
      }
    });
  }

  // Determine Status
  let status = ComplianceStatus.COMPLIANT;
  if (issues.length > 0) {
    const isCritical = issues.some(i => 
      /Missing Care Plan|GDR Overdue|active > 14 days|No Psychiatry Consult|Inappropriate Indication/i.test(i)
    );
    status = isCritical ? ComplianceStatus.CRITICAL : ComplianceStatus.WARNING;
  }

  return {
    ...resident,
    compliance: {
      ...resident.compliance,
      status,
      issues,
      gdrOverdue: issues.some(i => i.includes("GDR Overdue")),
      missingCarePlan: issues.some(i => i.includes("Missing Care Plan")),
    }
  };
};