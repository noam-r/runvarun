import { describe, it, expect } from 'vitest';
import { formatSecondsAsCountdown } from '../AudioActiveWorkoutScreen';

describe('formatSecondsAsCountdown', () => {
  it('formats zero seconds as 00:00', () => {
    expect(formatSecondsAsCountdown(0)).toBe('00:00');
  });

  it('formats whole seconds correctly', () => {
    expect(formatSecondsAsCountdown(5)).toBe('00:05');
    expect(formatSecondsAsCountdown(60)).toBe('01:00');
    expect(formatSecondsAsCountdown(90)).toBe('01:30');
    expect(formatSecondsAsCountdown(3599)).toBe('59:59');
  });

  it('uses ceil so fractional seconds round up', () => {
    expect(formatSecondsAsCountdown(0.1)).toBe('00:01');
    expect(formatSecondsAsCountdown(4.7)).toBe('00:05');
    expect(formatSecondsAsCountdown(59.01)).toBe('01:00');
  });

  it('clamps negative values to 00:00', () => {
    expect(formatSecondsAsCountdown(-1)).toBe('00:00');
    expect(formatSecondsAsCountdown(-100)).toBe('00:00');
  });

  it('handles large durations', () => {
    // 45 minutes
    expect(formatSecondsAsCountdown(2700)).toBe('45:00');
    // 60 minutes
    expect(formatSecondsAsCountdown(3600)).toBe('60:00');
  });
});
