/**
 * Cue event planning for the continuous audio generation pipeline.
 *
 * Takes a WorkoutTimeline and CueSettings and produces a sorted array of
 * CueEvents with priority-based collision resolution.
 *
 * This function is pure — no side effects, no dependency on clock or UI.
 */

import type { CueEvent, CueSettings, WorkoutTimeline } from './types';
import {
  normalizeCueKey,
  SYSTEM_CUE_START,
  SYSTEM_CUE_LAST_ROUND,
  SYSTEM_CUE_COMPLETE,
  SYSTEM_CUE_COUNTDOWN_3,
  SYSTEM_CUE_COUNTDOWN_2,
  SYSTEM_CUE_COUNTDOWN_1,
} from './cueKeyNormalization';

// ─── Priority Constants ──────────────────────────────────────────────────────

/** Priority values: lower number = higher priority = scheduled first at collisions. */
const PRIORITY_WORKOUT_COMPLETE = 1;
const PRIORITY_FINAL_ROUND = 2;
const PRIORITY_STEP_START = 3;
const PRIORITY_WORKOUT_START = 4;
const PRIORITY_COUNTDOWN = 5;

/** Gap inserted between cues sequenced at the same timestamp (in seconds). */
const COLLISION_GAP_SECONDS = 0.15; // 150ms

// ─── Helpers ─────────────────────────────────────────────────────────────────

let idCounter = 0;

function nextId(type: string): string {
  return `cue_${type}_${idCounter++}`;
}

function resetIdCounter(): void {
  idCounter = 0;
}

// ─── Main Function ───────────────────────────────────────────────────────────

/**
 * Plans cue events for a workout timeline based on the provided settings.
 *
 * The output is a sorted array of CueEvents with collision resolution applied:
 * - Step-start cues are placed at every segment's startsAtSeconds (never displaced)
 * - Workout-start cue at time 0 (if enabled)
 * - Countdown cues at -3, -2, -1s before each step transition (if enabled)
 * - Final-round cue before the last round starts (if enabled)
 * - Workout-complete cue at the end (if enabled)
 *
 * Collision handling:
 * - Countdown cues that would collide with step-start cues are omitted entirely
 * - Other cues at the same timestamp are sequenced by priority with 150-300ms gaps
 * - Step-start cues are never shifted from their timeline position
 */
export function planCueEvents(
  timeline: WorkoutTimeline,
  settings: CueSettings,
): CueEvent[] {
  resetIdCounter();

  const { segments, totalDurationSeconds } = timeline;

  if (segments.length === 0) {
    return [];
  }

  // Collect all step-start timestamps for collision detection
  const stepStartTimes = new Set<number>(
    segments.map((seg) => seg.startsAtSeconds),
  );

  // ─── 1. Place step-start cues ────────────────────────────────────────────

  const events: CueEvent[] = [];

  for (const segment of segments) {
    events.push({
      id: nextId('step-start'),
      type: 'step-start',
      atSeconds: segment.startsAtSeconds,
      cueKey: normalizeCueKey(segment.stepLabel),
      priority: PRIORITY_STEP_START,
      stepLabel: segment.stepLabel,
      roundIndex: segment.roundIndex,
      stepIndex: segment.stepIndex,
    });
  }

  // ─── 2. Place workout-start cue ─────────────────────────────────────────

  if (settings.workoutStartEnabled) {
    events.push({
      id: nextId('workout-start'),
      type: 'workout-start',
      atSeconds: 0,
      cueKey: SYSTEM_CUE_START,
      priority: PRIORITY_WORKOUT_START,
    });
  }

  // ─── 3. Place countdown cues ─────────────────────────────────────────────

  if (settings.countdownEnabled) {
    // Countdown cues are placed before each step transition (i.e., before
    // each segment start, except the very first segment at time 0).
    for (const segment of segments) {
      const transitionTime = segment.startsAtSeconds;

      // Skip countdown for the very first segment (transition at t=0)
      if (transitionTime === 0) {
        continue;
      }

      const countdownOffsets: Array<{ offset: number; cueKey: string }> = [
        { offset: 3, cueKey: SYSTEM_CUE_COUNTDOWN_3 },
        { offset: 2, cueKey: SYSTEM_CUE_COUNTDOWN_2 },
        { offset: 1, cueKey: SYSTEM_CUE_COUNTDOWN_1 },
      ];

      for (const { offset, cueKey } of countdownOffsets) {
        const cueTime = transitionTime - offset;

        // Don't place countdown cues at negative timestamps
        if (cueTime < 0) {
          continue;
        }

        // Omit countdown cues that collide with step-start cues
        if (stepStartTimes.has(cueTime)) {
          continue;
        }

        events.push({
          id: nextId('countdown'),
          type: 'countdown',
          atSeconds: cueTime,
          cueKey,
          priority: PRIORITY_COUNTDOWN,
          stepLabel: segment.stepLabel,
          roundIndex: segment.roundIndex,
          stepIndex: segment.stepIndex,
        });
      }
    }
  }

  // ─── 4. Place final-round cue ───────────────────────────────────────────

  if (settings.finalRoundEnabled) {
    // Find the last round index
    const lastRoundIndex = segments[segments.length - 1].roundIndex;

    // Only place if there are multiple rounds
    if (lastRoundIndex > 0) {
      // Find the first segment of the last round
      const lastRoundFirstSegment = segments.find(
        (seg) => seg.roundIndex === lastRoundIndex && seg.stepIndex === 0,
      );

      if (lastRoundFirstSegment) {
        events.push({
          id: nextId('final-round'),
          type: 'final-round',
          atSeconds: lastRoundFirstSegment.startsAtSeconds,
          cueKey: SYSTEM_CUE_LAST_ROUND,
          priority: PRIORITY_FINAL_ROUND,
          roundIndex: lastRoundFirstSegment.roundIndex,
          stepIndex: lastRoundFirstSegment.stepIndex,
        });
      }
    }
  }

  // ─── 5. Place workout-complete cue ──────────────────────────────────────

  if (settings.completionEnabled) {
    events.push({
      id: nextId('workout-complete'),
      type: 'workout-complete',
      atSeconds: totalDurationSeconds,
      cueKey: SYSTEM_CUE_COMPLETE,
      priority: PRIORITY_WORKOUT_COMPLETE,
    });
  }

  // ─── 6. Resolve collisions and sort ─────────────────────────────────────

  return resolveCollisions(events);
}

// ─── Collision Resolution ────────────────────────────────────────────────────

/**
 * Resolves collisions between cue events at the same timestamp.
 *
 * Strategy:
 * - Group events by their planned atSeconds
 * - Within each group, sort by priority (lower number = higher priority = first)
 * - Step-start cues stay at their exact position (never displaced)
 * - Other cues in the group are offset by 150ms gaps after the step-start
 *   (or after the highest-priority cue if no step-start at that timestamp)
 *
 * Returns the final sorted array of cue events.
 */
function resolveCollisions(events: CueEvent[]): CueEvent[] {
  // Group events by their planned timestamp
  const groups = new Map<number, CueEvent[]>();

  for (const event of events) {
    const key = event.atSeconds;
    const group = groups.get(key);
    if (group) {
      group.push(event);
    } else {
      groups.set(key, [event]);
    }
  }

  const result: CueEvent[] = [];

  for (const [_timestamp, group] of groups) {
    if (group.length === 1) {
      result.push(group[0]);
      continue;
    }

    // Sort by priority: lower number = higher priority = scheduled first
    group.sort((a, b) => a.priority - b.priority);

    // Find step-start cue in the group (it anchors the timestamp)
    const stepStartCue = group.find((e) => e.type === 'step-start');

    if (stepStartCue) {
      // Step-start stays at exact position. Other cues are offset.
      // Higher-priority cues go BEFORE the step-start, lower-priority go AFTER.
      const beforeStepStart: CueEvent[] = [];
      const afterStepStart: CueEvent[] = [];

      for (const cue of group) {
        if (cue === stepStartCue) continue;
        if (cue.priority < stepStartCue.priority) {
          beforeStepStart.push(cue);
        } else {
          afterStepStart.push(cue);
        }
      }

      // Place higher-priority cues at the same timestamp, offset backwards
      // Actually per the spec: cues at the same timestamp are sequenced by priority
      // with gaps. The step-start stays in place. Higher priority cues come first
      // (at the same time or offset forward), lower priority come after.
      //
      // Per the design: "Events at the same atSeconds are sorted by priority.
      // Lower-priority events are offset by the preceding cue's duration + 150–300ms gap."
      //
      // Since we don't know cue durations at planning time, we use a fixed 150ms gap.
      // The step-start anchors its position. Higher-priority items are placed at the
      // step-start time (they effectively play first), and lower-priority items are
      // offset after.

      // Higher-priority cues (before step-start in priority) get placed at the
      // step-start's timestamp and the step-start gets offset forward? NO — the spec
      // says step-start is NEVER displaced. So higher-priority cues are placed
      // at the same position and offset forward from there.
      //
      // Reinterpretation: all cues at the same timestamp are sorted by priority.
      // Step-start stays at its exact time. All other cues are offset from the
      // step-start position. Higher priority cues get smaller offsets (placed right
      // after step-start), lower priority cues get larger offsets.
      //
      // Wait — the design says "workout-complete > final-round > step-start > workout-start > countdown"
      // meaning workout-complete is highest priority. If workout-complete shares a timestamp
      // with step-start, the step-start stays put and workout-complete gets offset?
      // That seems odd. Let me re-read:
      //
      // "WHEN two Cue_Events share the same timestamp, THE Audio_Track_Generator SHALL
      //  sequence them by priority order rather than mixing them simultaneously"
      // "THE Audio_Track_Generator SHALL not shift any step-start cue from its planned
      //  timeline position due to cue sequencing"
      //
      // So the step-start stays at its planned time. Other cues are offset. The sequencing
      // order is by priority (highest first), but the step-start is pinned. So effectively:
      // - Cues with higher priority than step-start play at the step-start's time
      //   (they effectively "take" that slot, but step-start is pinned there too)
      // - No, step-start is PINNED. Other cues must be offset.
      //
      // Most logical interpretation: step-start occupies its exact timestamp. All other
      // cues sharing that timestamp are offset forward in priority order (highest priority
      // first, then lower priority after).

      let currentOffset = stepStartCue.atSeconds;

      // First, place step-start at its exact time
      result.push(stepStartCue);
      currentOffset += COLLISION_GAP_SECONDS;

      // Then place remaining cues in priority order (all sorted already)
      const remainingCues = [...beforeStepStart, ...afterStepStart];
      remainingCues.sort((a, b) => a.priority - b.priority);

      for (const cue of remainingCues) {
        result.push({ ...cue, atSeconds: currentOffset });
        currentOffset += COLLISION_GAP_SECONDS;
      }
    } else {
      // No step-start in group: first cue keeps exact timestamp, rest are offset
      let currentOffset = group[0].atSeconds;
      for (let i = 0; i < group.length; i++) {
        if (i === 0) {
          result.push(group[i]);
        } else {
          currentOffset += COLLISION_GAP_SECONDS;
          result.push({ ...group[i], atSeconds: currentOffset });
        }
      }
    }
  }

  // Final sort by atSeconds, then by priority for same-time events
  result.sort((a, b) => {
    if (a.atSeconds !== b.atSeconds) {
      return a.atSeconds - b.atSeconds;
    }
    return a.priority - b.priority;
  });

  return result;
}
