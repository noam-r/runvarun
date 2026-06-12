/** Format seconds as MM:SS for display. */
export function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/** Format milliseconds as MM:SS for countdown display. Uses ceil so timer doesn't show 00:00 before step ends. */
export function formatRemainingMs(ms: number): string {
  const totalSeconds = Math.ceil(Math.max(0, ms) / 1000);
  return formatDuration(totalSeconds);
}

/** Calculate total workout duration in seconds from steps and repeat count. */
export function totalWorkoutDuration(steps: { durationSeconds: number }[], repeatCount: number): number {
  const roundDuration = steps.reduce((sum, s) => sum + s.durationSeconds, 0);
  return roundDuration * repeatCount;
}
