/**
 * Cue asset resolution for the continuous audio generation pipeline.
 *
 * Resolves each unique cue key to a decoded AudioBuffer by checking sources
 * in priority order:
 *   1. User recording from IndexedDB (Recording_Store)
 *   2. Built-in MP3 from `public/cues/{filename}.mp3`
 *   3. Default step cue (`public/cues/step-default.mp3`) for step-label keys
 *   4. Report as missing (silence will be inserted)
 *
 * Decoded buffers are cached per cue key to avoid redundant decoding.
 */

import type { CueEvent, ResolvedCue, ResolutionReport } from './types';
import { recordingStore } from '../recordingStore';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Converts a cue key to the corresponding built-in asset filename.
 * Replaces `:` with `-` since filesystem paths cannot use colons.
 *
 * Examples:
 *   `system:start` → `system-start`
 *   `step-label:run` → `step-label-run`
 *   `system:countdown-3` → `system-countdown-3`
 */
export function cueKeyToFilename(cueKey: string): string {
  return cueKey.replace(/:/g, '-');
}

/**
 * Returns the URL path for a built-in cue asset.
 */
function builtInCueUrl(cueKey: string): string {
  return `/cues/${cueKeyToFilename(cueKey)}.mp3`;
}

/**
 * Checks if a cue key is a step-label key (eligible for default step cue fallback).
 */
function isStepLabelKey(cueKey: string): boolean {
  return cueKey.startsWith('step-label:');
}

// ─── Resolution Logic ────────────────────────────────────────────────────────

/**
 * Attempts to fetch and decode an audio asset from a URL.
 * Returns the decoded AudioBuffer, or null if fetch or decode fails.
 */
async function fetchAndDecode(
  url: string,
  audioContext: OfflineAudioContext | AudioContext,
): Promise<AudioBuffer | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    return audioBuffer;
  } catch {
    return null;
  }
}

/**
 * Attempts to load and decode a user recording from IndexedDB.
 * Returns the decoded AudioBuffer, or null if not found or decode fails.
 */
async function loadUserRecording(
  cueKey: string,
  audioContext: OfflineAudioContext | AudioContext,
): Promise<AudioBuffer | null> {
  try {
    const entry = await recordingStore.get(cueKey);
    if (!entry) return null;
    const arrayBuffer = await entry.blob.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    return audioBuffer;
  } catch {
    return null;
  }
}

const DEFAULT_STEP_CUE_URL = '/cues/step-default.mp3';

/**
 * Resolves a single cue key to a decoded AudioBuffer following the priority order:
 *   1. User recording from IndexedDB
 *   2. Built-in MP3 from public/cues/
 *   3. Default step cue (for step-label keys only)
 *   4. null (missing)
 *
 * Returns a partial ResolvedCue (without cueKey) or null if all sources fail.
 */
async function resolveSingleCue(
  cueKey: string,
  audioContext: OfflineAudioContext | AudioContext,
): Promise<{ audioBuffer: AudioBuffer; source: ResolvedCue['source'] } | null> {
  // 1. Try user recording from IndexedDB
  const userBuffer = await loadUserRecording(cueKey, audioContext);
  if (userBuffer) {
    return { audioBuffer: userBuffer, source: 'user-recorded' };
  }

  // 2. Try built-in MP3
  const builtInBuffer = await fetchAndDecode(builtInCueUrl(cueKey), audioContext);
  if (builtInBuffer) {
    return { audioBuffer: builtInBuffer, source: 'built-in' };
  }

  // 3. Try default step cue (only for step-label keys)
  if (isStepLabelKey(cueKey)) {
    const defaultBuffer = await fetchAndDecode(DEFAULT_STEP_CUE_URL, audioContext);
    if (defaultBuffer) {
      return { audioBuffer: defaultBuffer, source: 'built-in' };
    }
  }

  // 4. All sources failed
  return null;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Resolves all unique cue keys from a list of planned CueEvents into decoded
 * AudioBuffers, following the resolution priority order.
 *
 * Caches decoded buffers so that duplicate cue keys are decoded only once.
 *
 * @param cueEvents - The planned cue events containing cue keys to resolve
 * @param audioContext - An AudioContext or OfflineAudioContext for decoding audio data
 * @returns A ResolutionReport with resolved cues and any missing keys
 */
export async function resolveAllCues(
  cueEvents: CueEvent[],
  audioContext: OfflineAudioContext | AudioContext,
): Promise<ResolutionReport> {
  // Extract unique cue keys
  const uniqueKeys = [...new Set(cueEvents.map((e) => e.cueKey))];

  const resolved: ResolvedCue[] = [];
  const missing: string[] = [];

  // Resolve each unique key (cache implicitly via single resolution per key)
  for (const cueKey of uniqueKeys) {
    const result = await resolveSingleCue(cueKey, audioContext);
    if (result) {
      resolved.push({
        cueKey,
        audioBuffer: result.audioBuffer,
        source: result.source,
      });
    } else {
      missing.push(cueKey);
    }
  }

  return { resolved, missing };
}
