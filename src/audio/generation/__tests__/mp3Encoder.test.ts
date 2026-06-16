import { describe, it, expect, vi } from 'vitest';
import type { EncoderOptions } from '../types';

// Mock lamejs since it has a known issue with MPEGMode not being properly
// required in Node.js (works fine when bundled for browser by Vite).
vi.mock('lamejs', () => {
  class MockMp3Encoder {
    encodeBuffer(left: Int16Array): Int8Array {
      // Return a small chunk of fake MP3 data proportional to input
      const fakeData = new Int8Array(Math.max(1, Math.floor(left.length / 4)));
      fakeData[0] = 0xff; // MP3 sync byte
      return fakeData;
    }
    flush(): Int8Array {
      return new Int8Array([0xff, 0xfb]); // minimal MP3 frame header
    }
  }
  return { Mp3Encoder: MockMp3Encoder };
});

// Import after mock setup
import { encodeMp3 } from '../mp3Encoder';

const defaultOptions: EncoderOptions = {
  sampleRate: 22050,
  bitRate: 32,
  channels: 1,
};

describe('encodeMp3', () => {
  it('returns a Blob of type audio/mpeg', async () => {
    const samples = new Float32Array(22050); // 1 second of silence
    const blob = await encodeMp3(samples, defaultOptions);

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('audio/mpeg');
    expect(blob.size).toBeGreaterThan(0);
  });

  it('produces non-empty output for a tone', async () => {
    const sampleRate = 22050;
    const samples = new Float32Array(sampleRate);
    for (let i = 0; i < samples.length; i++) {
      samples[i] = Math.sin((2 * Math.PI * 440 * i) / sampleRate);
    }

    const blob = await encodeMp3(samples, defaultOptions);
    expect(blob.size).toBeGreaterThan(0);
  });

  it('calls onProgress with increasing percentages', async () => {
    const samples = new Float32Array(1152 * 5); // 5 chunks
    const progressValues: number[] = [];

    await encodeMp3(samples, defaultOptions, (percent) => {
      progressValues.push(percent);
    });

    expect(progressValues.length).toBe(5);
    // Each value should be increasing
    for (let i = 1; i < progressValues.length; i++) {
      expect(progressValues[i]).toBeGreaterThanOrEqual(progressValues[i - 1]);
    }
    // Final value should be 100
    expect(progressValues[progressValues.length - 1]).toBe(100);
  });

  it('reports progress starting from > 0 and ending at 100', async () => {
    const samples = new Float32Array(1152 * 3);
    const progressValues: number[] = [];

    await encodeMp3(samples, defaultOptions, (percent) => {
      progressValues.push(percent);
    });

    expect(progressValues[0]).toBeGreaterThan(0);
    expect(progressValues[progressValues.length - 1]).toBe(100);
  });

  it('throws AbortError when signal is already aborted', async () => {
    const samples = new Float32Array(1152 * 10);
    const controller = new AbortController();
    controller.abort();

    await expect(
      encodeMp3(samples, defaultOptions, undefined, controller.signal),
    ).rejects.toThrow('Encoding aborted');
  });

  it('throws AbortError when signal is aborted during encoding', async () => {
    const samples = new Float32Array(1152 * 200);
    const controller = new AbortController();
    let callCount = 0;

    const promise = encodeMp3(
      samples,
      defaultOptions,
      () => {
        callCount++;
        if (callCount === 2) {
          controller.abort();
        }
      },
      controller.signal,
    );

    await expect(promise).rejects.toThrow('Encoding aborted');
  });

  it('handles empty input gracefully', async () => {
    const samples = new Float32Array(0);
    const blob = await encodeMp3(samples, defaultOptions);

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('audio/mpeg');
  });

  it('works with 48 kbps bitrate option', async () => {
    const samples = new Float32Array(22050);
    const options: EncoderOptions = {
      sampleRate: 22050,
      bitRate: 48,
      channels: 1,
    };

    const blob = await encodeMp3(samples, options);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);
  });

  it('clamps sample values outside [-1, 1] range', async () => {
    // Samples with values exceeding normal range — should not throw
    const samples = new Float32Array([2.0, -2.0, 1.5, -1.5, 0.5]);
    const blob = await encodeMp3(samples, defaultOptions);
    expect(blob).toBeInstanceOf(Blob);
  });

  it('processes correct number of chunks for given input length', async () => {
    // 10 full chunks worth of samples
    const numChunks = 10;
    const samples = new Float32Array(1152 * numChunks);
    const progressValues: number[] = [];

    await encodeMp3(samples, defaultOptions, (percent) => {
      progressValues.push(percent);
    });

    expect(progressValues.length).toBe(numChunks);
    expect(progressValues[numChunks - 1]).toBe(100);
  });

  it('handles partial last chunk correctly', async () => {
    // 2.5 chunks worth of samples
    const samples = new Float32Array(1152 * 2 + 576);
    const progressValues: number[] = [];

    await encodeMp3(samples, defaultOptions, (percent) => {
      progressValues.push(percent);
    });

    // ceil(2.5) = 3 chunks
    expect(progressValues.length).toBe(3);
    expect(progressValues[2]).toBe(100);
  });
});
