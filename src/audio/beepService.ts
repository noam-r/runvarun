export type AudioCueResult = { success: boolean; error?: string };

let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (audioContext && audioContext.state !== 'closed') return audioContext;
  try {
    audioContext = new AudioContext();
    return audioContext;
  } catch {
    return null;
  }
}

function playTone(frequency: number, durationMs: number): Promise<AudioCueResult> {
  return new Promise((resolve) => {
    const ctx = getAudioContext();
    if (!ctx) {
      resolve({ success: false, error: 'AudioContext unavailable' });
      return;
    }

    // Resume context if suspended (browser autoplay policy)
    const ready = ctx.state === 'suspended' ? ctx.resume() : Promise.resolve();
    ready.then(() => {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();

      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      gain.gain.value = 0.5;

      oscillator.connect(gain);
      gain.connect(ctx.destination);

      // Fade out at end
      gain.gain.setValueAtTime(0.5, ctx.currentTime + durationMs / 1000 - 0.05);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + durationMs / 1000);

      oscillator.start();
      oscillator.stop(ctx.currentTime + durationMs / 1000);

      oscillator.onended = () => resolve({ success: true });
    }).catch(() => resolve({ success: false, error: 'AudioContext resume failed' }));
  });
}

export const beepService = {
  isSupported(): boolean {
    return typeof AudioContext !== 'undefined' || typeof (window as unknown as { webkitAudioContext: unknown }).webkitAudioContext !== 'undefined';
  },

  async test(): Promise<AudioCueResult> {
    return playTone(880, 200);
  },

  async playTransition(): Promise<AudioCueResult> {
    return playTone(880, 250);
  },

  async playCountdownTick(): Promise<AudioCueResult> {
    return playTone(660, 100);
  },

  async playCompletion(): Promise<AudioCueResult> {
    const r1 = await playTone(880, 200);
    if (!r1.success) return r1;
    await new Promise((r) => setTimeout(r, 100));
    return playTone(1100, 300);
  },
};
