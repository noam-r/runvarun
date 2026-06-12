import type { ActiveWorkout } from '../domain/types';
import { formatRemainingMs } from '../domain/duration';
import { reconcileRecovery } from '../engine/timerEngine';
import { useI18n } from '../i18n';

type Props = {
  activeWorkout: ActiveWorkout;
  onResume: () => void;
  onDiscard: () => void;
  onComplete: () => void;
  setActiveWorkout: (w: ActiveWorkout | null) => void;
};

export function RecoveryScreen({ activeWorkout, onResume, onDiscard, onComplete, setActiveWorkout }: Props) {
  const { t } = useI18n();
  const preset = activeWorkout.presetSnapshot;
  const currentStep = preset.steps[activeWorkout.stepIndex];

  const updatedAtMs = new Date(activeWorkout.updatedAt).getTime();
  const minutesSinceUpdate = (Date.now() - updatedAtMs) / 60000;
  const isStale = minutesSinceUpdate > 10;

  function handleResume() {
    const now = Date.now();
    if (activeWorkout.status === 'running') {
      const { workout: reconciled } = reconcileRecovery(activeWorkout, now);
      setActiveWorkout(reconciled);
      if (reconciled.status === 'complete') {
        onComplete();
        return;
      }
    }
    onResume();
  }

  return (
    <div className="screen recovery-screen">
      <div className="recovery-message">{t.workoutInProgress}</div>

      <div className="recovery-details">
        <p className="recovery-name">{preset.name}</p>
        <p>{t.roundOf(activeWorkout.roundIndex + 1, preset.repeatCount)}</p>
        <p>{t.currentStep}: {currentStep.label}</p>
        {activeWorkout.status === 'paused' && activeWorkout.pausedRemainingMs && (
          <p>{t.remaining}: {formatRemainingMs(activeWorkout.pausedRemainingMs)}</p>
        )}
        {isStale && (
          <p className="recovery-stale-warning">
            {t.staleWarning(Math.round(minutesSinceUpdate))}
          </p>
        )}
      </div>

      <div className="recovery-actions">
        <button className="btn btn-primary btn-large" onClick={handleResume}>{t.resume}</button>
        <button className="btn btn-secondary" onClick={onDiscard}>{t.discard}</button>
      </div>
    </div>
  );
}
