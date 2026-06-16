import { describe, it, expect } from 'vitest';
import { planCueEvents } from '../cueEventPlanner';
import type { CueSettings, WorkoutTimeline } from '../types';

// ─── Test Helpers ────────────────────────────────────────────────────────────

function makeTimeline(
  segmentDefs: Array<{
    roundIndex: number;
    stepIndex: number;
    stepLabel: string;
    durationSeconds: number;
  }>,
): WorkoutTimeline {
  let runningTime = 0;
  const segments = segmentDefs.map((def) => {
    const startsAtSeconds = runningTime;
    const endsAtSeconds = startsAtSeconds + def.durationSeconds;
    runningTime = endsAtSeconds;
    return {
      id: `seg_r${def.roundIndex}_s${def.stepIndex}`,
      roundIndex: def.roundIndex,
      stepIndex: def.stepIndex,
      stepLabel: def.stepLabel,
      startsAtSeconds,
      endsAtSeconds,
      durationSeconds: def.durationSeconds,
    };
  });

  return {
    segments,
    totalDurationSeconds: runningTime,
  };
}

const allEnabled: CueSettings = {
  workoutStartEnabled: true,
  countdownEnabled: true,
  finalRoundEnabled: true,
  completionEnabled: true,
};

const allDisabled: CueSettings = {
  workoutStartEnabled: false,
  countdownEnabled: false,
  finalRoundEnabled: false,
  completionEnabled: false,
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('planCueEvents', () => {
  describe('step-start cues', () => {
    it('places a step-start cue at every segment startsAtSeconds', () => {
      const timeline = makeTimeline([
        { roundIndex: 0, stepIndex: 0, stepLabel: 'Run', durationSeconds: 30 },
        { roundIndex: 0, stepIndex: 1, stepLabel: 'Walk', durationSeconds: 20 },
        { roundIndex: 1, stepIndex: 0, stepLabel: 'Run', durationSeconds: 30 },
        { roundIndex: 1, stepIndex: 1, stepLabel: 'Walk', durationSeconds: 20 },
      ]);

      const events = planCueEvents(timeline, allDisabled);
      const stepStarts = events.filter((e) => e.type === 'step-start');

      expect(stepStarts).toHaveLength(4);
      expect(stepStarts[0].atSeconds).toBe(0);
      expect(stepStarts[1].atSeconds).toBe(30);
      expect(stepStarts[2].atSeconds).toBe(50);
      expect(stepStarts[3].atSeconds).toBe(80);
    });

    it('uses normalizeCueKey for step-start cue keys', () => {
      const timeline = makeTimeline([
        { roundIndex: 0, stepIndex: 0, stepLabel: 'Fast Run', durationSeconds: 10 },
      ]);

      const events = planCueEvents(timeline, allDisabled);
      expect(events[0].cueKey).toBe('step-label:fast run');
    });

    it('step-start cues are never displaced from their position', () => {
      const timeline = makeTimeline([
        { roundIndex: 0, stepIndex: 0, stepLabel: 'Run', durationSeconds: 30 },
        { roundIndex: 0, stepIndex: 1, stepLabel: 'Walk', durationSeconds: 20 },
      ]);

      const events = planCueEvents(timeline, allEnabled);
      const stepStarts = events.filter((e) => e.type === 'step-start');

      // Step-start at 0 should still be at 0
      expect(stepStarts[0].atSeconds).toBe(0);
      // Step-start at 30 should still be at 30
      expect(stepStarts[1].atSeconds).toBe(30);
    });
  });

  describe('workout-start cue', () => {
    it('places workout-start at time 0 when enabled', () => {
      const timeline = makeTimeline([
        { roundIndex: 0, stepIndex: 0, stepLabel: 'Run', durationSeconds: 30 },
      ]);

      const events = planCueEvents(timeline, {
        ...allDisabled,
        workoutStartEnabled: true,
      });

      const workoutStart = events.find((e) => e.type === 'workout-start');
      expect(workoutStart).toBeDefined();
      // It may be offset due to collision with step-start at 0, but should be near 0
      expect(workoutStart!.atSeconds).toBeGreaterThanOrEqual(0);
      expect(workoutStart!.atSeconds).toBeLessThan(0.5);
      expect(workoutStart!.cueKey).toBe('system:start');
    });

    it('does not place workout-start when disabled', () => {
      const timeline = makeTimeline([
        { roundIndex: 0, stepIndex: 0, stepLabel: 'Run', durationSeconds: 30 },
      ]);

      const events = planCueEvents(timeline, {
        ...allDisabled,
        workoutStartEnabled: false,
      });

      const workoutStart = events.find((e) => e.type === 'workout-start');
      expect(workoutStart).toBeUndefined();
    });
  });

  describe('countdown cues', () => {
    it('places countdown cues at -3, -2, -1s before transitions when enabled', () => {
      const timeline = makeTimeline([
        { roundIndex: 0, stepIndex: 0, stepLabel: 'Run', durationSeconds: 30 },
        { roundIndex: 0, stepIndex: 1, stepLabel: 'Walk', durationSeconds: 20 },
      ]);

      const events = planCueEvents(timeline, {
        ...allDisabled,
        countdownEnabled: true,
      });

      const countdowns = events.filter((e) => e.type === 'countdown');
      // Countdown before the second segment (at t=30): placed at 27, 28, 29
      expect(countdowns).toHaveLength(3);
      expect(countdowns[0].atSeconds).toBe(27);
      expect(countdowns[1].atSeconds).toBe(28);
      expect(countdowns[2].atSeconds).toBe(29);
    });

    it('does not place countdown before the first segment (t=0)', () => {
      const timeline = makeTimeline([
        { roundIndex: 0, stepIndex: 0, stepLabel: 'Run', durationSeconds: 30 },
        { roundIndex: 0, stepIndex: 1, stepLabel: 'Walk', durationSeconds: 20 },
      ]);

      const events = planCueEvents(timeline, {
        ...allDisabled,
        countdownEnabled: true,
      });

      const countdowns = events.filter((e) => e.type === 'countdown');
      // No countdown at negative timestamps
      for (const cd of countdowns) {
        expect(cd.atSeconds).toBeGreaterThanOrEqual(0);
      }
    });

    it('omits countdown cues that collide with step-start cues', () => {
      // Step of 3 seconds — countdown-3 would be at the previous step-start
      const timeline = makeTimeline([
        { roundIndex: 0, stepIndex: 0, stepLabel: 'Run', durationSeconds: 3 },
        { roundIndex: 0, stepIndex: 1, stepLabel: 'Walk', durationSeconds: 10 },
      ]);

      const events = planCueEvents(timeline, {
        ...allDisabled,
        countdownEnabled: true,
      });

      const countdowns = events.filter((e) => e.type === 'countdown');
      // Countdown before segment at t=3: would be at 0, 1, 2
      // t=0 collides with step-start → omitted
      const countdownTimes = countdowns.map((e) => e.atSeconds);
      expect(countdownTimes).not.toContain(0);
      expect(countdownTimes).toContain(1);
      expect(countdownTimes).toContain(2);
    });

    it('does not place countdown cues when disabled', () => {
      const timeline = makeTimeline([
        { roundIndex: 0, stepIndex: 0, stepLabel: 'Run', durationSeconds: 30 },
        { roundIndex: 0, stepIndex: 1, stepLabel: 'Walk', durationSeconds: 20 },
      ]);

      const events = planCueEvents(timeline, {
        ...allDisabled,
        countdownEnabled: false,
      });

      const countdowns = events.filter((e) => e.type === 'countdown');
      expect(countdowns).toHaveLength(0);
    });
  });

  describe('final-round cue', () => {
    it('places final-round cue at the start of the last round', () => {
      const timeline = makeTimeline([
        { roundIndex: 0, stepIndex: 0, stepLabel: 'Run', durationSeconds: 30 },
        { roundIndex: 0, stepIndex: 1, stepLabel: 'Walk', durationSeconds: 20 },
        { roundIndex: 1, stepIndex: 0, stepLabel: 'Run', durationSeconds: 30 },
        { roundIndex: 1, stepIndex: 1, stepLabel: 'Walk', durationSeconds: 20 },
      ]);

      const events = planCueEvents(timeline, {
        ...allDisabled,
        finalRoundEnabled: true,
      });

      const finalRound = events.find((e) => e.type === 'final-round');
      expect(finalRound).toBeDefined();
      expect(finalRound!.cueKey).toBe('system:last-round');
      // The last round starts at t=50 (30+20). The final-round cue should be
      // at t=50 (same as step-start of last round's first step)
      // After collision resolution, it will be offset from step-start
      expect(finalRound!.roundIndex).toBe(1);
    });

    it('does not place final-round when there is only one round', () => {
      const timeline = makeTimeline([
        { roundIndex: 0, stepIndex: 0, stepLabel: 'Run', durationSeconds: 30 },
        { roundIndex: 0, stepIndex: 1, stepLabel: 'Walk', durationSeconds: 20 },
      ]);

      const events = planCueEvents(timeline, {
        ...allDisabled,
        finalRoundEnabled: true,
      });

      const finalRound = events.find((e) => e.type === 'final-round');
      expect(finalRound).toBeUndefined();
    });

    it('does not place final-round when disabled', () => {
      const timeline = makeTimeline([
        { roundIndex: 0, stepIndex: 0, stepLabel: 'Run', durationSeconds: 30 },
        { roundIndex: 1, stepIndex: 0, stepLabel: 'Run', durationSeconds: 30 },
      ]);

      const events = planCueEvents(timeline, {
        ...allDisabled,
        finalRoundEnabled: false,
      });

      const finalRound = events.find((e) => e.type === 'final-round');
      expect(finalRound).toBeUndefined();
    });
  });

  describe('workout-complete cue', () => {
    it('places workout-complete at totalDurationSeconds', () => {
      const timeline = makeTimeline([
        { roundIndex: 0, stepIndex: 0, stepLabel: 'Run', durationSeconds: 30 },
        { roundIndex: 0, stepIndex: 1, stepLabel: 'Walk', durationSeconds: 20 },
      ]);

      const events = planCueEvents(timeline, {
        ...allDisabled,
        completionEnabled: true,
      });

      const complete = events.find((e) => e.type === 'workout-complete');
      expect(complete).toBeDefined();
      expect(complete!.atSeconds).toBe(50);
      expect(complete!.cueKey).toBe('system:complete');
      expect(complete!.priority).toBe(1);
    });

    it('does not place workout-complete when disabled', () => {
      const timeline = makeTimeline([
        { roundIndex: 0, stepIndex: 0, stepLabel: 'Run', durationSeconds: 30 },
      ]);

      const events = planCueEvents(timeline, {
        ...allDisabled,
        completionEnabled: false,
      });

      const complete = events.find((e) => e.type === 'workout-complete');
      expect(complete).toBeUndefined();
    });
  });

  describe('collision resolution', () => {
    it('sequences cues at the same timestamp by priority with gaps', () => {
      // workout-start and step-start both at t=0
      const timeline = makeTimeline([
        { roundIndex: 0, stepIndex: 0, stepLabel: 'Run', durationSeconds: 30 },
      ]);

      const events = planCueEvents(timeline, {
        ...allDisabled,
        workoutStartEnabled: true,
      });

      const stepStart = events.find((e) => e.type === 'step-start');
      const workoutStart = events.find((e) => e.type === 'workout-start');

      expect(stepStart).toBeDefined();
      expect(workoutStart).toBeDefined();

      // Step-start stays at its exact position
      expect(stepStart!.atSeconds).toBe(0);
      // Workout-start is offset (has lower priority, higher number)
      expect(workoutStart!.atSeconds).toBeGreaterThan(0);
      // Gap should be 150ms
      expect(workoutStart!.atSeconds).toBeCloseTo(0.15, 2);
    });

    it('final-round cue gets offset when sharing timestamp with step-start', () => {
      const timeline = makeTimeline([
        { roundIndex: 0, stepIndex: 0, stepLabel: 'Run', durationSeconds: 30 },
        { roundIndex: 1, stepIndex: 0, stepLabel: 'Run', durationSeconds: 30 },
      ]);

      const events = planCueEvents(timeline, {
        ...allDisabled,
        finalRoundEnabled: true,
      });

      const stepStartAtLastRound = events.find(
        (e) => e.type === 'step-start' && e.roundIndex === 1,
      );
      const finalRound = events.find((e) => e.type === 'final-round');

      expect(stepStartAtLastRound).toBeDefined();
      expect(finalRound).toBeDefined();

      // Step-start at 30 stays put
      expect(stepStartAtLastRound!.atSeconds).toBe(30);
      // Final-round is higher priority than step-start (2 < 3)
      // but step-start is never displaced. Final-round is offset.
      expect(finalRound!.atSeconds).toBeCloseTo(30.15, 2);
    });
  });

  describe('output ordering', () => {
    it('returns events sorted by atSeconds', () => {
      const timeline = makeTimeline([
        { roundIndex: 0, stepIndex: 0, stepLabel: 'Run', durationSeconds: 30 },
        { roundIndex: 0, stepIndex: 1, stepLabel: 'Walk', durationSeconds: 20 },
        { roundIndex: 1, stepIndex: 0, stepLabel: 'Run', durationSeconds: 30 },
        { roundIndex: 1, stepIndex: 1, stepLabel: 'Walk', durationSeconds: 20 },
      ]);

      const events = planCueEvents(timeline, allEnabled);

      for (let i = 1; i < events.length; i++) {
        expect(events[i].atSeconds).toBeGreaterThanOrEqual(events[i - 1].atSeconds);
      }
    });
  });

  describe('empty timeline', () => {
    it('returns empty array for empty timeline', () => {
      const timeline: WorkoutTimeline = { segments: [], totalDurationSeconds: 0 };
      const events = planCueEvents(timeline, allEnabled);
      expect(events).toEqual([]);
    });
  });

  describe('priority values', () => {
    it('assigns correct priority values to each cue type', () => {
      const timeline = makeTimeline([
        { roundIndex: 0, stepIndex: 0, stepLabel: 'Run', durationSeconds: 30 },
        { roundIndex: 0, stepIndex: 1, stepLabel: 'Walk', durationSeconds: 20 },
        { roundIndex: 1, stepIndex: 0, stepLabel: 'Run', durationSeconds: 30 },
        { roundIndex: 1, stepIndex: 1, stepLabel: 'Walk', durationSeconds: 20 },
      ]);

      const events = planCueEvents(timeline, allEnabled);

      const workoutComplete = events.find((e) => e.type === 'workout-complete');
      const finalRound = events.find((e) => e.type === 'final-round');
      const stepStart = events.find((e) => e.type === 'step-start');
      const workoutStart = events.find((e) => e.type === 'workout-start');
      const countdown = events.find((e) => e.type === 'countdown');

      expect(workoutComplete!.priority).toBe(1);
      expect(finalRound!.priority).toBe(2);
      expect(stepStart!.priority).toBe(3);
      expect(workoutStart!.priority).toBe(4);
      expect(countdown!.priority).toBe(5);
    });
  });
});
