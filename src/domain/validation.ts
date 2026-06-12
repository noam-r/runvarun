import type { WorkoutPreset, WorkoutStep, ActiveWorkout, AppSettings } from './types';

export function isValidStep(step: unknown): step is WorkoutStep {
  if (!step || typeof step !== 'object') return false;
  const s = step as Record<string, unknown>;
  return (
    typeof s.id === 'string' &&
    s.id.length > 0 &&
    typeof s.label === 'string' &&
    s.label.trim().length > 0 &&
    typeof s.durationSeconds === 'number' &&
    Number.isInteger(s.durationSeconds) &&
    s.durationSeconds >= 1 &&
    (s.announcement === undefined || s.announcement === null || typeof s.announcement === 'string')
  );
}

export function isValidPreset(preset: unknown): preset is WorkoutPreset {
  if (!preset || typeof preset !== 'object') return false;
  const p = preset as Record<string, unknown>;
  return (
    typeof p.id === 'string' &&
    p.id.length > 0 &&
    typeof p.name === 'string' &&
    p.name.trim().length > 0 &&
    typeof p.repeatCount === 'number' &&
    Number.isInteger(p.repeatCount) &&
    p.repeatCount >= 1 &&
    Array.isArray(p.steps) &&
    p.steps.length >= 1 &&
    p.steps.every(isValidStep) &&
    typeof p.createdAt === 'string' &&
    typeof p.updatedAt === 'string'
  );
}

export function isValidActiveWorkout(workout: unknown): workout is ActiveWorkout {
  if (!workout || typeof workout !== 'object') return false;
  const w = workout as Record<string, unknown>;

  if (typeof w.id !== 'string') return false;
  if (!['running', 'paused', 'complete'].includes(w.status as string)) return false;
  if (!isValidPreset(w.presetSnapshot)) return false;

  const preset = w.presetSnapshot as WorkoutPreset;
  const roundIndex = w.roundIndex as number;
  const stepIndex = w.stepIndex as number;

  if (
    typeof roundIndex !== 'number' ||
    !Number.isInteger(roundIndex) ||
    roundIndex < 0 ||
    roundIndex >= preset.repeatCount
  )
    return false;

  if (
    typeof stepIndex !== 'number' ||
    !Number.isInteger(stepIndex) ||
    stepIndex < 0 ||
    stepIndex >= preset.steps.length
  )
    return false;

  if (w.status === 'running') {
    if (typeof w.stepStartedAt !== 'number') return false;
    if (typeof w.stepEndsAt !== 'number') return false;
  }

  if (w.status === 'paused') {
    if (typeof w.pausedRemainingMs !== 'number' || (w.pausedRemainingMs as number) <= 0)
      return false;
  }

  return true;
}

export function isValidSettings(settings: unknown): settings is AppSettings {
  if (!settings || typeof settings !== 'object') return false;
  const s = settings as Record<string, unknown>;
  return (
    typeof s.voiceCuesEnabled === 'boolean' &&
    typeof s.beepCuesEnabled === 'boolean' &&
    typeof s.vibrationEnabled === 'boolean' &&
    (s.countdownCue === 'off' || s.countdownCue === 'last3seconds') &&
    typeof s.finalRoundCueEnabled === 'boolean' &&
    typeof s.completionCueEnabled === 'boolean' &&
    typeof s.keepScreenAwake === 'boolean' &&
    (s.voiceLanguage === 'system' || s.voiceLanguage === 'en' || s.voiceLanguage === 'he') &&
    (s.uiLanguage === 'en' || s.uiLanguage === 'he')
  );
}

/** Returns human-readable validation errors for a preset being edited. */
export function getPresetErrors(preset: Partial<WorkoutPreset>): string[] {
  const errors: string[] = [];
  if (!preset.name || preset.name.trim().length === 0) {
    errors.push('Workout name is required.');
  }
  if (!preset.repeatCount || preset.repeatCount < 1) {
    errors.push('Repeat count must be at least 1.');
  }
  if (!preset.steps || preset.steps.length === 0) {
    errors.push('Add at least one step.');
  } else {
    for (let i = 0; i < preset.steps.length; i++) {
      const step = preset.steps[i];
      if (!step.label || step.label.trim().length === 0) {
        errors.push(`Step ${i + 1} needs a label.`);
      }
      if (!step.durationSeconds || step.durationSeconds < 1) {
        errors.push(`Step ${i + 1} duration must be at least 1 second.`);
      }
    }
  }
  return errors;
}
