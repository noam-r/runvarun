/**
 * MP3 encoder using lamejs.
 *
 * Converts a Float32Array PCM buffer into a mono MP3 Blob,
 * processing in 1152-sample chunks (one MP3 frame) with
 * progress reporting and AbortSignal support.
 */
import { Mp3Encoder } from 'lamejs';
import type { EncoderOptions } from './types';

/** Number of samples per MP3 frame. */
const SAMPLES_PER_FRAME = 1152;

/**
 * Convert a Float32Array of audio samples (range -1..1) to Int16Array
 * as required by lamejs.
 */
function floatTo16Bit(samples: Float32Array): Int16Array {
  const output = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    // Clamp to [-1, 1] then scale to Int16 range
    const s = Math.max(-1, Math.min(1, samples[i]));
    output[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return output;
}

/**
 * Encode a Float32Array of mono PCM audio samples into an MP3 Blob.
 *
 * @param samples - Raw PCM audio data (values in -1..1 range)
 * @param options - Encoder configuration (sampleRate, bitRate, channels)
 * @param onProgress - Optional callback reporting encoding progress (0–100)
 * @param signal - Optional AbortSignal to cancel encoding between chunks
 * @returns A Blob of type 'audio/mpeg'
 */
export async function encodeMp3(
  samples: Float32Array,
  options: EncoderOptions,
  onProgress?: (percent: number) => void,
  signal?: AbortSignal,
): Promise<Blob> {
  const { channels, sampleRate, bitRate } = options;
  const encoder = new Mp3Encoder(channels, sampleRate, bitRate);

  const pcm16 = floatTo16Bit(samples);
  const totalSamples = pcm16.length;
  const totalChunks = Math.ceil(totalSamples / SAMPLES_PER_FRAME);
  const mp3Buffers: Uint8Array[] = [];

  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
    // Check for cancellation between chunks
    if (signal?.aborted) {
      throw new DOMException('Encoding aborted', 'AbortError');
    }

    const start = chunkIndex * SAMPLES_PER_FRAME;
    const end = Math.min(start + SAMPLES_PER_FRAME, totalSamples);
    const chunk = pcm16.subarray(start, end);

    const mp3Chunk = encoder.encodeBuffer(chunk);
    if (mp3Chunk.length > 0) {
      mp3Buffers.push(new Uint8Array(mp3Chunk.buffer, mp3Chunk.byteOffset, mp3Chunk.byteLength));
    }

    // Report progress
    if (onProgress) {
      const percent = Math.round(((chunkIndex + 1) / totalChunks) * 100);
      onProgress(percent);
    }

    // Yield to the event loop periodically to keep the UI responsive
    if (chunkIndex % 100 === 0 && chunkIndex > 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  // Flush remaining MP3 data
  const tail = encoder.flush();
  if (tail.length > 0) {
    mp3Buffers.push(new Uint8Array(tail.buffer, tail.byteOffset, tail.byteLength));
  }

  return new Blob(mp3Buffers as BlobPart[], { type: 'audio/mpeg' });
}
