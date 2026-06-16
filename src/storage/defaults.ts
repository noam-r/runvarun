import type { WorkoutPreset, AppSettings, AppSettingsV2, RunVaRunStorage, RunVaRunStorageV2 } from '../domain/types';

export const DEFAULT_SETTINGS: AppSettings = {
  voiceCuesEnabled: true,
  beepCuesEnabled: true,
  vibrationEnabled: false,
  countdownCue: 'off',
  finalRoundCueEnabled: true,
  completionCueEnabled: true,
  keepScreenAwake: true,
  voiceLanguage: 'system',
  uiLanguage: 'en',
};

export function createStarterPresets(): WorkoutPreset[] {
  const now = new Date().toISOString();
  return [
    {
      id: 'preset_run_walk_beginner',
      name: 'Run / Walk Beginner',
      repeatCount: 5,
      steps: [
        { id: 'step_run_1', label: 'Run', durationSeconds: 60, announcement: 'Run' },
        { id: 'step_walk_1', label: 'Walk', durationSeconds: 30, announcement: 'Walk' },
      ],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'preset_couch_to_run',
      name: 'Couch-to-Run',
      repeatCount: 8,
      steps: [
        { id: 'step_run_2', label: 'Run', durationSeconds: 30, announcement: 'Run' },
        { id: 'step_walk_2', label: 'Walk', durationSeconds: 90, announcement: 'Walk' },
      ],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'preset_intervals',
      name: 'Fast Intervals',
      repeatCount: 10,
      steps: [
        { id: 'step_fast_1', label: 'Fast', durationSeconds: 30, announcement: 'Fast' },
        { id: 'step_easy_1', label: 'Easy', durationSeconds: 60, announcement: 'Easy' },
      ],
      createdAt: now,
      updatedAt: now,
    },
  ];
}

export function createDefaultStorage(): RunVaRunStorage {
  const presets = createStarterPresets();
  return {
    schemaVersion: 1,
    presets,
    lastUsedPresetId: presets[0].id,
    activeWorkout: null,
    settings: DEFAULT_SETTINGS,
  };
}

export const DEFAULT_SETTINGS_V2: AppSettingsV2 = {
  // Preserved from v1
  vibrationEnabled: false,
  keepScreenAwake: true,
  uiLanguage: 'en',

  // Audio runtime (new in v2)
  runtimeMode: 'reliable-audio',
  countdownCue: 'last-3-seconds',
  finalRoundCueEnabled: true,
  completionCueEnabled: true,
  workoutStartCueEnabled: true,
  pacerEnabled: true,

  // Legacy (kept for screen-on-timer mode)
  voiceCuesEnabled: true,
  beepCuesEnabled: true,
  voiceLanguage: 'system',
};

export function createDefaultStorageV2(): RunVaRunStorageV2 {
  const presets = createStarterPresets();
  return {
    schemaVersion: 2,
    presets,
    lastUsedPresetId: presets[0].id,
    settings: DEFAULT_SETTINGS_V2,
    activeAudioWorkout: null,
  };
}
