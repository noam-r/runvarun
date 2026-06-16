/** A single timed segment within a workout preset. */
export type WorkoutStep = {
  id: string;
  label: string;
  durationSeconds: number;
  announcement?: string;
  /** Explicit cue key override. When absent, derived via normalizeCueKey(label). */
  cueKey?: string;
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

// ─── Schema V2 (Continuous Audio Runtime) ────────────────────────────────────

/** User preferences for schema v2, including audio runtime settings. */
export type AppSettingsV2 = {
  // Existing (preserved from v1)
  vibrationEnabled: boolean;
  keepScreenAwake: boolean;
  uiLanguage: 'en' | 'he';

  // Audio runtime (new in v2)
  runtimeMode: 'reliable-audio' | 'screen-on-timer';
  countdownCue: 'off' | 'last-3-seconds';
  finalRoundCueEnabled: boolean;
  completionCueEnabled: boolean;
  workoutStartCueEnabled: boolean;
  pacerEnabled: boolean;

  // Legacy (kept for screen-on-timer mode)
  voiceCuesEnabled: boolean;
  beepCuesEnabled: boolean;
  voiceLanguage: 'system' | 'en' | 'he';
};

/** Root storage envelope persisted under runvarun:v2. */
export type RunVaRunStorageV2 = {
  schemaVersion: 2;
  presets: WorkoutPreset[];
  lastUsedPresetId: string | null;
  settings: AppSettingsV2;
  activeAudioWorkout: AudioWorkoutRuntimeState | null;
};

/** Persisted state of an audio-driven workout session (for recovery on reload). */
export type AudioWorkoutRuntimeState = {
  mode: 'reliable-audio';
  presetId: string;
  presetSnapshot: WorkoutPreset;
  status: 'preparing' | 'ready' | 'playing' | 'paused' | 'stopped' | 'complete' | 'interrupted';
  lastKnownAudioTimeSeconds: number;
  startedAt: number;
  updatedAt: number;
};

/** The complete timeline derived from a workout preset. */
export type WorkoutTimeline = {
  segments: WorkoutTimelineSegment[];
  totalDurationSeconds: number;
};

/** A single segment in a workout timeline (re-exported for domain-level use). */
export type WorkoutTimelineSegment = {
  id: string;
  roundIndex: number;
  stepIndex: number;
  stepLabel: string;
  startsAtSeconds: number;
  endsAtSeconds: number;
  durationSeconds: number;
};
