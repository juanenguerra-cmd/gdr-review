import { ResidentData, ComplianceStatus, Medication, AppSettings, MedicationClass, ComplianceExplainabilityEntry } from '../types';
import { normalizeSettings } from './settingsService';

const isWithinDays = (dateStr: string, now: Date, days: number): boolean => {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return false;
  return now.getTime() - date.getTime() <= days * 24 * 60 * 60 * 1000;
};

const normalizeText = (text: string): string => (text || "").trim().toLowerCase();
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

const tokenize = (text: string): string[] => {
  return normalizeText(text)
    .split(/[^a-z0-9]+/i)
    .map(token => token.trim())
    .filter(token => token.length > 1 && !STOP_WORDS.has(token));
};

const hasFuzzyTokenMatch = (indication: string, allowedEntry: string): boolean => {
  const indicationTokens = tokenize(indication);
  const allowedTokens = tokenize(allowedEntry);
  if (indicationTokens.length === 0 || allowedTokens.length === 0) return false;

  const overlap = allowedTokens.filter(token => indicationTokens.includes(token)).length;
  const minTokenCount = Math.min(indicationTokens.length, allowedTokens.length);
  if (minTokenCount === 1) return overlap === 1;
  return overlap / minTokenCount >= 0.6;
};

const getEffectiveClass = (med: Medication): MedicationClass => med.classOverride || med.class;

const mapIndicationMatch = (indication: string, allowed: string[]): boolean => {
  const normalized = normalizeText(indication);
  if (!normalized || allowed.length === 0) return false;
  return allowed.some(entry => {
    const normalizedEntry = normalizeText(entry);
    if (!normalizedEntry) return false;
    return (
      normalizedEntry.includes(normalized) ||
      normalized.includes(normalizedEntry) ||
      hasFuzzyTokenMatch(normalized, normalizedEntry)
    );
  });
};

const needsReview = (indication: string): boolean => /unknown|review|uncertain|tbd/i.test(indication);

const getMostRecentDate = (dates: string[]): string | null => {
  const sorted = dates
    .map(date => new Date(date))
    .filter(date => !Number.isNaN(date.getTime()))
    .sort((a, b) => b.getTime() - a.getTime());
  return sorted.length > 0 ? sorted[0].toISOString().split('T')[0] : null;
};

export const evaluateResidentCompliance = (
  resident: ResidentData,
  referenceDate: Date = new Date(),
  settings?: AppSettings
): ResidentData => {
  const appliedSettings = normalizeSettings(settings);
  const issues: string[] = [];
  const explainability: ComplianceExplainabilityEntry[] = [];
  const now = referenceDate;

  let hasCritical = false;
  let hasWarning = false;

  const addIssue = (
    ruleId: string,
    message: string,
    severity: 'CRITICAL' | 'WARNING',
    data: ComplianceExplainabilityEntry['data']
  ) => {
    issues.push(message);
    explainability.push({ ruleId, severity, summary: message, data });
    if (severity === 'CRITICAL') hasCritical = true;
    if (severity === 'WARNING') hasWarning = true;
  };

  const hasMedsParsed = resident.meds.length > 0;
  let indicationStatus: ResidentData['compliance']['indicationStatus'] = 'OK';
  let consultStatus: ResidentData['compliance']['consultStatus'] = 'MISSING';

  if (hasMedsParsed) {
    const psychCarePlanPresent = resident.carePlan.some(item => item.psychRelated);
    if (!psychCarePlanPresent) {
      addIssue(
        'care-plan-missing',
        "Missing psychotropic care plan",
        'CRITICAL',
        { psychCarePlanPresent }
      );
    }

    const behaviorWindow = appliedSettings.behaviorWindowDays;
    const recentBehaviorNotes = resident.behaviors.filter(b => isWithinDays(b.date, now, behaviorWindow));
    if (recentBehaviorNotes.length < appliedSettings.behaviorThreshold) {
      addIssue(
        'behavior-monitoring-threshold',
        `Behavior monitoring below threshold (${recentBehaviorNotes.length}/${appliedSettings.behaviorThreshold} in ${behaviorWindow} days)`,
        'WARNING',
        {
          recentBehaviorNotes: recentBehaviorNotes.length,
          threshold: appliedSettings.behaviorThreshold,
          windowDays: behaviorWindow
        }
      );
    }

    const consultWindow = appliedSettings.consultRecencyDays;
    const hasRecentConsult = resident.consults.some(c => isWithinDays(c.date, now, consultWindow));
    const hasRecentOrder = resident.psychMdOrders.some(o => isWithinDays(o.date, now, consultWindow));

    if (hasRecentConsult) {
      consultStatus = 'CONSULT';
    } else if (hasRecentOrder) {
      consultStatus = 'ORDER';
      addIssue(
        'consult-order-without-consult',
        `Psychiatry order present but consult not completed (last ${consultWindow} days)`,
        'WARNING',
        {
          consultWindowDays: consultWindow,
          hasRecentConsult,
          hasRecentOrder,
          mostRecentConsultDate: getMostRecentDate(resident.consults.map(c => c.date)),
          mostRecentOrderDate: getMostRecentDate(resident.psychMdOrders.map(o => o.date))
        }
      );
    } else {
      consultStatus = 'MISSING';
      addIssue(
        'consult-missing',
        `No psychiatry consult or order in last ${consultWindow} days`,
        'CRITICAL',
        {
          consultWindowDays: consultWindow,
          hasRecentConsult,
          hasRecentOrder,
          mostRecentConsultDate: getMostRecentDate(resident.consults.map(c => c.date)),
          mostRecentOrderDate: getMostRecentDate(resident.psychMdOrders.map(o => o.date))
        }
      );
    }

    const manualGdr = resident.manualGdr;
    if (manualGdr.status === 'NOT_SET') {
      addIssue(
        'manual-gdr-not-set',
        "Manual GDR status not set",
        'CRITICAL',
        { status: manualGdr.status }
      );
    } else if (manualGdr.status === 'DONE') {
      if (!manualGdr.note || manualGdr.note.trim().length === 0) {
        addIssue(
          'manual-gdr-missing-note',
          "Manual GDR marked done without note",
          'CRITICAL',
          { status: manualGdr.status, notePresent: false }
        );
      }
    } else if (manualGdr.status === 'CONTRAINDICATED') {
      const reasons = manualGdr.contraindications;
      const hasReason = reasons.symptomsReturned || reasons.additionalGdrLikelyToImpair || reasons.riskToSelfOrOthers || reasons.other;
      if (!hasReason) {
        addIssue(
          'manual-gdr-contraindicated-missing-reason',
          "Manual GDR contraindicated without documented reasons",
          'CRITICAL',
          { status: manualGdr.status, reasons }
        );
      }
      if (reasons.other && !reasons.otherText?.trim()) {
        addIssue(
          'manual-gdr-contraindicated-other-missing-detail',
          "Manual GDR contraindicated: 'Other' selected without detail",
          'CRITICAL',
          { status: manualGdr.status, reasons }
        );
      }
    }

    resident.meds.forEach(med => {
      const indication = (med.indication || '').trim();
      const effectiveClass = getEffectiveClass(med);
      if (!indication || indication.toLowerCase() === 'unknown') {
        addIssue(
          'medication-indication-missing',
          `Missing indication for ${med.drug}`,
          'CRITICAL',
          { medication: med.drug, indication: indication || null }
        );
        indicationStatus = 'MISSING';
        return;
      }

      if (needsReview(indication)) {
        addIssue(
          'medication-indication-needs-review',
          `Indication needs review for ${med.drug}`,
          'WARNING',
          { medication: med.drug, indication }
        );
        if (indicationStatus === 'OK') indicationStatus = 'NEEDS_REVIEW';
        return;
      }

      const allowed = appliedSettings.indicationMap[effectiveClass] || [];
      if (allowed.length > 0 && !mapIndicationMatch(indication, allowed)) {
        const severity = appliedSettings.indicationMismatchSeverity;
        addIssue(
          'medication-indication-mismatch',
          `Indication mismatch for ${med.drug} (${effectiveClass})`,
          severity,
          {
            medication: med.drug,
            indication,
            effectiveClass,
            allowedIndications: allowed,
            mismatchSeverity: severity
          }
        );
        if (indicationStatus !== 'MISSING') indicationStatus = 'MISMATCH';
      }
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
