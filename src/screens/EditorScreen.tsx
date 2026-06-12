import { useState } from 'react';
import type { WorkoutPreset, WorkoutStep } from '../domain/types';
import { formatDuration, totalWorkoutDuration } from '../domain/duration';
import { useI18n } from '../i18n';

type Props = {
  preset: WorkoutPreset | null;
  onSave: (preset: WorkoutPreset) => void;
  onBack: () => void;
};

function createEmptyStep(): WorkoutStep {
  return { id: `step_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, label: '', durationSeconds: 60 };
}

function createDefaultPreset(): WorkoutPreset {
  const now = new Date().toISOString();
  return {
    id: `preset_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: '',
    repeatCount: 1,
    steps: [createEmptyStep()],
    createdAt: now,
    updatedAt: now,
  };
}

export function EditorScreen({ preset, onSave, onBack }: Props) {
  const [draft, setDraft] = useState<WorkoutPreset>(preset ? { ...preset, steps: preset.steps.map(s => ({ ...s })) } : createDefaultPreset());
  const { t } = useI18n();

  const errors = getErrors(draft, t);
  const canSave = errors.length === 0;

  function updateStep(index: number, updates: Partial<WorkoutStep>) {
    const steps = [...draft.steps];
    steps[index] = { ...steps[index], ...updates };
    setDraft({ ...draft, steps, updatedAt: new Date().toISOString() });
  }

  function addStep() {
    setDraft({ ...draft, steps: [...draft.steps, createEmptyStep()] });
  }

  function deleteStep(index: number) {
    if (draft.steps.length <= 1) return;
    const steps = draft.steps.filter((_, i) => i !== index);
    setDraft({ ...draft, steps });
  }

  function duplicateStep(index: number) {
    const source = draft.steps[index];
    const dup: WorkoutStep = { ...source, id: `step_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` };
    const steps = [...draft.steps];
    steps.splice(index + 1, 0, dup);
    setDraft({ ...draft, steps });
  }

  function moveStep(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= draft.steps.length) return;
    const steps = [...draft.steps];
    [steps[index], steps[target]] = [steps[target], steps[index]];
    setDraft({ ...draft, steps });
  }

  function handleSave() {
    if (!canSave) return;
    onSave({ ...draft, updatedAt: new Date().toISOString() });
  }

  return (
    <div className="screen editor-screen">
      <header className="screen-header">
        <button className="btn-back" onClick={onBack} aria-label={t.back}><span className="back-arrow" aria-hidden="true"></span> {t.back}</button>
        <h2>{preset ? t.editWorkout : t.newWorkoutTitle}</h2>
      </header>

      <div className="editor-form">
        <label className="field">
          <span className="field-label">{t.workoutName}</span>
          <input
            type="text"
            className="input"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder={t.workoutNamePlaceholder}
          />
        </label>

        <label className="field">
          <span className="field-label">{t.repeatCount}</span>
          <div className="stepper">
            <button className="btn-stepper" onClick={() => setDraft({ ...draft, repeatCount: Math.max(1, draft.repeatCount - 1) })} aria-label="-1">−</button>
            <span className="stepper-value">{draft.repeatCount}×</span>
            <button className="btn-stepper" onClick={() => setDraft({ ...draft, repeatCount: draft.repeatCount + 1 })} aria-label="+1">+</button>
          </div>
        </label>

        <div className="step-list">
          <h3>{t.steps}</h3>
          {draft.steps.map((step, i) => (
            <div key={step.id} className="step-card">
              <div className="step-card__header">
                <span className="step-number">{i + 1}.</span>
                <input
                  type="text"
                  className="input input-step-label"
                  value={step.label}
                  onChange={(e) => updateStep(i, { label: e.target.value })}
                  placeholder={t.labelPlaceholder}
                />
              </div>
              <div className="step-card__duration">
                <button className="btn-stepper" onClick={() => updateStep(i, { durationSeconds: Math.max(1, step.durationSeconds - 60) })} aria-label={t.decreaseByMinute}>{t.decreaseByMinute}</button>
                <button className="btn-stepper" onClick={() => updateStep(i, { durationSeconds: Math.max(1, step.durationSeconds - 10) })} aria-label={t.decreaseByTen}>{t.decreaseByTen}</button>
                <span className="duration-value">{formatDuration(step.durationSeconds)}</span>
                <button className="btn-stepper" onClick={() => updateStep(i, { durationSeconds: step.durationSeconds + 10 })} aria-label={t.increaseByTen}>{t.increaseByTen}</button>
                <button className="btn-stepper" onClick={() => updateStep(i, { durationSeconds: step.durationSeconds + 60 })} aria-label={t.increaseByMinute}>{t.increaseByMinute}</button>
              </div>
              <details className="step-card__advanced">
                <summary>{t.announcement}</summary>
                <input
                  type="text"
                  className="input"
                  value={step.announcement ?? ''}
                  onChange={(e) => updateStep(i, { announcement: e.target.value })}
                  placeholder={t.announcementPlaceholder(step.label || '...')}
                />
              </details>
              <div className="step-card__actions">
                <button className="btn-small" onClick={() => moveStep(i, -1)} disabled={i === 0} aria-label={t.moveUp}>↑</button>
                <button className="btn-small" onClick={() => moveStep(i, 1)} disabled={i === draft.steps.length - 1} aria-label={t.moveDown}>↓</button>
                <button className="btn-small" onClick={() => duplicateStep(i)} aria-label={t.duplicateStep}>{t.duplicate}</button>
                <button className="btn-small btn-ghost-danger" onClick={() => deleteStep(i)} disabled={draft.steps.length <= 1} aria-label={t.deleteStep}>{t.delete}</button>
              </div>
            </div>
          ))}
          <button className="btn btn-secondary" onClick={addStep}>{t.addStep}</button>
        </div>

        <div className="editor-summary">
          <p>{t.total}: {formatDuration(totalWorkoutDuration(draft.steps, draft.repeatCount))}</p>
        </div>

        {errors.length > 0 && (
          <ul className="error-list">
            {errors.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        )}
      </div>

      <div className="editor-actions">
        <button className="btn btn-primary" onClick={handleSave} disabled={!canSave}>{t.saveAndStart}</button>
      </div>
    </div>
  );
}

function getErrors(preset: Partial<WorkoutPreset>, t: ReturnType<typeof useI18n>['t']): string[] {
  const errors: string[] = [];
  if (!preset.name || preset.name.trim().length === 0) errors.push(t.errNameRequired);
  if (!preset.repeatCount || preset.repeatCount < 1) errors.push(t.errRepeatMin);
  if (!preset.steps || preset.steps.length === 0) {
    errors.push(t.errNoSteps);
  } else {
    for (let i = 0; i < preset.steps.length; i++) {
      const step = preset.steps[i];
      if (!step.label || step.label.trim().length === 0) errors.push(t.errStepLabel(i + 1));
      if (!step.durationSeconds || step.durationSeconds < 1) errors.push(t.errStepDuration(i + 1));
    }
  }
  return errors;
}
