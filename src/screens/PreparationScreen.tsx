import type { GenerationProgress } from '../audio/generation/types';

type Props = {
  presetName: string;
  progress: GenerationProgress | null;
  error: string | null;
  isReady: boolean;
  onStart: () => void;
  onCancel: () => void;
  onRetry: () => void;
  onFallback: () => void;
};

const PHASE_LABELS: Record<GenerationProgress['phase'], string> = {
  'resolving-cues': 'Loading cues',
  'rendering': 'Building audio',
  'encoding': 'Encoding MP3',
  'storing': 'Almost ready',
  'ready': 'Ready!',
};

export function PreparationScreen({
  presetName,
  progress,
  error,
  isReady,
  onStart,
  onCancel,
  onRetry,
  onFallback,
}: Props) {
  const phase = progress?.phase ?? 'resolving-cues';
  const percent = progress?.percent ?? 0;
  const phaseLabel = PHASE_LABELS[phase];

  // Error state
  if (error) {
    return (
      <div className="screen preparation-screen">
        <div className="preparation-header">
          <h2 className="preparation-preset-name">{presetName}</h2>
        </div>

        <div className="preparation-error">
          <div className="preparation-error__icon">⚠</div>
          <p className="preparation-error__message">{error}</p>
        </div>

        <div className="preparation-actions">
          <button className="btn btn-primary btn-large" onClick={onRetry}>
            Retry
          </button>
          <button className="btn-link" onClick={onFallback}>
            Use Screen-On Timer Mode
          </button>
        </div>
      </div>
    );
  }

  // Ready state
  if (isReady) {
    return (
      <div className="screen preparation-screen">
        <div className="preparation-header">
          <h2 className="preparation-preset-name">{presetName}</h2>
        </div>

        <div className="preparation-status">
          <div className="preparation-phase preparation-phase--ready">Ready!</div>
          <div className="preparation-progress-bar">
            <div
              className="preparation-progress-bar__fill preparation-progress-bar__fill--complete"
              style={{ width: '100%' }}
            />
          </div>
        </div>

        <div className="preparation-actions">
          <button className="btn btn-primary btn-large" onClick={onStart}>
            START
          </button>
        </div>
      </div>
    );
  }

  // In-progress state (default)
  return (
    <div className="screen preparation-screen">
      <div className="preparation-header">
        <h2 className="preparation-preset-name">{presetName}</h2>
      </div>

      <div className="preparation-status">
        <div className="preparation-phase">{phaseLabel}</div>
        <div className="preparation-progress-bar">
          <div
            className="preparation-progress-bar__fill"
            style={{ width: `${percent}%` }}
          />
        </div>
        <div className="preparation-percent">{Math.round(percent)}%</div>
      </div>

      <div className="preparation-actions">
        <button className="btn btn-secondary btn-large" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
