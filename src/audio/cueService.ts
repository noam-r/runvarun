import type { AppSettings, WorkoutStep } from '../domain/types';
import type { TimerEvent } from '../engine/timerEngine';
import { speechService } from './speechService';
import { beepService } from './beepService';
import { vibrationService } from './vibrationService';
import { recordingStore, stepCueKey, SYSTEM_CUE_KEYS } from './recordingStore';

/**
 * Tries to play a custom recording for the given key.
 * Falls back to TTS, then beep.
 */
async function playWithFallback(
  recordingKey: string,
  ttsText: string,
  settings: AppSettings,
  beepFn: () => Promise<unknown> = () => beepService.playTransition(),
): Promise<void> {
  // 1. Try custom recording
  const played = await recordingStore.play(recordingKey);
  if (played) return;

  // 2. Try TTS
  if (settings.voiceCuesEnabled) {
    const result = await speechService.speak(ttsText, settings.voiceLanguage);
    if (result.success) return;
  }

  // 3. Beep fallback
  if (settings.beepCuesEnabled) {
    await beepFn();
  }
}

/** Handles audio/vibration cue dispatch based on timer events and user settings. */
export const cueService = {
  async handleEvent(event: TimerEvent, settings: AppSettings): Promise<void> {
    switch (event.type) {
      case 'workout_started':
        await this.announceStep(event.step, settings);
        break;

      case 'step_started':
        await this.announceStep(event.step, settings);
        if (settings.vibrationEnabled) vibrationService.transitionPulse();
        break;

      case 'final_round':
        await this.announceFinalRound(event.step, settings);
        break;

      case 'countdown':
        await this.announceCountdown(event.value, settings);
        break;

      case 'workout_completed':
        await this.announceCompletion(settings);
        if (settings.vibrationEnabled) vibrationService.completionPulse();
        break;

      case 'workout_resumed':
        await this.announceStep(event.step, settings);
        break;

      case 'workout_paused':
        break;
    }
  },

  async announceStep(step: WorkoutStep, settings: AppSettings): Promise<void> {
    const text = step.announcement?.trim() || step.label;
    const key = stepCueKey(text);
    await playWithFallback(key, text, settings);
  },

  async announceFinalRound(step: WorkoutStep, settings: AppSettings): Promise<void> {
    if (!settings.finalRoundCueEnabled) return;
    const stepText = step.announcement?.trim() || step.label;
    // Try the "last round" system recording first, then fall back to combined TTS
    await playWithFallback(
      SYSTEM_CUE_KEYS.lastRound,
      `Last round. ${stepText}`,
      settings,
    );
  },

  async announceCountdown(_value: 3 | 2 | 1, settings: AppSettings): Promise<void> {
    if (settings.countdownCue === 'off') return;
    if (settings.beepCuesEnabled) {
      await beepService.playCountdownTick();
    }
  },

  async announceCompletion(settings: AppSettings): Promise<void> {
    if (!settings.completionCueEnabled) return;
    await playWithFallback(
      SYSTEM_CUE_KEYS.workoutComplete,
      'Workout complete',
      settings,
      () => beepService.playCompletion(),
    );
  },

  cancel(): void {
    speechService.cancel();
  },
};
