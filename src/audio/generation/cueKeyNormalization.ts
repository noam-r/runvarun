/**
 * Cue key normalization utilities for the continuous audio generation pipeline.
 *
 * Cue keys are stable, label-based semantic identifiers for cue assets.
 * Step labels are normalized (trim → lowercase → collapse whitespace) to
 * produce deterministic keys regardless of formatting variations.
 */

// ─── System Cue Key Constants ────────────────────────────────────────────────

/** Cue key for the workout-start announcement. */
export const SYSTEM_CUE_START = 'system:start';

/** Cue key for the final-round announcement. */
export const SYSTEM_CUE_LAST_ROUND = 'system:last-round';

/** Cue key for the workout-complete announcement. */
export const SYSTEM_CUE_COMPLETE = 'system:complete';

/** Cue key for the 3-second countdown tick. */
export const SYSTEM_CUE_COUNTDOWN_3 = 'system:countdown-3';

/** Cue key for the 2-second countdown tick. */
export const SYSTEM_CUE_COUNTDOWN_2 = 'system:countdown-2';

/** Cue key for the 1-second countdown tick. */
export const SYSTEM_CUE_COUNTDOWN_1 = 'system:countdown-1';

/** All system cue keys as an array for iteration/validation. */
export const SYSTEM_CUE_KEYS = [
  SYSTEM_CUE_START,
  SYSTEM_CUE_LAST_ROUND,
  SYSTEM_CUE_COMPLETE,
  SYSTEM_CUE_COUNTDOWN_3,
  SYSTEM_CUE_COUNTDOWN_2,
  SYSTEM_CUE_COUNTDOWN_1,
] as const;

// ─── Normalization ───────────────────────────────────────────────────────────

/**
 * Normalizes a step label into a stable cue key.
 *
 * Pipeline: trim → lowercase → collapse multiple whitespace to single space
 * Output format: `step-label:{normalizedLabel}`
 *
 * This ensures that labels like "Run", " run ", "  RUN  ", and "R U N" all
 * don't collide accidentally, while "Run" and " Run " and "RUN" produce the
 * same key.
 *
 * @param label - The raw step label string
 * @returns A normalized cue key in the format `step-label:{normalized}`
 */
export function normalizeCueKey(label: string): string {
  const normalized = label.trim().toLowerCase().replace(/\s+/g, ' ');
  return `step-label:${normalized}`;
}
