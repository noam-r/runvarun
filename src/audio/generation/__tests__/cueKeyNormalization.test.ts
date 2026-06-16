import { describe, it, expect } from 'vitest';
import {
  normalizeCueKey,
  SYSTEM_CUE_START,
  SYSTEM_CUE_LAST_ROUND,
  SYSTEM_CUE_COMPLETE,
  SYSTEM_CUE_COUNTDOWN_3,
  SYSTEM_CUE_COUNTDOWN_2,
  SYSTEM_CUE_COUNTDOWN_1,
  SYSTEM_CUE_KEYS,
} from '../cueKeyNormalization';

describe('normalizeCueKey', () => {
  it('produces step-label:{normalized} format', () => {
    expect(normalizeCueKey('Run')).toBe('step-label:run');
  });

  it('trims leading and trailing whitespace', () => {
    expect(normalizeCueKey('  Run  ')).toBe('step-label:run');
  });

  it('converts to lowercase', () => {
    expect(normalizeCueKey('RUN')).toBe('step-label:run');
    expect(normalizeCueKey('Walk')).toBe('step-label:walk');
  });

  it('collapses multiple spaces to a single space', () => {
    expect(normalizeCueKey('Fast   Run')).toBe('step-label:fast run');
  });

  it('handles tabs and mixed whitespace', () => {
    expect(normalizeCueKey('Fast\t\tRun')).toBe('step-label:fast run');
    expect(normalizeCueKey(' Fast \n Run ')).toBe('step-label:fast run');
  });

  it('produces identical keys for formatting variants', () => {
    const key1 = normalizeCueKey('Run');
    const key2 = normalizeCueKey(' run ');
    const key3 = normalizeCueKey('RUN');
    const key4 = normalizeCueKey('  RuN  ');
    expect(key1).toBe(key2);
    expect(key2).toBe(key3);
    expect(key3).toBe(key4);
  });

  it('preserves meaningful differences between labels', () => {
    expect(normalizeCueKey('Run')).not.toBe(normalizeCueKey('Walk'));
    expect(normalizeCueKey('Fast Run')).not.toBe(normalizeCueKey('FastRun'));
  });

  it('handles empty string after trim', () => {
    expect(normalizeCueKey('')).toBe('step-label:');
    expect(normalizeCueKey('   ')).toBe('step-label:');
  });
});

describe('System cue key constants', () => {
  it('has correct system:start value', () => {
    expect(SYSTEM_CUE_START).toBe('system:start');
  });

  it('has correct system:last-round value', () => {
    expect(SYSTEM_CUE_LAST_ROUND).toBe('system:last-round');
  });

  it('has correct system:complete value', () => {
    expect(SYSTEM_CUE_COMPLETE).toBe('system:complete');
  });

  it('has correct countdown values', () => {
    expect(SYSTEM_CUE_COUNTDOWN_3).toBe('system:countdown-3');
    expect(SYSTEM_CUE_COUNTDOWN_2).toBe('system:countdown-2');
    expect(SYSTEM_CUE_COUNTDOWN_1).toBe('system:countdown-1');
  });

  it('SYSTEM_CUE_KEYS contains all six system keys', () => {
    expect(SYSTEM_CUE_KEYS).toHaveLength(6);
    expect(SYSTEM_CUE_KEYS).toContain('system:start');
    expect(SYSTEM_CUE_KEYS).toContain('system:last-round');
    expect(SYSTEM_CUE_KEYS).toContain('system:complete');
    expect(SYSTEM_CUE_KEYS).toContain('system:countdown-3');
    expect(SYSTEM_CUE_KEYS).toContain('system:countdown-2');
    expect(SYSTEM_CUE_KEYS).toContain('system:countdown-1');
  });
});
