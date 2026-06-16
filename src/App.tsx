import { useState, useEffect, useCallback, useRef } from 'react';
import { HomeScreen } from './screens/HomeScreen';
import { EditorScreen } from './screens/EditorScreen';
import { ActiveWorkoutScreen } from './screens/ActiveWorkoutScreen';
import { PausedScreen } from './screens/PausedScreen';
import { CompleteScreen } from './screens/CompleteScreen';
import { RecoveryScreen } from './screens/RecoveryScreen';
import { PreparationScreen } from './screens/PreparationScreen';
import { AudioActiveWorkoutScreen } from './screens/AudioActiveWorkoutScreen';
import { AudioPausedScreen } from './screens/AudioPausedScreen';
import { AudioRecoveryScreen } from './screens/AudioRecoveryScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { RecordingsScreen } from './screens/RecordingsScreen';
import { storageService } from './storage/storageService';
import { trackStore } from './storage/trackStore';
import { migrateV1toV2 } from './storage/migrationService';
import { I18nCtx, getI18nForLocale } from './i18n';
import { checkAudioRecovery, clearAudioRecoveryState } from './audio/useAudioRecovery';
import { generateAudioTrack } from './audio/generation/audioTrackGenerator';
import { AudioRuntime } from './audio/audioRuntime';
import type { AudioRuntimeState } from './audio/audioRuntime';
import type { GenerationProgress, WorkoutTimeline } from './audio/generation/types';
import type { WorkoutPreset, ActiveWorkout, AppSettings, AudioWorkoutRuntimeState } from './domain/types';

export type Screen =
  | { type: 'home' }
  | { type: 'editor'; presetId: string | null }
  | { type: 'active' }
  | { type: 'paused' }
  | { type: 'complete' }
  | { type: 'recovery' }
  | { type: 'preparation'; preset: WorkoutPreset }
  | { type: 'audio-active' }
  | { type: 'audio-paused' }
  | { type: 'audio-recovery'; state: AudioWorkoutRuntimeState }
  | { type: 'settings' }
  | { type: 'recordings' };

export function App() {
  const [screen, setScreen] = useState<Screen>({ type: 'home' });
  const [presets, setPresets] = useState<WorkoutPreset[]>([]);
  const [settings, setSettings] = useState<AppSettings>(storageService.loadSettings());
  const [activeWorkout, setActiveWorkout] = useState<ActiveWorkout | null>(null);
  const [lastUsedPresetId, setLastUsedPresetId] = useState<string | null>(null);

  // Audio generation state
  const [generationProgress, setGenerationProgress] = useState<GenerationProgress | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [generationReady, setGenerationReady] = useState(false);

  // Audio runtime state (updated every RAF frame during playback)
  const [audioState, setAudioState] = useState<AudioRuntimeState | null>(null);

  // Audio workout context stored in state so it can be read during render
  const [audioPreset, setAudioPreset] = useState<WorkoutPreset | null>(null);
  const [audioTimeline, setAudioTimeline] = useState<WorkoutTimeline | null>(null);

  // Refs for audio lifecycle (not read during render)
  const audioRuntimeRef = useRef<AudioRuntime | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const generatedObjectUrlRef = useRef<string | null>(null);

  const i18n = getI18nForLocale(settings.uiLanguage);

  // Apply dir and lang to document root
  useEffect(() => {
    document.documentElement.dir = i18n.dir;
    document.documentElement.lang = i18n.locale;
  }, [i18n.dir, i18n.locale]);

  // Initialize app state from storage (with migration)
  useEffect(() => {
    async function init() {
      // Run schema migration before loading anything
      await migrateV1toV2();

      const loadedPresets = storageService.loadPresets();
      setPresets(loadedPresets);
      setLastUsedPresetId(storageService.loadLastUsedPresetId());

      // Check for legacy (screen-on-timer) active workout first
      const savedWorkout = storageService.loadActiveWorkout();
      if (savedWorkout && (savedWorkout.status === 'running' || savedWorkout.status === 'paused')) {
        setActiveWorkout(savedWorkout);
        setScreen({ type: 'recovery' });
        return;
      }

      // Check for audio mode recovery (async — loads blob from IndexedDB)
      const result = await checkAudioRecovery();
      if (result.needsRecovery && result.state) {
        setScreen({ type: 'audio-recovery', state: result.state });
      }
    }

    init();
  }, []);

  // Cleanup audio runtime on unmount
  useEffect(() => {
    return () => {
      audioRuntimeRef.current?.dispose();
      abortControllerRef.current?.abort();
    };
  }, []);

  const navigate = useCallback((s: Screen) => setScreen(s), []);

  const updatePresets = useCallback((updated: WorkoutPreset[]) => {
    setPresets(updated);
    storageService.savePresets(updated);
  }, []);

  const updateSettings = useCallback((updated: AppSettings) => {
    setSettings(updated);
    storageService.saveSettings(updated);
  }, []);

  const updateLastUsedPresetId = useCallback((id: string | null) => {
    setLastUsedPresetId(id);
    storageService.saveLastUsedPresetId(id);
  }, []);

  const updateActiveWorkout = useCallback((workout: ActiveWorkout | null) => {
    setActiveWorkout(workout);
    storageService.saveActiveWorkout(workout);
  }, []);

  // ─── Audio Generation Flow ───────────────────────────────────────────────

  const startAudioGeneration = useCallback((preset: WorkoutPreset) => {
    // Reset state
    setGenerationProgress(null);
    setGenerationError(null);
    setGenerationReady(false);
    setAudioPreset(preset);
    setAudioTimeline(null);

    // Cancel any previous generation
    abortControllerRef.current?.abort();
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const settingsV2 = storageService.loadSettingsV2();

    const cueSettings = {
      workoutStartEnabled: settingsV2.workoutStartCueEnabled,
      countdownEnabled: settingsV2.countdownCue === 'last-3-seconds',
      finalRoundEnabled: settingsV2.finalRoundCueEnabled,
      completionEnabled: settingsV2.completionCueEnabled,
    };

    generateAudioTrack(preset, cueSettings, {
      pacerEnabled: settingsV2.pacerEnabled,
      onProgress: (progress) => setGenerationProgress(progress),
      signal: abortController.signal,
    })
      .then(async (result) => {
        // Store the track blob in IndexedDB for recovery
        try {
          await trackStore.saveTrack(result.blob, {
            presetId: preset.id,
            totalDurationSeconds: result.totalDurationSeconds,
            generatedAt: Date.now(),
            timelineHash: `${preset.id}_${preset.updatedAt}`,
          });
        } catch {
          // Non-critical — workout still works, just no recovery after reload
        }

        generatedObjectUrlRef.current = result.objectUrl;
        setAudioTimeline(result.timeline);
        setGenerationReady(true);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') {
          // User cancelled — no error display
          return;
        }
        setGenerationError(err instanceof Error ? err.message : 'Audio generation failed');
      });
  }, []);

  const handleNavigateToPreparation = useCallback((preset: WorkoutPreset) => {
    setScreen({ type: 'preparation', preset });
    startAudioGeneration(preset);
  }, [startAudioGeneration]);

  const handlePreparationStart = useCallback(() => {
    const objectUrl = generatedObjectUrlRef.current;
    const timeline = audioTimeline;
    const preset = audioPreset;
    if (!objectUrl || !timeline || !preset) return;

    // Create AudioRuntime
    const runtime = new AudioRuntime({
      onStateChange: (state) => setAudioState(state),
      onComplete: () => {
        setScreen({ type: 'complete' });
        // Clean up persisted audio state
        storageService.saveAudioWorkoutState(null);
      },
      onError: (error) => {
        console.error('[App] AudioRuntime error:', error);
      },
    });

    audioRuntimeRef.current = runtime;

    runtime
      .load({
        objectUrl,
        timeline,
        presetId: preset.id,
        presetSnapshot: preset,
      })
      .then(() => runtime.start())
      .then(() => {
        setScreen({ type: 'audio-active' });
      })
      .catch((err) => {
        console.error('[App] Failed to start audio playback:', err);
        setGenerationError(
          err instanceof Error ? err.message : 'Audio playback could not start. Tap Start again.',
        );
        setGenerationReady(true);
      });
  }, [audioTimeline, audioPreset]);

  const handlePreparationCancel = useCallback(() => {
    abortControllerRef.current?.abort();
    navigate({ type: 'home' });
  }, [navigate]);

  const handlePreparationRetry = useCallback(() => {
    if (audioPreset) {
      startAudioGeneration(audioPreset);
    }
  }, [audioPreset, startAudioGeneration]);

  const handlePreparationFallback = useCallback(() => {
    abortControllerRef.current?.abort();
    navigate({ type: 'home' });
  }, [navigate]);

  // ─── Audio Active Flow ───────────────────────────────────────────────────

  const handleAudioPause = useCallback(() => {
    audioRuntimeRef.current?.pause();
    navigate({ type: 'audio-paused' });
  }, [navigate]);

  // ─── Audio Paused Flow ───────────────────────────────────────────────────

  const handleAudioResume = useCallback(() => {
    const runtime = audioRuntimeRef.current;
    if (!runtime) return;

    runtime.resume().then(() => {
      navigate({ type: 'audio-active' });
    }).catch((err) => {
      console.error('[App] Resume failed:', err);
      // Still on paused screen — user may need to tap again
    });
  }, [navigate]);

  const handleAudioStop = useCallback(() => {
    audioRuntimeRef.current?.stop();
    audioRuntimeRef.current?.dispose();
    audioRuntimeRef.current = null;
    storageService.saveAudioWorkoutState(null);
    navigate({ type: 'home' });
  }, [navigate]);

  // ─── Audio Recovery Flow ─────────────────────────────────────────────────

  const handleAudioRecoveryRestart = useCallback((state: AudioWorkoutRuntimeState) => {
    clearAudioRecoveryState();
    handleNavigateToPreparation(state.presetSnapshot);
  }, [handleNavigateToPreparation]);

  const handleAudioRecoveryDiscard = useCallback(() => {
    clearAudioRecoveryState();
    navigate({ type: 'home' });
  }, [navigate]);

  // ─── Derived values ──────────────────────────────────────────────────────

  // Selected preset: last used, or first available
  const selectedPreset = presets.find((p) => p.id === lastUsedPresetId) ?? presets[0] ?? null;

  // Derive next step label for audio active screen
  const nextStepLabel = (() => {
    if (!audioState?.activeSegment || !audioTimeline) return null;
    const segments = audioTimeline.segments;
    const currentIdx = segments.findIndex((s) => s.id === audioState.activeSegment?.id);
    if (currentIdx < 0 || currentIdx >= segments.length - 1) return null;
    return segments[currentIdx + 1].stepLabel;
  })();

  return (
    <I18nCtx value={i18n}>
      <div className="app-shell">
        {screen.type === 'home' && (
          <HomeScreen
            presets={presets}
            selectedPreset={selectedPreset}
            settings={settings}
            onStart={() => navigate({ type: 'active' })}
            onStartAudio={(preset) => handleNavigateToPreparation(preset)}
            onSelectPreset={(id) => updateLastUsedPresetId(id)}
            onEdit={(id) => navigate({ type: 'editor', presetId: id })}
            onNew={() => navigate({ type: 'editor', presetId: null })}
            onDuplicate={(id) => {
              const source = presets.find((p) => p.id === id);
              if (!source) return;
              const dup: WorkoutPreset = {
                ...source,
                id: `preset_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                name: `${source.name} (copy)`,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              };
              updatePresets([...presets, dup]);
            }}
            onDelete={(id) => {
              updatePresets(presets.filter((p) => p.id !== id));
              if (lastUsedPresetId === id) updateLastUsedPresetId(null);
            }}
            onSettings={() => navigate({ type: 'settings' })}
            setActiveWorkout={updateActiveWorkout}
          />
        )}
        {screen.type === 'editor' && (
          <EditorScreen
            preset={screen.presetId ? presets.find((p) => p.id === screen.presetId) ?? null : null}
            onSave={(preset) => {
              const existing = presets.findIndex((p) => p.id === preset.id);
              if (existing >= 0) {
                const updated = [...presets];
                updated[existing] = preset;
                updatePresets(updated);
              } else {
                updatePresets([...presets, preset]);
              }
              updateLastUsedPresetId(preset.id);
              navigate({ type: 'home' });
            }}
            onBack={() => navigate({ type: 'home' })}
          />
        )}
        {screen.type === 'preparation' && (
          <PreparationScreen
            presetName={screen.preset.name}
            progress={generationProgress}
            error={generationError}
            isReady={generationReady}
            onStart={handlePreparationStart}
            onCancel={handlePreparationCancel}
            onRetry={handlePreparationRetry}
            onFallback={handlePreparationFallback}
          />
        )}
        {screen.type === 'audio-active' && audioState && (
          <AudioActiveWorkoutScreen
            runtimeState={audioState}
            presetName={audioPreset?.name ?? ''}
            totalRounds={audioPreset?.repeatCount ?? 0}
            nextStepLabel={nextStepLabel}
            onPause={handleAudioPause}
          />
        )}
        {screen.type === 'audio-paused' && audioState && (
          <AudioPausedScreen
            remainingStepSeconds={audioState.remainingStepSeconds}
            totalRemainingSeconds={audioState.totalRemainingSeconds}
            stepLabel={audioState.activeSegment?.stepLabel ?? ''}
            roundInfo={`${(audioState.roundIndex ?? 0) + 1} / ${audioPreset?.repeatCount ?? 0}`}
            onResume={handleAudioResume}
            onStop={handleAudioStop}
            gestureRequired={false}
          />
        )}
        {screen.type === 'active' && activeWorkout && (
          <ActiveWorkoutScreen
            activeWorkout={activeWorkout}
            settings={settings}
            onPause={() => navigate({ type: 'paused' })}
            onComplete={() => navigate({ type: 'complete' })}
            setActiveWorkout={updateActiveWorkout}
          />
        )}
        {screen.type === 'paused' && activeWorkout && (
          <PausedScreen
            activeWorkout={activeWorkout}
            onResume={() => navigate({ type: 'active' })}
            onStop={() => {
              updateActiveWorkout(null);
              navigate({ type: 'home' });
            }}
            setActiveWorkout={updateActiveWorkout}
          />
        )}
        {screen.type === 'complete' && (
          <CompleteScreen
            activeWorkout={activeWorkout}
            onRunAgain={() => {
              updateActiveWorkout(null);
              audioRuntimeRef.current?.dispose();
              audioRuntimeRef.current = null;
              navigate({ type: 'home' });
            }}
            onEdit={() => {
              updateActiveWorkout(null);
              audioRuntimeRef.current?.dispose();
              audioRuntimeRef.current = null;
              if (selectedPreset) {
                navigate({ type: 'editor', presetId: selectedPreset.id });
              } else {
                navigate({ type: 'home' });
              }
            }}
            onHome={() => {
              updateActiveWorkout(null);
              audioRuntimeRef.current?.dispose();
              audioRuntimeRef.current = null;
              navigate({ type: 'home' });
            }}
          />
        )}
        {screen.type === 'recovery' && activeWorkout && (
          <RecoveryScreen
            activeWorkout={activeWorkout}
            onResume={() => navigate({ type: 'active' })}
            onDiscard={() => {
              updateActiveWorkout(null);
              navigate({ type: 'home' });
            }}
            onComplete={() => navigate({ type: 'complete' })}
            setActiveWorkout={updateActiveWorkout}
          />
        )}
        {screen.type === 'audio-recovery' && (
          <AudioRecoveryScreen
            presetName={screen.state.presetSnapshot.name}
            onRestart={() => handleAudioRecoveryRestart(screen.state)}
            onDiscard={handleAudioRecoveryDiscard}
          />
        )}
        {screen.type === 'settings' && (
          <SettingsScreen
            settings={settings}
            onUpdate={updateSettings}
            onBack={() => navigate({ type: 'home' })}
            onRecordings={() => navigate({ type: 'recordings' })}
            onResetStarters={() => {
              const starters = storageService.createStarterPresets();
              updatePresets([...presets, ...starters]);
            }}
            onClearAll={() => {
              storageService.resetAll();
              setPresets(storageService.loadPresets());
              setSettings(storageService.loadSettings());
              setLastUsedPresetId(null);
              setActiveWorkout(null);
              navigate({ type: 'home' });
            }}
          />
        )}
        {screen.type === 'recordings' && (
          <RecordingsScreen
            presets={presets}
            onBack={() => navigate({ type: 'settings' })}
          />
        )}
      </div>
    </I18nCtx>
  );
}
