# Alarm (Rust)

A desktop alarm clock in the style of Apple's Clock app, written entirely in Rust: the
`alarmd` daemon and the `alarm-ui` client (Tauri) with a Leptos (WASM) interface. Behaviour and
design: [`../ALARM_SPEC.md`](../ALARM_SPEC.md).

The alarm rings even when the window is closed: the daemon plays the sound, shows the
notification and opens the window on top of everything.

## Commands

| Command | What it does |
|---|---|
| `cargo xtask dev` | build `ui-web` (trunk), `alarmd` and `alarm-ui`; start the client (it starts the daemon) |
| `cargo xtask check` | `trunk build`, `cargo fmt --check`, `cargo clippy -D warnings` (host and wasm32), `cargo xtask arch`, all tests |
| `cargo xtask arch` | dependency rules of the architecture over `cargo metadata` plus source rules |
| `cargo xtask e2e` | reliability scenarios (headless daemon, fake clock) and the visual tests (headless WebKit) |
| `cargo xtask dist` | installers: macOS `Alarm.app` + `Alarm.dmg`; Windows `.msi`; Linux `.AppImage`, `.deb` |
| `cargo xtask icons` | renders the app icon and generates the icon set |

Tools: Rust stable (see `rust-toolchain.toml`, target `wasm32-unknown-unknown`), `trunk`,
`wasm-bindgen-cli` (same version as in `Cargo.lock`), `tauri-cli` 2, `wasm-opt` (binaryen),
Node.js for the visual tests. `trunk` runs with `--offline`, so the tools must be installed locally.

## Architecture (short)

Hexagonal: the pure core (`domain` + `app`) knows nothing about the OS. Two programs talk over a
local socket with JSON lines (`protocol`).

```
alarmd (always running)                       alarm-ui (while the window is open)
  main thread: tray (tao)                       Tauri window + relay of the protocol
  tokio: tick loop → app use cases → domain     WebView: ui-web (Leptos → WASM)
  adapters: store-sqlite, audio-rodio, notify,
  power, login, sysinfo, ipc-server, tray, ui-launcher
```

| Crate | Role |
|---|---|
| `crates/domain` | model, schedule (`next_occurrence`, decision table), tasks, ramp, formats, texts |
| `crates/app` | ports (`ports.rs`) and use cases (`usecases/`); tested with fakes in memory |
| `crates/protocol` | `Command`, `Event`, `Snapshot`, `PROTOCOL_VERSION` |
| `crates/adapters/*` | port implementations; adapters never depend on each other |
| `crates/ui-web` | screens and widgets; makes no decisions |
| `bins/alarmd` | composition root, tick loop, signals |
| `bins/alarm-ui` | window, relay, file dialog |
| `xtask` | `dev`, `check`, `arch`, `e2e`, `dist`, `icons` |

The rules are enforced by the compiler (crate boundaries), `cargo xtask arch` (graph edges,
`tokio`-free `domain`/`app`/`protocol`, `#![forbid(unsafe_code)]` outside OS adapters,
`ui-web` may use only `domain::{format, strings, tasks, schedule::repeat_summary}`), and
`clippy.toml` + `#![deny(clippy::disallowed_methods, clippy::disallowed_types)]` in `domain`
and `app` (no `SystemTime::now`, `Instant::now`, `jiff::*::now`, `std::fs`, `std::net`,
`thread::sleep`, `rand::thread_rng`).

## Where the data lives

`ProjectDirs::from("org", "AlarmRs", "Alarm").data_dir()`, per OS user:

- macOS: `~/Library/Application Support/org.AlarmRs.Alarm/`
- Linux: `~/.local/share/alarm/`
- Windows: `%APPDATA%\AlarmRs\Alarm\data\`

Files: `alarm.db` (SQLite, WAL), `sounds/<id>.<ext>` (copies of imported music),
`alarmd.lock` (single daemon), `alarmd.log`. The socket is `alarm-<user>.sock` in the same
folder (or, if that path is too long for a Unix socket, `alarm-<user>-<hash>.sock` in the
temp directory).

Login agent: label `org.alarmrs.alarmd` (macOS `SMAppService` from the bundle; in development
`~/Library/LaunchAgents/org.alarmrs.alarmd.plist`), `systemd --user` unit `alarmd.service`
on Linux, Task Scheduler task on Windows.

## Daemon flags (tests and development)

`--data-dir <dir>`, `--headless` (silent audio pipeline, notifications only logged, no tray, no
client launch, no keep-awake, no login item), `--no-login-item`, `--no-ui`, `--agent-label <label>`,
`--clock-offset-file <file>` (fake clock: milliseconds added to the system time, re-read on every
tick), `--tz <IANA zone>`, `--wait-lock`, `--with-login-item`.

## Known platform differences

- **macOS.** The daemon is a helper app inside the bundle
  (`Alarm.app/Contents/Library/Helpers/alarmd.app`, bundle id `org.alarmrs.Alarm.daemon`,
  `LSUIElement`), which carries the LaunchAgent plist registered through `SMAppService`; the client
  is the main program with a Dock icon. Notifications need the signed bundle; outside the
  bundle (`cargo xtask dev`) they are only logged. Whether a notification stays on screen follows
  the user's "Alerts" style in System Settings. Distribution needs a Developer ID signature and
  notarization: `cargo xtask dist --sign "<identity>"`, then `notarytool`.
- **Windows.** Not built or tested on this machine. Uses WinRT toasts (`scenario="alarm"`), a
  Task Scheduler logon task and a waitable timer that wakes the computer for the next ring when
  the OS allows it without administrator rights.
- **Linux.** Not built or tested on this machine. Notifications use `Urgency::Critical` and
  `Timeout::Never`. WebKitGTK rendering differences are to be recorded here after a manual check.
