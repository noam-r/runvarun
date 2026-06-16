/**
 * AudioRecoveryScreen — shown when a page reload detected an active audio workout
 * but the track blob is no longer available in IndexedDB.
 *
 * Offers:
 * - Restart Workout: regenerates the audio track and starts fresh
 * - Discard: clears persisted state and returns to home
 */

import { useI18n } from '../i18n';

type Props = {
  presetName: string;
  onRestart: () => void;
  onDiscard: () => void;
};

export function AudioRecoveryScreen({ presetName, onRestart, onDiscard }: Props) {
  const { t } = useI18n();

  return (
    <div className="screen audio-recovery-screen">
      <div className="recovery-message">
        {t.audioRecoveryInterrupted}
      </div>

      <div className="recovery-details">
        <p className="recovery-name">{presetName}</p>
        <p className="recovery-unavailable">{t.audioRecoveryTrackUnavailable}</p>
      </div>

      <div className="recovery-actions">
        <button className="btn btn-primary btn-large" onClick={onRestart}>
          {t.audioRecoveryRestart}
        </button>
        <button className="btn btn-secondary" onClick={onDiscard}>
          {t.discard}
        </button>
      </div>
    </div>
  );
}
