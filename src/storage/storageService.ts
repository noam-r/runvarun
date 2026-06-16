/**
 * Storage service: reads/writes the app's localStorage envelope.
 *
 * V2 strategy:
 * - Read: try `runvarun:v2` first; if absent, fall back to `runvarun:v1` and auto-migrate
 * - Write: always write to `runvarun:v2`
 *
 * The migration service handles the actual v1→v2 conversion logic.
 */

import type {
  RunVaRunStorage,
  RunVaRunStorageV2,
  WorkoutPreset,
  ActiveWorkout,
  AppSettings,
  AppSettingsV2,
  AudioWorkoutRuntimeState,
} from '../domain/types';
import { isValidPreset, isValidActiveWorkout } from '../domain/validation';
import { createDefaultStorage, createStarterPresets, DEFAULT_SETTINGS, createDefaultStorageV2, DEFAULT_SETTINGS_V2 } from './defaults';
import { buildV2Envelope } from './migrationService';

const V1_KEY = 'runvarun:v1';
const V2_KEY = 'runvarun:v2';

// ─── V1 read (for fallback) ──────────────────────────────────────────────────

function readV1Envelope(): RunVaRunStorage | null {
  try {
    const raw = localStorage.getItem(V1_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || parsed.schemaVersion !== 1) return null;
    return parsed as RunVaRunStorage;
  } catch {
    return null;
  }
}

// ─── V2 read/write ───────────────────────────────────────────────────────────

function readV2Envelope(): RunVaRunStorageV2 | null {
  try {
    const raw = localStorage.getItem(V2_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || parsed.schemaVersion !== 2) return null;
    return parsed as RunVaRunStorageV2;
  } catch {
    return null;
  }
}

function writeV2Envelope(envelope: RunVaRunStorageV2): void {
  try {
    localStorage.setItem(V2_KEY, JSON.stringify(envelope));
  } catch {
    // Storage full or unavailable — silent fail
  }
}

/**
 * Ensures a valid v2 envelope exists.
 * Priority: v2 > v1 (auto-migrated) > fresh defaults.
 */
function ensureV2Envelope(): RunVaRunStorageV2 {
  // 1. Try v2 first
  const v2 = readV2Envelope();
  if (v2) return v2;

  // 2. Fall back to v1 with auto-migration
  const v1 = readV1Envelope();
  if (v1) {
    const migrated = buildV2Envelope(v1);
    writeV2Envelope(migrated);
    // Remove v1 after successful migration write
    try {
      localStorage.removeItem(V1_KEY);
    } catch {
      // Non-critical — v2 already written
    }
    return migrated;
  }

  // 3. Fresh install — create v2 defaults
  const fresh = createDefaultStorageV2();
  writeV2Envelope(fresh);
  return fresh;
}

// ─── Legacy v1 envelope helpers (kept for backward compat with existing code) ─

function writeV1Envelope(envelope: RunVaRunStorage): void {
  try {
    localStorage.setItem(V1_KEY, JSON.stringify(envelope));
  } catch {
    // Storage full or unavailable — silent fail
  }
}

function ensureV1Envelope(): RunVaRunStorage {
  const existing = readV1Envelope();
  if (existing) return existing;
  const fresh = createDefaultStorage();
  writeV1Envelope(fresh);
  return fresh;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export const storageService = {
  // ─── V2 envelope operations ──────────────────────────────────────────

  loadV2Envelope(): RunVaRunStorageV2 {
    return ensureV2Envelope();
  },

  saveV2Envelope(envelope: RunVaRunStorageV2): void {
    writeV2Envelope(envelope);
  },

  // ─── Audio workout state (v2) ────────────────────────────────────────

  loadAudioWorkoutState(): AudioWorkoutRuntimeState | null {
    const envelope = ensureV2Envelope();
    return envelope.activeAudioWorkout ?? null;
  },

  saveAudioWorkoutState(state: AudioWorkoutRuntimeState | null): void {
    const envelope = ensureV2Envelope();
    envelope.activeAudioWorkout = state;
    writeV2Envelope(envelope);
  },

  // ─── V2 Settings ────────────────────────────────────────────────────

  loadSettingsV2(): AppSettingsV2 {
    const envelope = ensureV2Envelope();
    const stored = envelope.settings;
    if (stored && typeof stored === 'object') {
      return { ...DEFAULT_SETTINGS_V2, ...stored } as AppSettingsV2;
    }
    return DEFAULT_SETTINGS_V2;
  },

  saveSettingsV2(settings: AppSettingsV2): void {
    const envelope = ensureV2Envelope();
    envelope.settings = settings;
    writeV2Envelope(envelope);
  },

  // ─── Legacy v1 envelope (kept for backward compatibility) ────────────

  loadEnvelope(): RunVaRunStorage {
    return ensureV1Envelope();
  },

  saveEnvelope(envelope: RunVaRunStorage): void {
    writeV1Envelope(envelope);
  },

  // ─── Presets (reads from v2, writes to v2) ───────────────────────────

  loadPresets(): WorkoutPreset[] {
    const envelope = ensureV2Envelope();
    const valid = (envelope.presets ?? []).filter(isValidPreset);
    if (valid.length === 0) {
      const starters = createStarterPresets();
      envelope.presets = starters;
      envelope.lastUsedPresetId = starters[0].id;
      writeV2Envelope(envelope);
      return starters;
    }
    return valid;
  },

  savePresets(presets: WorkoutPreset[]): void {
    const envelope = ensureV2Envelope();
    envelope.presets = presets;
    writeV2Envelope(envelope);
  },

  loadLastUsedPresetId(): string | null {
    const envelope = ensureV2Envelope();
    return envelope.lastUsedPresetId;
  },

  saveLastUsedPresetId(id: string | null): void {
    const envelope = ensureV2Envelope();
    envelope.lastUsedPresetId = id;
    writeV2Envelope(envelope);
  },

  // ─── Settings (v1 compat — reads from v2, maps to AppSettings) ──────

  loadSettings(): AppSettings {
    const envelope = ensureV2Envelope();
    const stored = envelope.settings;
    if (stored && typeof stored === 'object') {
      // Map v2 settings back to v1 AppSettings shape for legacy consumers
      return {
        ...DEFAULT_SETTINGS,
        voiceCuesEnabled: stored.voiceCuesEnabled ?? DEFAULT_SETTINGS.voiceCuesEnabled,
        beepCuesEnabled: stored.beepCuesEnabled ?? DEFAULT_SETTINGS.beepCuesEnabled,
        vibrationEnabled: stored.vibrationEnabled ?? DEFAULT_SETTINGS.vibrationEnabled,
        countdownCue: stored.countdownCue === 'last-3-seconds' ? 'last3seconds' : 'off',
        finalRoundCueEnabled: stored.finalRoundCueEnabled ?? DEFAULT_SETTINGS.finalRoundCueEnabled,
        completionCueEnabled: stored.completionCueEnabled ?? DEFAULT_SETTINGS.completionCueEnabled,
        keepScreenAwake: stored.keepScreenAwake ?? DEFAULT_SETTINGS.keepScreenAwake,
        voiceLanguage: stored.voiceLanguage ?? DEFAULT_SETTINGS.voiceLanguage,
        uiLanguage: stored.uiLanguage ?? DEFAULT_SETTINGS.uiLanguage,
      };
    }
    return DEFAULT_SETTINGS;
  },

  saveSettings(settings: AppSettings): void {
    const envelope = ensureV2Envelope();
    // Map v1 AppSettings to v2 shape, preserving v2-only fields
    envelope.settings = {
      ...envelope.settings,
      vibrationEnabled: settings.vibrationEnabled,
      keepScreenAwake: settings.keepScreenAwake,
      uiLanguage: settings.uiLanguage,
      voiceCuesEnabled: settings.voiceCuesEnabled,
      beepCuesEnabled: settings.beepCuesEnabled,
      voiceLanguage: settings.voiceLanguage,
      countdownCue: settings.countdownCue === 'last3seconds' ? 'last-3-seconds' : 'off',
      finalRoundCueEnabled: settings.finalRoundCueEnabled,
      completionCueEnabled: settings.completionCueEnabled,
    };
    writeV2Envelope(envelope);
  },

  // ─── Active workout (v1 legacy — kept for screen-on-timer mode) ─────

  loadActiveWorkout(): ActiveWorkout | null {
    // Active workout is a v1 concept (screen-on-timer mode).
    // Read from v1 if it still exists, otherwise return null.
    const v1 = readV1Envelope();
    if (v1 && v1.activeWorkout && isValidActiveWorkout(v1.activeWorkout)) {
      return v1.activeWorkout;
    }
    return null;
  },

  saveActiveWorkout(workout: ActiveWorkout | null): void {
    // Legacy active workout is stored in v1 for screen-on-timer mode
    const v1 = readV1Envelope() ?? ensureV1Envelope();
    v1.activeWorkout = workout;
    writeV1Envelope(v1);
  },

  clearActiveWorkout(): void {
    const v1 = readV1Envelope();
    if (v1) {
      v1.activeWorkout = null;
      writeV1Envelope(v1);
    }
  },

  // ─── Utilities ───────────────────────────────────────────────────────

  createStarterPresets(): WorkoutPreset[] {
    return createStarterPresets();
  },

  resetAll(): void {
    const fresh = createDefaultStorageV2();
    writeV2Envelope(fresh);
    try {
      localStorage.removeItem(V1_KEY);
    } catch {
      // Non-critical
    }
  },
};
