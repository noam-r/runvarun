import { useState } from 'react';
import type { ActiveWorkout } from '../domain/types';
import { formatRemainingMs } from '../domain/duration';
import { resume } from '../engine/timerEngine';
import { useI18n } from '../i18n';

type Props = {
  activeWorkout: ActiveWorkout;
  onResume: () => void;
  onStop: () => void;
  setActiveWorkout: (w: ActiveWorkout | null) => void;
};

export function PausedScreen({ activeWorkout, onResume, onStop, setActiveWorkout }: Props) {
  const [confirmStop, setConfirmStop] = useState(false);
  const { t } = useI18n();

  function handleResume() {
    const now = Date.now();
    const { workout: resumed } = resume(activeWorkout, now);
    setActiveWorkout(resumed);
    onResume();
  }

  const currentStep = activeWorkout.presetSnapshot.steps[activeWorkout.stepIndex];
  const remainingMs = activeWorkout.pausedRemainingMs ?? 0;

  return (
    <div className="screen paused-screen">
      <div className="paused-status">{t.paused}</div>
      <div className="paused-info">
        <p>{t.resumesWith(currentStep.label, formatRemainingMs(remainingMs))}</p>
        <p>{t.roundOf(activeWorkout.roundIndex + 1, activeWorkout.presetSnapshot.repeatCount)}</p>
      </div>

      <div className="paused-actions">
        {/* Resume is the only large primary CTA */}
        <button className="btn btn-primary btn-large" onClick={handleResume}>{t.resume}</button>

        {/* Stop is visually demoted — text-only link unless confirming */}
        {confirmStop ? (
          <div className="confirm-stop">
            <p>{t.stopConfirm}<br /><small>{t.stopNote}</small></p>
            <div className="confirm-stop__buttons">
              <button className="btn btn-danger" onClick={onStop}>{t.yesStop}</button>
              <button className="btn btn-secondary" onClick={() => setConfirmStop(false)}>{t.cancel}</button>
            </div>
          </div>
        ) : (
          <button className="btn-link btn-link--muted" onClick={() => setConfirmStop(true)}>{t.stopWorkout}</button>
        )}
      </div>
    </div>
  );
}
