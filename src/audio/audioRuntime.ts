/**
 * AudioRuntime — owns a single HTMLAudioElement, controls playback, and derives
 * workout state from audio.currentTime using binary search on timeline segments.
 *
 * This is the core of the "Reliable Audio Mode": once playback starts,
 * audio.currentTime is the single source of truth. No setTimeout/setInterval
 * drives workout logic.
 */

import type { TimelineSegment, WorkoutTimeline } from './generation/types';
import type { AudioWorkoutRuntimeState, WorkoutPreset } from '../domain/types';
import { storageService } from '../storage/storageService';
import {
  setInitialMetadata,
  updateStepMetadata,
  registerActionHandlers,
  clearMediaSession,
} from './mediaSessionService';

// ─── Public Types ────────────────────────────────────────────────────────────

export type AudioRuntimeStatus = 'idle' | 'ready' | 'playing' | 'paused' | 'complete' | 'error';

export type AudioRuntimeState = {
  status: AudioRuntimeStatus;
  currentTimeSeconds: number;
  activeSegment: TimelineSegment | null;
  remainingStepSeconds: number;
  totalRemainingSeconds: number;
  roundIndex: number;
  stepIndex: number;
  error?: string;
};

export type AudioRuntimeCallbacks = {
  onStateChange: (state: AudioRuntimeState) => void;
  onComplete: () => void;
  onError: (error: string) => void;
};

export type AudioRuntimeConfig = {
  objectUrl: string;
  timeline: WorkoutTimeline;
  presetId: string;
  presetSnapshot: WorkoutPreset;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Binary search on sorted timeline segments to find the active segment
 * for a given currentTime. Segments are sorted by startsAtSeconds.
 *
 * Returns the segment where startsAtSeconds <= currentTime < endsAtSeconds,
 * or the last segment if currentTime >= totalDuration.
 */
export function findActiveSegment(
  segments: TimelineSegment[],
  currentTime: number,
): TimelineSegment | null {
  if (segments.length === 0) return null;

  // Clamp: if past the end, return the last segment
  if (currentTime >= segments[segments.length - 1].endsAtSeconds) {
    return segments[segments.length - 1];
  }

  // Clamp: if before start, return the first segment
  if (currentTime < segments[0].startsAtSeconds) {
    return segments[0];
  }

  let lo = 0;
  let hi = segments.length - 1;

  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const seg = segments[mid];

    if (currentTime < seg.startsAtSeconds) {
      hi = mid - 1;
    } else if (currentTime >= seg.endsAtSeconds) {
      lo = mid + 1;
    } else {
      // startsAtSeconds <= currentTime < endsAtSeconds
      return seg;
    }
  }

  // Fallback (shouldn't happen with well-formed timeline)
  return segments[lo] ?? segments[segments.length - 1];
}

// ─── AudioRuntime Class ──────────────────────────────────────────────────────

const PERSIST_INTERVAL_MS = 5000;

export class AudioRuntime {
  private audio: HTMLAudioElement | null = null;
  private timeline: WorkoutTimeline | null = null;
  private objectUrl: string | null = null;
  private presetId: string | null = null;
  private presetSnapshot: WorkoutPreset | null = null;

  private callbacks: AudioRuntimeCallbacks;
  private state: AudioRuntimeState;

  private rafId: number | null = null;
  private lastPersistTime = 0;
  private startedAt = 0;
  private disposed = false;

  // Bound event handlers (for cleanup)
  private handleVisibilityChange: () => void;
  private handlePageHide: () => void;
  private handleAudioEnded: () => void;
  private handleAudioError: (e: Event) => void;

  constructor(callbacks: AudioRuntimeCallbacks) {
    this.callbacks = callbacks;
    this.state = {
      status: 'idle',
      currentTimeSeconds: 0,
      activeSegment: null,
      remainingStepSeconds: 0,
      totalRemainingSeconds: 0,
      roundIndex: 0,
      stepIndex: 0,
    };

    // Bind event handlers
    this.handleVisibilityChange = this.onVisibilityChange.bind(this);
    this.handlePageHide = this.onPageHide.bind(this);
    this.handleAudioEnded = this.onAudioEnded.bind(this);
    this.handleAudioError = this.onAudioError.bind(this);
  }

  // ─── Public Methods ──────────────────────────────────────────────────

  /**
   * Load the audio track and prepare for playback.
   * Awaits `loadedmetadata` before resolving.
   */
  async load(config: AudioRuntimeConfig): Promise<void> {
    if (this.disposed) return;

    this.objectUrl = config.objectUrl;
    this.timeline = config.timeline;
    this.presetId = config.presetId;
    this.presetSnapshot = config.presetSnapshot;

    // Create audio element
    this.audio = new Audio();
    this.audio.preload = 'auto';
    this.audio.src = config.objectUrl;

    // Attach audio event listeners
    this.audio.addEventListener('ended', this.handleAudioEnded);
    this.audio.addEventListener('error', this.handleAudioError);

    // Wait for metadata to be loaded
    await new Promise<void>((resolve, reject) => {
      if (!this.audio) {
        reject(new Error('Audio element not created'));
        return;
      }
      const onLoaded = () => {
        this.audio?.removeEventListener('loadedmetadata', onLoaded);
        this.audio?.removeEventListener('error', onError);
        resolve();
      };
      const onError = () => {
        this.audio?.removeEventListener('loadedmetadata', onLoaded);
        this.audio?.removeEventListener('error', onError);
        reject(new Error('Failed to load audio metadata'));
      };
      this.audio.addEventListener('loadedmetadata', onLoaded);
      this.audio.addEventListener('error', onError);
    });

    // Register page lifecycle listeners
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    window.addEventListener('pagehide', this.handlePageHide);

    // Media Session: set initial metadata and register action handlers
    setInitialMetadata(config.presetSnapshot.name);
    registerActionHandlers({
      onPlay: () => { this.resume(); },
      onPause: () => { this.pause(); },
    });

    this.updateState({ status: 'ready' });
  }

  /**
   * Start playback. Must be called from a user gesture context.
   */
  async start(): Promise<void> {
    if (this.disposed || !this.audio) return;

    try {
      await this.audio.play();
      this.startedAt = Date.now();
      this.lastPersistTime = Date.now();
      this.updateState({ status: 'playing' });
      this.startRafLoop();
      this.persistState('playing');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Playback failed';
      this.updateState({ status: 'error', error: message });
      this.callbacks.onError(message);
    }
  }

  /**
   * Pause playback and persist state.
   */
  pause(): void {
    if (this.disposed || !this.audio) return;
    if (this.state.status !== 'playing') return;

    this.audio.pause();
    this.stopRafLoop();
    this.updateState({ status: 'paused' });
    this.persistState('paused');
  }

  /**
   * Resume playback. May require user gesture context.
   */
  async resume(): Promise<void> {
    if (this.disposed || !this.audio) return;
    if (this.state.status !== 'paused') return;

    try {
      await this.audio.play();
      this.lastPersistTime = Date.now();
      this.updateState({ status: 'playing' });
      this.startRafLoop();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Resume failed';
      this.updateState({ status: 'error', error: message });
      this.callbacks.onError(message);
    }
  }

  /**
   * Stop playback completely, revoke object URL, clean up.
   */
  stop(): void {
    if (this.disposed || !this.audio) return;

    this.audio.pause();
    this.audio.currentTime = 0;
    this.stopRafLoop();
    this.revokeObjectUrl();
    clearMediaSession();
    this.updateState({ status: 'idle' });
    this.persistState('stopped');
  }

  /**
   * Seek to a specific time. Used for recovery.
   */
  seekTo(seconds: number): void {
    if (this.disposed || !this.audio) return;
    this.audio.currentTime = Math.max(0, Math.min(seconds, this.audio.duration || 0));
    this.deriveAndEmitState();
  }

  /**
   * Get the current derived state.
   */
  getState(): AudioRuntimeState {
    return { ...this.state };
  }

  /**
   * Get current audio time in seconds.
   */
  getCurrentTimeSeconds(): number {
    return this.audio?.currentTime ?? 0;
  }

  /**
   * Full cleanup: remove event listeners, stop RAF, revoke URL.
   */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    this.stopRafLoop();
    clearMediaSession();

    if (this.audio) {
      this.audio.pause();
      this.audio.removeEventListener('ended', this.handleAudioEnded);
      this.audio.removeEventListener('error', this.handleAudioError);
      this.audio.src = '';
      this.audio = null;
    }

    this.revokeObjectUrl();

    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    window.removeEventListener('pagehide', this.handlePageHide);

    this.updateState({ status: 'idle' });
  }

  // ─── Private Methods ─────────────────────────────────────────────────

  private startRafLoop(): void {
    if (this.rafId !== null) return;

    const tick = () => {
      if (this.disposed || this.state.status !== 'playing') return;

      this.deriveAndEmitState();
      this.maybePeriodicPersist();
      this.rafId = requestAnimationFrame(tick);
    };

    this.rafId = requestAnimationFrame(tick);
  }

  private stopRafLoop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private deriveAndEmitState(): void {
    if (!this.audio || !this.timeline) return;

    const currentTime = this.audio.currentTime;
    const totalDuration = this.timeline.totalDurationSeconds;

    // Check for completion
    if (currentTime >= totalDuration) {
      this.handleCompletion();
      return;
    }

    const activeSegment = findActiveSegment(this.timeline.segments, currentTime);
    if (!activeSegment) return;

    const remainingStepSeconds = Math.max(0, activeSegment.endsAtSeconds - currentTime);
    const totalRemainingSeconds = Math.max(0, totalDuration - currentTime);

    const newState: Partial<AudioRuntimeState> = {
      currentTimeSeconds: currentTime,
      activeSegment,
      remainingStepSeconds,
      totalRemainingSeconds,
      roundIndex: activeSegment.roundIndex,
      stepIndex: activeSegment.stepIndex,
    };

    // Only emit if something changed meaningfully
    if (
      this.state.activeSegment?.id !== activeSegment.id ||
      Math.abs(this.state.currentTimeSeconds - currentTime) > 0.05
    ) {
      // Update Media Session metadata on step change
      if (this.state.activeSegment?.id !== activeSegment.id && this.presetSnapshot) {
        updateStepMetadata(activeSegment, this.presetSnapshot.repeatCount);
      }

      this.updateState(newState);
    }
  }

  private handleCompletion(): void {
    this.stopRafLoop();
    const totalDuration = this.timeline?.totalDurationSeconds ?? 0;
    const lastSegment = this.timeline?.segments[this.timeline.segments.length - 1] ?? null;

    this.updateState({
      status: 'complete',
      currentTimeSeconds: totalDuration,
      activeSegment: lastSegment,
      remainingStepSeconds: 0,
      totalRemainingSeconds: 0,
      roundIndex: lastSegment?.roundIndex ?? 0,
      stepIndex: lastSegment?.stepIndex ?? 0,
    });

    this.persistState('complete');
    this.callbacks.onComplete();
  }

  private maybePeriodicPersist(): void {
    const now = Date.now();
    if (now - this.lastPersistTime >= PERSIST_INTERVAL_MS) {
      this.lastPersistTime = now;
      this.persistState('playing');
    }
  }

  private persistState(
    status: AudioWorkoutRuntimeState['status'],
  ): void {
    if (!this.presetId || !this.presetSnapshot) return;

    const audioTime = this.audio?.currentTime ?? 0;

    const runtimeState: AudioWorkoutRuntimeState = {
      mode: 'reliable-audio',
      presetId: this.presetId,
      presetSnapshot: this.presetSnapshot,
      status,
      lastKnownAudioTimeSeconds: audioTime,
      startedAt: this.startedAt,
      updatedAt: Date.now(),
    };

    storageService.saveAudioWorkoutState(runtimeState);
  }

  private updateState(partial: Partial<AudioRuntimeState>): void {
    this.state = { ...this.state, ...partial };
    this.callbacks.onStateChange({ ...this.state });
  }

  private revokeObjectUrl(): void {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
  }

  // ─── Event Handlers ──────────────────────────────────────────────────

  private onVisibilityChange(): void {
    if (document.visibilityState === 'hidden') {
      // Persist before going to background
      if (this.state.status === 'playing') {
        this.persistState('playing');
      }
    } else if (document.visibilityState === 'visible') {
      // Page returned to foreground — resync state from audio.currentTime
      if (this.state.status === 'playing') {
        this.deriveAndEmitState();
        // Restart RAF loop if it was somehow stopped
        if (this.rafId === null) {
          this.startRafLoop();
        }
      }
    }
  }

  private onPageHide(): void {
    if (this.state.status === 'playing' || this.state.status === 'paused') {
      this.persistState(this.state.status);
    }
  }

  private onAudioEnded(): void {
    this.handleCompletion();
  }

  private onAudioError(_e: Event): void {
    const message = 'Audio playback error';
    this.stopRafLoop();
    this.updateState({ status: 'error', error: message });
    this.callbacks.onError(message);
  }
}
