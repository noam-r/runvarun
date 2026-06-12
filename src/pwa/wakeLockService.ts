let wakeLock: WakeLockSentinel | null = null;
let shouldBeActive = false;
let listenerRegistered = false;

function ensureVisibilityListener() {
  if (listenerRegistered) return;
  if (typeof document === 'undefined') return;
  listenerRegistered = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && shouldBeActive) {
      wakeLockService.reacquire();
    }
  });
}

export const wakeLockService = {
  isSupported(): boolean {
    return 'wakeLock' in navigator;
  },

  async request(): Promise<boolean> {
    if (!this.isSupported()) return false;
    shouldBeActive = true;
    ensureVisibilityListener();
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => {
        wakeLock = null;
      });
      return true;
    } catch {
      return false;
    }
  },

  async release(): Promise<void> {
    shouldBeActive = false;
    if (wakeLock) {
      try {
        await wakeLock.release();
      } catch {
        // Already released
      }
      wakeLock = null;
    }
  },

  async reacquire(): Promise<void> {
    if (shouldBeActive && !wakeLock && document.visibilityState === 'visible') {
      try {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => {
          wakeLock = null;
        });
      } catch {
        // Failed to reacquire
      }
    }
  },

  isActive(): boolean {
    return wakeLock !== null;
  },
};
