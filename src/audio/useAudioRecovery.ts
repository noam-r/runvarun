/**
 * Audio recovery check — determines if a previously active audio workout
 * can be resumed after page reload.
 *
 * Flow:
 * 1. Check localStorage for activeAudioWorkout state
 * 2. If state exists and status is 'playing' or 'paused':
 *    a. Try to load the track blob from IndexedDB (trackStore)
 *    b. Return recovery info (whether blob is available, the state, etc.)
 * 3. If no active workout or status is terminal → no recovery needed
 */

import type { AudioWorkoutRuntimeState } from '../domain/types';
import { storageService } from '../storage/storageService';
import { trackStore } from '../storage/trackStore';

export type AudioRecoveryResult = {
  needsRecovery: boolean;
  hasTrackBlob: boolean;
  state: AudioWorkoutRuntimeState | null;
  trackBlob: Blob | null;
};

/**
 * Synchronously check if there's a recoverable audio workout in storage.
 * Returns the persisted state if recovery is needed — blob loading is async
 * and must be done separately with `loadRecoveryTrack()`.
 */
export function checkAudioRecoverySync(): {
  needsRecovery: boolean;
  state: AudioWorkoutRuntimeState | null;
} {
  const state = storageService.loadAudioWorkoutState();

  if (!state) {
    return { needsRecovery: false, state: null };
  }

  // Only recover from playing or paused states
  if (state.status === 'playing' || state.status === 'paused') {
    return { needsRecovery: true, state };
  }

  return { needsRecovery: false, state: null };
}

/**
 * Full async recovery check: loads both the persisted state and attempts
 * to retrieve the track blob from IndexedDB.
 */
export async function checkAudioRecovery(): Promise<AudioRecoveryResult> {
  const state = storageService.loadAudioWorkoutState();

  if (!state) {
    return { needsRecovery: false, hasTrackBlob: false, state: null, trackBlob: null };
  }

  // Only recover from playing or paused states
  if (state.status !== 'playing' && state.status !== 'paused') {
    return { needsRecovery: false, hasTrackBlob: false, state: null, trackBlob: null };
  }

  // Attempt to load the track blob from IndexedDB
  try {
    const trackData = await trackStore.loadTrack();
    if (trackData && trackData.blob) {
      return {
        needsRecovery: true,
        hasTrackBlob: true,
        state,
        trackBlob: trackData.blob,
      };
    }
  } catch {
    // IndexedDB unavailable or corrupted — blob not available
  }

  // Blob not available — needs recovery screen with Restart/Discard
  return {
    needsRecovery: true,
    hasTrackBlob: false,
    state,
    trackBlob: null,
  };
}

/**
 * Clear the persisted audio workout state (used when discarding).
 */
export function clearAudioRecoveryState(): void {
  storageService.saveAudioWorkoutState(null);
}
