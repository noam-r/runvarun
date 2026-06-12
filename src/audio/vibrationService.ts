export const vibrationService = {
  isSupported(): boolean {
    return 'vibrate' in navigator;
  },

  pulse(pattern: number | number[]): void {
    if (this.isSupported()) {
      try {
        navigator.vibrate(pattern);
      } catch {
        // Silently fail
      }
    }
  },

  transitionPulse(): void {
    this.pulse(200);
  },

  completionPulse(): void {
    this.pulse([200, 100, 200]);
  },
};
