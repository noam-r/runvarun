import { useState, useEffect, useRef, useCallback } from 'react';
import type { WorkoutPreset } from '../domain/types';
import { recordingStore, SYSTEM_CUE_KEYS } from '../audio/recordingStore';
import { normalizeCueKey } from '../audio/generation/cueKeyNormalization';
import { useI18n } from '../i18n';

const MAX_RECORDING_SECONDS = 5;

type Props = {
  presets: WorkoutPreset[];
  onBack: () => void;
};

type CueItem = {
  key: string;
  label: string;
  category: 'step' | 'system';
};

function buildCueList(presets: WorkoutPreset[]): CueItem[] {
  // Collect unique step labels across all presets
  const stepLabels = new Set<string>();
  for (const preset of presets) {
    for (const step of preset.steps) {
      stepLabels.add(step.label);
    }
  }

  const stepItems: CueItem[] = Array.from(stepLabels).sort().map((label) => ({
    key: normalizeCueKey(label),
    label,
    category: 'step',
  }));

  const systemItems: CueItem[] = [
    { key: SYSTEM_CUE_KEYS.lastRound, label: 'Last round', category: 'system' },
    { key: SYSTEM_CUE_KEYS.workoutComplete, label: 'Workout complete', category: 'system' },
  ];

  return [...stepItems, ...systemItems];
}

/**
 * Verify that a recorded blob can be decoded by Web Audio API.
 * Returns true if decoding succeeds, false otherwise.
 */
async function verifyRecording(blob: Blob): Promise<boolean> {
  try {
    const arrayBuffer = await blob.arrayBuffer();
    const audioContext = new AudioContext();
    try {
      await audioContext.decodeAudioData(arrayBuffer);
      return true;
    } finally {
      await audioContext.close();
    }
  } catch {
    return false;
  }
}

export function RecordingsScreen({ presets, onBack }: Props) {
  const { t } = useI18n();
  const [cues] = useState(() => buildCueList(presets));
  const [recordedKeys, setRecordedKeys] = useState<Set<string>>(new Set());
  const [recordingKey, setRecordingKey] = useState<string | null>(null);
  const [playingKey, setPlayingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleteMessage, setDeleteMessage] = useState<string | null>(null);
  const [recordingTimeLeft, setRecordingTimeLeft] = useState<number>(MAX_RECORDING_SECONDS);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const autoStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load which keys have recordings
  useEffect(() => {
    recordingStore.listKeys().then((keys) => setRecordedKeys(new Set(keys)));
  }, []);

  // Clear messages after a delay
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  useEffect(() => {
    if (deleteMessage) {
      const timer = setTimeout(() => setDeleteMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [deleteMessage]);

  const clearTimers = useCallback(() => {
    if (autoStopTimerRef.current) {
      clearTimeout(autoStopTimerRef.current);
      autoStopTimerRef.current = null;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
  }, []);

  async function startRecording(key: string) {
    setError(null);
    setDeleteMessage(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        clearTimers();

        const blob = new Blob(chunksRef.current, { type: mimeType });

        // Verify recording can be decoded before saving
        const valid = await verifyRecording(blob);
        if (!valid) {
          setError(t.recordingFailed);
          setRecordingKey(null);
          return;
        }

        await recordingStore.save(key, blob);
        setRecordedKeys((prev) => new Set([...prev, key]));
        setRecordingKey(null);
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecordingKey(key);
      setRecordingTimeLeft(MAX_RECORDING_SECONDS);

      // Countdown timer for visual feedback
      const startTime = Date.now();
      countdownIntervalRef.current = setInterval(() => {
        const elapsed = (Date.now() - startTime) / 1000;
        const remaining = Math.max(0, MAX_RECORDING_SECONDS - elapsed);
        setRecordingTimeLeft(Math.ceil(remaining));
      }, 200);

      // Auto-stop after 5 seconds
      autoStopTimerRef.current = setTimeout(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          mediaRecorderRef.current.stop();
          setError(t.maxRecordingDuration);
        }
      }, MAX_RECORDING_SECONDS * 1000);
    } catch {
      // Mic permission denied or unavailable
      setRecordingKey(null);
      clearTimers();
    }
  }

  function stopRecording() {
    clearTimers();
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  }

  async function playRecording(key: string) {
    setPlayingKey(key);
    await recordingStore.play(key);
    setPlayingKey(null);
  }

  async function deleteRecording(key: string) {
    await recordingStore.delete(key);
    setRecordedKeys((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
    setDeleteMessage(t.recordingDeleted);
  }

  const stepCues = cues.filter((c) => c.category === 'step');
  const systemCues = cues.filter((c) => c.category === 'system');

  return (
    <div className="screen recordings-screen">
      <header className="screen-header">
        <h2>{t.customRecordings}</h2>
      </header>

      <p className="recordings-hint">{t.recordingsHint}</p>

      {error && <div className="recordings-error" role="alert">{error}</div>}
      {deleteMessage && <div className="recordings-info" role="status">{deleteMessage}</div>}

      <div className="recordings-list">
        {stepCues.length > 0 && (
          <div className="recordings-section">
            <h3>{t.stepCues}</h3>
            {stepCues.map((cue) => (
              <CueRow
                key={cue.key}
                cue={cue}
                hasRecording={recordedKeys.has(cue.key)}
                isRecording={recordingKey === cue.key}
                isPlaying={playingKey === cue.key}
                recordingTimeLeft={recordingKey === cue.key ? recordingTimeLeft : null}
                onRecord={() => startRecording(cue.key)}
                onStop={stopRecording}
                onPlay={() => playRecording(cue.key)}
                onDelete={() => deleteRecording(cue.key)}
                t={t}
              />
            ))}
          </div>
        )}

        <div className="recordings-section">
          <h3>{t.systemCues}</h3>
          {systemCues.map((cue) => (
            <CueRow
              key={cue.key}
              cue={cue}
              hasRecording={recordedKeys.has(cue.key)}
              isRecording={recordingKey === cue.key}
              isPlaying={playingKey === cue.key}
              recordingTimeLeft={recordingKey === cue.key ? recordingTimeLeft : null}
              onRecord={() => startRecording(cue.key)}
              onStop={stopRecording}
              onPlay={() => playRecording(cue.key)}
              onDelete={() => deleteRecording(cue.key)}
              t={t}
            />
          ))}
        </div>
      </div>

      <div className="settings-actions">
        <button className="btn btn-primary btn-large" onClick={onBack}>{t.done}</button>
      </div>
    </div>
  );
}

function CueRow({
  cue,
  hasRecording,
  isRecording,
  isPlaying,
  recordingTimeLeft,
  onRecord,
  onStop,
  onPlay,
  onDelete,
  t,
}: {
  cue: CueItem;
  hasRecording: boolean;
  isRecording: boolean;
  isPlaying: boolean;
  recordingTimeLeft: number | null;
  onRecord: () => void;
  onStop: () => void;
  onPlay: () => void;
  onDelete: () => void;
  t: ReturnType<typeof useI18n>['t'];
}) {
  return (
    <div className={`cue-row ${isRecording ? 'cue-row--recording' : ''}`}>
      <div className="cue-row__label">
        <span className="cue-row__text">{cue.label}</span>
        {hasRecording && <span className="cue-row__badge">●</span>}
      </div>
      <div className="cue-row__actions">
        {isRecording ? (
          <>
            <span className="cue-row__timer">{recordingTimeLeft}s</span>
            <button className="btn-small btn-recording-stop" onClick={onStop}>{t.stopRec}</button>
          </>
        ) : (
          <button className="btn-small btn-recording" onClick={onRecord} aria-label={`Record ${cue.label}`}>
            {t.record}
          </button>
        )}
        {hasRecording && !isRecording && (
          <>
            <button className="btn-small" onClick={onPlay} disabled={isPlaying}>
              {isPlaying ? '...' : '▶'}
            </button>
            <button className="btn-small btn-ghost-danger" onClick={onDelete} aria-label={`Delete recording for ${cue.label}`}>✕</button>
          </>
        )}
      </div>
    </div>
  );
}
