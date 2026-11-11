# Alarm — Python (actors + Qt Quick)

A desktop alarm clock in the style of Apple Clock: one resident process with pykka actors under a
supervisor and a Qt Quick window (MVVM). Behaviour and design follow [`ALARM_SPEC.md`](../ALARM_SPEC.md).

The alarm rings while its window is closed: the process lives in the menu bar / tray.

## Commands

| Command | What it does |
|---|---|
| `uv run alarm` | run in development (`--hidden` to start in the tray) |
| `uv run poe check` | `ruff`, `pyright --strict`, `lint-imports`, unit / actor / UI tests |
| `uv run poe e2e` | end-to-end tests: the real process, headless (`QT_QPA_PLATFORM=offscreen`), fake clock |
| `uv run poe visual` | compare 36 screens with `docs/screens` (macOS; **opens real windows**) |
| `uv run poe dist` | Briefcase installer for the current OS (`.dmg` on macOS, `.msi` on Windows, `.deb`/`.rpm` on Linux) |
| `uv run python scripts/make_icons.py` | regenerate the app icon in `resources/icon/` |

`ALARM_E2E_LAUNCHD=1 uv run poe e2e` also runs the `kill -9` test, which registers a temporary
LaunchAgent; run it only on a machine nobody is using.

Test-only flags: `--fake-clock <epoch ms | ISO>[@speed]`, `--test-control` (fault injection on the
local socket), `--data-dir`, environment `ALARM_AUDIO=null` (no audio device).

## Architecture (short)

```
alarm.__main__   bootstrap: single instance, QApplication, Supervisor, subscriptions, tray, window
alarm.ui         UiBridge (actor events → queued Qt signals), ViewModels, QML, tray
alarm.actors     clock, settings, alarms, timer, stopwatch, sounds, store, audio/, notifier, power/
alarm.kernel     Actor (pykka), Address/registry (tell, ask, publish), Supervisor, clock
alarm.messages   frozen dataclasses — the only link between actors
alarm.rules      pure rules and pydantic models: schedule, tasks, ramp, formats, strings
```

- Actors never call each other: `tell` / `ask` through addresses that survive restarts; mail sent
  while an actor is down waits and is delivered to the next incarnation.
- The supervisor restarts a crashed actor after 0.5 → 1 → 2 → 5 s; more than 5 crashes in 60 s
  ends the process with code 70 so the login agent restarts it.
- `AlarmActor` writes `ringing_since` (ask to `StoreActor`) before it plays and notifies.
- The window and its ViewModels are created on demand and destroyed on close; the UI never `ask`s.
- `import-linter` keeps the layers: bootstrap → (ui | actors) → kernel → messages → rules.

## Where the data lives

`platformdirs.user_data_dir("Alarm")` (macOS: `~/Library/Application Support/Alarm`):
`alarms/<id>.json`, `settings.json`, `timer.json`, `stopwatch.json`, `sounds.json`,
`sounds/<id>.<ext>`, `alarm.lock`. Writes are atomic (temporary file + `os.replace`).
Log: `user_log_dir("Alarm")/alarm.log`, rotated 5 × 1 MB.

## Open at Login

On by default. macOS: `~/Library/LaunchAgents/org.alarmclock.alarm.plist`
(`KeepAlive = { SuccessfulExit = false }`); Linux: `systemd --user` unit with `Restart=on-failure`
(fallback `~/.config/autostart/alarm.desktop`); Windows: a Task Scheduler logon task with restart on
failure (fallback `HKCU\…\Run`). A manual launch hands over to the agent so a crash is restarted.
In development (`uv run alarm`) nothing is registered unless `ALARM_DEV_AUTOSTART=1`.

## Known platform differences

- Notifications on macOS need the signed app bundle; from `uv run` desktop-notifier has no macOS
  backend and nothing is shown.
- Windows only: waitable timer that wakes the computer for the next alarm.
- Linux: notifications stay with `Urgency.Critical`; Windows toasts use `scenario="alarm"`.
