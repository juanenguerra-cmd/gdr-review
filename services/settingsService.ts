import { AppSettings } from '../types';

export const DEFAULT_SETTINGS: AppSettings = {
  consultRecencyDays: 90,
  behaviorThreshold: 8,
  behaviorWindowDays: 56,
  indicationMismatchSeverity: 'WARNING',
  indicationMap: {
    'ADHD/ANTI-NARCOLEPSY/ANTI-OBESITY/ANOREXIANTS': [
      'ADHD',
      'Narcolepsy/excessive daytime sleepiness',
      'Appetite suppression/weight loss'
    ],
    'ANTIANXIETY AGENTS': [
      'Anxiety (generalized/situational)',
      'Panic attacks',
      'Acute agitation/anxiety episodes',
      'Alcohol withdrawal (short-term/protocol)'
    ],
    'ANTIDEPRESSANTS': [
      'Depression',
      'Anxiety disorders',
      'Neuropathic/chronic pain (some agents)',
      'Insomnia/sleep (some agents)',
      'OCD/PTSD (some agents)',
      'Appetite/weight issues (some agents)'
    ],
    'ANTIPSYCHOTICS/ANTIMANIC AGENTS': [
      'Schizophrenia/psychotic disorders',
      'Bipolar disorder/mania',
      'Hallucinations/delusions/paranoia',
      'Severe agitation/aggression related to qualifying psych condition',
      'Adjunct mood stabilization (agent-dependent)'
    ],
    'HYPNOTICS/SEDATIVES/SLEEP DISORDER AGENTS': [
      'Insomnia (sleep onset or maintenance)',
      'Sleep disturbance',
      'Circadian rhythm/sleep-wake disorders',
      'Short-term sedation (situational)'
    ],
    'PSYCHOTHERAPEUTIC AND NEUROLOGICAL AGENTS - MISC.': [
      'Seizures',
      'Mood stabilization/behavior control (agent-dependent)',
      'Neuropathic pain',
      'Migraine prevention',
      'Movement/tremor disorders',
      'Other CNS indications per formulary'
    ],
    'Other': []
  },
  customMedicationMap: {}
};

export const normalizeSettings = (settings?: Partial<AppSettings>): AppSettings => {
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    indicationMap: {
      ...DEFAULT_SETTINGS.indicationMap,
      ...(settings?.indicationMap || {})
    },
    customMedicationMap: {
      ...DEFAULT_SETTINGS.customMedicationMap,
      ...(settings?.customMedicationMap || {})
    }
  };
};
