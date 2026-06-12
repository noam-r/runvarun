import { useState } from 'react';
import type { AppSettings } from '../domain/types';
import { vibrationService } from '../audio/vibrationService';
import { speechService } from '../audio/speechService';
import { wakeLockService } from '../pwa/wakeLockService';
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
  const { t } = useI18n();

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
