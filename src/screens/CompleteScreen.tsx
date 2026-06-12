import type { ActiveWorkout } from '../domain/types';
import { formatDuration, totalWorkoutDuration } from '../domain/duration';
import { useI18n } from '../i18n';

type Props = {
  activeWorkout: ActiveWorkout | null;
  onRunAgain: () => void;
  onEdit: () => void;
  onHome: () => void;
};

export function CompleteScreen({ activeWorkout, onRunAgain, onEdit, onHome }: Props) {
  const { t } = useI18n();
  const preset = activeWorkout?.presetSnapshot;
  const total = preset ? totalWorkoutDuration(preset.steps, preset.repeatCount) : 0;

  return (
    <div className="screen complete-screen">
      <div className="complete-message">{t.workoutComplete}</div>
      {preset && (
        <div className="complete-details">
          <p className="complete-name">{preset.name}</p>
          <p className="complete-duration">{formatDuration(total)} {t.plannedTime}</p>
        </div>
      )}
      <div className="complete-actions">
        <button className="btn btn-primary btn-large" onClick={onRunAgain}>{t.runAgain}</button>
        <button className="btn btn-secondary" onClick={onEdit}>{t.editWorkoutAction}</button>
        <button className="btn btn-secondary" onClick={onHome}>{t.chooseAnother}</button>
      </div>
    </div>
  );
}
