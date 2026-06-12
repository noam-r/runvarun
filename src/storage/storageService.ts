import type { RunVaRunStorage, WorkoutPreset, ActiveWorkout, AppSettings } from '../domain/types';
import { isValidPreset, isValidActiveWorkout } from '../domain/validation';
import { createDefaultStorage, createStarterPresets, DEFAULT_SETTINGS } from './defaults';

const STORAGE_KEY = 'runvarun:v1';

function readRawEnvelope(): RunVaRunStorage | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || parsed.schemaVersion !== 1) return null;
    return parsed as RunVaRunStorage;
  } catch {
    return null;
  }
}

function writeEnvelope(envelope: RunVaRunStorage): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
  } catch {
    // Storage full or unavailable — silent fail
  }
}

function ensureEnvelope(): RunVaRunStorage {
  const existing = readRawEnvelope();
  if (existing) return existing;
  const fresh = createDefaultStorage();
  writeEnvelope(fresh);
  return fresh;
}

export const storageService = {
  loadEnvelope(): RunVaRunStorage {
    return ensureEnvelope();
  },

  saveEnvelope(envelope: RunVaRunStorage): void {
    writeEnvelope(envelope);
  },

  loadPresets(): WorkoutPreset[] {
    const envelope = ensureEnvelope();
    // Filter to only valid presets
    const valid = (envelope.presets ?? []).filter(isValidPreset);
    if (valid.length === 0) {
      // No valid presets — create starters
      const starters = createStarterPresets();
      envelope.presets = starters;
      envelope.lastUsedPresetId = starters[0].id;
      writeEnvelope(envelope);
      return starters;
    }
    return valid;
  },

  savePresets(presets: WorkoutPreset[]): void {
    const envelope = ensureEnvelope();
    envelope.presets = presets;
    writeEnvelope(envelope);
  },

  loadLastUsedPresetId(): string | null {
    const envelope = ensureEnvelope();
    return envelope.lastUsedPresetId;
  },

  saveLastUsedPresetId(id: string | null): void {
    const envelope = ensureEnvelope();
    envelope.lastUsedPresetId = id;
    writeEnvelope(envelope);
  },

  loadSettings(): AppSettings {
    const envelope = ensureEnvelope();
    const stored = envelope.settings;
    if (stored && typeof stored === 'object') {
      // Merge with defaults to handle missing fields after schema additions
      return { ...DEFAULT_SETTINGS, ...stored } as AppSettings;
    }
    return DEFAULT_SETTINGS;
  },

  saveSettings(settings: AppSettings): void {
    const envelope = ensureEnvelope();
    envelope.settings = settings;
    writeEnvelope(envelope);
  },

  loadActiveWorkout(): ActiveWorkout | null {
    const envelope = ensureEnvelope();
    if (envelope.activeWorkout && isValidActiveWorkout(envelope.activeWorkout)) {
      return envelope.activeWorkout;
    }
    return null;
  },

  saveActiveWorkout(workout: ActiveWorkout | null): void {
    const envelope = ensureEnvelope();
    envelope.activeWorkout = workout;
    writeEnvelope(envelope);
  },

  clearActiveWorkout(): void {
    const envelope = ensureEnvelope();
    envelope.activeWorkout = null;
    writeEnvelope(envelope);
  },

  createStarterPresets(): WorkoutPreset[] {
    return createStarterPresets();
  },

  resetAll(): void {
    const fresh = createDefaultStorage();
    writeEnvelope(fresh);
  },
};
