/**
 * IndexedDB store for the generated audio track blob.
 * Only one track is stored at a time (the current workout's generated audio).
 * Database: `runvarun-tracks`, object store: `tracks`, key: `'current'`
 */

const DB_NAME = 'runvarun-tracks';
const DB_VERSION = 1;
const STORE_NAME = 'tracks';
const TRACK_KEY = 'current';

export type TrackMetadata = {
  presetId: string;
  totalDurationSeconds: number;
  generatedAt: number;
  timelineHash: string;
};

type TrackRecord = {
  blob: Blob;
  metadata: TrackMetadata;
};

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

export const trackStore = {
  async saveTrack(blob: Blob, metadata: TrackMetadata): Promise<void> {
    const db = await openDb();
    const record: TrackRecord = { blob, metadata };
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(record, TRACK_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  async loadTrack(): Promise<{ blob: Blob; metadata: TrackMetadata } | null> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).get(TRACK_KEY);
      request.onsuccess = () => {
        const record = request.result as TrackRecord | undefined;
        resolve(record ?? null);
      };
      request.onerror = () => reject(request.error);
    });
  },

  async clearTrack(): Promise<void> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(TRACK_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },
};
