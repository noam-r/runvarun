/**
 * Generate built-in cue MP3 files for the RunVaRun app.
 *
 * Produces short mono MP3 files at 22050 Hz / 48 kbps using lamejs.
 * Each cue has a distinct tone pattern so users can differentiate them.
 *
 * Usage: npx tsx scripts/generate-cues.ts
 */

import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// ─── Load lamejs (bundled version works in Node, CJS modules are broken) ─────

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, '..');

// Load the self-contained bundled file
const lamejsBundlePath = join(PROJECT_ROOT, 'node_modules', 'lamejs', 'lame.all.js');
const lamejsSource = readFileSync(lamejsBundlePath, 'utf-8');

// The bundle defines `function lamejs()` which assigns Mp3Encoder to the lamejs namespace.
// We wrap it so the namespace object is returned to us.
const lamejsNs: Record<string, unknown> = {};
// eslint-disable-next-line @typescript-eslint/no-implied-eval
const loadLamejs = new Function('lamejs', lamejsSource + '\nreturn lamejs;');
const lamejs = loadLamejs(lamejsNs) as Record<string, unknown>;

type Mp3EncoderInstance = {
  encodeBuffer(left: Int16Array, right?: Int16Array): Int8Array;
  flush(): Int8Array;
};

const Mp3Encoder = lamejs.Mp3Encoder as new (
  channels: number,
  sampleRate: number,
  kbps: number,
) => Mp3EncoderInstance;

// ─── Config ──────────────────────────────────────────────────────────────────

const SAMPLE_RATE = 22050;
const BIT_RATE = 48;
const CHANNELS = 1;
const OUTPUT_DIR = resolve(PROJECT_ROOT, 'public', 'cues');

// ─── Tone Generation Helpers ─────────────────────────────────────────────────

/** Generate a sine wave at given frequency for duration in seconds. */
function sineWave(freq: number, duration: number, amplitude = 0.8): Float32Array {
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    samples[i] = amplitude * Math.sin(2 * Math.PI * freq * i / SAMPLE_RATE);
  }
  return samples;
}

/** Apply a fade-in and fade-out envelope to avoid clicks. */
function applyEnvelope(samples: Float32Array, fadeInMs = 10, fadeOutMs = 30): Float32Array {
  const fadeInSamples = Math.floor(SAMPLE_RATE * fadeInMs / 1000);
  const fadeOutSamples = Math.floor(SAMPLE_RATE * fadeOutMs / 1000);
  const result = new Float32Array(samples);

  for (let i = 0; i < fadeInSamples && i < result.length; i++) {
    result[i] *= i / fadeInSamples;
  }
  for (let i = 0; i < fadeOutSamples && i < result.length; i++) {
    const idx = result.length - 1 - i;
    result[idx] *= i / fadeOutSamples;
  }
  return result;
}

/** Concatenate multiple Float32Arrays into one. */
function concat(...arrays: Float32Array[]): Float32Array {
  const totalLength = arrays.reduce((sum, a) => sum + a.length, 0);
  const result = new Float32Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

/** Generate silence for a given duration. */
function silence(duration: number): Float32Array {
  return new Float32Array(Math.floor(SAMPLE_RATE * duration));
}

/** Generate a frequency sweep from startFreq to endFreq over duration. */
function sweep(startFreq: number, endFreq: number, duration: number, amplitude = 0.7): Float32Array {
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / numSamples;
    const freq = startFreq + (endFreq - startFreq) * t;
    samples[i] = amplitude * Math.sin(2 * Math.PI * freq * i / SAMPLE_RATE);
  }
  return samples;
}

// ─── Cue Tone Patterns ───────────────────────────────────────────────────────

/** system-start: ascending three-note arpeggio (≤3s) — signals workout begin */
function generateSystemStart(): Float32Array {
  const tone1 = applyEnvelope(sineWave(523, 0.4, 0.7));  // C5
  const gap1 = silence(0.1);
  const tone2 = applyEnvelope(sineWave(659, 0.4, 0.75)); // E5
  const gap2 = silence(0.1);
  const tone3 = applyEnvelope(sineWave(784, 0.6, 0.8));  // G5
  return concat(tone1, gap1, tone2, gap2, tone3); // ~1.6s
}

/** system-complete: celebration ascending arpeggio C5-E5-G5-C6 (≤3s) */
function generateSystemComplete(): Float32Array {
  const t1 = applyEnvelope(sineWave(523, 0.3, 0.7));  // C5
  const t2 = applyEnvelope(sineWave(659, 0.3, 0.7));  // E5
  const t3 = applyEnvelope(sineWave(784, 0.3, 0.7));  // G5
  const t4 = applyEnvelope(sineWave(1047, 0.8, 0.8)); // C6 (held longer)
  const gap = silence(0.05);
  return concat(t1, gap, t2, gap, t3, gap, t4); // ~1.85s
}

/** system-last-round: alert double-beep then lower tone (≤3s) */
function generateSystemLastRound(): Float32Array {
  const beep1 = applyEnvelope(sineWave(880, 0.15, 0.8));  // A5
  const gap1 = silence(0.1);
  const beep2 = applyEnvelope(sineWave(880, 0.15, 0.8));  // A5
  const gap2 = silence(0.15);
  const sustained = applyEnvelope(sineWave(660, 0.5, 0.7)); // E5
  return concat(beep1, gap1, beep2, gap2, sustained); // ~1.05s
}

/** system-countdown-3: short tick beep at 1kHz */
function generateCountdown3(): Float32Array {
  return applyEnvelope(sineWave(1000, 0.1, 0.6));
}

/** system-countdown-2: short tick beep at 1kHz */
function generateCountdown2(): Float32Array {
  return applyEnvelope(sineWave(1000, 0.1, 0.6));
}

/** system-countdown-1: slightly higher and longer final tick */
function generateCountdown1(): Float32Array {
  return applyEnvelope(sineWave(1200, 0.15, 0.7));
}

/** step-label-run: energetic double-pulse with rising sweep (≤2s) */
function generateStepRun(): Float32Array {
  const pulse1 = applyEnvelope(sineWave(700, 0.12, 0.8));
  const gap = silence(0.08);
  const pulse2 = applyEnvelope(sineWave(700, 0.12, 0.8));
  const tail = applyEnvelope(sweep(700, 900, 0.3, 0.5));
  return concat(pulse1, gap, pulse2, gap, tail); // ~0.72s
}

/** step-label-walk: gentle lower tone at A4 (≤2s) */
function generateStepWalk(): Float32Array {
  return applyEnvelope(sineWave(440, 0.5, 0.6)); // 0.5s
}

/** step-default: generic mid-frequency beep (≤2s) */
function generateStepDefault(): Float32Array {
  return applyEnvelope(sineWave(580, 0.25, 0.7)); // 0.25s
}

// ─── MP3 Encoding ────────────────────────────────────────────────────────────

/** Convert Float32Array samples to Int16Array for lamejs. */
function floatToInt16(samples: Float32Array): Int16Array {
  const int16 = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return int16;
}

/** Encode PCM samples to MP3 buffer using lamejs. */
function encodeToMp3(samples: Float32Array): Buffer {
  const encoder = new Mp3Encoder(CHANNELS, SAMPLE_RATE, BIT_RATE);
  const int16Samples = floatToInt16(samples);

  const mp3Chunks: Int8Array[] = [];
  const CHUNK_SIZE = 1152;

  for (let i = 0; i < int16Samples.length; i += CHUNK_SIZE) {
    const chunk = int16Samples.subarray(i, i + CHUNK_SIZE);
    const mp3Buf = encoder.encodeBuffer(chunk);
    if (mp3Buf.length > 0) {
      mp3Chunks.push(mp3Buf);
    }
  }

  const flushed = encoder.flush();
  if (flushed.length > 0) {
    mp3Chunks.push(flushed);
  }

  const totalLength = mp3Chunks.reduce((sum, c) => sum + c.length, 0);
  const result = Buffer.alloc(totalLength);
  let offset = 0;
  for (const chunk of mp3Chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}

// ─── Cue Definitions ─────────────────────────────────────────────────────────

type CueDefinition = {
  filename: string;
  generate: () => Float32Array;
  maxDuration: number; // seconds
};

const CUES: CueDefinition[] = [
  { filename: 'system-start.mp3', generate: generateSystemStart, maxDuration: 3 },
  { filename: 'system-complete.mp3', generate: generateSystemComplete, maxDuration: 3 },
  { filename: 'system-last-round.mp3', generate: generateSystemLastRound, maxDuration: 3 },
  { filename: 'system-countdown-3.mp3', generate: generateCountdown3, maxDuration: 1 },
  { filename: 'system-countdown-2.mp3', generate: generateCountdown2, maxDuration: 1 },
  { filename: 'system-countdown-1.mp3', generate: generateCountdown1, maxDuration: 1 },
  { filename: 'step-label-run.mp3', generate: generateStepRun, maxDuration: 2 },
  { filename: 'step-label-walk.mp3', generate: generateStepWalk, maxDuration: 2 },
  { filename: 'step-default.mp3', generate: generateStepDefault, maxDuration: 2 },
];

// ─── Main ────────────────────────────────────────────────────────────────────

function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log(`Generating ${CUES.length} cue files in ${OUTPUT_DIR}\n`);
  console.log(`Config: mono, ${SAMPLE_RATE} Hz, ${BIT_RATE} kbps\n`);

  for (const cue of CUES) {
    const samples = cue.generate();
    const durationSeconds = samples.length / SAMPLE_RATE;

    if (durationSeconds > cue.maxDuration) {
      console.error(
        `ERROR: ${cue.filename} is ${durationSeconds.toFixed(2)}s, exceeds max ${cue.maxDuration}s`
      );
      process.exit(1);
    }

    const mp3Buffer = encodeToMp3(samples);
    const outputPath = resolve(OUTPUT_DIR, cue.filename);
    writeFileSync(outputPath, mp3Buffer);

    console.log(
      `  ✓ ${cue.filename.padEnd(26)} ${durationSeconds.toFixed(2)}s  ${(mp3Buffer.length / 1024).toFixed(1)} KB`
    );
  }

  console.log('\nDone! All cue files generated successfully.');
}

main();
