import { describe, it, expect } from 'vitest';
import { startWorkout, tick, pause, resume, getCountdownEvents, getRemainingMs, reconcileRecovery } from './timerEngine';
import type { WorkoutPreset } from '../domain/types';

function makePreset(overrides?: Partial<WorkoutPreset>): WorkoutPreset {
  return {
    id: 'test_preset',
    name: 'Test',
    repeatCount: 2,
    steps: [
      { id: 's1', label: 'Run', durationSeconds: 60 },
      { id: 's2', label: 'Walk', durationSeconds: 30 },
    ],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('startWorkout', () => {
  it('creates a running workout from a valid preset', () => {
    const preset = makePreset();
    const now = 1000000;
    const result = startWorkout(preset, now);
    expect(result).not.toBeNull();
    expect(result!.workout.status).toBe('running');
    expect(result!.workout.roundIndex).toBe(0);
    expect(result!.workout.stepIndex).toBe(0);
    expect(result!.workout.stepStartedAt).toBe(now);
    expect(result!.workout.stepEndsAt).toBe(now + 60000);
    expect(result!.workout.pausedRemainingMs).toBeNull();
    expect(result!.events.length).toBeGreaterThan(0);
    expect(result!.events[0].type).toBe('workout_started');
  });

  it('returns null for invalid preset', () => {
    const invalid: WorkoutPreset = { id: '', name: '', repeatCount: 0, steps: [], createdAt: '', updatedAt: '' };
    expect(startWorkout(invalid, 1000)).toBeNull();
  });

  it('emits final_round event when repeatCount is 1', () => {
    const preset = makePreset({ repeatCount: 1 });
    const result = startWorkout(preset, 1000);
    expect(result!.events.some(e => e.type === 'final_round')).toBe(true);
  });
});

describe('tick', () => {
  it('does not advance when step is still active', () => {
    const preset = makePreset();
    const start = startWorkout(preset, 0)!;
    const { workout, events } = tick(start.workout, 30000); // 30s into 60s step
    expect(workout.stepIndex).toBe(0);
    expect(workout.roundIndex).toBe(0);
    expect(events).toHaveLength(0);
  });

  it('advances to next step when current step ends', () => {
    const preset = makePreset();
    const start = startWorkout(preset, 0)!;
    const { workout, events } = tick(start.workout, 60000); // exactly at 60s
    expect(workout.stepIndex).toBe(1);
    expect(workout.roundIndex).toBe(0);
    expect(events.some(e => e.type === 'step_started')).toBe(true);
  });

  it('preserves schedule: next step starts from previous end time', () => {
    const preset = makePreset();
    const start = startWorkout(preset, 0)!;
    // Tick fires 300ms late
    const { workout } = tick(start.workout, 60300);
    expect(workout.stepStartedAt).toBe(60000); // Not 60300
    expect(workout.stepEndsAt).toBe(90000); // 60000 + 30000
  });

  it('advances from final step to next round', () => {
    const preset = makePreset();
    const start = startWorkout(preset, 0)!;
    // End of step 1 (Walk at 90s)
    const after1 = tick(start.workout, 60000);
    const { workout } = tick(after1.workout, 90000);
    expect(workout.roundIndex).toBe(1);
    expect(workout.stepIndex).toBe(0);
  });

  it('completes workout after final step of final round', () => {
    const preset = makePreset({ repeatCount: 1 });
    const start = startWorkout(preset, 0)!;
    const after1 = tick(start.workout, 60000);
    const { workout, events } = tick(after1.workout, 90000);
    expect(workout.status).toBe('complete');
    expect(events.some(e => e.type === 'workout_completed')).toBe(true);
  });

  it('handles missed steps (catch-up)', () => {
    const preset = makePreset({ repeatCount: 1 });
    const start = startWorkout(preset, 0)!;
    // Skip past both steps entirely (90s total for 1 round)
    const { workout, events } = tick(start.workout, 100000);
    expect(workout.status).toBe('complete');
    expect(events.some(e => e.type === 'workout_completed')).toBe(true);
  });

  it('does not advance when paused', () => {
    const preset = makePreset();
    const start = startWorkout(preset, 0)!;
    const { workout: paused } = pause(start.workout, 30000);
    const { workout, events } = tick(paused, 90000);
    expect(workout.status).toBe('paused');
    expect(workout.stepIndex).toBe(0);
    expect(events).toHaveLength(0);
  });

  it('emits final_round event when entering last round', () => {
    const preset = makePreset({ repeatCount: 2 });
    const start = startWorkout(preset, 0)!;
    // Advance through round 0: step 0 ends at 60s, step 1 ends at 90s
    const after0 = tick(start.workout, 60000);
    const { events } = tick(after0.workout, 90000);
    expect(events.some(e => e.type === 'final_round')).toBe(true);
  });
});

describe('pause', () => {
  it('captures remaining time', () => {
    const preset = makePreset();
    const start = startWorkout(preset, 0)!;
    const { workout } = pause(start.workout, 25000);
    expect(workout.status).toBe('paused');
    expect(workout.pausedRemainingMs).toBe(35000); // 60000 - 25000
  });

  it('does nothing if already paused', () => {
    const preset = makePreset();
    const start = startWorkout(preset, 0)!;
    const { workout: paused } = pause(start.workout, 25000);
    const { workout } = pause(paused, 30000);
    expect(workout.pausedRemainingMs).toBe(35000); // Unchanged
  });
});

describe('resume', () => {
  it('resumes from paused remaining time', () => {
    const preset = makePreset();
    const start = startWorkout(preset, 0)!;
    const { workout: paused } = pause(start.workout, 25000);
    const { workout } = resume(paused, 50000);
    expect(workout.status).toBe('running');
    expect(workout.stepStartedAt).toBe(50000);
    expect(workout.stepEndsAt).toBe(50000 + 35000); // 50000 + remaining
    expect(workout.pausedRemainingMs).toBeNull();
  });
});

describe('single-step workout', () => {
  it('completes after one step one round', () => {
    const preset = makePreset({
      repeatCount: 1,
      steps: [{ id: 's1', label: 'Run', durationSeconds: 10 }],
    });
    const start = startWorkout(preset, 0)!;
    const { workout } = tick(start.workout, 10000);
    expect(workout.status).toBe('complete');
  });
});

describe('getCountdownEvents', () => {
  it('fires countdown cue at 3 seconds remaining', () => {
    const preset = makePreset();
    const start = startWorkout(preset, 0)!;
    const emitted = new Set<string>();
    const events = getCountdownEvents(start.workout, 57000, emitted); // 3s remaining
    expect(events.some(e => e.type === 'countdown' && e.value === 3)).toBe(true);
  });

  it('does not duplicate countdown cues', () => {
    const preset = makePreset();
    const start = startWorkout(preset, 0)!;
    const emitted = new Set<string>();
    getCountdownEvents(start.workout, 57500, emitted);
    const events2 = getCountdownEvents(start.workout, 57800, emitted);
    expect(events2).toHaveLength(0);
  });
});

describe('getRemainingMs', () => {
  it('returns remaining ms for running workout', () => {
    const preset = makePreset();
    const start = startWorkout(preset, 0)!;
    expect(getRemainingMs(start.workout, 25000)).toBe(35000);
  });

  it('returns pausedRemainingMs for paused workout', () => {
    const preset = makePreset();
    const start = startWorkout(preset, 0)!;
    const { workout: paused } = pause(start.workout, 25000);
    expect(getRemainingMs(paused, 99999)).toBe(35000);
  });
});

describe('reconcileRecovery', () => {
  it('advances a running workout that has elapsed', () => {
    const preset = makePreset({ repeatCount: 1 });
    const start = startWorkout(preset, 0)!;
    // App was closed for 100 seconds — workout should be complete
    const { workout } = reconcileRecovery(start.workout, 100000);
    expect(workout.status).toBe('complete');
  });

  it('does not change a paused workout', () => {
    const preset = makePreset();
    const start = startWorkout(preset, 0)!;
    const { workout: paused } = pause(start.workout, 25000);
    const { workout } = reconcileRecovery(paused, 100000);
    expect(workout.status).toBe('paused');
    expect(workout.pausedRemainingMs).toBe(35000);
  });
});
