import { useState } from 'react';
import { formatDuration } from '../domain/duration';
import { useI18n } from '../i18n';

type Props = {
  remainingStepSeconds: number;
  totalRemainingSeconds: number;
  stepLabel: string;
  roundInfo: string;
  onResume: () => void;
  onStop: () => void;
  gestureRequired?: boolean;
};

export function AudioPausedScreen({
  remainingStepSeconds,
  totalRemainingSeconds,
  stepLabel,
  roundInfo,
  onResume,
  onStop,
  gestureRequired,
}: Props) {
  const [confirmStop, setConfirmStop] = useState(false);
  const { t } = useI18n();

  const stepTimeDisplay = formatDuration(Math.ceil(Math.max(0, remainingStepSeconds)));
  const totalTimeDisplay = formatDuration(Math.ceil(Math.max(0, totalRemainingSeconds)));

  return (
    <div className="screen paused-screen">
      <div className="paused-status">{t.paused}</div>

      <div className="paused-info">
        <p className="paused-info__step">{stepLabel}</p>
        <p className="paused-info__round">{roundInfo}</p>
        <p className="paused-info__time">{stepTimeDisplay}</p>
        <p className="paused-info__total">
          {t.remaining}: {totalTimeDisplay}
        </p>
      </div>

      {gestureRequired && (
        <p className="paused-gesture-hint">
          Tap Resume to continue audio playback
        </p>
      )}

      <div className="paused-actions">
        <button className="btn btn-primary btn-large" onClick={onResume}>
          {t.resume}
        </button>

        {confirmStop ? (
          <div className="confirm-stop">
            <p>
              {t.stopConfirm}
              <br />
              <small>{t.stopNote}</small>
            </p>
            <div className="confirm-stop__buttons">
              <button className="btn btn-danger" onClick={onStop}>
                {t.yesStop}
              </button>
              <button className="btn btn-secondary" onClick={() => setConfirmStop(false)}>
                {t.cancel}
              </button>
            </div>
          </div>
        ) : (
          <button className="btn-link btn-link--muted" onClick={() => setConfirmStop(true)}>
            {t.stopWorkout}
          </button>
        )}
      </div>
    </div>
  );
}
