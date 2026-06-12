/** A single timed segment within a workout preset. */
export type WorkoutStep = {
  id: string;
  label: string;
  durationSeconds: number;
  announcement?: string;
};

/** A reusable user-defined workout template. */
export type WorkoutPreset = {
  id: string;
  name: string;
  repeatCount: number;
  steps: WorkoutStep[];
  createdAt: string;
  updatedAt: string;
};

/** A currently running or paused workout instance. */
export type ActiveWorkout = {
  id: string;
  presetId: string;
  presetSnapshot: WorkoutPreset;
  status: 'running' | 'paused' | 'complete';
  roundIndex: number;
  stepIndex: number;
  startedAt: string;
  updatedAt: string;
  stepStartedAt: number | null;
  stepEndsAt: number | null;
  pausedRemainingMs: number | null;
};

/** User preferences that affect workout execution and cue behavior. */
export type AppSettings = {
  voiceCuesEnabled: boolean;
  beepCuesEnabled: boolean;
  vibrationEnabled: boolean;
  countdownCue: 'off' | 'last3seconds';
  finalRoundCueEnabled: boolean;
  completionCueEnabled: boolean;
  keepScreenAwake: boolean;
  voiceLanguage: 'system' | 'en' | 'he';
  uiLanguage: 'en' | 'he';
};

/** Root storage envelope persisted under runvarun:v1. */
export type RunVaRunStorage = {
  schemaVersion: number;
  presets: WorkoutPreset[];
  lastUsedPresetId: string | null;
  activeWorkout: ActiveWorkout | null;
  settings: AppSettings;
};
