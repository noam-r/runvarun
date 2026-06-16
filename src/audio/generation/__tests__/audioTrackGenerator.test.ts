/**
 * Unit tests for the audioTrackGenerator orchestrator.
 *
 * These tests validate core orchestration logic: duration validation,
 * abort handling, progress reporting, and pacer layer rendering.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { WorkoutPreset } from '../../../domain/types';
import type { GenerationProgress } from '../types';

// We test the exported function indirectly via the module
// but need to mock dependencies since we don't have a real browser environment
vi.mock('../timelineGenerator', () => ({
  generateTimeline: vi.fn(() => ({
    segments: [
      {
        id: 'seg_r0_s0',
        roundIndex: 0,
        stepIndex: 0,
        stepLabel: 'Run',
        startsAtSeconds: 0,
        endsAtSeconds: 30,
        durationSeconds: 30,
      },
    ],
    totalDurationSeconds: 30,
  })),
}));

vi.mock('../cueEventPlanner', () => ({
  planCueEvents: vi.fn(() => [
    {
      id: 'cue_step-start_0',
      type: 'step-start',
      atSeconds: 0,
      cueKey: 'step-label:run',
      priority: 3,
      stepLabel: 'Run',
      roundIndex: 0,
      stepIndex: 0,
    },
  ]),
}));

vi.mock('../cueResolver', () => ({
  resolveAllCues: vi.fn(() =>
    Promise.resolve({
      resolved: [],
      missing: ['step-label:run'],
    }),
  ),
}));

vi.mock('../mp3Encoder', () => ({
  encodeMp3: vi.fn(() => Promise.resolve(new Blob(['fake-mp3'], { type: 'audio/mpeg' }))),
}));

// Mock Web Audio APIs
const mockStartRendering = vi.fn();
const mockCreateBufferSource = vi.fn(() => ({
  buffer: null,
  connect: vi.fn(),
  start: vi.fn(),
}));

class MockOfflineAudioContext {
  destination = {};
  createBufferSource = mockCreateBufferSource;
  startRendering = mockStartRendering.mockResolvedValue({
    getChannelData: () => new Float32Array(30 * 22050),
  });
}

vi.stubGlobal('OfflineAudioContext', MockOfflineAudioContext);

// Mock URL.createObjectURL (keeping the URL constructor intact)
const originalURL = globalThis.URL;
vi.stubGlobal('URL', class extends originalURL {
  static createObjectURL = vi.fn(() => 'blob:mock-url');
  static revokeObjectURL = vi.fn();
});

describe('generateAudioTrack', () => {
  let generateAudioTrack: typeof import('../audioTrackGenerator').generateAudioTrack;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../audioTrackGenerator');
    generateAudioTrack = mod.generateAudioTrack;
  });

  const makePreset = (overrides: Partial<WorkoutPreset> = {}): WorkoutPreset => ({
    id: 'preset-1',
    name: 'Test Workout',
    repeatCount: 1,
    steps: [
      { id: 'step-1', label: 'Run', durationSeconds: 30 },
    ],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  });

  const defaultSettings = {
    workoutStartEnabled: true,
    countdownEnabled: true,
    finalRoundEnabled: true,
    completionEnabled: true,
  };

  it('rejects workouts exceeding 60 minutes', async () => {
    const longPreset = makePreset({
      repeatCount: 10,
      steps: [{ id: 's1', label: 'Run', durationSeconds: 400 }], // 10 * 400 = 4000s > 3600
    });

    await expect(
      generateAudioTrack(longPreset, defaultSettings, { pacerEnabled: true }),
    ).rejects.toThrow('too long for audio generation');
  });

  it('rejects exactly at the boundary (3601s)', async () => {
    const longPreset = makePreset({
      repeatCount: 1,
      steps: [{ id: 's1', label: 'Run', durationSeconds: 3601 }],
    });

    await expect(
      generateAudioTrack(longPreset, defaultSettings, { pacerEnabled: true }),
    ).rejects.toThrow('too long for audio generation');
  });

  it('allows workouts of exactly 60 minutes (3600s)', async () => {
    const preset = makePreset({
      repeatCount: 1,
      steps: [{ id: 's1', label: 'Run', durationSeconds: 3600 }],
    });

    // This should NOT throw for duration validation
    // (it will use mocked pipeline internals)
    const result = await generateAudioTrack(preset, defaultSettings, { pacerEnabled: true });
    expect(result).toBeDefined();
    expect(result.blob).toBeInstanceOf(Blob);
  });

  it('throws AbortError when signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      generateAudioTrack(makePreset(), defaultSettings, {
        pacerEnabled: true,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('reports progress through all phases', async () => {
    const progressUpdates: GenerationProgress[] = [];
    const onProgress = (p: GenerationProgress) => progressUpdates.push({ ...p });

    await generateAudioTrack(makePreset(), defaultSettings, {
      pacerEnabled: true,
      onProgress,
    });

    const phases = progressUpdates.map((p) => p.phase);
    expect(phases).toContain('resolving-cues');
    expect(phases).toContain('rendering');
    expect(phases).toContain('encoding');
    expect(phases).toContain('storing');
    expect(phases).toContain('ready');
  });

  it('returns GenerationResult with expected shape', async () => {
    const result = await generateAudioTrack(makePreset(), defaultSettings, {
      pacerEnabled: true,
    });

    expect(result).toHaveProperty('blob');
    expect(result).toHaveProperty('objectUrl', 'blob:mock-url');
    expect(result).toHaveProperty('timeline');
    expect(result).toHaveProperty('totalDurationSeconds');
    expect(result).toHaveProperty('missingCues');
    expect(result.missingCues).toEqual(['step-label:run']);
  });

  it('returns the timeline from the generation pipeline', async () => {
    const result = await generateAudioTrack(makePreset(), defaultSettings, {
      pacerEnabled: true,
    });

    expect(result.timeline.segments).toHaveLength(1);
    expect(result.timeline.segments[0].stepLabel).toBe('Run');
    expect(result.timeline.totalDurationSeconds).toBe(30);
  });

  it('works with pacerEnabled false', async () => {
    const result = await generateAudioTrack(makePreset(), defaultSettings, {
      pacerEnabled: false,
    });

    expect(result).toBeDefined();
    expect(result.blob).toBeInstanceOf(Blob);
  });

  it('works without onProgress callback', async () => {
    const result = await generateAudioTrack(makePreset(), defaultSettings, {
      pacerEnabled: true,
    });

    expect(result).toBeDefined();
  });
});
