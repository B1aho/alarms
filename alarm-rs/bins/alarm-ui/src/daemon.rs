//! The connection to `alarmd` (TZ_RUST 5.1): connect, start the daemon when it is not running
//! (waiting up to 3 s for the socket), `Hello`, protocol upgrade, `AlreadyOpen`, reconnect after
//! a daemon crash, close after the daemon quit.

use std::io::{BufRead, BufReader, Read, Write};
use std::path::PathBuf;
use std::process::{Command as Process, Stdio};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use interprocess::local_socket::prelude::*;
use interprocess::local_socket::{GenericFilePath, Stream};
use protocol::{Command, Event, PROTOCOL_VERSION};

#[derive(Clone, Debug, Default)]
pub struct Options {
    pub data_dir: Option<PathBuf>,
    pub daemon: Option<PathBuf>,
}

impl Options {
    fn data_dir(&self) -> PathBuf {
        self.data_dir.clone().unwrap_or_else(|| {
            directories::ProjectDirs::from("org", "AlarmRs", "Alarm")
                .map(|d| d.data_dir().to_path_buf())
                .unwrap_or_else(|| std::env::temp_dir().join("alarm-rs"))
        })
    }

    fn socket(&self) -> PathBuf {
        let user = std::env::var("USER")
            .or_else(|_| std::env::var("USERNAME"))
            .unwrap_or_else(|_| "user".into());
        protocol::socket_path(&self.data_dir(), &user, &std::env::temp_dir())
    }

    fn daemon_exe(&self) -> PathBuf {
        if let Some(p) = &self.daemon {
            return p.clone();
        }
        let name = if cfg!(windows) { "alarmd.exe" } else { "alarmd" };
        let Some(dir) = std::env::current_exe()
            .ok()
            .and_then(|me| me.parent().map(PathBuf::from))
        else {
            return PathBuf::from(name);
        };
        // macOS bundle: Alarm.app/Contents/MacOS/alarm-ui → Contents/Library/Helpers/alarmd.app.
        let helper = dir.join("../Library/Helpers/alarmd.app/Contents/MacOS").join(name);
        if helper.exists() { helper } else { dir.join(name) }
    }

    fn start_daemon(&self) {
        let exe = self.daemon_exe();
        let mut cmd = Process::new(&exe);
        if let Some(d) = &self.data_dir {
            cmd.arg("--data-dir").arg(d);
        }
        cmd.stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());
        match cmd.spawn() {
            Ok(c) => log::info!("started daemon {} (pid {})", exe.display(), c.id()),
            Err(e) => log::warn!("cannot start daemon {}: {e}", exe.display()),
        }
    }

    fn open(&self) -> std::io::Result<Stream> {
        let path = self.socket();
        Stream::connect(path.as_path().to_fs_name::<GenericFilePath>()?)
    }

    fn wait_for_socket(&self, limit: Duration) -> Option<Stream> {
        let deadline = Instant::now() + limit;
        loop {
            if let Ok(s) = self.open() {
                return Some(s);
            }
            if Instant::now() >= deadline {
                return None;
            }
            std::thread::sleep(Duration::from_millis(50));
        }
    }
}

pub enum ConnectError {
    AlreadyOpen,
    Failed(String),
}

/// How the shell treats a line from the daemon (every line is also forwarded to the WebView).
pub enum LineKind {
    Hello,
    Snapshot,
    /// `Focus`, `ShowRinging`, `ShowTimerAlert`: bring the window forward.
    Focus,
    Other,
    /// The daemon quit for good: close the window.
    Closed,
}

fn classify(line: &str) -> LineKind {
    match serde_json::from_str::<Event>(line) {
        Ok(Event::Hello { .. }) => LineKind::Hello,
        Ok(Event::Snapshot(_)) => LineKind::Snapshot,
        Ok(Event::Focus | Event::ShowRinging | Event::ShowTimerAlert) => LineKind::Focus,
        _ => LineKind::Other,
    }
}

struct ArcRead(Arc<Stream>);

impl Read for ArcRead {
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        let mut r: &Stream = &self.0;
        r.read(buf)
    }
}

/// A connected, admitted session: the writer, the reader and the first lines already read.
struct Session {
    stream: Arc<Stream>,
    reader: BufReader<ArcRead>,
    first: Vec<String>,
}

fn write_line(stream: &Stream, line: &str) -> std::io::Result<()> {
    let mut w: &Stream = stream;
    w.write_all(line.as_bytes())?;
    w.write_all(b"\n")?;
    w.flush()
}

fn command_line(c: &Command) -> String {
    serde_json::to_string(c).unwrap_or_default()
}

/// Hello, protocol check (replacing an older daemon), admission.
fn admit(opts: &Options, stream: Stream, upgrades: u8) -> Result<Session, ConnectError> {
    let fail = |e: std::io::Error| ConnectError::Failed(e.to_string());
    let stream = Arc::new(stream);
    write_line(
        &stream,
        &command_line(&Command::Hello {
            protocol: PROTOCOL_VERSION,
            version: crate::VERSION.into(),
        }),
    )
    .map_err(fail)?;
    let mut reader = BufReader::new(ArcRead(stream.clone()));
    let mut hello = String::new();
    reader.read_line(&mut hello).map_err(fail)?;
    let hello = hello.trim().to_string();
    if let Ok(Event::Hello { protocol, version }) = serde_json::from_str::<Event>(&hello)
        && protocol != PROTOCOL_VERSION
    {
        if upgrades > 0 {
            return Err(ConnectError::Failed(format!(
                "daemon {version} still speaks protocol {protocol}"
            )));
        }
        // An older daemon: ask it to quit and start ours (TZ_RUST 5.1, updates).
        log::info!("daemon {version} speaks protocol {protocol}; replacing it");
        let mut second = String::new();
        let _ = reader.read_line(&mut second);
        let _ = write_line(&stream, &command_line(&Command::Shutdown));
        drop(reader);
        drop(stream);
        let deadline = Instant::now() + Duration::from_secs(3);
        while opts.open().is_ok() && Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(100));
        }
        opts.start_daemon();
        let fresh = opts
            .wait_for_socket(Duration::from_secs(3))
            .ok_or_else(|| ConnectError::Failed("the new daemon did not start".into()))?;
        return admit(opts, fresh, upgrades + 1);
    }
    let mut next = String::new();
    reader.read_line(&mut next).map_err(fail)?;
    let next = next.trim().to_string();
    if matches!(serde_json::from_str::<Event>(&next), Ok(Event::AlreadyOpen)) {
        return Err(ConnectError::AlreadyOpen);
    }
    Ok(Session {
        stream,
        reader,
        first: vec![hello, next],
    })
}

/// Shared handle to the daemon connection. Cheap to clone.
#[derive(Clone)]
pub struct Link {
    writer: Arc<Mutex<Option<Arc<Stream>>>>,
    pending: Arc<Mutex<Option<Session>>>,
}

impl Link {
    pub fn connect(opts: &Options) -> Result<Link, ConnectError> {
        let stream = match opts.open() {
            Ok(s) => s,
            Err(_) => {
                opts.start_daemon();
                opts.wait_for_socket(Duration::from_secs(3))
                    .ok_or_else(|| ConnectError::Failed("the daemon did not start within 3 s".into()))?
            }
        };
        let session = admit(opts, stream, 0)?;
        Ok(Link {
            writer: Arc::new(Mutex::new(Some(session.stream.clone()))),
            pending: Arc::new(Mutex::new(Some(session))),
        })
    }

    pub fn send(&self, c: &Command) {
        self.send_line(&command_line(c));
    }

    pub fn send_line(&self, line: &str) {
        let w = self.writer.lock().unwrap_or_else(|p| p.into_inner()).clone();
        if let Some(stream) = w {
            let _ = write_line(&stream, line);
        }
    }

    /// Read the daemon's lines on a thread; reconnect after a crash (the OS restarts the daemon
    /// within 5 s); report `Closed` when the daemon quit (its socket is gone) or never came back.
    pub fn start_reader(&self, opts: Options, on_line: impl Fn(String, LineKind) + Send + 'static) {
        let Some(mut session) = self.pending.lock().unwrap_or_else(|p| p.into_inner()).take() else {
            return;
        };
        let writer = self.writer.clone();
        std::thread::Builder::new()
            .name("daemon-reader".into())
            .spawn(move || {
                loop {
                    for line in std::mem::take(&mut session.first) {
                        let kind = classify(&line);
                        on_line(line, kind);
                    }
                    let mut buf = String::new();
                    loop {
                        buf.clear();
                        match session.reader.read_line(&mut buf) {
                            Ok(0) | Err(_) => break,
                            Ok(_) => {
                                let line = buf.trim().to_string();
                                if !line.is_empty() {
                                    let kind = classify(&line);
                                    on_line(line, kind);
                                }
                            }
                        }
                    }
                    *writer.lock().unwrap_or_else(|p| p.into_inner()) = None;
                    // A daemon that quit removes its socket; a crashed one leaves it behind.
                    if !opts.socket().exists() {
                        log::info!("the daemon quit; closing");
                        on_line(String::new(), LineKind::Closed);
                        return;
                    }
                    log::warn!("lost the daemon; waiting for it to come back");
                    let back = opts
                        .wait_for_socket(Duration::from_secs(8))
                        .and_then(|s| admit(&opts, s, 0).ok());
                    match back {
                        Some(s) => {
                            *writer.lock().unwrap_or_else(|p| p.into_inner()) = Some(s.stream.clone());
                            session = s;
                        }
                        None => {
                            on_line(String::new(), LineKind::Closed);
                            return;
                        }
                    }
                }
            })
            .expect("reader thread");
    }
}
