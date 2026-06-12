# RunVaRun

A private, offline-capable interval running timer for your phone. Define timed workout steps, repeat them, and hear voice cues at every transition — no accounts, no cloud, no app store.

## What it does

Before a run, you open RunVaRun, pick a saved workout (or create one), and tap START. The app counts down each step, announces transitions with your own recorded voice or text-to-speech, and continues until all rounds are complete. You put the phone away and follow the audio cues.

A typical workout:

```
Run 60 seconds → Walk 30 seconds → Repeat 5 times
```

## Features

- **One-tap start** — big green START button on the home screen, no intermediate screens
- **Custom voice recordings** — record your own cues for each step (stored locally in IndexedDB)
- **Fallback audio chain** — custom recording → text-to-speech → beep
- **Timestamp-based timer** — accurate even when the phone throttles JavaScript
- **Pause / resume / stop** — paused time doesn't count toward workout duration
- **Recovery** — if you accidentally close the app mid-workout, it offers to resume
- **Offline-first PWA** — works without internet after first load, installable to home screen
- **Hebrew + English UI** — full i18n with RTL support
- **Dark high-contrast theme** — readable outdoors, battery-friendly
- **Wake lock** — keeps the screen on during workouts (where supported)
- **No backend** — all data stays on your device in localStorage

## Tech stack

- Vite + TypeScript + React
- localStorage (single `runvarun:v1` key) for presets, settings, and workout state
- IndexedDB for recorded audio blobs
- Web Speech API + Web Audio API (beep fallback)
- Service Worker for offline caching
- Screen Wake Lock API (optional)

## Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Run tests (timer engine)
npm test

# Build for production
npm run build

# Preview production build
npm run preview
```

## Deployment

The `dist/` folder is a fully static site. Deploy it to any HTTPS host:

```bash
npm run build
# Upload dist/ to Netlify, Vercel, Cloudflare Pages, GitHub Pages, etc.
```

Requirements:
- HTTPS (needed for service worker, wake lock, and microphone access)
- No server-side runtime needed

## Project structure

```
src/
  domain/       Types, validation, duration formatting
  engine/       Timer state machine (framework-independent, tested)
  storage/      localStorage adapter with versioned envelope
  audio/        Speech, beep, vibration, recording store, cue dispatcher
  pwa/          Wake lock service
  screens/      React screen components
  components/   Shared UI components (ErrorBoundary)
  i18n/         Translation maps and context
  styles/       CSS
public/
  sw.js         Service worker
  manifest.webmanifest
  icons/
```

## How it works

1. **Presets** are saved workout templates (name, steps, repeat count)
2. **Starting** clones the preset into an `ActiveWorkout` snapshot and begins the timer
3. **Timer engine** uses wall-clock timestamps (`stepEndsAt = now + duration`), not interval counters
4. **On each tick**, remaining time is derived from `stepEndsAt - Date.now()`
5. **Step transitions** are schedule-preserving: next step starts from the previous planned end time, not the delayed callback time
6. **Cue dispatch** checks for a custom recording first, falls back to TTS, then beep
7. **Persistence** writes active state to localStorage every transition so recovery works after refresh

## License

Private project.
