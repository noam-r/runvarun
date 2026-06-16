/**
 * IndexedDB store for custom voice recordings.
 * Each recording is keyed by a cue identifier (e.g. "step-label:run", "system:last-round").
 *
 * Version 2: bumped to trigger onupgradeneeded after the migration service
 * (which opens at version 1) has re-keyed legacy entries. No schema change —
 * the object store shape is identical.
 */

const DB_NAME = 'runvarun-recordings';
const DB_VERSION = 2;
const STORE_NAME = 'recordings';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = request.result;
      const oldVersion = event.oldVersion;

      if (oldVersion < 1) {
        // Fresh install — create the recordings object store
        db.createObjectStore(STORE_NAME);
      }
      // Version 1 → 2: object store already exists, no schema change needed.
      // The actual re-keying of legacy entries is handled by migrationService.
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export type RecordingEntry = {
  blob: Blob;
  mimeType: string;
  recordedAt: string;
};

export const recordingStore = {
  async save(key: string, blob: Blob): Promise<void> {
    const db = await openDb();
    const entry: RecordingEntry = {
      blob,
      mimeType: blob.type,
      recordedAt: new Date().toISOString(),
    };
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(entry, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  async get(key: string): Promise<RecordingEntry | null> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).get(key);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    });
  },

  async delete(key: string): Promise<void> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  async listKeys(): Promise<string[]> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).getAllKeys();
      request.onsuccess = () => resolve(request.result as string[]);
      request.onerror = () => reject(request.error);
    });
  },

  async has(key: string): Promise<boolean> {
    const entry = await this.get(key);
    return entry !== null;
  },

  /** Play a recorded cue. Returns true if playback succeeded. */
  async play(key: string): Promise<boolean> {
    // Try preload cache first for instant playback
    const cachedUrl = this.preloadCache.get(key);
    if (cachedUrl) {
      return this.playUrl(cachedUrl);
    }

    const entry = await this.get(key);
    if (!entry) return false;

    const url = URL.createObjectURL(entry.blob);
    const result = await this.playUrl(url);
    URL.revokeObjectURL(url);
    return result;
  },

  playUrl(url: string): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        const audio = new Audio(url);
        audio.onended = () => resolve(true);
        audio.onerror = () => resolve(false);
        audio.play().catch(() => resolve(false));
      } catch {
        resolve(false);
      }
    });
  },

  /**
   * Preload recordings into memory for instant playback during a workout.
   * Call before starting a workout with the relevant cue keys.
   */
  preloadCache: new Map<string, string>(),

  async preload(keys: string[]): Promise<void> {
    for (const key of keys) {
      const entry = await this.get(key);
      if (entry) {
        const existing = this.preloadCache.get(key);
        if (existing) URL.revokeObjectURL(existing);
        this.preloadCache.set(key, URL.createObjectURL(entry.blob));
      }
    }
  },

  releasePreloadCache(): void {
    for (const url of this.preloadCache.values()) {
      URL.revokeObjectURL(url);
    }
    this.preloadCache.clear();
  },

  async clearAll(): Promise<void> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },
};

/** Build a cue key for a step announcement (uses normalizeCueKey). */
export { normalizeCueKey as stepCueKey } from './generation/cueKeyNormalization';

/** System cue keys (re-exported from cueKeyNormalization). */
export {
  SYSTEM_CUE_LAST_ROUND,
  SYSTEM_CUE_COMPLETE,
  SYSTEM_CUE_START,
} from './generation/cueKeyNormalization';

/** Legacy-compatible system cue keys object for backward compatibility. */
export const SYSTEM_CUE_KEYS = {
  lastRound: 'system:last-round',
  workoutComplete: 'system:complete',
} as const;
