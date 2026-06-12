import { useEffect, useRef, useState } from 'react';
import type { ActiveWorkout, AppSettings } from '../domain/types';
import { formatRemainingMs, formatDuration } from '../domain/duration';
import { tick, pause, getCountdownEvents, getRemainingMs } from '../engine/timerEngine';
import { cueService } from '../audio/cueService';
import { wakeLockService } from '../pwa/wakeLockService';
import { useI18n } from '../i18n';

type Props = {
  activeWorkout: ActiveWorkout;
  settings: AppSettings;
  onPause: () => void;
  onComplete: () => void;
  setActiveWorkout: (w: ActiveWorkout | null) => void;
};

export function ActiveWorkoutScreen({ activeWorkout, settings, onPause, onComplete, setActiveWorkout }: Props) {
  const [now, setNow] = useState(Date.now());
  const { t } = useI18n();

  // Use refs for the animation loop to avoid re-creating callbacks on every state change
  const workoutRef = useRef(activeWorkout);
  const settingsRef = useRef(settings);
  const setActiveWorkoutRef = useRef(setActiveWorkout);
  const onCompleteRef = useRef(onComplete);
  const emittedCuesRef = useRef(new Set<string>());
  const lastPersistRef = useRef(Date.now());
  const frameRef = useRef<number>(0);
  const cueQueueRef = useRef<Promise<void>>(Promise.resolve());

  // Keep refs in sync with props
  workoutRef.current = activeWorkout;
  settingsRef.current = settings;
  setActiveWorkoutRef.current = setActiveWorkout;
  onCompleteRef.current = onComplete;

  useEffect(() => {
    let running = true;

    function loop() {
      if (!running) return;

      const currentNow = Date.now();
      setNow(currentNow);

      const workout = workoutRef.current;
      const currentSettings = settingsRef.current;

      if (workout.status !== 'running') {
        frameRef.current = requestAnimationFrame(loop);
        return;
      }

      const { workout: updated, events } = tick(workout, currentNow);

      if (currentSettings.countdownCue === 'last3seconds') {
        const countdownEvents = getCountdownEvents(updated, currentNow, emittedCuesRef.current);
        events.push(...countdownEvents);
      }

      // Queue cue events sequentially to avoid overlap
      if (events.length > 0) {
        cueQueueRef.current = cueQueueRef.current.then(async () => {
          for (const event of events) {
            await cueService.handleEvent(event, currentSettings);
          }
        });
      }

      if (updated.status === 'complete') {
        setActiveWorkoutRef.current(updated);
        wakeLockService.release();
        onCompleteRef.current();
        return;
      }

      // Only update React state if something meaningful changed
      if (
        updated.stepIndex !== workout.stepIndex ||
        updated.roundIndex !== workout.roundIndex ||
        updated.status !== workout.status
      ) {
        setActiveWorkoutRef.current(updated);
        // Throttled persistence: every 3 seconds
        if (currentNow - lastPersistRef.current > 3000) {
          lastPersistRef.current = currentNow;
        }
      }

      frameRef.current = requestAnimationFrame(loop);
    }

    frameRef.current = requestAnimationFrame(loop);
    return () => {
      running = false;
      cancelAnimationFrame(frameRef.current);
    };
  }, []); // Empty deps — loop uses refs

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && settings.keepScreenAwake) {
        wakeLockService.reacquire();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [settings.keepScreenAwake]);

  function handlePause() {
    const currentNow = Date.now();
    const { workout: paused } = pause(activeWorkout, currentNow);
    setActiveWorkout(paused);
    cueService.cancel();
    onPause();
  }

  const preset = activeWorkout.presetSnapshot;
  const currentStep = preset.steps[activeWorkout.stepIndex];
  const remainingMs = getRemainingMs(activeWorkout, now);
  const roundDisplay = activeWorkout.roundIndex + 1;
  const totalRounds = preset.repeatCount;

  const nextStepIndex = activeWorkout.stepIndex + 1 < preset.steps.length
    ? activeWorkout.stepIndex + 1
    : (activeWorkout.roundIndex + 1 < preset.repeatCount ? 0 : -1);
  const nextStep = nextStepIndex >= 0 ? preset.steps[nextStepIndex] : null;

  return (
    <div className="screen active-workout-screen">
      <div className="workout-round">{t.roundOf(roundDisplay, totalRounds)}</div>
      <div className="workout-step-label">{currentStep.label.toUpperCase()}</div>
      <div className="workout-timer">{formatRemainingMs(remainingMs)}</div>
      {nextStep && (
        <div className="workout-next">
          {t.next}: {nextStep.label} · {formatDuration(nextStep.durationSeconds)}
        </div>
      )}
      {!nextStep && activeWorkout.roundIndex === preset.repeatCount - 1 && (
        <div className="workout-next workout-next--final">{t.lastInterval}</div>
      )}
      <button className="btn btn-primary btn-large workout-pause" onClick={handlePause}>{t.pause}</button>
    </div>
  );
}
