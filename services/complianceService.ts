import { ResidentData, ComplianceStatus, Medication, AppSettings, MedicationClass, ComplianceExplainabilityEntry, ComplianceRuleEvidence } from '../types';
import { normalizeSettings } from './settingsService';
import { resolveIndicationMatch } from './clinicalIndicationService';

const isWithinDays = (dateStr: string, now: Date, days: number): boolean => {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return false;
  return now.getTime() - date.getTime() <= days * 24 * 60 * 60 * 1000;
};

const getEffectiveClass = (med: Medication): MedicationClass => med.classOverride || med.class;

const needsReview = (indication: string): boolean => /unknown|review|uncertain|tbd/i.test(indication);

const formatDateValue = (value?: string): string => {
  if (!value) return 'Not available';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toISOString().split('T')[0];
};

const getMostRecentDate = (dates: string[]): string | undefined => {
  if (dates.length === 0) return undefined;
  return dates
    .map(date => ({ date, time: new Date(date).getTime() }))
    .filter(item => !Number.isNaN(item.time))
    .sort((a, b) => b.time - a.time)[0]?.date;
};

const buildEvidence = (entries: Array<[string, string | number | boolean | undefined]>): ComplianceRuleEvidence[] => {
  return entries.map(([label, value]) => ({
    label,
    value: value === undefined || value === '' ? 'Not available' : String(value)
  }));
};

export const evaluateResidentCompliance = (
  resident: ResidentData,
  referenceDate: Date = new Date(),
  settings?: AppSettings
): ResidentData => {
  const appliedSettings = normalizeSettings(settings);
  const issues: string[] = [];
  const now = referenceDate;
  const explainability: ComplianceExplainabilityEntry[] = [];

  let hasCritical = false;
  let hasWarning = false;

  const addIssue = (message: string, severity: 'CRITICAL' | 'WARNING', detail: Omit<ComplianceExplainabilityEntry, 'message' | 'severity'>) => {
    issues.push(message);
    explainability.push({
      ...detail,
      message,
      severity,
      evidence: detail.evidence || []
    });
    if (severity === 'CRITICAL') hasCritical = true;
    if (severity === 'WARNING') hasWarning = true;
  };

  const hasMedsParsed = resident.meds.length > 0;
  let indicationStatus: ResidentData['compliance']['indicationStatus'] = 'OK';
  let consultStatus: ResidentData['compliance']['consultStatus'] = 'MISSING';
  let updatedMeds = resident.meds;

  if (hasMedsParsed) {
    const psychCarePlanPresent = resident.carePlan.some(item => item.psychRelated);
    if (!psychCarePlanPresent) {
      addIssue("Missing psychotropic care plan", 'CRITICAL', {
        id: 'care-plan-missing',
        title: 'Psychotropic care plan requirement',
        evidence: buildEvidence([
          ['Psych care plan present', psychCarePlanPresent]
        ])
      });
    }

    const behaviorWindow = appliedSettings.behaviorWindowDays;
    const recentBehaviorNotes = resident.behaviors.filter(b => isWithinDays(b.date, now, behaviorWindow));
    if (recentBehaviorNotes.length < appliedSettings.behaviorThreshold) {
      addIssue(`Behavior monitoring below threshold (${recentBehaviorNotes.length}/${appliedSettings.behaviorThreshold} in ${behaviorWindow} days)`, 'WARNING', {
        id: 'behavior-monitoring-threshold',
        title: 'Behavior monitoring threshold',
        evidence: buildEvidence([
          ['Behavior notes in window', recentBehaviorNotes.length],
          ['Required threshold', appliedSettings.behaviorThreshold],
          ['Window (days)', behaviorWindow]
        ])
      });
    }

    const consultWindow = appliedSettings.consultRecencyDays;
    const hasRecentConsult = resident.consults.some(c => isWithinDays(c.date, now, consultWindow));
    const hasRecentOrder = resident.psychMdOrders.some(o => isWithinDays(o.date, now, consultWindow));
    const lastConsultDate = getMostRecentDate(resident.consults.map(c => c.date));
    const lastOrderDate = getMostRecentDate(resident.psychMdOrders.map(o => o.date));

    if (hasRecentConsult) {
      consultStatus = 'CONSULT';
    } else if (hasRecentOrder) {
      consultStatus = 'ORDER';
      addIssue(`Psychiatry order present but consult not completed (last ${consultWindow} days)`, 'WARNING', {
        id: 'consult-order-without-consult',
        title: 'Consult recency requirement',
        evidence: buildEvidence([
          ['Consult window (days)', consultWindow],
          ['Recent consult in window', hasRecentConsult],
          ['Recent order in window', hasRecentOrder],
          ['Last consult date', formatDateValue(lastConsultDate)],
          ['Last order date', formatDateValue(lastOrderDate)]
        ])
      });
    } else {
      consultStatus = 'MISSING';
      addIssue(`No psychiatry consult or order in last ${consultWindow} days`, 'CRITICAL', {
        id: 'consult-missing',
        title: 'Consult recency requirement',
        evidence: buildEvidence([
          ['Consult window (days)', consultWindow],
          ['Recent consult in window', hasRecentConsult],
          ['Recent order in window', hasRecentOrder],
          ['Last consult date', formatDateValue(lastConsultDate)],
          ['Last order date', formatDateValue(lastOrderDate)]
        ])
      });
    }

    const manualGdr = resident.manualGdr;
    if (manualGdr.status === 'NOT_SET') {
      addIssue("Manual GDR status not set", 'CRITICAL', {
        id: 'manual-gdr-not-set',
        title: 'Manual GDR documentation',
        evidence: buildEvidence([
          ['Manual GDR status', manualGdr.status]
        ])
      });
    } else if (manualGdr.status === 'DONE') {
      if (!manualGdr.note || manualGdr.note.trim().length === 0) {
        addIssue("Manual GDR marked done without note", 'CRITICAL', {
          id: 'manual-gdr-missing-note',
          title: 'Manual GDR documentation',
          evidence: buildEvidence([
            ['Manual GDR status', manualGdr.status],
            ['Note provided', Boolean(manualGdr.note?.trim())]
          ])
        });
      }
    } else if (manualGdr.status === 'CONTRAINDICATED') {
      const reasons = manualGdr.contraindications;
      const hasReason = reasons.symptomsReturned || reasons.additionalGdrLikelyToImpair || reasons.riskToSelfOrOthers || reasons.other;
      if (!hasReason) {
        addIssue("Manual GDR contraindicated without documented reasons", 'CRITICAL', {
          id: 'manual-gdr-contradiction-no-reason',
          title: 'Manual GDR contraindications',
          evidence: buildEvidence([
            ['Manual GDR status', manualGdr.status],
            ['Symptoms returned', reasons.symptomsReturned],
            ['Additional GDR likely to impair', reasons.additionalGdrLikelyToImpair],
            ['Risk to self or others', reasons.riskToSelfOrOthers],
            ['Other reason selected', reasons.other]
          ])
        });
      }
      if (reasons.other && !reasons.otherText?.trim()) {
        addIssue("Manual GDR contraindicated: 'Other' selected without detail", 'CRITICAL', {
          id: 'manual-gdr-contradiction-other-detail',
          title: 'Manual GDR contraindications',
          evidence: buildEvidence([
            ['Other reason selected', reasons.other],
            ['Other reason detail', reasons.otherText?.trim()]
          ])
        });
      }
    }

    updatedMeds = resident.meds.map(med => {
      const indication = (med.indication || '').trim();
      const effectiveClass = getEffectiveClass(med);
      let indicationMatch = med.indicationMatch;
      if (!indication || indication.toLowerCase() === 'unknown') {
        addIssue(`Missing indication for ${med.drug}`, 'CRITICAL', {
          id: `indication-missing-${med.drug}`,
          title: 'Medication indication required',
          evidence: buildEvidence([
            ['Medication', med.display || med.drug],
            ['Medication class', effectiveClass],
            ['Indication', indication || 'Unknown']
          ])
        });
        indicationStatus = 'MISSING';
        indicationMatch = undefined;
        return { ...med, indicationMatch };
      }

      if (needsReview(indication)) {
        addIssue(`Indication needs review for ${med.drug}`, 'WARNING', {
          id: `indication-needs-review-${med.drug}`,
          title: 'Indication requires review',
          evidence: buildEvidence([
            ['Medication', med.display || med.drug],
            ['Medication class', effectiveClass],
            ['Indication', indication]
          ])
        });
        if (indicationStatus === 'OK') indicationStatus = 'NEEDS_REVIEW';
        indicationMatch = undefined;
        return { ...med, indicationMatch };
      }

      const allowed = appliedSettings.indicationMap[effectiveClass] || [];
      const match = resolveIndicationMatch(indication, effectiveClass, allowed);
      indicationMatch = {
        confidence: match.confidence,
        source: match.source,
        label: match.label,
        entryId: match.entryId
      };
      const confidenceLabel = `${Math.round(match.confidence * 100)}%`;
      if (match.matched) {
        if (match.confidence < 0.75) {
          addIssue(`Indication match confidence low for ${med.drug} (${confidenceLabel})`, 'WARNING', {
            id: `indication-low-confidence-${med.drug}`,
            title: 'Indication confidence threshold',
            evidence: buildEvidence([
              ['Medication', med.display || med.drug],
              ['Medication class', effectiveClass],
              ['Indication', indication],
              ['Matched label', match.label || 'Not available'],
              ['Confidence', confidenceLabel]
            ])
          });
          if (indicationStatus === 'OK') indicationStatus = 'NEEDS_REVIEW';
        }
      } else if (allowed.length > 0) {
        const severity = appliedSettings.indicationMismatchSeverity;
        addIssue(`Indication mismatch for ${med.drug} (${effectiveClass}, ${confidenceLabel})`, severity, {
          id: `indication-mismatch-${med.drug}`,
          title: 'Indication mismatch check',
          evidence: buildEvidence([
            ['Medication', med.display || med.drug],
            ['Medication class', effectiveClass],
            ['Indication', indication],
            ['Allowed indications (sample)', allowed.slice(0, 5).join(', ') || 'None'],
            ['Confidence', confidenceLabel],
            ['Mismatch severity', severity]
          ])
        });
        if (indicationStatus !== 'MISSING') indicationStatus = 'MISMATCH';
      }
      return { ...med, indicationMatch };
    });
  }

  let status = ComplianceStatus.UNKNOWN;
  if (hasMedsParsed) {
    status = ComplianceStatus.COMPLIANT;
    if (hasCritical) status = ComplianceStatus.CRITICAL;
    else if (hasWarning) status = ComplianceStatus.WARNING;
  }

  return {
    ...resident,
    meds: updatedMeds,
    compliance: {
      ...resident.compliance,
      status,
      issues,
      gdrOverdue: false,
      missingCarePlan: issues.some(i => i.toLowerCase().includes("care plan")),
      behaviorNotesCount: resident.behaviors.filter(b => isWithinDays(b.date, now, appliedSettings.behaviorWindowDays)).length,
      carePlanPsychPresent: resident.carePlan.some(item => item.psychRelated),
      indicationStatus,
      consultStatus,
      manualGdrStatus: resident.manualGdr.status,
      explainability
    }
  };
};
