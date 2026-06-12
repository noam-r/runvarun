import { useState, useEffect, useRef } from 'react';
import type { WorkoutPreset } from '../domain/types';
import { recordingStore, stepCueKey, SYSTEM_CUE_KEYS } from '../audio/recordingStore';
import { useI18n } from '../i18n';

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
      const text = step.announcement?.trim() || step.label;
      stepLabels.add(text);
    }
  }

  const stepItems: CueItem[] = Array.from(stepLabels).sort().map((label) => ({
    key: stepCueKey(label),
    label,
    category: 'step',
  }));

  const systemItems: CueItem[] = [
    { key: SYSTEM_CUE_KEYS.lastRound, label: 'Last round', category: 'system' },
    { key: SYSTEM_CUE_KEYS.workoutComplete, label: 'Workout complete', category: 'system' },
  ];

  return [...stepItems, ...systemItems];
}

export function RecordingsScreen({ presets, onBack }: Props) {
  const { t } = useI18n();
  const [cues] = useState(() => buildCueList(presets));
  const [recordedKeys, setRecordedKeys] = useState<Set<string>>(new Set());
  const [recordingKey, setRecordingKey] = useState<string | null>(null);
  const [playingKey, setPlayingKey] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Load which keys have recordings
  useEffect(() => {
    recordingStore.listKeys().then((keys) => setRecordedKeys(new Set(keys)));
  }, []);

  async function startRecording(key: string) {
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
        const blob = new Blob(chunksRef.current, { type: mimeType });
        await recordingStore.save(key, blob);
        setRecordedKeys((prev) => new Set([...prev, key]));
        setRecordingKey(null);
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecordingKey(key);
    } catch {
      // Mic permission denied or unavailable
      setRecordingKey(null);
    }
  }

  function stopRecording() {
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
  }

  const stepCues = cues.filter((c) => c.category === 'step');
  const systemCues = cues.filter((c) => c.category === 'system');

  return (
    <div className="screen recordings-screen">
      <header className="screen-header">
        <h2>{t.customRecordings}</h2>
      </header>

      <p className="recordings-hint">{t.recordingsHint}</p>

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
          <button className="btn-small btn-recording-stop" onClick={onStop}>{t.stopRec}</button>
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
            <button className="btn-small btn-ghost-danger" onClick={onDelete}>✕</button>
          </>
        )}
      </div>
    </div>
  );
}
