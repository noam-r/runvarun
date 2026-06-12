import type { WorkoutPreset, ActiveWorkout, WorkoutStep } from '../domain/types';
import { isValidPreset } from '../domain/validation';

// --- Timer Events ---

export type TimerEvent =
  | { type: 'workout_started'; step: WorkoutStep; roundIndex: number }
  | { type: 'step_started'; step: WorkoutStep; roundIndex: number; stepIndex: number; skippedSteps: number }
  | { type: 'countdown'; value: 3 | 2 | 1 }
  | { type: 'final_round'; step: WorkoutStep }
  | { type: 'workout_completed' }
  | { type: 'workout_paused' }
  | { type: 'workout_resumed'; step: WorkoutStep };

// --- Engine Functions ---

/** Create a new ActiveWorkout from a valid preset. Returns null if preset is invalid. */
export function startWorkout(preset: WorkoutPreset, now: number): { workout: ActiveWorkout; events: TimerEvent[] } | null {
  if (!isValidPreset(preset)) return null;

  const firstStep = preset.steps[0];
  const workout: ActiveWorkout = {
    id: `run_${now}`,
    presetId: preset.id,
    presetSnapshot: JSON.parse(JSON.stringify(preset)),
    status: 'running',
    roundIndex: 0,
    stepIndex: 0,
    startedAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
    stepStartedAt: now,
    stepEndsAt: now + firstStep.durationSeconds * 1000,
    pausedRemainingMs: null,
  };

  const events: TimerEvent[] = [{ type: 'workout_started', step: firstStep, roundIndex: 0 }];

  // If single-round workout, also emit final_round at start
  if (preset.repeatCount === 1) {
    events.push({ type: 'final_round', step: firstStep });
  }

  return { workout, events };
}

/** Advance the workout based on the current wall-clock time. */
export function tick(workout: ActiveWorkout, now: number): { workout: ActiveWorkout; events: TimerEvent[] } {
  if (workout.status !== 'running') {
    return { workout, events: [] };
  }

  const events: TimerEvent[] = [];
  let current = { ...workout };
  const preset = current.presetSnapshot;
  let skippedSteps = 0;

  // Advance through any elapsed steps
  while (current.stepEndsAt !== null && now >= current.stepEndsAt) {
    const nextPosition = getNextPosition(preset, current.roundIndex, current.stepIndex);

    if (!nextPosition) {
      // Workout complete
      current = {
        ...current,
        status: 'complete',
        updatedAt: new Date(now).toISOString(),
      };
      events.push({ type: 'workout_completed' });
      return { workout: current, events };
    }

    const { roundIndex: nextRound, stepIndex: nextStep } = nextPosition;
    const nextStepData = preset.steps[nextStep];
    const newStepStartedAt = current.stepEndsAt!;
    const newStepEndsAt = newStepStartedAt + nextStepData.durationSeconds * 1000;

    // Check if this next step has also already elapsed
    if (now >= newStepEndsAt) {
      // Step was fully skipped
      skippedSteps++;
      current = {
        ...current,
        roundIndex: nextRound,
        stepIndex: nextStep,
        stepStartedAt: newStepStartedAt,
        stepEndsAt: newStepEndsAt,
        updatedAt: new Date(now).toISOString(),
      };
      continue;
    }

    // Landed on this step
    current = {
      ...current,
      roundIndex: nextRound,
      stepIndex: nextStep,
      stepStartedAt: newStepStartedAt,
      stepEndsAt: newStepEndsAt,
      updatedAt: new Date(now).toISOString(),
    };

    // Emit final round cue if entering the final round's first step
    if (nextRound === preset.repeatCount - 1 && nextStep === 0 && preset.repeatCount > 1) {
      events.push({ type: 'final_round', step: nextStepData });
    }

    events.push({
      type: 'step_started',
      step: nextStepData,
      roundIndex: nextRound,
      stepIndex: nextStep,
      skippedSteps,
    });
    skippedSteps = 0;
    break;
  }

  return { workout: current, events };
}

/** Pause the workout, capturing remaining time. */
export function pause(workout: ActiveWorkout, now: number): { workout: ActiveWorkout; events: TimerEvent[] } {
  if (workout.status !== 'running') return { workout, events: [] };

  const remainingMs = Math.max(0, (workout.stepEndsAt ?? 0) - now);
  const paused: ActiveWorkout = {
    ...workout,
    status: 'paused',
    pausedRemainingMs: remainingMs,
    updatedAt: new Date(now).toISOString(),
  };

  return { workout: paused, events: [{ type: 'workout_paused' }] };
}

/** Resume from paused state. */
export function resume(workout: ActiveWorkout, now: number): { workout: ActiveWorkout; events: TimerEvent[] } {
  if (workout.status !== 'paused' || workout.pausedRemainingMs === null) {
    return { workout, events: [] };
  }

  const currentStep = workout.presetSnapshot.steps[workout.stepIndex];
  const resumed: ActiveWorkout = {
    ...workout,
    status: 'running',
    stepStartedAt: now,
    stepEndsAt: now + workout.pausedRemainingMs,
    pausedRemainingMs: null,
    updatedAt: new Date(now).toISOString(),
  };

  return { workout: resumed, events: [{ type: 'workout_resumed', step: currentStep }] };
}

/** Stop the workout (returns null to indicate cleared state). */
export function stop(): { workout: null; events: TimerEvent[] } {
  return { workout: null, events: [] };
}

/** Get countdown cue events if any are due. Tracks which have been emitted via the cuesEmitted set. */
export function getCountdownEvents(
  workout: ActiveWorkout,
  now: number,
  emittedKeys: Set<string>,
): TimerEvent[] {
  if (workout.status !== 'running' || workout.stepEndsAt === null) return [];

  const remainingMs = workout.stepEndsAt - now;
  const events: TimerEvent[] = [];

  const thresholds: (3 | 2 | 1)[] = [3, 2, 1];
  for (const t of thresholds) {
    if (remainingMs <= t * 1000 && remainingMs > (t - 1) * 1000) {
      const key = `countdown-r${workout.roundIndex}-s${workout.stepIndex}-${t}`;
      if (!emittedKeys.has(key)) {
        emittedKeys.add(key);
        events.push({ type: 'countdown', value: t });
      }
    }
  }

  return events;
}

// --- Helpers ---

function getNextPosition(
  preset: WorkoutPreset,
  roundIndex: number,
  stepIndex: number,
): { roundIndex: number; stepIndex: number } | null {
  // More steps in this round?
  if (stepIndex + 1 < preset.steps.length) {
    return { roundIndex, stepIndex: stepIndex + 1 };
  }
  // More rounds?
  if (roundIndex + 1 < preset.repeatCount) {
    return { roundIndex: roundIndex + 1, stepIndex: 0 };
  }
  // Workout complete
  return null;
}

/** Get remaining milliseconds for display. */
export function getRemainingMs(workout: ActiveWorkout, now: number): number {
  if (workout.status === 'paused') {
    return workout.pausedRemainingMs ?? 0;
  }
  if (workout.status === 'running' && workout.stepEndsAt !== null) {
    return Math.max(0, workout.stepEndsAt - now);
  }
  return 0;
}

/** Reconcile a recovered running workout with current time. */
export function reconcileRecovery(workout: ActiveWorkout, now: number): { workout: ActiveWorkout; events: TimerEvent[] } {
  if (workout.status === 'paused') {
    // Paused workouts don't need time reconciliation
    return { workout, events: [] };
  }
  if (workout.status !== 'running') {
    return { workout, events: [] };
  }
  // Use tick to advance through elapsed time
  return tick(workout, now);
}
