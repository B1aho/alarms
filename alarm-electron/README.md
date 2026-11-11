# Alarm — Electron

Desktop alarm clock in the style of Apple Clock, built on Electron and plain JavaScript (no UI framework,
no bundler). Functionality and design follow [`../ALARM_SPEC.md`](../ALARM_SPEC.md). The alarm rings with its window closed:
the app lives in the menu bar / tray.

## Commands

```bash
npm install
npm start              # development run (electron .)
npm run check          # validators up to date, tsc --checkJs, dependency-cruiser, ESLint, Prettier, all node:test tests
npm run test:e2e       # Playwright _electron: e2e scenarios and visual tests (36 references × 2 themes)
npm run dist           # installers: macOS .dmg, Windows NSIS .exe, Linux .AppImage and .deb (into dist/)
npm run dist:mac       # macOS only
npm run gen:validators # regenerate src/contract/schemas/validators.js after a schema change
npm run icons          # re-render assets/*.png from assets/*.svg
```

## Architecture (short)

Event-driven, multi-process. Processes talk only through messages on a bus; state is an event journal with a
pure decider; the window is MVU without a framework.

| Process | Code | Role |
|---|---|---|
| `main` (shell) | `src/shell/` | tray, windows, notifications, keep-awake, login item, single instance, protocols, **bus broker** |
| `engine` | `src/engine/` (utilityProcess) | the only owner of state: `decide(state, cmd, now, rng) → events → journal (append + fsync) → evolve → projection` |
| `audio` | `src/audio/` (hidden renderer) | all sounds: synthesis, ramp, fades, file probing |
| `ui` | `src/ui/` (renderer, while the window is open) | MVU: `model` + `update(model, msg) → [model, effects]` + `view(model) → vnode` + `patch` |

- `src/contract/` — every message (`{ type, ...payload }`) with a JSON Schema; schemas are compiled by ajv
  ahead of time into the self-contained `schemas/validators.js` (sandboxed renderers, the engine and the shell
  cannot load npm packages). Every process validates every incoming message and drops invalid ones.
- `src/domain/` — pure rules: decider, evolve, upcast, projections, schedule, tasks, ramp, formats, texts.
  No clock, randomness or I/O (ESLint enforces it).
- Dependency rules (`.dependency-cruiser.cjs`) fix which layer may import which; `test/contract/architecture.test.js`
  proves that a forbidden import makes `npm run check` fail.

## Where the data lives

`app.getPath('userData')`, separate for every OS user:

| OS | Folder |
|---|---|
| macOS | `~/Library/Application Support/Alarm/` |
| Windows | `%APPDATA%\Alarm\` |
| Linux | `~/.config/Alarm/` |

Inside: `journal.jsonl` (event log, append + fsync), `snapshot.json` (every 500 events; the journal is compacted
at start when larger than 5 MB), `sounds/<id>.<ext>` (copies of imported music files). A broken journal line is
skipped; a broken setting falls back to its default.

## Platform differences

- **macOS:** notification permission is requested with **Turn On**; its state is read from the Notification Center
  preferences. With the window closed the Dock icon is hidden; the menu bar keeps a template icon.
- **Windows:** notifications use `scenario="alarm"` toasts with a Snooze button; an alarm can wake the computer
  through a per-user Task Scheduler task. Notification status is always "On".
- **Linux:** Electron notifications have no action buttons, so **Snooze** is in the tray menu only; autostart is a
  `.desktop` file in `~/.config/autostart`; Inter is bundled. Notification status is always "On".
- **Open at Login** is registered only by packaged builds (in development it would register the bare Electron
  binary); set `ALARM_FORCE_LOGIN_ITEM=1` to force it.

## Test hooks

`ALARM_TEST=1` enables test-only behaviour: `ALARM_USER_DATA`, `ALARM_TEST_CLOCK` (engine start time),
`TestSetClock` messages from the shell, `ALARM_TEST_NOTIFICATIONS`, `ALARM_TEST_DSF` (device scale factor for
screenshots), `ALARM_TEST_KEEP_BOUNDS` (the ringing window keeps 1100 × 820 for visual tests) and
`globalThis.__alarm` hooks in the main process. Without `ALARM_TEST=1` none of this is active.

Tests run **quietly** so they do not disturb whoever is using the computer: windows are transparent,
click-through and never take focus, the Dock icon is hidden, audio is muted (Web Audio still runs, so gains are
checked) and no real OS notifications are posted (they are recorded for assertions). `ALARM_TEST_VISIBLE=1`
turns this off for debugging.

Visual references are copies of `docs/screens` in `test/visual/baseline/` (`scripts/prepare-visual-baselines.cjs`);
the Settings references are compared on their first 1100 × 820 frame with the RELIABILITY row that differs by
design masked. Each state is also rendered in the other theme against a self-recorded baseline (`*--light.png`,
`*--dark.png`).
