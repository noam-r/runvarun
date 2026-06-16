import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import type { RunVaRunStorage, RunVaRunStorageV2 } from '../../domain/types';

// ─── localStorage polyfill for Node test environment ─────────────────────────

class MockLocalStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null { return this.store.get(key) ?? null; }
  setItem(key: string, value: string): void { this.store.set(key, value); }
  removeItem(key: string): void { this.store.delete(key); }
  clear(): void { this.store.clear(); }
  get length(): number { return this.store.size; }
  key(index: number): string | null {
    const keys = [...this.store.keys()];
    return keys[index] ?? null;
  }
}

const mockStorage = new MockLocalStorage();
Object.defineProperty(globalThis, 'localStorage', { value: mockStorage, writable: true });

// Reset indexedDB and localStorage between tests
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  mockStorage.clear();
});

afterEach(() => {
  mockStorage.clear();
  vi.restoreAllMocks();
});

// Dynamic import to get a fresh module per test
async function importMigration() {
  // Clear module cache to get fresh import
  const mod = await import('../migrationService');
  return mod;
}

function createV1Storage(overrides: Partial<RunVaRunStorage> = {}): RunVaRunStorage {
  return {
    schemaVersion: 1,
    presets: [
      {
        id: 'preset_1',
        name: 'Test Workout',
        repeatCount: 3,
        steps: [
          { id: 'step_1', label: 'Run', durationSeconds: 60 },
          { id: 'step_2', label: 'Walk', durationSeconds: 30 },
        ],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      },
    ],
    lastUsedPresetId: 'preset_1',
    activeWorkout: null,
    settings: {
      voiceCuesEnabled: true,
      beepCuesEnabled: false,
      vibrationEnabled: true,
      countdownCue: 'last3seconds',
      finalRoundCueEnabled: false,
      completionCueEnabled: true,
      keepScreenAwake: false,
      voiceLanguage: 'he',
      uiLanguage: 'he',
    },
    ...overrides,
  };
}

function seedV1(overrides: Partial<RunVaRunStorage> = {}): void {
  localStorage.setItem('runvarun:v1', JSON.stringify(createV1Storage(overrides)));
}

// Helper: seed IndexedDB with old-format recording keys
async function seedRecording(key: string, blobContent: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('runvarun-recordings', 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('recordings')) {
        db.createObjectStore('recordings');
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('recordings', 'readwrite');
      tx.objectStore('recordings').put(
        { blob: new Blob([blobContent]), mimeType: 'audio/webm', recordedAt: '2024-01-01T00:00:00Z' },
        key,
      );
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
    request.onerror = () => reject(request.error);
  });
}

// Helper: get all keys from IndexedDB
async function getAllRecordingKeys(): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('runvarun-recordings', 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('recordings')) {
        db.createObjectStore('recordings');
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('recordings', 'readonly');
      const getKeys = tx.objectStore('recordings').getAllKeys();
      getKeys.onsuccess = () => {
        db.close();
        resolve(getKeys.result as string[]);
      };
      getKeys.onerror = () => reject(getKeys.error);
    };
    request.onerror = () => reject(request.error);
  });
}

describe('migrationService', () => {
  describe('migrateV1toV2', () => {
    it('no-ops when no v1 data exists', async () => {
      const { migrateV1toV2 } = await importMigration();
      await migrateV1toV2();
      expect(localStorage.getItem('runvarun:v2')).toBeNull();
    });

    it('no-ops when v2 already exists', async () => {
      seedV1();
      localStorage.setItem('runvarun:v2', JSON.stringify({ schemaVersion: 2 }));
      const { migrateV1toV2 } = await importMigration();
      await migrateV1toV2();
      // v2 should not be overwritten
      const v2 = JSON.parse(localStorage.getItem('runvarun:v2')!);
      expect(v2.presets).toBeUndefined(); // Still the original sparse v2
    });

    it('migrates v1 to v2 with correct settings defaults', async () => {
      seedV1();
      const { migrateV1toV2 } = await importMigration();
      await migrateV1toV2();

      const raw = localStorage.getItem('runvarun:v2');
      expect(raw).not.toBeNull();
      const v2: RunVaRunStorageV2 = JSON.parse(raw!);

      expect(v2.schemaVersion).toBe(2);
      expect(v2.settings.runtimeMode).toBe('reliable-audio');
      expect(v2.settings.pacerEnabled).toBe(true);
      expect(v2.settings.countdownCue).toBe('last-3-seconds');
      expect(v2.settings.finalRoundCueEnabled).toBe(true);
      expect(v2.settings.completionCueEnabled).toBe(true);
      expect(v2.settings.workoutStartCueEnabled).toBe(true);
    });

    it('preserves existing v1 settings that carry over', async () => {
      seedV1();
      const { migrateV1toV2 } = await importMigration();
      await migrateV1toV2();

      const v2: RunVaRunStorageV2 = JSON.parse(localStorage.getItem('runvarun:v2')!);
      expect(v2.settings.vibrationEnabled).toBe(true);
      expect(v2.settings.keepScreenAwake).toBe(false);
      expect(v2.settings.uiLanguage).toBe('he');
      expect(v2.settings.voiceCuesEnabled).toBe(true);
      expect(v2.settings.beepCuesEnabled).toBe(false);
      expect(v2.settings.voiceLanguage).toBe('he');
    });

    it('preserves all presets unchanged', async () => {
      seedV1();
      const { migrateV1toV2 } = await importMigration();
      await migrateV1toV2();

      const v2: RunVaRunStorageV2 = JSON.parse(localStorage.getItem('runvarun:v2')!);
      expect(v2.presets).toHaveLength(1);
      expect(v2.presets[0].id).toBe('preset_1');
      expect(v2.presets[0].name).toBe('Test Workout');
      expect(v2.presets[0].steps[0].label).toBe('Run');
      expect(v2.presets[0].steps[1].label).toBe('Walk');
    });

    it('preserves lastUsedPresetId', async () => {
      seedV1();
      const { migrateV1toV2 } = await importMigration();
      await migrateV1toV2();

      const v2: RunVaRunStorageV2 = JSON.parse(localStorage.getItem('runvarun:v2')!);
      expect(v2.lastUsedPresetId).toBe('preset_1');
    });

    it('sets activeAudioWorkout to null', async () => {
      seedV1();
      const { migrateV1toV2 } = await importMigration();
      await migrateV1toV2();

      const v2: RunVaRunStorageV2 = JSON.parse(localStorage.getItem('runvarun:v2')!);
      expect(v2.activeAudioWorkout).toBeNull();
    });

    it('removes v1 key after successful migration', async () => {
      seedV1();
      const { migrateV1toV2 } = await importMigration();
      await migrateV1toV2();

      expect(localStorage.getItem('runvarun:v1')).toBeNull();
    });

    it('preserves v1 data on failure and logs error', async () => {
      seedV1();
      // Sabotage localStorage.setItem to fail on v2 write
      const originalSetItem = localStorage.setItem.bind(localStorage);
      let callCount = 0;
      vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => {
        if (key === 'runvarun:v2') {
          callCount++;
          throw new Error('QuotaExceededError');
        }
        originalSetItem(key, value);
      });
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const { migrateV1toV2 } = await importMigration();
      await migrateV1toV2();

      // v1 data should still be there
      expect(localStorage.getItem('runvarun:v1')).not.toBeNull();
      expect(consoleSpy).toHaveBeenCalled();
    });
  });

  describe('migrateKey', () => {
    it('maps step:{label} to step-label:{normalized}', async () => {
      const { migrateKey } = await importMigration();
      expect(migrateKey('step:Run')).toBe('step-label:run');
      expect(migrateKey('step:Fast Walk')).toBe('step-label:fast walk');
      expect(migrateKey('step:  SPRINT  ')).toBe('step-label:sprint');
    });

    it('maps system:last_round to system:last-round', async () => {
      const { migrateKey } = await importMigration();
      expect(migrateKey('system:last_round')).toBe('system:last-round');
    });

    it('maps system:workout_complete to system:complete', async () => {
      const { migrateKey } = await importMigration();
      expect(migrateKey('system:workout_complete')).toBe('system:complete');
    });

    it('returns null for keys that do not need migration', async () => {
      const { migrateKey } = await importMigration();
      expect(migrateKey('step-label:run')).toBeNull();
      expect(migrateKey('system:start')).toBeNull();
      expect(migrateKey('system:last-round')).toBeNull();
    });
  });

  describe('IndexedDB recording key migration', () => {
    it('re-keys step recordings', async () => {
      seedV1();
      await seedRecording('step:Run', 'audio-data-run');
      await seedRecording('step:Walk', 'audio-data-walk');

      const { migrateV1toV2 } = await importMigration();
      await migrateV1toV2();

      const keys = await getAllRecordingKeys();
      expect(keys).toContain('step-label:run');
      expect(keys).toContain('step-label:walk');
      expect(keys).not.toContain('step:Run');
      expect(keys).not.toContain('step:Walk');
    });

    it('re-keys system recording keys', async () => {
      seedV1();
      await seedRecording('system:last_round', 'audio-last-round');
      await seedRecording('system:workout_complete', 'audio-complete');

      const { migrateV1toV2 } = await importMigration();
      await migrateV1toV2();

      const keys = await getAllRecordingKeys();
      expect(keys).toContain('system:last-round');
      expect(keys).toContain('system:complete');
      expect(keys).not.toContain('system:last_round');
      expect(keys).not.toContain('system:workout_complete');
    });

    it('preserves recording count (no data loss)', async () => {
      seedV1();
      await seedRecording('step:Run', 'audio-run');
      await seedRecording('step:Walk', 'audio-walk');
      await seedRecording('system:last_round', 'audio-last-round');

      const { migrateV1toV2 } = await importMigration();
      await migrateV1toV2();

      const keys = await getAllRecordingKeys();
      expect(keys).toHaveLength(3);
    });

    it('leaves already-migrated keys untouched', async () => {
      seedV1();
      await seedRecording('step-label:run', 'already-migrated');

      const { migrateV1toV2 } = await importMigration();
      await migrateV1toV2();

      const keys = await getAllRecordingKeys();
      expect(keys).toContain('step-label:run');
      expect(keys).toHaveLength(1);
    });
  });
});
