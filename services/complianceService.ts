import { ResidentData, ComplianceStatus, Medication, AppSettings, MedicationClass } from '../types';
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

export const evaluateResidentCompliance = (
  resident: ResidentData,
  referenceDate: Date = new Date(),
  settings?: AppSettings
): ResidentData => {
  const appliedSettings = normalizeSettings(settings);
  const issues: string[] = [];
  const now = referenceDate;

  let hasCritical = false;
  let hasWarning = false;

  const addIssue = (message: string, severity: 'CRITICAL' | 'WARNING') => {
    issues.push(message);
    if (severity === 'CRITICAL') hasCritical = true;
    if (severity === 'WARNING') hasWarning = true;
  };

  const hasMedsParsed = resident.meds.length > 0;
  let indicationStatus: ResidentData['compliance']['indicationStatus'] = 'OK';
  let consultStatus: ResidentData['compliance']['consultStatus'] = 'MISSING';

  if (hasMedsParsed) {
    const psychCarePlanPresent = resident.carePlan.some(item => item.psychRelated);
    if (!psychCarePlanPresent) {
      addIssue("Missing psychotropic care plan", 'CRITICAL');
    }

    const behaviorWindow = appliedSettings.behaviorWindowDays;
    const recentBehaviorNotes = resident.behaviors.filter(b => isWithinDays(b.date, now, behaviorWindow));
    if (recentBehaviorNotes.length < appliedSettings.behaviorThreshold) {
      addIssue(`Behavior monitoring below threshold (${recentBehaviorNotes.length}/${appliedSettings.behaviorThreshold} in ${behaviorWindow} days)`, 'WARNING');
    }

    const consultWindow = appliedSettings.consultRecencyDays;
    const hasRecentConsult = resident.consults.some(c => isWithinDays(c.date, now, consultWindow));
    const hasRecentOrder = resident.psychMdOrders.some(o => isWithinDays(o.date, now, consultWindow));

    if (hasRecentConsult) {
      consultStatus = 'CONSULT';
    } else if (hasRecentOrder) {
      consultStatus = 'ORDER';
      addIssue(`Psychiatry order present but consult not completed (last ${consultWindow} days)`, 'WARNING');
    } else {
      consultStatus = 'MISSING';
      addIssue(`No psychiatry consult or order in last ${consultWindow} days`, 'CRITICAL');
    }

    const manualGdr = resident.manualGdr;
    if (manualGdr.status === 'NOT_SET') {
      addIssue("Manual GDR status not set", 'CRITICAL');
    } else if (manualGdr.status === 'DONE') {
      if (!manualGdr.note || manualGdr.note.trim().length === 0) {
        addIssue("Manual GDR marked done without note", 'CRITICAL');
      }
    } else if (manualGdr.status === 'CONTRAINDICATED') {
      const reasons = manualGdr.contraindications;
      const hasReason = reasons.symptomsReturned || reasons.additionalGdrLikelyToImpair || reasons.riskToSelfOrOthers || reasons.other;
      if (!hasReason) {
        addIssue("Manual GDR contraindicated without documented reasons", 'CRITICAL');
      }
      if (reasons.other && !reasons.otherText?.trim()) {
        addIssue("Manual GDR contraindicated: 'Other' selected without detail", 'CRITICAL');
      }
    }

    resident.meds.forEach(med => {
      const indication = (med.indication || '').trim();
      const effectiveClass = getEffectiveClass(med);
      if (!indication || indication.toLowerCase() === 'unknown') {
        addIssue(`Missing indication for ${med.drug}`, 'CRITICAL');
        indicationStatus = 'MISSING';
        return;
      }

      if (needsReview(indication)) {
        addIssue(`Indication needs review for ${med.drug}`, 'WARNING');
        if (indicationStatus === 'OK') indicationStatus = 'NEEDS_REVIEW';
        return;
      }

      const allowed = appliedSettings.indicationMap[effectiveClass] || [];
      if (allowed.length > 0 && !mapIndicationMatch(indication, allowed)) {
        const severity = appliedSettings.indicationMismatchSeverity;
        addIssue(`Indication mismatch for ${med.drug} (${effectiveClass})`, severity);
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
      manualGdrStatus: resident.manualGdr.status
    }
  };
};
