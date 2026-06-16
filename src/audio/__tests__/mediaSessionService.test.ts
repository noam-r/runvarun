import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  setInitialMetadata,
  updateStepMetadata,
  registerActionHandlers,
  clearMediaSession,
} from '../mediaSessionService';
import type { TimelineSegment } from '../generation/types';

// ─── MediaMetadata Polyfill for Node test environment ────────────────────────

class MediaMetadataMock {
  title: string;
  artist: string;
  album: string;
  artwork: Array<{ src: string; sizes?: string; type?: string }>;

  constructor(init?: { title?: string; artist?: string; album?: string; artwork?: Array<{ src: string; sizes?: string; type?: string }> }) {
    this.title = init?.title ?? '';
    this.artist = init?.artist ?? '';
    this.album = init?.album ?? '';
    this.artwork = init?.artwork ?? [];
  }
}

// Assign to global so that `new MediaMetadata(...)` works in the service code
(globalThis as unknown as { MediaMetadata: typeof MediaMetadataMock }).MediaMetadata = MediaMetadataMock;

// ─── Mock Setup ──────────────────────────────────────────────────────────────

function setupMediaSessionMock() {
  const setActionHandler = vi.fn();
  const mediaSession = {
    metadata: null as MediaMetadataMock | null,
    setActionHandler,
  };

  // Create a navigator-like object with mediaSession on globalThis
  const nav = (globalThis as unknown as { navigator: Record<string, unknown> }).navigator ?? {};
  nav.mediaSession = mediaSession;
  (globalThis as unknown as { navigator: Record<string, unknown> }).navigator = nav;

  return { mediaSession, setActionHandler };
}

function removeMediaSessionMock() {
  const nav = (globalThis as unknown as { navigator: Record<string, unknown> }).navigator;
  if (nav) {
    delete nav.mediaSession;
  }
}

function makeSegment(overrides: Partial<TimelineSegment> = {}): TimelineSegment {
  return {
    id: 'seg_r1_s0',
    roundIndex: 1,
    stepIndex: 0,
    stepLabel: 'Run',
    startsAtSeconds: 60,
    endsAtSeconds: 90,
    durationSeconds: 30,
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('mediaSessionService', () => {
  describe('when Media Session API is available', () => {
    let mock: ReturnType<typeof setupMediaSessionMock>;

    beforeEach(() => {
      mock = setupMediaSessionMock();
    });

    describe('setInitialMetadata', () => {
      it('sets metadata with workout name as title and RunVaRun as artist', () => {
        setInitialMetadata('5K Training');

        expect(mock.mediaSession.metadata).not.toBeNull();
        expect(mock.mediaSession.metadata!.title).toBe('5K Training');
        expect(mock.mediaSession.metadata!.artist).toBe('RunVaRun');
      });
    });

    describe('updateStepMetadata', () => {
      it('sets metadata title with step label and round info', () => {
        const segment = makeSegment({ stepLabel: 'Run', roundIndex: 1 });
        updateStepMetadata(segment, 5);

        expect(mock.mediaSession.metadata).not.toBeNull();
        expect(mock.mediaSession.metadata!.title).toBe('Run - Round 2/5');
        expect(mock.mediaSession.metadata!.artist).toBe('RunVaRun');
      });

      it('shows correct round numbers (1-based display from 0-based index)', () => {
        const segment = makeSegment({ stepLabel: 'Walk', roundIndex: 4 });
        updateStepMetadata(segment, 10);

        expect(mock.mediaSession.metadata!.title).toBe('Walk - Round 5/10');
      });
    });

    describe('registerActionHandlers', () => {
      it('registers play and pause handlers', () => {
        const onPlay = vi.fn();
        const onPause = vi.fn();
        registerActionHandlers({ onPlay, onPause });

        expect(mock.setActionHandler).toHaveBeenCalledWith('play', expect.any(Function));
        expect(mock.setActionHandler).toHaveBeenCalledWith('pause', expect.any(Function));
      });

      it('play handler calls onPlay callback', () => {
        const onPlay = vi.fn();
        const onPause = vi.fn();
        registerActionHandlers({ onPlay, onPause });

        // Find and invoke the play handler
        const playCall = mock.setActionHandler.mock.calls.find(
          (call) => call[0] === 'play',
        );
        playCall![1]();

        expect(onPlay).toHaveBeenCalledTimes(1);
      });

      it('pause handler calls onPause callback', () => {
        const onPlay = vi.fn();
        const onPause = vi.fn();
        registerActionHandlers({ onPlay, onPause });

        // Find and invoke the pause handler
        const pauseCall = mock.setActionHandler.mock.calls.find(
          (call) => call[0] === 'pause',
        );
        pauseCall![1]();

        expect(onPause).toHaveBeenCalledTimes(1);
      });
    });

    describe('clearMediaSession', () => {
      it('clears metadata and removes action handlers', () => {
        mock.mediaSession.metadata = new MediaMetadataMock({ title: 'test' });
        clearMediaSession();

        expect(mock.mediaSession.metadata).toBeNull();
        expect(mock.setActionHandler).toHaveBeenCalledWith('play', null);
        expect(mock.setActionHandler).toHaveBeenCalledWith('pause', null);
      });
    });
  });

  describe('when Media Session API is unavailable', () => {
    beforeEach(() => {
      removeMediaSessionMock();
    });

    it('setInitialMetadata does not throw', () => {
      expect(() => setInitialMetadata('Test')).not.toThrow();
    });

    it('updateStepMetadata does not throw', () => {
      const segment = makeSegment();
      expect(() => updateStepMetadata(segment, 5)).not.toThrow();
    });

    it('registerActionHandlers does not throw', () => {
      expect(() =>
        registerActionHandlers({ onPlay: vi.fn(), onPause: vi.fn() }),
      ).not.toThrow();
    });

    it('clearMediaSession does not throw', () => {
      expect(() => clearMediaSession()).not.toThrow();
    });
  });
});
