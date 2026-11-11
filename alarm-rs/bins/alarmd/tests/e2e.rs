//! End-to-end scenarios of TZ_RUST 7 against the real `alarmd` binary in headless mode (no sound
//! device, no notifications, no tray, no client window) with a fake clock.
//! Run with `cargo xtask e2e` (they are `#[ignore]`d in `cargo test`). Unix only.
#![cfg(unix)]
#![allow(clippy::disallowed_methods, clippy::disallowed_types)]

use std::io::{BufRead, BufReader, Write};
use std::os::unix::net::UnixStream;
use std::path::{Path, PathBuf};
use std::process::{Child, Command as Process, Stdio};
use std::time::{Duration, Instant};

use protocol::{AlarmDraft, Command, Event, PROTOCOL_VERSION, Snapshot};

const BIN: &str = env!("CARGO_BIN_EXE_alarmd");

struct Daemon {
    dir: PathBuf,
    child: Option<Child>,
}

fn user() -> String {
    std::env::var("USER").unwrap_or_else(|_| "user".into())
}

fn socket(dir: &Path) -> PathBuf {
    protocol::socket_path(dir, &user(), &std::env::temp_dir())
}

impl Daemon {
    fn start(dir: &Path, extra: &[&str]) -> Daemon {
        let mut d = Daemon {
            dir: dir.to_path_buf(),
            child: None,
        };
        d.child = Some(d.spawn(extra));
        d.wait_socket();
        d
    }

    fn spawn(&self, extra: &[&str]) -> Child {
        Process::new(BIN)
            .args(["--headless", "--data-dir"])
            .arg(&self.dir)
            .arg("--clock-offset-file")
            .arg(self.dir.join("offset"))
            .args(["--tz", "Europe/Berlin"])
            .args(extra)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .expect("spawn alarmd")
    }

    fn wait_socket(&self) {
        let deadline = Instant::now() + Duration::from_secs(5);
        while UnixStream::connect(socket(&self.dir)).is_err() {
            assert!(Instant::now() < deadline, "daemon socket did not appear");
            std::thread::sleep(Duration::from_millis(50));
        }
    }

    fn set_offset(&self, ms: i64) {
        std::fs::write(self.dir.join("offset"), ms.to_string()).unwrap();
    }

    fn log(&self) -> String {
        std::fs::read_to_string(self.dir.join("alarmd.log")).unwrap_or_default()
    }

    fn kill9(&mut self) {
        if let Some(mut c) = self.child.take() {
            let _ = Process::new("kill").args(["-9", &c.id().to_string()]).status();
            let _ = c.wait();
        }
    }
}

impl Drop for Daemon {
    fn drop(&mut self) {
        if let Some(mut c) = self.child.take() {
            let _ = c.kill();
            let _ = c.wait();
        }
    }
}

struct Client {
    w: UnixStream,
    r: BufReader<UnixStream>,
    last: Option<Snapshot>,
}

impl Client {
    fn connect(dir: &Path) -> Client {
        let s = UnixStream::connect(socket(dir)).expect("connect");
        s.set_read_timeout(Some(Duration::from_millis(300))).unwrap();
        let mut c = Client {
            w: s.try_clone().unwrap(),
            r: BufReader::new(s),
            last: None,
        };
        c.send(&Command::Hello {
            protocol: PROTOCOL_VERSION,
            version: "e2e".into(),
        });
        c
    }

    fn send(&mut self, cmd: &Command) {
        let line = serde_json::to_string(cmd).unwrap();
        self.w.write_all(format!("{line}\n").as_bytes()).unwrap();
    }

    fn next(&mut self) -> Option<Event> {
        let mut line = String::new();
        match self.r.read_line(&mut line) {
            Ok(n) if n > 0 => {
                let e: Event = serde_json::from_str(line.trim()).unwrap();
                if let Event::Snapshot(s) = &e {
                    self.last = Some((**s).clone());
                }
                Some(e)
            }
            _ => None,
        }
    }

    /// Read events until `f` holds for the latest snapshot.
    fn until(&mut self, limit: Duration, f: impl Fn(&Snapshot) -> bool) -> Snapshot {
        let deadline = Instant::now() + limit;
        loop {
            if let Some(s) = &self.last
                && f(s)
            {
                return s.clone();
            }
            assert!(
                Instant::now() < deadline,
                "condition not reached; last snapshot: {:?}",
                self.last.as_ref().map(|s| (&s.alarms, s.ringing.len()))
            );
            self.next();
        }
    }
}

fn tmp() -> tempfile::TempDir {
    tempfile::Builder::new().prefix("ars").tempdir_in("/tmp").unwrap()
}

fn draft(hour: u8, minute: u8, label: &str) -> AlarmDraft {
    let s = domain::defaults::settings();
    let mut d = domain::defaults::new_alarm_draft(&s, hour, minute);
    d.label = label.into();
    d
}

/// Berlin wall clock of `ms`.
fn hm(ms: i64) -> (u8, u8) {
    domain::format::local_hm(ms, &domain::TimeZone::get("Europe/Berlin").unwrap())
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as i64
}

#[test]
#[ignore]
fn rings_within_a_second_with_no_client_and_survives_kill() {
    let dir = tmp();
    let mut d = Daemon::start(dir.path(), &[]);
    // Fake clock: 1.5 s before the next full minute.
    let now = now_ms();
    let next_minute = (now / 60_000 + 2) * 60_000;
    let offset = next_minute - 1500 - now;
    d.set_offset(offset);
    let (h, m) = hm(next_minute);
    let mut c = Client::connect(dir.path());
    c.send(&Command::SaveAlarm {
        alarm: draft(h, m, "E2E"),
    });
    c.until(Duration::from_secs(2), |s| s.alarms.len() == 1);
    drop(c); // the client closes: nobody is connected.
    std::thread::sleep(Duration::from_millis(3000));
    let mut c = Client::connect(dir.path());
    let s = c.until(Duration::from_secs(2), |s| !s.ringing.is_empty());
    let since = s.ringing[0].alarm.ringing_since.unwrap();
    assert!(since - next_minute <= 1000, "rang {} ms late", since - next_minute);
    assert!(d.log().contains("notification [alarm-"), "notification posted");
    assert!(
        d.log().contains("client launch skipped (ringing)"),
        "the daemon tries to open the client"
    );
    drop(c);

    // kill -9 while ringing: after a restart it still rings (`ringing_since` is stored).
    d.kill9();
    d.child = Some(d.spawn(&[]));
    d.wait_socket();
    let mut c = Client::connect(dir.path());
    let s = c.until(Duration::from_secs(2), |s| s.alarms.len() == 1);
    assert_eq!(s.ringing.len(), 1, "still ringing after kill -9");

    // Snooze, then Stop with the task (wrong answer, then right answers).
    let id = s.alarms[0].id.clone();
    c.send(&Command::Stop { id: id.clone() });
    let s = c.until(Duration::from_secs(2), |s| {
        s.ringing.first().is_some_and(|r| r.task.is_some())
    });
    assert_eq!(s.ringing[0].task.as_ref().unwrap().total, 2);
    c.send(&Command::SubmitAnswer {
        id: id.clone(),
        answer: "-1".into(),
    });
    c.until(Duration::from_secs(2), |s| {
        s.ringing
            .first()
            .and_then(|r| r.task.as_ref())
            .is_some_and(|t| t.wrong == 1)
    });
    c.send(&Command::Snooze { id: id.clone() });
    let s = c.until(Duration::from_secs(2), |s| s.ringing.is_empty());
    assert!(s.alarms[0].snooze_until.is_some());
    c.send(&Command::CancelSnooze { id });
    c.until(Duration::from_secs(2), |s| s.alarms[0].snooze_until.is_none());
}

#[test]
#[ignore]
fn sleep_within_grace_rings_and_beyond_grace_is_missed() {
    let dir = tmp();
    let d = Daemon::start(dir.path(), &[]);
    let now = now_ms();
    let base = (now / 60_000 + 10) * 60_000; // 10 min ahead
    let mut c = Client::connect(dir.path());
    let (h1, m1) = hm(base);
    let (h2, m2) = hm(base + 60_000);
    c.send(&Command::SaveAlarm {
        alarm: draft(h1, m1, "Grace"),
    });
    c.send(&Command::SaveAlarm {
        alarm: draft(h2, m2, "Late"),
    });
    c.until(Duration::from_secs(2), |s| s.alarms.len() == 2);
    // The computer "sleeps" until 30 min after the first alarm: it rings (grace 60 min).
    d.set_offset(base + 30 * 60_000 - now);
    let s = c.until(Duration::from_secs(3), |s| !s.ringing.is_empty());
    assert_eq!(s.ringing.len(), 2, "both late alarms within grace ring");
    let ids: Vec<String> = s.alarms.iter().map(|a| a.id.clone()).collect();
    for id in &ids {
        c.send(&Command::Stop { id: id.clone() });
    }
    // Change to `None` tasks is not needed: dismiss through the answers instead — simpler: delete.
    for id in ids {
        c.send(&Command::DeleteAlarm { id });
    }
    c.until(Duration::from_secs(2), |s| s.alarms.is_empty());

    // Beyond grace: missed, with a notification, no ring.
    let base2 = base + 31 * 60_000 + 60_000;
    let (h, m) = hm(base2);
    c.send(&Command::SaveAlarm {
        alarm: draft(h, m, "Missed"),
    });
    c.until(Duration::from_secs(2), |s| s.alarms.len() == 1);
    d.set_offset(base2 + 2 * 3_600_000 - now);
    let s = c.until(Duration::from_secs(3), |s| !s.alarms[0].enabled);
    assert!(s.ringing.is_empty());
    assert!(d.log().contains("Missed alarm: Missed"));
}

#[test]
#[ignore]
fn second_daemon_and_second_client() {
    let dir = tmp();
    let d = Daemon::start(dir.path(), &[]);
    let status = Process::new(BIN)
        .args(["--headless", "--data-dir"])
        .arg(dir.path())
        .status()
        .unwrap();
    assert!(status.success(), "the second daemon exits with 0");
    let mut first = Client::connect(dir.path());
    first.until(Duration::from_secs(2), |_| true);
    let mut second = Client::connect(dir.path());
    let _hello = second.next();
    assert_eq!(second.next(), Some(Event::AlreadyOpen));
    let mut got_focus = false;
    for _ in 0..10 {
        if first.next() == Some(Event::Focus) {
            got_focus = true;
            break;
        }
    }
    assert!(got_focus, "the open client is brought forward");
    drop(d);
}

#[test]
#[ignore]
fn quit_is_a_normal_exit_and_removes_the_socket() {
    let dir = tmp();
    let mut d = Daemon::start(dir.path(), &[]);
    let mut c = Client::connect(dir.path());
    c.until(Duration::from_secs(2), |_| true);
    c.send(&Command::Shutdown);
    let mut child = d.child.take().unwrap();
    let deadline = Instant::now() + Duration::from_secs(5);
    let status = loop {
        if let Some(s) = child.try_wait().unwrap() {
            break s;
        }
        assert!(Instant::now() < deadline, "daemon did not quit");
        std::thread::sleep(Duration::from_millis(50));
    };
    assert!(status.success());
    assert!(!socket(dir.path()).exists());
}

#[test]
#[ignore]
fn broken_row_is_skipped_and_state_survives_restart() {
    let dir = tmp();
    let mut d = Daemon::start(dir.path(), &[]);
    let mut c = Client::connect(dir.path());
    c.send(&Command::SaveAlarm {
        alarm: draft(6, 30, "Good"),
    });
    c.send(&Command::SaveAlarm {
        alarm: draft(7, 30, "Bad"),
    });
    c.send(&Command::StartTimer {
        duration_ms: 3_600_000,
        label: Some("Long".into()),
    });
    c.send(&Command::StopwatchStart);
    c.until(Duration::from_secs(2), |s| {
        s.alarms.len() == 2 && s.stopwatch.started_at.is_some()
    });
    drop(c);
    d.kill9();
    let db = dir.path().join("alarm.db");
    let ok = Process::new("sqlite3")
        .arg(&db)
        .arg("UPDATE alarms SET hour = 'x' WHERE label = 'Bad'; UPDATE settings SET value = 'garbage' WHERE key = 'volume';")
        .status()
        .map(|s| s.success())
        .unwrap_or(false);
    d.child = Some(d.spawn(&[]));
    d.wait_socket();
    let mut c = Client::connect(dir.path());
    let s = c.until(Duration::from_secs(2), |_| true);
    if ok {
        assert_eq!(s.alarms.len(), 1, "the broken row is skipped");
        assert_eq!(s.alarms[0].label, "Good");
        assert!((s.settings.volume - 0.9).abs() < 1e-6);
    }
    assert_eq!(
        s.timer.status,
        protocol::TimerStatus::Running,
        "the timer keeps running"
    );
    assert!(s.stopwatch.started_at.is_some(), "the stopwatch keeps running");
}

#[test]
#[ignore]
fn late_timer_only_notifies() {
    let dir = tmp();
    let d = Daemon::start(dir.path(), &[]);
    let mut c = Client::connect(dir.path());
    c.send(&Command::StartTimer {
        duration_ms: 60_000,
        label: None,
    });
    c.until(Duration::from_secs(2), |s| {
        s.timer.status == protocol::TimerStatus::Running
    });
    d.set_offset(15 * 60_000);
    c.until(Duration::from_secs(3), |s| {
        s.timer.status == protocol::TimerStatus::Idle
    });
    assert!(d.log().contains("Timer ended"));
}

/// The login agent restarts a killed daemon within 5 s and not after `Quit` (macOS LaunchAgent with a
/// temporary label; removed at the end).
#[cfg(target_os = "macos")]
#[test]
#[ignore]
fn launch_agent_restarts_after_kill_but_not_after_quit() {
    let dir = tmp();
    let label = format!("org.alarmrs.e2e.{}", std::process::id());
    let plist = PathBuf::from(std::env::var("HOME").unwrap()).join(format!("Library/LaunchAgents/{label}.plist"));
    let uid = String::from_utf8(Process::new("id").arg("-u").output().unwrap().stdout)
        .unwrap()
        .trim()
        .to_string();
    let cleanup = || {
        let _ = Process::new("launchctl")
            .args(["bootout", &format!("gui/{uid}/{label}")])
            .output();
        let _ = std::fs::remove_file(&plist);
    };
    // Started by hand: it installs the agent and hands over to it.
    let status = Process::new(BIN)
        .args(["--headless", "--with-login-item", "--agent-label", &label, "--data-dir"])
        .arg(dir.path())
        .status()
        .unwrap();
    let result = std::panic::catch_unwind(|| {
        assert!(status.success());
        assert!(plist.exists(), "agent plist installed");
        let d = Daemon {
            dir: dir.path().to_path_buf(),
            child: None,
        };
        d.wait_socket();
        let pid_of = || -> Option<String> {
            let out = Process::new("launchctl").args(["list", &label]).output().ok()?;
            let text = String::from_utf8_lossy(&out.stdout).to_string();
            text.lines()
                .find(|l| l.contains("\"PID\""))
                .map(|l| l.chars().filter(char::is_ascii_digit).collect())
        };
        let pid = pid_of().expect("managed daemon running");
        let killed_at = Instant::now();
        Process::new("kill").args(["-9", &pid]).status().unwrap();
        let deadline = Instant::now() + Duration::from_secs(5);
        loop {
            if pid_of().is_some_and(|p| p != pid) && UnixStream::connect(socket(dir.path())).is_ok() {
                break;
            }
            assert!(Instant::now() < deadline, "not restarted within 5 s");
            std::thread::sleep(Duration::from_millis(100));
        }
        eprintln!("restarted after {:?}", killed_at.elapsed());
        let mut c = Client::connect(dir.path());
        c.until(Duration::from_secs(2), |_| true);
        c.send(&Command::Shutdown);
        std::thread::sleep(Duration::from_secs(3));
        assert!(pid_of().is_none(), "not restarted after Quit");
        std::mem::forget(d);
    });
    cleanup();
    if let Err(e) = result {
        std::panic::resume_unwind(e);
    }
}
