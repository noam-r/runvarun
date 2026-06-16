/**
 * Migration service: v1 → v2 schema migration.
 *
 * Reads `runvarun:v1` localStorage envelope, transforms settings to AppSettingsV2
 * with audio runtime defaults, writes `runvarun:v2`, and re-keys IndexedDB recordings
 * from legacy format to the new cue key format.
 *
 * Graceful failure: preserves original v1 data on error, logs but never throws.
 */

import type { RunVaRunStorage, RunVaRunStorageV2, AppSettingsV2 } from '../domain/types';
import { normalizeCueKey } from '../audio/generation/cueKeyNormalization';

const V1_KEY = 'runvarun:v1';
const V2_KEY = 'runvarun:v2';

const DB_NAME = 'runvarun-recordings';
const DB_VERSION = 1;
const STORE_NAME = 'recordings';

// ─── Legacy key mappings ─────────────────────────────────────────────────────

/** Maps old system cue keys to new normalized keys. */
const SYSTEM_KEY_MAP: Record<string, string> = {
  'system:last_round': 'system:last-round',
  'system:workout_complete': 'system:complete',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

function writeV2Envelope(envelope: RunVaRunStorageV2): void {
  localStorage.setItem(V2_KEY, JSON.stringify(envelope));
}

function transformSettings(v1: RunVaRunStorage): AppSettingsV2 {
  const s = v1.settings;
  return {
    // Preserved from v1
    vibrationEnabled: s.vibrationEnabled,
    keepScreenAwake: s.keepScreenAwake,
    uiLanguage: s.uiLanguage,

    // New audio runtime defaults
    runtimeMode: 'reliable-audio',
    countdownCue: 'last-3-seconds',
    finalRoundCueEnabled: true,
    completionCueEnabled: true,
    workoutStartCueEnabled: true,
    pacerEnabled: true,

    // Legacy (kept for screen-on-timer mode)
    voiceCuesEnabled: s.voiceCuesEnabled,
    beepCuesEnabled: s.beepCuesEnabled,
    voiceLanguage: s.voiceLanguage,
  };
}

function buildV2Envelope(v1: RunVaRunStorage): RunVaRunStorageV2 {
  return {
    schemaVersion: 2,
    presets: v1.presets,
    lastUsedPresetId: v1.lastUsedPresetId,
    settings: transformSettings(v1),
    activeAudioWorkout: null,
  };
}

// ─── IndexedDB re-keying ─────────────────────────────────────────────────────

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Converts a legacy recording key to the new format.
 * - `step:{label}` → `step-label:{normalizeCueKey(label)}` (just the normalized part)
 * - `system:last_round` → `system:last-round`
 * - `system:workout_complete` → `system:complete`
 * Returns null if the key does not need migration.
 */
function migrateKey(oldKey: string): string | null {
  // System key remapping
  if (SYSTEM_KEY_MAP[oldKey]) {
    return SYSTEM_KEY_MAP[oldKey];
  }

  // Step key remapping: `step:{label}` → `step-label:{normalized}`
  if (oldKey.startsWith('step:')) {
    const label = oldKey.slice('step:'.length);
    return normalizeCueKey(label);
  }

  // Already in new format or unknown — no migration needed
  return null;
}

/**
 * Re-keys all IndexedDB recordings from legacy format to new cue key format.
 * Does not delete blobs — writes under new key, then removes old key only on success.
 */
async function migrateRecordingKeys(): Promise<void> {
  let db: IDBDatabase;
  try {
    db = await openDb();
  } catch {
    // IndexedDB unavailable (e.g., private browsing) — skip silently
    return;
  }

  try {
    // Get all existing keys
    const allKeys: string[] = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).getAllKeys();
      request.onsuccess = () => resolve(request.result as string[]);
      request.onerror = () => reject(request.error);
    });

    // Identify keys that need migration
    const migrations: { oldKey: string; newKey: string }[] = [];
    for (const oldKey of allKeys) {
      const newKey = migrateKey(oldKey);
      if (newKey && newKey !== oldKey) {
        migrations.push({ oldKey, newKey });
      }
    }

    if (migrations.length === 0) {
      db.close();
      return;
    }

    // Migrate each key: read value, write under new key, delete old key
    for (const { oldKey, newKey } of migrations) {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);

        const getReq = store.get(oldKey);
        getReq.onsuccess = () => {
          const value = getReq.result;
          if (value == null) {
            // Nothing to migrate for this key
            resolve();
            return;
          }
          // Write under new key
          store.put(value, newKey);
          // Remove old key
          store.delete(oldKey);
        };
        getReq.onerror = () => reject(getReq.error);

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    }

    db.close();
  } catch (err) {
    db.close();
    throw err;
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Migrates storage from schema v1 to v2.
 *
 * - Reads `runvarun:v1` from localStorage
 * - Adds v2 default fields (runtimeMode, pacerEnabled, audio settings)
 * - Writes `runvarun:v2` to localStorage
 * - Re-keys IndexedDB recordings to new cue key format
 * - Preserves original v1 data on failure
 *
 * Safe to call multiple times — no-ops if v1 data doesn't exist or v2 already exists.
 * Never throws; logs errors to console.
 */
export async function migrateV1toV2(): Promise<void> {
  try {
    // If v2 already exists, skip migration
    const existingV2 = localStorage.getItem(V2_KEY);
    if (existingV2) return;

    // Read v1 envelope
    const v1 = readV1Envelope();
    if (!v1) return;

    // Build and write v2 envelope
    const v2 = buildV2Envelope(v1);
    writeV2Envelope(v2);

    // Re-key IndexedDB recordings
    await migrateRecordingKeys();

    // Migration successful — remove v1 key
    localStorage.removeItem(V1_KEY);
  } catch (err) {
    // Preserve original v1 data — do not delete it
    console.error('[migrationService] v1→v2 migration failed:', err);
  }
}

// Exported for testing
export { migrateKey, transformSettings, buildV2Envelope, migrateRecordingKeys };
