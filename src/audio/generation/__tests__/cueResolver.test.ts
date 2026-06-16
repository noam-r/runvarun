import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cueKeyToFilename, resolveAllCues } from '../cueResolver';
import type { CueEvent } from '../types';

// ─── Mock recordingStore ─────────────────────────────────────────────────────

vi.mock('../../recordingStore', () => ({
  recordingStore: {
    get: vi.fn(),
  },
}));

import { recordingStore } from '../../recordingStore';
const mockedRecordingStore = vi.mocked(recordingStore);

// ─── Test helpers ────────────────────────────────────────────────────────────

function makeCueEvent(cueKey: string): CueEvent {
  return {
    id: `test-${cueKey}`,
    type: 'step-start',
    atSeconds: 0,
    cueKey,
    priority: 3,
  };
}

/** Create a minimal mock AudioBuffer */
function createMockAudioBuffer(label = 'test'): AudioBuffer {
  return {
    length: 22050,
    duration: 1.0,
    sampleRate: 22050,
    numberOfChannels: 1,
    getChannelData: () => new Float32Array(22050),
    copyFromChannel: vi.fn(),
    copyToChannel: vi.fn(),
  } as unknown as AudioBuffer;
}

/** Create a mock AudioContext with controllable decodeAudioData */
function createMockAudioContext(decodeResult?: AudioBuffer | null) {
  const buffer = decodeResult ?? createMockAudioBuffer();
  return {
    decodeAudioData: vi.fn().mockResolvedValue(buffer),
    sampleRate: 22050,
  } as unknown as AudioContext;
}

// ─── cueKeyToFilename ────────────────────────────────────────────────────────

describe('cueKeyToFilename', () => {
  it('replaces colon with hyphen for system keys', () => {
    expect(cueKeyToFilename('system:start')).toBe('system-start');
    expect(cueKeyToFilename('system:countdown-3')).toBe('system-countdown-3');
    expect(cueKeyToFilename('system:last-round')).toBe('system-last-round');
  });

  it('replaces colon with hyphen for step-label keys', () => {
    expect(cueKeyToFilename('step-label:run')).toBe('step-label-run');
    expect(cueKeyToFilename('step-label:fast run')).toBe('step-label-fast run');
  });

  it('handles keys with multiple colons', () => {
    expect(cueKeyToFilename('a:b:c')).toBe('a-b-c');
  });
});

// ─── resolveAllCues ──────────────────────────────────────────────────────────

describe('resolveAllCues', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Default: no user recordings
    mockedRecordingStore.get.mockResolvedValue(null);
    // Default: fetch succeeds for built-in cues
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(100)),
    });
  });

  it('returns empty report for empty cue events', async () => {
    const ctx = createMockAudioContext();
    const report = await resolveAllCues([], ctx);
    expect(report.resolved).toEqual([]);
    expect(report.missing).toEqual([]);
  });

  it('resolves a cue key from user recording when available', async () => {
    const mockBlob = new Blob(['audio'], { type: 'audio/mp3' });
    mockedRecordingStore.get.mockResolvedValue({
      blob: mockBlob,
      mimeType: 'audio/mp3',
      recordedAt: '2024-01-01',
    });

    const ctx = createMockAudioContext();
    const events = [makeCueEvent('step-label:run')];
    const report = await resolveAllCues(events, ctx);

    expect(report.resolved).toHaveLength(1);
    expect(report.resolved[0].cueKey).toBe('step-label:run');
    expect(report.resolved[0].source).toBe('user-recorded');
    expect(report.missing).toEqual([]);
  });

  it('falls back to built-in MP3 when no user recording exists', async () => {
    mockedRecordingStore.get.mockResolvedValue(null);

    const ctx = createMockAudioContext();
    const events = [makeCueEvent('system:start')];
    const report = await resolveAllCues(events, ctx);

    expect(report.resolved).toHaveLength(1);
    expect(report.resolved[0].cueKey).toBe('system:start');
    expect(report.resolved[0].source).toBe('built-in');
    expect(global.fetch).toHaveBeenCalledWith('/cues/system-start.mp3');
  });

  it('falls back to default step cue when built-in fetch fails for step-label keys', async () => {
    mockedRecordingStore.get.mockResolvedValue(null);

    // First fetch (built-in for the specific key) fails, second (step-default) succeeds
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false }) // specific built-in fails
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(100)),
      }); // step-default succeeds
    global.fetch = fetchMock;

    const ctx = createMockAudioContext();
    const events = [makeCueEvent('step-label:custom exercise')];
    const report = await resolveAllCues(events, ctx);

    expect(report.resolved).toHaveLength(1);
    expect(report.resolved[0].cueKey).toBe('step-label:custom exercise');
    expect(report.resolved[0].source).toBe('built-in');
    expect(fetchMock).toHaveBeenCalledWith('/cues/step-label-custom exercise.mp3');
    expect(fetchMock).toHaveBeenCalledWith('/cues/step-default.mp3');
  });

  it('does NOT fall back to default step cue for non-step-label keys', async () => {
    mockedRecordingStore.get.mockResolvedValue(null);

    // Built-in fetch fails
    global.fetch = vi.fn().mockResolvedValue({ ok: false });

    const ctx = createMockAudioContext();
    const events = [makeCueEvent('system:start')];
    const report = await resolveAllCues(events, ctx);

    expect(report.resolved).toHaveLength(0);
    expect(report.missing).toEqual(['system:start']);
    // Should only try the specific built-in URL, not step-default
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('reports missing cues when all resolution attempts fail', async () => {
    mockedRecordingStore.get.mockResolvedValue(null);
    global.fetch = vi.fn().mockResolvedValue({ ok: false });

    const ctx = createMockAudioContext();
    const events = [makeCueEvent('step-label:unknown')];
    const report = await resolveAllCues(events, ctx);

    expect(report.resolved).toHaveLength(0);
    expect(report.missing).toEqual(['step-label:unknown']);
  });

  it('deduplicates cue keys — resolves each unique key only once', async () => {
    mockedRecordingStore.get.mockResolvedValue(null);

    const ctx = createMockAudioContext();
    const events = [
      makeCueEvent('step-label:run'),
      makeCueEvent('step-label:run'),
      makeCueEvent('step-label:run'),
    ];
    const report = await resolveAllCues(events, ctx);

    expect(report.resolved).toHaveLength(1);
    expect(report.resolved[0].cueKey).toBe('step-label:run');
    // fetch should only be called once for the single unique key
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('handles mixed resolved and missing cues', async () => {
    mockedRecordingStore.get.mockResolvedValue(null);

    // First fetch succeeds, second fails, third fails (for default too)
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(100)),
      })
      .mockResolvedValue({ ok: false });
    global.fetch = fetchMock;

    const ctx = createMockAudioContext();
    const events = [
      makeCueEvent('system:start'),
      makeCueEvent('step-label:unknown'),
    ];
    const report = await resolveAllCues(events, ctx);

    expect(report.resolved).toHaveLength(1);
    expect(report.resolved[0].cueKey).toBe('system:start');
    expect(report.missing).toEqual(['step-label:unknown']);
  });

  it('treats decode failure as missing', async () => {
    mockedRecordingStore.get.mockResolvedValue(null);

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(100)),
    });

    const ctx = {
      decodeAudioData: vi.fn().mockRejectedValue(new Error('decode failed')),
      sampleRate: 22050,
    } as unknown as AudioContext;

    const events = [makeCueEvent('system:start')];
    const report = await resolveAllCues(events, ctx);

    expect(report.resolved).toHaveLength(0);
    expect(report.missing).toEqual(['system:start']);
  });

  it('user recording takes priority over built-in', async () => {
    const userBuffer = createMockAudioBuffer('user');
    const builtInBuffer = createMockAudioBuffer('builtin');

    const mockBlob = new Blob(['audio'], { type: 'audio/mp3' });
    mockedRecordingStore.get.mockResolvedValue({
      blob: mockBlob,
      mimeType: 'audio/mp3',
      recordedAt: '2024-01-01',
    });

    // Even though fetch would succeed, user recording should take priority
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(100)),
    });

    // decodeAudioData returns user buffer first (for the user recording)
    const ctx = {
      decodeAudioData: vi.fn()
        .mockResolvedValueOnce(userBuffer)
        .mockResolvedValueOnce(builtInBuffer),
      sampleRate: 22050,
    } as unknown as AudioContext;

    const events = [makeCueEvent('step-label:run')];
    const report = await resolveAllCues(events, ctx);

    expect(report.resolved).toHaveLength(1);
    expect(report.resolved[0].source).toBe('user-recorded');
    expect(report.resolved[0].audioBuffer).toBe(userBuffer);
    // fetch should NOT be called because user recording resolved first
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
