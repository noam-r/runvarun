/**
 * Type definitions for the continuous audio generation pipeline.
 *
 * These types model the full flow from workout preset → timeline → cue events
 * → resolved audio assets → rendered MP3 track.
 */

// ─── Timeline ────────────────────────────────────────────────────────────────

/** A single step occurrence within a WorkoutTimeline, with precise time boundaries. */
export type TimelineSegment = {
  /** Unique ID: `seg_r{roundIndex}_s{stepIndex}` */
  id: string;
  /** 0-based round index */
  roundIndex: number;
  /** 0-based step index within the round */
  stepIndex: number;
  /** The label of the corresponding WorkoutStep */
  stepLabel: string;
  /** Absolute start time in seconds from track beginning */
  startsAtSeconds: number;
  /** Absolute end time in seconds from track beginning */
  endsAtSeconds: number;
  /** Duration of this segment in seconds */
  durationSeconds: number;
};

/** The complete timeline derived from a workout preset. */
export type WorkoutTimeline = {
  segments: TimelineSegment[];
  totalDurationSeconds: number;
};

// ─── Cue Events ──────────────────────────────────────────────────────────────

/** The type of a planned cue event in the generated track. */
export type CueEventType =
  | 'workout-start'
  | 'step-start'
  | 'countdown'
  | 'final-round'
  | 'workout-complete';

/** A planned audio cue placed at a specific timestamp in the track. */
export type CueEvent = {
  id: string;
  type: CueEventType;
  /** Absolute time in seconds from track beginning */
  atSeconds: number;
  /** Semantic identifier for the cue asset to play */
  cueKey: string;
  /** Priority: 1=highest (workout-complete), 5=lowest (countdown) */
  priority: number;
  stepLabel?: string;
  roundIndex?: number;
  stepIndex?: number;
};

/** User-facing settings that control which cue types are included in the generated track. */
export type CueSettings = {
  workoutStartEnabled: boolean;
  countdownEnabled: boolean;
  finalRoundEnabled: boolean;
  completionEnabled: boolean;
};

// ─── Cue Resolution ──────────────────────────────────────────────────────────

/** A cue asset resolved to a decoded AudioBuffer ready for rendering. */
export type ResolvedCue = {
  cueKey: string;
  audioBuffer: AudioBuffer;
  source: 'user-recorded' | 'built-in';
};

/** Report of cue resolution results after attempting to resolve all planned cues. */
export type ResolutionReport = {
  resolved: ResolvedCue[];
  /** Cue keys that could not be resolved (silence will be inserted). */
  missing: string[];
};

// ─── Generation Pipeline ─────────────────────────────────────────────────────

/** Progress report emitted during audio track generation. */
export type GenerationProgress = {
  phase: 'resolving-cues' | 'rendering' | 'encoding' | 'storing' | 'ready';
  /** 0–100 */
  percent: number;
};

/** The result of a successful audio track generation. */
export type GenerationResult = {
  blob: Blob;
  objectUrl: string;
  timeline: WorkoutTimeline;
  totalDurationSeconds: number;
  /** Cue keys that could not be resolved (silence was inserted). */
  missingCues: string[];
};

// ─── MP3 Encoder ─────────────────────────────────────────────────────────────

/** Options for the MP3 encoder. */
export type EncoderOptions = {
  sampleRate: 22050;
  bitRate: 32 | 48;
  channels: 1;
};
