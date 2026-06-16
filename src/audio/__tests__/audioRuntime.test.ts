import { describe, it, expect } from 'vitest';
import { findActiveSegment } from '../audioRuntime';
import type { TimelineSegment } from '../generation/types';

// ─── Test Data ───────────────────────────────────────────────────────────────

function makeSegments(): TimelineSegment[] {
  return [
    {
      id: 'seg_r0_s0',
      roundIndex: 0,
      stepIndex: 0,
      stepLabel: 'Run',
      startsAtSeconds: 0,
      endsAtSeconds: 30,
      durationSeconds: 30,
    },
    {
      id: 'seg_r0_s1',
      roundIndex: 0,
      stepIndex: 1,
      stepLabel: 'Walk',
      startsAtSeconds: 30,
      endsAtSeconds: 60,
      durationSeconds: 30,
    },
    {
      id: 'seg_r1_s0',
      roundIndex: 1,
      stepIndex: 0,
      stepLabel: 'Run',
      startsAtSeconds: 60,
      endsAtSeconds: 90,
      durationSeconds: 30,
    },
    {
      id: 'seg_r1_s1',
      roundIndex: 1,
      stepIndex: 1,
      stepLabel: 'Walk',
      startsAtSeconds: 90,
      endsAtSeconds: 120,
      durationSeconds: 30,
    },
  ];
}

// ─── findActiveSegment Tests ─────────────────────────────────────────────────

describe('findActiveSegment', () => {
  it('returns null for empty segments', () => {
    expect(findActiveSegment([], 10)).toBeNull();
  });

  it('returns the first segment at time 0', () => {
    const segments = makeSegments();
    const result = findActiveSegment(segments, 0);
    expect(result?.id).toBe('seg_r0_s0');
  });

  it('returns the first segment for times within the first segment', () => {
    const segments = makeSegments();
    expect(findActiveSegment(segments, 15)?.id).toBe('seg_r0_s0');
    expect(findActiveSegment(segments, 29.99)?.id).toBe('seg_r0_s0');
  });

  it('returns the second segment at exactly 30 seconds', () => {
    const segments = makeSegments();
    expect(findActiveSegment(segments, 30)?.id).toBe('seg_r0_s1');
  });

  it('returns the correct segment for mid-segment times', () => {
    const segments = makeSegments();
    expect(findActiveSegment(segments, 45)?.id).toBe('seg_r0_s1');
    expect(findActiveSegment(segments, 75)?.id).toBe('seg_r1_s0');
    expect(findActiveSegment(segments, 100)?.id).toBe('seg_r1_s1');
  });

  it('returns the last segment when time is at or past total duration', () => {
    const segments = makeSegments();
    expect(findActiveSegment(segments, 120)?.id).toBe('seg_r1_s1');
    expect(findActiveSegment(segments, 999)?.id).toBe('seg_r1_s1');
  });

  it('returns the first segment for negative times', () => {
    const segments = makeSegments();
    expect(findActiveSegment(segments, -5)?.id).toBe('seg_r0_s0');
  });

  it('handles single-segment timeline', () => {
    const segments: TimelineSegment[] = [
      {
        id: 'seg_r0_s0',
        roundIndex: 0,
        stepIndex: 0,
        stepLabel: 'Run',
        startsAtSeconds: 0,
        endsAtSeconds: 60,
        durationSeconds: 60,
      },
    ];
    expect(findActiveSegment(segments, 0)?.id).toBe('seg_r0_s0');
    expect(findActiveSegment(segments, 30)?.id).toBe('seg_r0_s0');
    expect(findActiveSegment(segments, 60)?.id).toBe('seg_r0_s0');
  });

  it('correctly finds segment at boundary transitions', () => {
    const segments = makeSegments();
    // At exactly 59.999... should still be in second segment
    expect(findActiveSegment(segments, 59.999)?.id).toBe('seg_r0_s1');
    // At exactly 60 should be in third segment
    expect(findActiveSegment(segments, 60)?.id).toBe('seg_r1_s0');
  });
});
