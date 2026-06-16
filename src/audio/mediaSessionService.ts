/**
 * Media Session integration for lock-screen metadata and controls.
 *
 * Provides workout info (name, current step) on the lock screen and registers
 * play/pause action handlers so runners can control playback without unlocking.
 *
 * Uses feature detection — no-ops gracefully when Media Session API is unavailable.
 */

import type { TimelineSegment } from './generation/types';

// ─── Types ───────────────────────────────────────────────────────────────────

export type MediaSessionCallbacks = {
  onPlay: () => void;
  onPause: () => void;
};

// ─── Service ─────────────────────────────────────────────────────────────────

/**
 * Check if the Media Session API is available in this environment.
 */
function isMediaSessionAvailable(): boolean {
  return typeof navigator !== 'undefined' && 'mediaSession' in navigator;
}

/**
 * Set initial metadata when a workout track is loaded.
 * Shows the workout preset name as title and "RunVaRun" as artist.
 */
export function setInitialMetadata(workoutName: string): void {
  if (!isMediaSessionAvailable()) return;

  navigator.mediaSession.metadata = new MediaMetadata({
    title: workoutName,
    artist: 'RunVaRun',
  });
}

/**
 * Update metadata when the active step changes during playback.
 * Formats the title as "{stepLabel} - Round {current}/{total}".
 */
export function updateStepMetadata(
  segment: TimelineSegment,
  totalRounds: number,
): void {
  if (!isMediaSessionAvailable()) return;

  const roundDisplay = `Round ${segment.roundIndex + 1}/${totalRounds}`;
  const title = `${segment.stepLabel} - ${roundDisplay}`;

  navigator.mediaSession.metadata = new MediaMetadata({
    title,
    artist: 'RunVaRun',
  });
}

/**
 * Register play and pause action handlers for lock-screen controls.
 * Call this once after loading a track.
 */
export function registerActionHandlers(callbacks: MediaSessionCallbacks): void {
  if (!isMediaSessionAvailable()) return;

  navigator.mediaSession.setActionHandler('play', () => {
    callbacks.onPlay();
  });

  navigator.mediaSession.setActionHandler('pause', () => {
    callbacks.onPause();
  });
}

/**
 * Remove action handlers and clear metadata. Call on dispose/stop.
 */
export function clearMediaSession(): void {
  if (!isMediaSessionAvailable()) return;

  navigator.mediaSession.metadata = null;

  try {
    navigator.mediaSession.setActionHandler('play', null);
    navigator.mediaSession.setActionHandler('pause', null);
  } catch {
    // Some browsers throw when setting null handlers — safe to ignore
  }
}
