# Alarm: desktop alarm clock (React PWA)

An offline-first alarm clock for desktop browsers, styled after Apple's Clock app (iOS/macOS look: dark by default, light theme, SF system font, grouped lists, wheel pickers, sheets).

Stack: React 19 · Vite 8 · TypeScript · TanStack Router · Tailwind CSS 4 · vite-plugin-pwa (injectManifest) · idb · zod.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + production build into dist/
npm run preview    # serve the production build (service worker active)
npm run check      # typecheck + lint (incl. architecture rules) + unit tests
```

## Features

| Requirement | Where |
| --- | --- |
| Alarms at a set time, repeat on chosen weekdays, label, snooze, enable/disable, edit/delete | `features/alarms` |
| Smooth volume ramp-up (quadratic gain curve, 15 s to 10 min) | `shared/audio/player.ts` |
| Dismissal task: math (easy/medium/hard) or retype a code, 1–5 in a row; a wrong answer gives a new problem | `features/alarms/model/tasks.ts`, `ui/RingingOverlay.tsx` |
| Custom music file from the computer (copied into IndexedDB, so it still works if the original moves) | `shared/audio/library.ts`, `shared/ui/SoundPicker.tsx` |
| Built-in sounds synthesised at runtime (no audio assets, works offline) | `shared/audio/tones.ts` |
| Timer (with recents) and stopwatch (with laps, Space/L shortcuts) | `features/timer`, `features/stopwatch` |
| Settings: theme, 12/24 h, defaults, snooze length, keep-awake, music library | `features/settings` |
| Local, per-OS-user storage, no account, no sync, no network | IndexedDB (`shared/db`) |

## Architecture (Feature-Sliced)

```
src/
 ├── main.tsx, sw.ts      app layer: entry point and service worker
 ├── app/                 router, root layout, bootstrap   → may import features, shared
 ├── features/<name>/     alarms, timer, stopwatch, settings → may import shared + itself only
 │    └── index.ts        the feature's public API
 └── shared/              ui, db, audio, notify, settings store, lib → shared only
```

The rules are enforced by a custom ESLint rule, `eslint/architecture.js` (`architecture/layers`), which has its own tests:

- `shared` may import only from `shared`
- a feature may not import `app` or any other feature
- code outside a feature may import it only through `@/features/<name>`, not its internals

Settings are needed by several features, so the settings store lives in `shared/settings`. The settings feature only holds the UI.

## How alarms fire

- A dedicated Web Worker sends a heartbeat every 500 ms. Worker timers are not throttled like background-tab timers.
- Only one tab runs the engine, chosen with a Web Lock, so an alarm never rings twice. Other tabs stay in sync through `BroadcastChannel`.
- Ringing state is saved to IndexedDB, so an alarm keeps ringing after a reload.
- If the computer was asleep at alarm time, the alarm still rings when it wakes, as long as it is within the grace window (60 min by default). Past that, it shows a "Missed alarm" notification instead.
- A system notification goes out through the service worker, with a Snooze button.
- The optional Screen Wake Lock ("Keep Computer Awake") stops the machine from going to sleep while alarms are on.

## Known limitation (as stated in the architecture plan)

This is a PWA without a native wrapper. **An alarm cannot ring when the browser is fully quit or the computer is asleep.** It rings when the window is minimised, hidden or behind other windows, and when the screen is locked, as long as the browser keeps running. For the best results:

1. Install it as an app (Chrome/Edge: address bar → Install). Installed PWAs may play sound without a click first.
2. Keep it running. In Chrome, enable *Settings → System → Continue running background apps when Chrome is closed*.
3. Allow notifications and turn on *Keep Computer Awake*.

Meeting the "rings even when closed" requirement fully needs a native shell (Tauri or Electron) with OS-level scheduling.
