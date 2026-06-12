import { useState, useEffect, useCallback } from 'react';
import { HomeScreen } from './screens/HomeScreen';
import { EditorScreen } from './screens/EditorScreen';
import { ActiveWorkoutScreen } from './screens/ActiveWorkoutScreen';
import { PausedScreen } from './screens/PausedScreen';
import { CompleteScreen } from './screens/CompleteScreen';
import { RecoveryScreen } from './screens/RecoveryScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { RecordingsScreen } from './screens/RecordingsScreen';
import { storageService } from './storage/storageService';
import { I18nCtx, getI18nForLocale } from './i18n';
import type { WorkoutPreset, ActiveWorkout, AppSettings } from './domain/types';

export type Screen =
  | { type: 'home' }
  | { type: 'editor'; presetId: string | null }
  | { type: 'active' }
  | { type: 'paused' }
  | { type: 'complete' }
  | { type: 'recovery' }
  | { type: 'settings' }
  | { type: 'recordings' };

export function App() {
  const [screen, setScreen] = useState<Screen>({ type: 'home' });
  const [presets, setPresets] = useState<WorkoutPreset[]>([]);
  const [settings, setSettings] = useState<AppSettings>(storageService.loadSettings());
  const [activeWorkout, setActiveWorkout] = useState<ActiveWorkout | null>(null);
  const [lastUsedPresetId, setLastUsedPresetId] = useState<string | null>(null);

  const i18n = getI18nForLocale(settings.uiLanguage);

  // Apply dir and lang to document root
  useEffect(() => {
    document.documentElement.dir = i18n.dir;
    document.documentElement.lang = i18n.locale;
  }, [i18n.dir, i18n.locale]);

  // Initialize app state from storage
  useEffect(() => {
    const loadedPresets = storageService.loadPresets();
    setPresets(loadedPresets);
    setLastUsedPresetId(storageService.loadLastUsedPresetId());

    const savedWorkout = storageService.loadActiveWorkout();
    if (savedWorkout && (savedWorkout.status === 'running' || savedWorkout.status === 'paused')) {
      setActiveWorkout(savedWorkout);
      setScreen({ type: 'recovery' });
    }
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

  // Selected preset: last used, or first available
  const selectedPreset = presets.find((p) => p.id === lastUsedPresetId) ?? presets[0] ?? null;

  return (
    <I18nCtx value={i18n}>
      <div className="app-shell">
        {screen.type === 'home' && (
          <HomeScreen
            presets={presets}
            selectedPreset={selectedPreset}
            settings={settings}
            onStart={() => navigate({ type: 'active' })}
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
              navigate({ type: 'home' });
            }}
            onEdit={() => {
              updateActiveWorkout(null);
              if (selectedPreset) {
                navigate({ type: 'editor', presetId: selectedPreset.id });
              } else {
                navigate({ type: 'home' });
              }
            }}
            onHome={() => {
              updateActiveWorkout(null);
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
