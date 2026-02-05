import { ResidentData, ComplianceStatus, Medication, AppSettings, MedicationClass } from '../types';
import { normalizeSettings } from './settingsService';
import { normalizeText, resolveIndicationMatch } from './clinicalIndicationService';

const isWithinDays = (dateStr: string, now: Date, days: number): boolean => {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return false;
  return now.getTime() - date.getTime() <= days * 24 * 60 * 60 * 1000;
};

const getEffectiveClass = (med: Medication): MedicationClass => med.classOverride || med.class;

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
  let updatedMeds = resident.meds;

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

    updatedMeds = resident.meds.map(med => {
      const indication = (med.indication || '').trim();
      const effectiveClass = getEffectiveClass(med);
      let indicationMatch = med.indicationMatch;
      if (!indication || indication.toLowerCase() === 'unknown') {
        addIssue(`Missing indication for ${med.drug}`, 'CRITICAL');
        indicationStatus = 'MISSING';
        indicationMatch = undefined;
        return { ...med, indicationMatch };
      }

      if (needsReview(indication)) {
        addIssue(`Indication needs review for ${med.drug}`, 'WARNING');
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
          addIssue(`Indication match confidence low for ${med.drug} (${confidenceLabel})`, 'WARNING');
          if (indicationStatus === 'OK') indicationStatus = 'NEEDS_REVIEW';
        }
      } else if (allowed.length > 0) {
        const severity = appliedSettings.indicationMismatchSeverity;
        addIssue(`Indication mismatch for ${med.drug} (${effectiveClass}, ${confidenceLabel})`, severity);
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
      manualGdrStatus: resident.manualGdr.status
    }
  };
};
