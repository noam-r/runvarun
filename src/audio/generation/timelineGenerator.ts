import type { WorkoutPreset } from '../../domain/types';
import type { TimelineSegment, WorkoutTimeline } from './types';

/**
 * Generates a deterministic WorkoutTimeline from a WorkoutPreset.
 *
 * The timeline is a flat sequence of segments in round-major order
 * (all steps of round 0, then all steps of round 1, etc.), each with
 * precise start/end boundaries in seconds.
 *
 * This function is pure — no side effects, no dependency on clock or UI.
 */
export function generateTimeline(preset: WorkoutPreset): WorkoutTimeline {
  const segments: TimelineSegment[] = [];
  let runningSeconds = 0;

  for (let roundIndex = 0; roundIndex < preset.repeatCount; roundIndex++) {
    for (let stepIndex = 0; stepIndex < preset.steps.length; stepIndex++) {
      const step = preset.steps[stepIndex];
      const durationSeconds = step.durationSeconds;
      const startsAtSeconds = runningSeconds;
      const endsAtSeconds = startsAtSeconds + durationSeconds;

      segments.push({
        id: `seg_r${roundIndex}_s${stepIndex}`,
        roundIndex,
        stepIndex,
        stepLabel: step.label,
        startsAtSeconds,
        endsAtSeconds,
        durationSeconds,
      });

      runningSeconds = endsAtSeconds;
    }
  }

  return {
    segments,
    totalDurationSeconds: runningSeconds,
  };
}
