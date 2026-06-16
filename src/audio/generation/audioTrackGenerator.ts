/**
 * Audio track generation orchestrator for the continuous audio runtime.
 *
 * Coordinates the full pipeline:
 *   validate duration → generate timeline → plan cues → resolve assets
 *   → render with OfflineAudioContext → encode MP3 → return blob
 *
 * Reports progress through a callback and supports AbortSignal for cancellation.
 */

import type { WorkoutPreset } from '../../domain/types';
import type {
  CueEvent,
  CueSettings,
  EncoderOptions,
  GenerationProgress,
  GenerationResult,
  WorkoutTimeline,
} from './types';
import { generateTimeline } from './timelineGenerator';
import { planCueEvents } from './cueEventPlanner';
import { resolveAllCues } from './cueResolver';
import { encodeMp3 } from './mp3Encoder';

// ─── Constants ───────────────────────────────────────────────────────────────

/** Maximum allowed workout duration in seconds (60 minutes). */
const MAX_DURATION_SECONDS = 3600;

/** Sample rate for the generated audio track. */
const SAMPLE_RATE = 22050;

/** Number of audio channels (mono). */
const CHANNELS = 1;

/** Gain for the pacer layer pulses. */
const PACER_GAIN = 0.05;

/** Duration (in seconds) around a cue event where the pacer is ducked to 0. */
const PACER_DUCK_RADIUS_SECONDS = 0.5;

/** Interval between pacer pulses in seconds. */
const PACER_INTERVAL_SECONDS = 1;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Checks if the AbortSignal has been triggered and throws if so.
 */
function checkAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException('Generation aborted', 'AbortError');
  }
}

/**
 * Calculates the total workout duration from a preset.
 */
function calculateTotalDuration(preset: WorkoutPreset): number {
  const stepDurationSum = preset.steps.reduce(
    (sum, step) => sum + step.durationSeconds,
    0,
  );
  return preset.repeatCount * stepDurationSum;
}

/**
 * Renders the pacer layer into the audio buffer.
 *
 * Creates a low-gain (0.05) single-sample pulse at regular intervals (~1s),
 * ducked to 0 within ±0.5s of any cue event.
 */
function renderPacerLayer(buffer: Float32Array, cueEvents: CueEvent[]): void {
  const totalSamples = buffer.length;
  const intervalSamples = Math.round(PACER_INTERVAL_SECONDS * SAMPLE_RATE);

  // Pre-compute cue event times for ducking checks
  const cueTimes = cueEvents.map((e) => e.atSeconds);

  for (let sampleIndex = 0; sampleIndex < totalSamples; sampleIndex += intervalSamples) {
    const timeSeconds = sampleIndex / SAMPLE_RATE;

    // Check if this pulse should be ducked (within PACER_DUCK_RADIUS_SECONDS of any cue)
    const isDucked = cueTimes.some(
      (cueTime) => Math.abs(timeSeconds - cueTime) < PACER_DUCK_RADIUS_SECONDS,
    );

    if (!isDucked && sampleIndex < totalSamples) {
      // Add a single-sample pulse at low gain
      buffer[sampleIndex] += PACER_GAIN;
    }
  }
}

// ─── Main Orchestrator ───────────────────────────────────────────────────────

/**
 * Generates a complete audio track for a workout preset.
 *
 * Orchestrates the full pipeline:
 * 1. Validate duration (reject > 60 minutes)
 * 2. Generate timeline from preset
 * 3. Plan cue events from timeline + settings
 * 4. Resolve cue assets (fetch/decode audio buffers)
 * 5. Render audio with OfflineAudioContext (place cues + optional pacer)
 * 6. Encode rendered buffer as MP3
 * 7. Create object URL from the resulting blob
 *
 * @param preset - The workout preset to generate audio for
 * @param settings - Cue settings controlling which cue types are included
 * @param options - Generation options (pacer, progress callback, abort signal)
 * @returns A GenerationResult with the MP3 blob, object URL, timeline, and metadata
 * @throws DOMException with name 'AbortError' if cancelled via signal
 * @throws Error if workout duration exceeds 60 minutes
 */
export async function generateAudioTrack(
  preset: WorkoutPreset,
  settings: CueSettings,
  options: {
    pacerEnabled: boolean;
    onProgress?: (progress: GenerationProgress) => void;
    signal?: AbortSignal;
  },
): Promise<GenerationResult> {
  const { pacerEnabled, onProgress, signal } = options;

  const reportProgress = (phase: GenerationProgress['phase'], percent: number) => {
    onProgress?.({ phase, percent });
  };

  // ─── Step 1: Validate duration ─────────────────────────────────────────

  const totalDurationSeconds = calculateTotalDuration(preset);

  if (totalDurationSeconds > MAX_DURATION_SECONDS) {
    throw new Error(
      'This workout is too long for audio generation. ' +
        'Shorten it or use Screen-On Timer Mode.',
    );
  }

  checkAborted(signal);

  // ─── Step 2: Generate timeline ─────────────────────────────────────────

  const timeline: WorkoutTimeline = generateTimeline(preset);

  checkAborted(signal);

  // ─── Step 3: Plan cue events ───────────────────────────────────────────

  const cueEvents: CueEvent[] = planCueEvents(timeline, settings);

  checkAborted(signal);

  // ─── Step 4: Resolve cue assets ────────────────────────────────────────

  reportProgress('resolving-cues', 0);

  // Create a temporary AudioContext for decoding cue assets
  const decodeContext = new OfflineAudioContext(
    CHANNELS,
    SAMPLE_RATE, // At least 1 second of frames for decoding
    SAMPLE_RATE,
  );

  const resolutionReport = await resolveAllCues(cueEvents, decodeContext);

  checkAborted(signal);
  reportProgress('resolving-cues', 100);

  // ─── Step 5: Render audio with OfflineAudioContext ─────────────────────

  reportProgress('rendering', 0);

  const totalFrames = Math.ceil(totalDurationSeconds * SAMPLE_RATE);
  const offlineCtx = new OfflineAudioContext(CHANNELS, totalFrames, SAMPLE_RATE);

  // Build a map of cueKey → AudioBuffer for quick lookup
  const cueBufferMap = new Map(
    resolutionReport.resolved.map((r) => [r.cueKey, r.audioBuffer]),
  );

  // Place each cue event's AudioBuffer at its scheduled position
  for (const event of cueEvents) {
    const audioBuffer = cueBufferMap.get(event.cueKey);
    if (!audioBuffer) continue; // Missing cue — silence inserted implicitly

    const source = offlineCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(offlineCtx.destination);
    source.start(event.atSeconds);
  }

  // Render the pacer layer if enabled
  // We'll add pacer to the rendered buffer after OfflineAudioContext render
  // since OfflineAudioContext scheduling is more complex for per-sample manipulation

  checkAborted(signal);
  reportProgress('rendering', 50);

  const renderedBuffer = await offlineCtx.startRendering();

  checkAborted(signal);

  // Apply pacer layer directly to the rendered PCM data if enabled
  const channelData = renderedBuffer.getChannelData(0);
  if (pacerEnabled) {
    renderPacerLayer(channelData, cueEvents);
  }

  reportProgress('rendering', 100);

  // ─── Step 6: Encode MP3 ────────────────────────────────────────────────

  reportProgress('encoding', 0);
  checkAborted(signal);

  const encoderOptions: EncoderOptions = {
    sampleRate: SAMPLE_RATE as 22050,
    bitRate: 48,
    channels: CHANNELS as 1,
  };

  const blob = await encodeMp3(
    channelData,
    encoderOptions,
    (percent) => reportProgress('encoding', percent),
    signal,
  );

  checkAborted(signal);
  reportProgress('encoding', 100);

  // ─── Step 7: Create object URL ─────────────────────────────────────────

  reportProgress('storing', 0);

  const objectUrl = URL.createObjectURL(blob);

  reportProgress('storing', 100);
  reportProgress('ready', 100);

  // ─── Step 8: Return result ─────────────────────────────────────────────

  return {
    blob,
    objectUrl,
    timeline,
    totalDurationSeconds,
    missingCues: resolutionReport.missing,
  };
}
