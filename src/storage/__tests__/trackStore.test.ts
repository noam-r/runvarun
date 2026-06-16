import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { trackStore, type TrackMetadata } from '../trackStore';

// Replace global indexedDB with a fresh instance before each test
beforeEach(() => {
  const fakeIDB = new IDBFactory();
  vi.stubGlobal('indexedDB', fakeIDB);
});

function createMetadata(overrides?: Partial<TrackMetadata>): TrackMetadata {
  return {
    presetId: 'preset-1',
    totalDurationSeconds: 300,
    generatedAt: Date.now(),
    timelineHash: 'abc123',
    ...overrides,
  };
}

describe('trackStore', () => {
  it('returns null when no track is stored', async () => {
    const result = await trackStore.loadTrack();
    expect(result).toBeNull();
  });

  it('saves and loads a track with metadata', async () => {
    const blob = new Blob(['audio-data'], { type: 'audio/mpeg' });
    const metadata = createMetadata();

    await trackStore.saveTrack(blob, metadata);
    const result = await trackStore.loadTrack();

    expect(result).not.toBeNull();
    expect(result!.metadata).toEqual(metadata);
    expect(result!.blob).toBeInstanceOf(Blob);
    expect(result!.blob.type).toBe('audio/mpeg');
  });

  it('replaces existing track on subsequent save', async () => {
    const blob1 = new Blob(['first'], { type: 'audio/mpeg' });
    const metadata1 = createMetadata({ presetId: 'preset-1' });

    const blob2 = new Blob(['second'], { type: 'audio/mpeg' });
    const metadata2 = createMetadata({ presetId: 'preset-2', totalDurationSeconds: 600 });

    await trackStore.saveTrack(blob1, metadata1);
    await trackStore.saveTrack(blob2, metadata2);

    const result = await trackStore.loadTrack();
    expect(result).not.toBeNull();
    expect(result!.metadata.presetId).toBe('preset-2');
    expect(result!.metadata.totalDurationSeconds).toBe(600);
  });

  it('clears the stored track', async () => {
    const blob = new Blob(['audio-data'], { type: 'audio/mpeg' });
    const metadata = createMetadata();

    await trackStore.saveTrack(blob, metadata);
    await trackStore.clearTrack();

    const result = await trackStore.loadTrack();
    expect(result).toBeNull();
  });

  it('clearTrack succeeds even when no track exists', async () => {
    // Should not throw
    await trackStore.clearTrack();
    const result = await trackStore.loadTrack();
    expect(result).toBeNull();
  });
});
