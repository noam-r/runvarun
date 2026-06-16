import { useState } from 'react';
import type { WorkoutPreset, ActiveWorkout, AppSettings } from '../domain/types';
import { formatDuration, totalWorkoutDuration } from '../domain/duration';
import { startWorkout } from '../engine/timerEngine';
import { cueService } from '../audio/cueService';
import { recordingStore, stepCueKey, SYSTEM_CUE_KEYS } from '../audio/recordingStore';
import { wakeLockService } from '../pwa/wakeLockService';
import { storageService } from '../storage/storageService';
import { useI18n } from '../i18n';

type Props = {
  presets: WorkoutPreset[];
  selectedPreset: WorkoutPreset | null;
  settings: AppSettings;
  onStart: () => void;
  onStartAudio?: (preset: WorkoutPreset) => void;
  onSelectPreset: (id: string) => void;
  onEdit: (id: string) => void;
  onNew: () => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onSettings: () => void;
  setActiveWorkout: (w: ActiveWorkout | null) => void;
};

export function HomeScreen({
  presets,
  selectedPreset,
  settings,
  onStart,
  onStartAudio,
  onSelectPreset,
  onEdit,
  onNew,
  onDuplicate,
  onDelete,
  onSettings,
  setActiveWorkout,
}: Props) {
  const [showPicker, setShowPicker] = useState(false);
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [audioModeError, setAudioModeError] = useState<string | null>(null);
  const { t } = useI18n();

  async function handleStart() {
    if (!selectedPreset) return;
    setAudioModeError(null);

    const settingsV2 = storageService.loadSettingsV2();

    if (settingsV2.runtimeMode === 'reliable-audio') {
      // Audio mode: check duration guardrails, then delegate to audio flow
      const duration = totalWorkoutDuration(selectedPreset.steps, selectedPreset.repeatCount);
      if (duration > 3600) {
        setAudioModeError(t.workoutTooLongForAudio);
        return;
      }
      if (onStartAudio) {
        onStartAudio(selectedPreset);
      }
      return;
    }

    // Screen-on-timer mode: existing legacy flow
    const now = Date.now();
    const result = startWorkout(selectedPreset, now);
    if (!result) return;

    setActiveWorkout(result.workout);

    // Preload recordings for instant playback during workout
    const cueKeys = selectedPreset.steps.map((s) => stepCueKey(s.announcement?.trim() || s.label));
    cueKeys.push(SYSTEM_CUE_KEYS.lastRound, SYSTEM_CUE_KEYS.workoutComplete);
    await recordingStore.preload(cueKeys);

    if (settings.keepScreenAwake) {
      wakeLockService.request();
    }

    for (const event of result.events) {
      await cueService.handleEvent(event, settings);
    }

    onStart();
  }

  if (!selectedPreset) {
    // No presets at all — empty state
    return (
      <div className="screen home-screen home-screen--empty">
        <header className="screen-header">
          <h1 className="app-title">{t.appName}</h1>
          <button className="btn-icon" onClick={onSettings} aria-label={t.settings}>⚙</button>
        </header>
        <div className="empty-state">
          <p>{t.noWorkouts}</p>
          <button className="btn btn-primary btn-large" onClick={onNew}>{t.createWorkout}</button>
        </div>
      </div>
    );
  }

  const total = totalWorkoutDuration(selectedPreset.steps, selectedPreset.repeatCount);

  return (
    <div className="screen home-screen">
      <header className="screen-header">
        <h1 className="app-title">{t.appName}</h1>
        <button className="btn-icon" onClick={onSettings} aria-label={t.settings}>⚙</button>
      </header>

      {/* Main CTA — large round START button */}
      <div className="home-start-area">
        <button className="start-button" onClick={handleStart} aria-label={t.startWorkout}>
          <span className="start-button__label">{t.start}</span>
        </button>
        {audioModeError && (
          <p className="home-start-area__error" role="alert">{audioModeError}</p>
        )}
      </div>

      {/* Current workout summary */}
      <div className="home-current-workout">
        <div className="home-current-workout__header">
          <h2 className="home-current-workout__name">{selectedPreset.name}</h2>
          <button className="btn-small" onClick={() => onEdit(selectedPreset.id)}>{t.edit}</button>
        </div>

        <ul className="home-current-workout__steps">
          {selectedPreset.steps.map((step) => (
            <li key={step.id}>
              <span>{step.label}</span>
              <span className="step-duration-mono">{formatDuration(step.durationSeconds)}</span>
            </li>
          ))}
        </ul>

        <div className="home-current-workout__meta">
          {selectedPreset.repeatCount}× · {formatDuration(total)}
        </div>
      </div>

      {/* Change workout */}
      <div className="home-change-area">
        <button className="btn btn-secondary" onClick={() => setShowPicker(!showPicker)}>
          {showPicker ? t.hideWorkouts : t.changeWorkout}
        </button>
        <button className="btn-link" onClick={onNew}>{t.newWorkout}</button>
      </div>

      {/* Workout picker — collapsed by default */}
      {showPicker && (
        <ul className="preset-picker">
          {presets.map((preset) => {
            const isSelected = preset.id === selectedPreset.id;
            const isExpanded = expandedCard === preset.id;
            const isConfirmingDelete = confirmDelete === preset.id;

            return (
              <li key={preset.id} className={`picker-card ${isSelected ? 'picker-card--selected' : ''}`}>
                <button
                  className="picker-card__main"
                  onClick={() => { onSelectPreset(preset.id); setShowPicker(false); }}
                >
                  <span className="picker-card__name">{preset.name}</span>
                  <span className="picker-card__meta">
                    {t.stepCount(preset.steps.length)} · {preset.repeatCount}× · {formatDuration(totalWorkoutDuration(preset.steps, preset.repeatCount))}
                  </span>
                  {isSelected && <span className="picker-card__check">✓</span>}
                </button>

                <div className="picker-card__actions">
                  <button className="btn-small btn-ghost" onClick={() => setExpandedCard(isExpanded ? null : preset.id)}>⋯</button>
                </div>

                {isExpanded && (
                  <div className="picker-card__overflow">
                    <button className="btn-small" onClick={() => { onEdit(preset.id); setShowPicker(false); }}>{t.edit}</button>
                    <button className="btn-small" onClick={() => { onDuplicate(preset.id); setExpandedCard(null); }}>{t.duplicate}</button>
                    {isConfirmingDelete ? (
                      <span className="confirm-delete-inline">
                        <button className="btn-small btn-danger-text" onClick={() => { onDelete(preset.id); setConfirmDelete(null); setExpandedCard(null); }}>{t.yesDelete}</button>
                        <button className="btn-small" onClick={() => setConfirmDelete(null)}>{t.cancel}</button>
                      </span>
                    ) : (
                      <button className="btn-small btn-ghost-danger" onClick={() => setConfirmDelete(preset.id)}>{t.delete}</button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
