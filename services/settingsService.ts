import { AppSettings } from '../types';

export const DEFAULT_SETTINGS: AppSettings = {
  consultRecencyDays: 90,
  behaviorThreshold: 8,
  behaviorWindowDays: 56,
  indicationMismatchSeverity: 'WARNING',
  indicationMap: {
    'Antipsychotic': ['Schizophrenia', 'Schizoaffective disorder', 'Bipolar disorder', 'Psychosis', 'Tourette', 'Huntington'],
    'Antidepressant': ['Major depressive disorder', 'Depression', 'Anxiety', 'Panic disorder', 'PTSD', 'OCD'],
    'Anxiolytic': ['Generalized anxiety disorder', 'Anxiety', 'Panic disorder'],
    'Hypnotic/Sedative': ['Insomnia', 'Sleep disorder'],
    'Mood Stabilizer': ['Bipolar disorder', 'Mood disorder'],
    'Cognitive Enhancer': ['Alzheimer disease', 'Dementia', 'Cognitive impairment'],
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
