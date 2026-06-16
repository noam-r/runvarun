import type { AudioRuntimeState } from '../audio/audioRuntime';
import { useI18n } from '../i18n';

type Props = {
  runtimeState: AudioRuntimeState;
  presetName: string;
  totalRounds: number;
  nextStepLabel: string | null;
  onPause: () => void;
};

/** Format seconds as MM:SS countdown display. Uses ceil so timer doesn't show 00:00 prematurely. */
export function formatSecondsAsCountdown(seconds: number): string {
  const clamped = Math.max(0, seconds);
  const totalWholeSeconds = Math.ceil(clamped);
  const mm = Math.floor(totalWholeSeconds / 60);
  const ss = totalWholeSeconds % 60;
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

/**
 * Audio-driven active workout screen.
 *
 * Displays workout progress derived entirely from AudioRuntime state —
 * no setTimeout/setInterval for progress. The parent polls audio.currentTime
 * via requestAnimationFrame and passes the derived state as props.
 */
export function AudioActiveWorkoutScreen({
  runtimeState,
  presetName,
  totalRounds,
  nextStepLabel,
  onPause,
}: Props) {
  const { t } = useI18n();

  const { activeSegment, remainingStepSeconds, totalRemainingSeconds, roundIndex } = runtimeState;

  const stepLabel = activeSegment?.stepLabel ?? presetName;
  const roundDisplay = roundIndex + 1;

  return (
    <div className="screen active-workout-screen">
      <div className="workout-round">{t.roundOf(roundDisplay, totalRounds)}</div>
      <div className="workout-step-label">{stepLabel.toUpperCase()}</div>
      <div className="workout-timer">{formatSecondsAsCountdown(remainingStepSeconds)}</div>
      <div className="workout-total-remaining">
        {formatSecondsAsCountdown(totalRemainingSeconds)}
      </div>
      {nextStepLabel && (
        <div className="workout-next">
          {t.next}: {nextStepLabel}
        </div>
      )}
      {!nextStepLabel && roundIndex === totalRounds - 1 && (
        <div className="workout-next workout-next--final">{t.lastInterval}</div>
      )}
      <button className="btn btn-primary btn-large workout-pause" onClick={onPause}>
        {t.pause}
      </button>
    </div>
  );
}
