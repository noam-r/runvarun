import { useState, useEffect } from 'react';
import type { AppSettings, AppSettingsV2 } from '../domain/types';
import { vibrationService } from '../audio/vibrationService';
import { speechService } from '../audio/speechService';
import { wakeLockService } from '../pwa/wakeLockService';
import { storageService } from '../storage/storageService';
import { useI18n } from '../i18n';

type Props = {
  settings: AppSettings;
  onUpdate: (settings: AppSettings) => void;
  onBack: () => void;
  onRecordings: () => void;
  onResetStarters: () => void;
  onClearAll: () => void;
};

export function SettingsScreen({ settings, onUpdate, onBack, onRecordings, onResetStarters, onClearAll }: Props) {
  const [confirmClear, setConfirmClear] = useState(false);
  const [showDataSection, setShowDataSection] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<'idle' | 'testing' | 'success' | 'failed'>('idle');
  const [settingsV2, setSettingsV2] = useState<AppSettingsV2>(() => storageService.loadSettingsV2());
  const { t } = useI18n();

  // Keep v2 settings in sync if the component re-mounts
  useEffect(() => {
    setSettingsV2(storageService.loadSettingsV2());
  }, []);

  function updateV2(patch: Partial<AppSettingsV2>) {
    const updated = { ...settingsV2, ...patch };
    setSettingsV2(updated);
    storageService.saveSettingsV2(updated);
  }

  async function handleTestVoice() {
    setVoiceStatus('testing');
    const result = await speechService.test();
    setVoiceStatus(result.success ? 'success' : 'failed');
    setTimeout(() => setVoiceStatus('idle'), 3000);
  }

  function toggle(key: keyof AppSettings) {
    const current = settings[key];
    if (typeof current === 'boolean') {
      onUpdate({ ...settings, [key]: !current });
    }
  }

  return (
    <div className="screen settings-screen">
      <header className="screen-header">
        <h2>{t.settings}</h2>
      </header>

      <div className="settings-list">
        <div className="settings-section">
          <h3>{t.uiLanguage}</h3>
          <label className="setting-row">
            <span>{t.uiLanguage}</span>
            <select
              value={settings.uiLanguage}
              onChange={(e) => onUpdate({ ...settings, uiLanguage: e.target.value as AppSettings['uiLanguage'] })}
            >
              <option value="en">{t.english}</option>
              <option value="he">{t.hebrew}</option>
            </select>
          </label>
        </div>

        {/* Runtime Mode Section */}
        <div className="settings-section">
          <h3>{t.runtimeMode}</h3>
          <label className="setting-row">
            <span>{t.runtimeMode}</span>
            <select
              value={settingsV2.runtimeMode}
              onChange={(e) => updateV2({ runtimeMode: e.target.value as AppSettingsV2['runtimeMode'] })}
            >
              <option value="reliable-audio">{t.reliableAudio}</option>
              <option value="screen-on-timer">{t.screenOnTimer}</option>
            </select>
          </label>
          {settingsV2.runtimeMode === 'screen-on-timer' && (
            <p className="setting-warning">{t.screenOnTimerWarning}</p>
          )}
        </div>

        {/* Audio Cues Section — shown when runtime mode is reliable-audio */}
        {settingsV2.runtimeMode === 'reliable-audio' && (
          <div className="settings-section">
            <h3>{t.audioCues}</h3>
            <label className="setting-row">
              <span>{t.pacerEnabled}</span>
              <input
                type="checkbox"
                checked={settingsV2.pacerEnabled}
                onChange={() => updateV2({ pacerEnabled: !settingsV2.pacerEnabled })}
              />
            </label>
            <label className="setting-row">
              <span>{t.countdownCue}</span>
              <select
                value={settingsV2.countdownCue}
                onChange={(e) => updateV2({ countdownCue: e.target.value as AppSettingsV2['countdownCue'] })}
              >
                <option value="off">{t.countdownOff}</option>
                <option value="last-3-seconds">{t.countdownLast3}</option>
              </select>
            </label>
            <label className="setting-row">
              <span>{t.finalRoundCue}</span>
              <input
                type="checkbox"
                checked={settingsV2.finalRoundCueEnabled}
                onChange={() => updateV2({ finalRoundCueEnabled: !settingsV2.finalRoundCueEnabled })}
              />
            </label>
            <label className="setting-row">
              <span>{t.workoutStartCue}</span>
              <input
                type="checkbox"
                checked={settingsV2.workoutStartCueEnabled}
                onChange={() => updateV2({ workoutStartCueEnabled: !settingsV2.workoutStartCueEnabled })}
              />
            </label>
            <label className="setting-row">
              <span>{t.completionCue}</span>
              <input
                type="checkbox"
                checked={settingsV2.completionCueEnabled}
                onChange={() => updateV2({ completionCueEnabled: !settingsV2.completionCueEnabled })}
              />
            </label>
          </div>
        )}

        {/* Legacy Audio Section — shown when screen-on-timer mode */}
        {settingsV2.runtimeMode === 'screen-on-timer' && (
          <div className="settings-section">
            <h3>{t.audio}</h3>

            <div className="setting-row setting-row--action">
              <button className="btn btn-secondary" onClick={handleTestVoice} disabled={voiceStatus === 'testing'}>
                {voiceStatus === 'testing' ? t.testing : t.testVoice}
              </button>
              {voiceStatus === 'success' && <span className="voice-status voice-status--ok">{t.voiceReady}</span>}
              {voiceStatus === 'failed' && <span className="voice-status voice-status--warn">{t.voiceMayNotWork}</span>}
            </div>

            <div className="setting-row setting-row--action">
              <button className="btn btn-secondary" onClick={onRecordings}>
                {t.manageRecordings}
              </button>
            </div>

            <label className="setting-row">
              <span>{t.voiceCues}</span>
              <input type="checkbox" checked={settings.voiceCuesEnabled} onChange={() => toggle('voiceCuesEnabled')} />
            </label>
            <label className="setting-row">
              <span>{t.voiceLanguage}</span>
              <select
                value={settings.voiceLanguage}
                onChange={(e) => onUpdate({ ...settings, voiceLanguage: e.target.value as AppSettings['voiceLanguage'] })}
              >
                <option value="system">{t.systemDefault}</option>
                <option value="en">{t.english}</option>
                <option value="he">{t.hebrew}</option>
              </select>
            </label>
            <label className="setting-row">
              <span>{t.beepFallbackSetting}</span>
              <input type="checkbox" checked={settings.beepCuesEnabled} onChange={() => toggle('beepCuesEnabled')} />
            </label>
            <label className="setting-row">
              <span>{t.countdownCue}</span>
              <select
                value={settings.countdownCue}
                onChange={(e) => onUpdate({ ...settings, countdownCue: e.target.value as AppSettings['countdownCue'] })}
              >
                <option value="off">{t.countdownOff}</option>
                <option value="last3seconds">{t.countdownLast3}</option>
              </select>
            </label>
            <label className="setting-row">
              <span>{t.finalRoundCue}</span>
              <input type="checkbox" checked={settings.finalRoundCueEnabled} onChange={() => toggle('finalRoundCueEnabled')} />
            </label>
            <label className="setting-row">
              <span>{t.completionCue}</span>
              <input type="checkbox" checked={settings.completionCueEnabled} onChange={() => toggle('completionCueEnabled')} />
            </label>
            {vibrationService.isSupported() && (
              <label className="setting-row">
                <span>{t.vibration}</span>
                <input type="checkbox" checked={settings.vibrationEnabled} onChange={() => toggle('vibrationEnabled')} />
              </label>
            )}
          </div>
        )}

        {/* Recordings button — always accessible in reliable-audio mode */}
        {settingsV2.runtimeMode === 'reliable-audio' && (
          <div className="settings-section">
            <div className="setting-row setting-row--action">
              <button className="btn btn-secondary" onClick={onRecordings}>
                {t.manageRecordings}
              </button>
            </div>
          </div>
        )}

        <div className="settings-section">
          <h3>{t.display}</h3>
          {wakeLockService.isSupported() ? (
            <label className="setting-row">
              <span>{t.keepScreenAwake}</span>
              <input type="checkbox" checked={settings.keepScreenAwake} onChange={() => toggle('keepScreenAwake')} />
            </label>
          ) : (
            <p className="setting-unavailable">{t.wakeLockUnsupported}</p>
          )}
          {vibrationService.isSupported() && (
            <label className="setting-row">
              <span>{t.vibration}</span>
              <input type="checkbox" checked={settings.vibrationEnabled} onChange={() => toggle('vibrationEnabled')} />
            </label>
          )}
        </div>

        {/* Data section is collapsed by default — not a primary action */}
        <div className="settings-section settings-section--data">
          <button
            className="settings-section__toggle"
            onClick={() => setShowDataSection(!showDataSection)}
          >
            <h3>{t.data}</h3>
            <span className="toggle-indicator">{showDataSection ? '▾' : '▸'}</span>
          </button>

          {showDataSection && (
            <div className="settings-data-content">
              <button className="btn-link" onClick={onResetStarters}>{t.restoreStarters}</button>
              {confirmClear ? (
                <div className="confirm-clear">
                  <p>{t.clearConfirm}</p>
                  <div className="confirm-clear__buttons">
                    <button className="btn btn-danger" onClick={() => { onClearAll(); setConfirmClear(false); }}>{t.yesClear}</button>
                    <button className="btn btn-secondary" onClick={() => setConfirmClear(false)}>{t.cancel}</button>
                  </div>
                </div>
              ) : (
                <button className="btn-link btn-link--danger" onClick={() => setConfirmClear(true)}>{t.clearAllData}</button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Primary CTA: Done button at the bottom in the thumb zone */}
      <div className="settings-actions">
        <button className="btn btn-primary btn-large" onClick={onBack}>{t.done}</button>
      </div>
    </div>
  );
}
