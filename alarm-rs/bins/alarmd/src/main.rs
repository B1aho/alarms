//! `alarmd`: the composition root (TZ_RUST 5.1, 5.4). Wires the adapters to the use cases, runs
//! the tick loop on tokio and the tray event loop on the main thread.
//!
//! Flags (tests and development):
//! `--data-dir <dir>`, `--headless` (no sound device, no notifications, no tray, no client,
//! no login item, no keep-awake), `--no-login-item`, `--no-ui`, `--agent-label <label>`,
//! `--client <path>`, `--clock-offset-file <file>` (fake clock: ms added to the system time,
//! re-read on every tick), `--tz <IANA zone>`, `--wait-lock`.
#![forbid(unsafe_code)]
#![allow(clippy::disallowed_methods, clippy::disallowed_types)]

mod clock;

use std::fs::{File, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::mpsc as std_mpsc;
use std::time::{Duration, Instant};

use app::ports::{Ports, TrayMenu};
use app::{Request, Runtime, handle};
use ipc_server::{Handler, Incoming, IpcSink};
use rand::SeedableRng;
use tokio::sync::mpsc::{UnboundedReceiver, unbounded_channel};

pub const VERSION: &str = env!("CARGO_PKG_VERSION");

#[derive(Debug, Default, Clone)]
struct Args {
    data_dir: Option<PathBuf>,
    headless: bool,
    no_login_item: bool,
    no_ui: bool,
    agent_label: Option<String>,
    client: Option<PathBuf>,
    clock_offset_file: Option<PathBuf>,
    tz: Option<String>,
    wait_lock: bool,
    /// Use the login agent even with `--headless` (e2e of the crash restart).
    with_login_item: bool,
}

fn parse_args() -> Args {
    let mut a = Args::default();
    let mut it = std::env::args().skip(1);
    while let Some(arg) = it.next() {
        match arg.as_str() {
            "--data-dir" => a.data_dir = it.next().map(PathBuf::from),
            "--headless" => a.headless = true,
            "--no-login-item" => a.no_login_item = true,
            "--no-ui" => a.no_ui = true,
            "--agent-label" => a.agent_label = it.next(),
            "--client" => a.client = it.next().map(PathBuf::from),
            "--clock-offset-file" => a.clock_offset_file = it.next().map(PathBuf::from),
            "--tz" => a.tz = it.next(),
            "--wait-lock" => a.wait_lock = true,
            "--with-login-item" => a.with_login_item = true,
            "--version" => {
                println!("alarmd {VERSION}");
                std::process::exit(0);
            }
            other => eprintln!("alarmd: unknown argument {other}"),
        }
    }
    a
}

pub fn default_data_dir() -> PathBuf {
    directories::ProjectDirs::from("org", "AlarmRs", "Alarm")
        .map(|d| d.data_dir().to_path_buf())
        .unwrap_or_else(|| std::env::temp_dir().join("alarm-rs"))
}

fn user_name() -> String {
    std::env::var("USER")
        .or_else(|_| std::env::var("USERNAME"))
        .unwrap_or_else(|_| "user".into())
}

fn init_log(dir: &std::path::Path) {
    let path = dir.join("alarmd.log");
    if std::fs::metadata(&path).is_ok_and(|m| m.len() > 5 * 1024 * 1024) {
        let _ = std::fs::rename(&path, dir.join("alarmd.log.1"));
    }
    let mut b = env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info"));
    if let Ok(file) = OpenOptions::new().create(true).append(true).open(&path) {
        b.target(env_logger::Target::Pipe(Box::new(file)));
    }
    b.format(|buf, rec| {
        writeln!(
            buf,
            "{} [{}] {} {}",
            jiff::Timestamp::now(),
            std::process::id(),
            rec.level(),
            rec.args()
        )
    });
    let _ = b.try_init();
}

/// Exclusive lock on `alarmd.lock`: one daemon per user (TZ_RUST 5.1).
fn take_lock(dir: &std::path::Path, wait: bool) -> Option<File> {
    let file = OpenOptions::new()
        .create(true)
        .truncate(false)
        .write(true)
        .open(dir.join("alarmd.lock"))
        .ok()?;
    let deadline = Instant::now() + Duration::from_secs(if wait { 10 } else { 0 });
    loop {
        if file.try_lock().is_ok() {
            return Some(file);
        }
        if Instant::now() >= deadline {
            return None;
        }
        std::thread::sleep(Duration::from_millis(100));
    }
}

/// Messages into the core actor.
enum Input {
    Request(Request),
    Quit,
}

fn main() {
    let args = parse_args();
    let dir = args.data_dir.clone().unwrap_or_else(default_data_dir);
    if let Err(e) = std::fs::create_dir_all(&dir) {
        eprintln!("alarmd: cannot create {}: {e}", dir.display());
        std::process::exit(1);
    }
    init_log(&dir);
    let exe = std::env::current_exe().unwrap_or_else(|_| PathBuf::from("alarmd"));
    let use_login = (!args.headless || args.with_login_item) && !args.no_login_item;
    let label = args
        .agent_label
        .clone()
        .unwrap_or_else(|| login::DEFAULT_LABEL.to_string());
    let mut agent_args = Vec::new();
    if let Some(d) = &args.data_dir {
        agent_args.extend(["--data-dir".to_string(), d.to_string_lossy().into_owned()]);
    }
    if args.agent_label.is_some() {
        agent_args.extend(["--agent-label".to_string(), label.clone()]);
    }
    if args.headless {
        agent_args.extend(["--headless".to_string(), "--with-login-item".to_string()]);
    }
    if let Some(f) = &args.clock_offset_file {
        agent_args.extend(["--clock-offset-file".to_string(), f.to_string_lossy().into_owned()]);
    }
    if let Some(tz) = &args.tz {
        agent_args.extend(["--tz".to_string(), tz.clone()]);
    }
    let agent = login::LoginAgent::new(&label, &exe, agent_args.clone(), use_login);

    let Some(lock) = take_lock(&dir, args.wait_lock) else {
        log::info!("another alarmd is running; exiting");
        std::process::exit(0);
    };

    let store = match store_sqlite::SqliteStore::open(&dir) {
        Ok(s) => s,
        Err(e) => {
            log::error!("cannot open the store: {e}");
            std::process::exit(1);
        }
    };

    // Started by hand while `Open at Login` is on: hand over to the login agent so that a crash
    // is restarted by the OS (TZ_RUST 7).
    if use_login && !agent.is_managed_process() {
        let open_at_login = app::ports::SettingsRepo::load(&store)
            .map(|s| s.open_at_login)
            .unwrap_or(true);
        if open_at_login && app::ports::LoginItem::set_enabled(&agent, true).is_ok() {
            drop(store);
            drop(lock);
            if agent.start_managed() {
                log::info!("handed over to the login agent {label}");
                std::process::exit(0);
            }
            log::warn!("login agent did not start; running unmanaged");
            let Some(lock2) = take_lock(&dir, true) else {
                std::process::exit(0)
            };
            return run(args, dir, lock2, agent);
        }
    }
    run(args, dir, lock, agent)
}

fn run(args: Args, dir: PathBuf, lock: File, agent: login::LoginAgent) {
    log::info!("alarmd {VERSION} starting, data in {}", dir.display());
    let store = store_sqlite::SqliteStore::open(&dir).unwrap_or_else(|e| {
        log::error!("cannot open the store: {e}");
        std::process::exit(1)
    });
    let (tx, rx) = unbounded_channel::<Input>();
    let sink = IpcSink::default();

    // Driving adapters push requests into the core.
    let tx_preview = tx.clone();
    let audio: Box<dyn app::ports::AudioOut> = {
        let cb: Box<dyn Fn() + Send + Sync> = Box::new(move || {
            let _ = tx_preview.send(Input::Request(Request::PreviewEnded));
        });
        if args.headless {
            Box::new(audio_rodio::RodioAudio::silent(cb))
        } else {
            Box::new(audio_rodio::RodioAudio::new(cb))
        }
    };
    let tx_notify = tx.clone();
    let notifier: Box<dyn app::ports::Notifier> = if args.headless {
        Box::new(notify::LogNotifier)
    } else {
        notify::system(Arc::new(move |action| {
            let req = match action {
                notify::NotifyAction::Snooze(id) => Request::Snooze(id),
                notify::NotifyAction::Open => Request::OpenWindow,
                notify::NotifyAction::StatusChanged => Request::Tick,
            };
            let _ = tx_notify.send(Input::Request(req));
        }))
    };
    let client = if args.headless || args.no_ui {
        None
    } else {
        args.client
            .clone()
            .or_else(|| ui_launcher::find_client(&std::env::current_exe().unwrap_or_default()))
    };
    let mut client_args = Vec::new();
    if let Some(d) = &args.data_dir {
        client_args.extend(["--data-dir".to_string(), d.to_string_lossy().into_owned()]);
    }
    let clock = clock::SystemClock::new(args.clock_offset_file.clone(), args.tz.clone());

    // The tray lives on the main thread; the core reaches it through a channel-backed handle.
    let (tray_tx, tray_rx) = std_mpsc::channel::<tray::TrayHandle>();
    let tray_port = DeferredTray::new(tray_rx);

    let ports = Ports {
        clock: Box::new(clock),
        alarms: Box::new(store.clone()),
        settings: Box::new(store.clone()),
        timer: Box::new(store.clone()),
        stopwatch: Box::new(store.clone()),
        sounds: Box::new(store.clone()),
        audio,
        notifier,
        power: Box::new(power::Power::new(!args.headless)),
        login: Box::new(agent),
        system: Box::new(sysinfo::System::new(VERSION)),
        launcher: Box::new(ui_launcher::Launcher::new(client, client_args)),
        sink: Box::new(sink.clone()),
        tray: Box::new(tray_port.clone()),
    };

    let socket = ipc_server::socket_path(&dir, &user_name());
    let (exit_tx, exit_rx) = std_mpsc::channel::<()>();
    let tx_ipc = tx.clone();
    let tx_signal = tx.clone();
    let headless = args.headless;
    let socket_for_core = socket.clone();
    std::thread::Builder::new()
        .name("core".into())
        .spawn(move || {
            let rt = tokio::runtime::Builder::new_multi_thread()
                .worker_threads(2)
                .enable_all()
                .build()
                .expect("tokio");
            rt.block_on(async move {
                let handler: Handler = Arc::new(move |inc| {
                    let _ = tx_ipc.send(match inc {
                        Incoming::Request(r) => Input::Request(r),
                        Incoming::Shutdown => Input::Quit,
                    });
                });
                let server = ipc_server::serve(socket.clone(), sink, VERSION.to_string(), handler);
                tokio::spawn(async move {
                    if let Err(e) = server.await {
                        log::error!("socket server failed: {e}");
                    }
                });
                tokio::spawn(async move {
                    signals().await;
                    let _ = tx_signal.send(Input::Quit);
                });
                core_loop(ports, rx).await;
            });
            let _ = std::fs::remove_file(&socket_for_core);
            drop(lock);
            log::info!("alarmd stopped");
            let _ = exit_tx.send(());
        })
        .expect("core thread");

    if headless {
        let _ = exit_rx.recv();
        std::process::exit(0);
    }
    let tx_tray = tx.clone();
    std::thread::spawn(move || {
        let _ = exit_rx.recv();
        if let Some(t) = tray_port.handle() {
            t.exit();
        }
        // The loop exits on the next event; make sure the process ends even if it does not.
        std::thread::sleep(Duration::from_millis(500));
        std::process::exit(0);
    });
    tray::run(
        move |action| {
            let input = match action {
                tray::TrayAction::Open => Input::Request(Request::OpenWindow),
                tray::TrayAction::Snooze => Input::Request(Request::SnoozeAllRinging),
                tray::TrayAction::Quit => Input::Quit,
            };
            let _ = tx_tray.send(input);
        },
        move |handle| {
            let _ = tray_tx.send(handle);
        },
    )
}

async fn signals() {
    #[cfg(unix)]
    {
        use tokio::signal::unix::{SignalKind, signal};
        let mut term = signal(SignalKind::terminate()).expect("SIGTERM");
        let mut int = signal(SignalKind::interrupt()).expect("SIGINT");
        tokio::select! { _ = term.recv() => {}, _ = int.recv() => {} }
    }
    #[cfg(not(unix))]
    {
        let _ = tokio::signal::ctrl_c().await;
    }
}

/// The tick loop (TZ_RUST 6, row 3.4): `sleep_until(min(next ring, now + 500 ms))`, plus an
/// immediate check after every request and after a wall-clock jump of more than 2 s.
async fn core_loop(ports: Ports, mut rx: UnboundedReceiver<Input>) {
    let seed = rand::rngs::StdRng::from_entropy();
    let mut rt = Runtime::new(Box::new(seed));
    run_request(&ports, &mut rt, Request::Startup);
    run_request(&ports, &mut rt, Request::Tick);
    let mut last_wall = ports.clock.now();
    let mut last_mono = Instant::now();
    loop {
        let now = ports.clock.now();
        let due = app::usecases::tick::next_due(&ports).ok().flatten();
        let wait_ms = due.map(|d| (d - now).clamp(0, 500)).unwrap_or(500) as u64;
        let msg = tokio::select! {
            m = rx.recv() => m,
            _ = tokio::time::sleep(Duration::from_millis(wait_ms)) => Some(Input::Request(Request::Tick)),
        };
        match msg {
            None | Some(Input::Quit) => {
                log::info!("quitting");
                run_request(&ports, &mut rt, Request::Quit);
                // Let the 120 ms fades finish, then release the device.
                tokio::time::sleep(Duration::from_millis(300)).await;
                drop(ports);
                return;
            }
            Some(Input::Request(r)) => {
                run_request(&ports, &mut rt, r);
            }
        }
        let wall = ports.clock.now();
        let mono = Instant::now();
        let drift = (wall - last_wall) - mono.duration_since(last_mono).as_millis() as i64;
        if drift.abs() > 2000 {
            log::info!("clock jumped by {drift} ms; checking alarms now");
            run_request(&ports, &mut rt, Request::Tick);
        }
        last_wall = wall;
        last_mono = mono;
    }
}

fn run_request(ports: &Ports, rt: &mut Runtime, r: Request) {
    let name = format!("{r:?}");
    if !matches!(r, Request::Tick) {
        log::debug!("request {name}");
    }
    if let Err(e) = handle(ports, rt, r) {
        log::error!("{name}: {e}");
    }
}

/// `TrayMenu` port whose handle arrives once the tray loop started on the main thread.
type TraySlot = (
    Option<tray::TrayHandle>,
    Option<std_mpsc::Receiver<tray::TrayHandle>>,
    Option<Option<String>>,
);

#[derive(Clone)]
struct DeferredTray {
    inner: Arc<std::sync::Mutex<TraySlot>>,
}

impl DeferredTray {
    fn new(rx: std_mpsc::Receiver<tray::TrayHandle>) -> Self {
        DeferredTray {
            inner: Arc::new(std::sync::Mutex::new((None, Some(rx), None))),
        }
    }

    fn handle(&self) -> Option<tray::TrayHandle> {
        let mut g = self.inner.lock().unwrap_or_else(|p| p.into_inner());
        if g.0.is_none()
            && let Some(rx) = &g.1
            && let Ok(h) = rx.try_recv()
        {
            if let Some(pending) = g.2.take() {
                h.set_snooze(pending);
            }
            g.0 = Some(h);
        }
        g.0.clone()
    }
}

impl TrayMenu for DeferredTray {
    fn set_snooze(&self, label: Option<String>) {
        match self.handle() {
            Some(h) => h.set_snooze(label),
            None => self.inner.lock().unwrap_or_else(|p| p.into_inner()).2 = Some(label),
        }
    }
}
