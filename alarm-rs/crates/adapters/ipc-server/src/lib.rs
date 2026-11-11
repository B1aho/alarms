//! IPC adapter (TZ_RUST 5.1, 5.2): a local socket (Unix domain socket / named pipe) speaking
//! JSON lines. Driving side: commands become `app::Request`s. Driven side: the `EventSink` port
//! sends `Snapshot` and events to the single UI session.
#![forbid(unsafe_code)]
#![allow(clippy::disallowed_methods, clippy::disallowed_types)]

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use app::Request;
use app::ports::{EventSink, UiEvent};
use app::view::AppView;
use interprocess::local_socket::tokio::prelude::*;
use interprocess::local_socket::{GenericFilePath, ListenerOptions};
use protocol::{Command, Event, PROTOCOL_VERSION, Ringing, Snapshot, TaskView};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::sync::mpsc::{UnboundedSender, unbounded_channel};

/// What the server hands to the daemon.
#[derive(Debug)]
pub enum Incoming {
    Request(Request),
    /// `Shutdown` from a client (protocol upgrade): exit normally.
    Shutdown,
}

pub type Handler = Arc<dyn Fn(Incoming) + Send + Sync>;

struct Session {
    id: u64,
    tx: UnboundedSender<String>,
}

#[derive(Default)]
struct Shared {
    session: Mutex<Option<Session>>,
    next_id: AtomicU64,
}

/// The `EventSink` port. Cheap to clone.
#[derive(Clone, Default)]
pub struct IpcSink(Arc<Shared>);

fn line(e: &Event) -> String {
    serde_json::to_string(e).unwrap_or_default()
}

impl IpcSink {
    fn send(&self, e: &Event) {
        if let Some(s) = self.0.session.lock().unwrap_or_else(|p| p.into_inner()).as_ref() {
            let _ = s.tx.send(line(e));
        }
    }
}

pub fn to_snapshot(v: &AppView) -> Snapshot {
    Snapshot {
        version: v.version.clone(),
        platform: v.platform,
        now: v.now,
        alarms: v.alarms.clone(),
        settings: v.settings.clone(),
        hour_cycle: v.hour_cycle,
        timer: v.timer.clone(),
        stopwatch: v.stopwatch.clone(),
        sounds: v.sounds.clone(),
        ringing: v
            .ringing
            .iter()
            .map(|r| Ringing {
                alarm: r.alarm.clone(),
                task: r.task.as_ref().map(|t| TaskView {
                    kind: t.kind,
                    prompt: t.prompt.clone(),
                    solved: t.solved,
                    total: t.total,
                    wrong: t.wrong,
                }),
            })
            .collect(),
        notifications: v.notifications,
        next_alarm_at: v.next_alarm_at,
        new_alarm: v.new_alarm.clone(),
        preview_playing: v.preview_playing,
    }
}

impl EventSink for IpcSink {
    fn has_client(&self) -> bool {
        self.0.session.lock().unwrap_or_else(|p| p.into_inner()).is_some()
    }

    fn publish(&self, view: &AppView) {
        self.send(&Event::Snapshot(Box::new(to_snapshot(view))));
    }

    fn emit(&self, event: UiEvent) {
        let e = match event {
            UiEvent::Focus => Event::Focus,
            UiEvent::ShowRinging => Event::ShowRinging,
            UiEvent::ShowTimerAlert => Event::ShowTimerAlert,
            UiEvent::PreviewEnded => Event::PreviewEnded,
            UiEvent::ImportResult(Ok(id)) => Event::ImportResult {
                ok: Some(id),
                error: None,
            },
            UiEvent::ImportResult(Err(e)) => Event::ImportResult {
                ok: None,
                error: Some(e),
            },
        };
        self.send(&e);
    }
}

/// Map a client command to a use-case request.
pub fn to_request(c: Command) -> Option<Incoming> {
    use Incoming::Request as R;
    Some(match c {
        Command::Hello { .. } => return None,
        Command::Shutdown => Incoming::Shutdown,
        Command::SaveAlarm { alarm } => R(Request::SaveAlarm(alarm)),
        Command::DeleteAlarm { id } => R(Request::DeleteAlarm(id)),
        Command::SetAlarmEnabled { id, enabled } => R(Request::SetAlarmEnabled { id, enabled }),
        Command::CancelSnooze { id } => R(Request::CancelSnooze(id)),
        Command::Snooze { id } => R(Request::Snooze(id)),
        Command::Stop { id } => R(Request::Stop(id)),
        Command::SubmitAnswer { id, answer } => R(Request::SubmitAnswer { id, answer }),
        Command::BackFromTask { id } => R(Request::BackFromTask(id)),
        Command::UpdateSettings { settings } => R(Request::UpdateSettings(settings)),
        Command::ImportSound { path } => R(Request::ImportSound { path }),
        Command::RemoveSound { id } => R(Request::RemoveSound(id)),
        Command::PreviewPlay {
            sound,
            volume,
            ramp_seconds,
            looped,
        } => R(Request::PreviewPlay {
            sound,
            volume,
            ramp_seconds,
            looped,
        }),
        Command::PreviewStop => R(Request::PreviewStop),
        Command::RequestNotificationPermission => R(Request::RequestNotificationPermission),
        Command::SetTimerDuration { duration_ms } => R(Request::SetTimerDuration(duration_ms)),
        Command::SetTimerLabel { label } => R(Request::SetTimerLabel(label)),
        Command::SetTimerSound { sound } => R(Request::SetTimerSound(sound)),
        Command::StartTimer { duration_ms, label } => R(Request::StartTimer { duration_ms, label }),
        Command::PauseTimer => R(Request::PauseTimer),
        Command::ResumeTimer => R(Request::ResumeTimer),
        Command::CancelTimer => R(Request::CancelTimer),
        Command::StopTimerAlert => R(Request::StopTimerAlert),
        Command::RepeatTimer => R(Request::RepeatTimer),
        Command::RemoveRecent { duration_ms } => R(Request::RemoveRecent(duration_ms)),
        Command::StopwatchStart => R(Request::StopwatchStart),
        Command::StopwatchStop => R(Request::StopwatchStop),
        Command::StopwatchLap => R(Request::StopwatchLap),
        Command::StopwatchReset => R(Request::StopwatchReset),
        Command::WindowFocused => R(Request::WindowFocused),
    })
}

/// The socket path inside the data directory.
pub fn socket_path(data_dir: &Path, user: &str) -> PathBuf {
    protocol::socket_path(data_dir, user, &std::env::temp_dir())
}

/// Accept clients forever. The caller holds the instance lock, so a stale socket file is replaced.
pub async fn serve(path: PathBuf, sink: IpcSink, version: String, handler: Handler) -> std::io::Result<()> {
    let _ = std::fs::remove_file(&path);
    let name = path.as_path().to_fs_name::<GenericFilePath>()?;
    let listener = ListenerOptions::new().name(name).create_tokio()?;
    log::info!("listening on {}", path.display());
    loop {
        let conn = match listener.accept().await {
            Ok(c) => c,
            Err(e) => {
                log::warn!("accept failed: {e}");
                continue;
            }
        };
        let sink = sink.clone();
        let handler = handler.clone();
        let version = version.clone();
        tokio::spawn(async move {
            if let Err(e) = session(conn, sink, version, handler).await {
                log::info!("client session ended: {e}");
            }
        });
    }
}

async fn session(conn: LocalSocketStream, sink: IpcSink, version: String, handler: Handler) -> std::io::Result<()> {
    let (rd, mut wr) = tokio::io::split(conn);
    let mut lines = BufReader::new(rd).lines();

    // First message: Hello.
    let Some(first) = lines.next_line().await? else {
        return Ok(());
    };
    match serde_json::from_str::<Command>(&first) {
        Ok(Command::Hello {
            protocol,
            version: client_version,
        }) => {
            log::info!("client hello: protocol {protocol}, version {client_version}");
        }
        _ => {
            log::warn!("client did not start with Hello");
            return Ok(());
        }
    }
    let hello = line(&Event::Hello {
        protocol: PROTOCOL_VERSION,
        version,
    });
    wr.write_all(format!("{hello}\n").as_bytes()).await?;

    let (tx, mut rx) = unbounded_channel::<String>();
    let id = sink.0.next_id.fetch_add(1, Ordering::Relaxed) + 1;
    let admitted = {
        let mut slot = sink.0.session.lock().unwrap_or_else(|p| p.into_inner());
        match slot.as_ref() {
            Some(existing) if !existing.tx.is_closed() => {
                // At most one window: the newcomer is told to quit, the open one comes forward.
                let _ = existing.tx.send(line(&Event::Focus));
                false
            }
            _ => {
                *slot = Some(Session { id, tx });
                true
            }
        }
    };
    if !admitted {
        // A protocol-upgrade client may still ask the old daemon to shut down.
        wr.write_all(format!("{}\n", line(&Event::AlreadyOpen)).as_bytes())
            .await?;
        wr.flush().await?;
        if let Ok(Ok(Some(next))) = tokio::time::timeout(std::time::Duration::from_millis(300), lines.next_line()).await
            && matches!(serde_json::from_str::<Command>(&next), Ok(Command::Shutdown))
        {
            handler(Incoming::Shutdown);
        }
        return Ok(());
    }

    let writer = tokio::spawn(async move {
        while let Some(l) = rx.recv().await {
            if wr.write_all(l.as_bytes()).await.is_err() || wr.write_all(b"\n").await.is_err() {
                break;
            }
            let _ = wr.flush().await;
        }
    });
    handler(Incoming::Request(Request::ClientConnected));

    let result = async {
        while let Some(l) = lines.next_line().await? {
            match serde_json::from_str::<Command>(&l) {
                Ok(c) => {
                    if let Some(inc) = to_request(c) {
                        handler(inc);
                    }
                }
                Err(e) => log::warn!("bad command {l:?}: {e}"),
            }
        }
        Ok::<(), std::io::Error>(())
    }
    .await;

    {
        let mut slot = sink.0.session.lock().unwrap_or_else(|p| p.into_inner());
        if slot.as_ref().is_some_and(|s| s.id == id) {
            *slot = None;
        }
    }
    writer.abort();
    handler(Incoming::Request(Request::ClientDisconnected));
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use interprocess::local_socket::tokio::Stream;

    async fn connect(
        path: &Path,
    ) -> (
        tokio::io::Lines<BufReader<impl tokio::io::AsyncRead>>,
        impl AsyncWriteExt + Unpin,
    ) {
        let name = path.to_fs_name::<GenericFilePath>().unwrap();
        let s = Stream::connect(name).await.unwrap();
        let (rd, mut wr) = tokio::io::split(s);
        let hello = serde_json::to_string(&Command::Hello {
            protocol: PROTOCOL_VERSION,
            version: "t".into(),
        })
        .unwrap();
        wr.write_all(format!("{hello}\n").as_bytes()).await.unwrap();
        (BufReader::new(rd).lines(), wr)
    }

    #[tokio::test]
    async fn one_ui_session_and_commands_flow() {
        let dir = tempfile::tempdir().unwrap();
        let path = socket_path(dir.path(), "test");
        let sink = IpcSink::default();
        let got: Arc<Mutex<Vec<String>>> = Arc::default();
        let g = got.clone();
        let handler: Handler = Arc::new(move |i| g.lock().unwrap().push(format!("{i:?}")));
        tokio::spawn(serve(path.clone(), sink.clone(), "1.0.0".into(), handler));
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;

        let (mut lines1, mut wr1) = connect(&path).await;
        let hello: Event = serde_json::from_str(&lines1.next_line().await.unwrap().unwrap()).unwrap();
        assert_eq!(
            hello,
            Event::Hello {
                protocol: PROTOCOL_VERSION,
                version: "1.0.0".into()
            }
        );
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
        assert!(sink.has_client());

        // A second client gets AlreadyOpen, the first gets Focus.
        let (mut lines2, _wr2) = connect(&path).await;
        let _ = lines2.next_line().await.unwrap();
        let second: Event = serde_json::from_str(&lines2.next_line().await.unwrap().unwrap()).unwrap();
        assert_eq!(second, Event::AlreadyOpen);
        let focus: Event = serde_json::from_str(&lines1.next_line().await.unwrap().unwrap()).unwrap();
        assert_eq!(focus, Event::Focus);

        let cmd = serde_json::to_string(&Command::StopwatchLap).unwrap();
        wr1.write_all(format!("{cmd}\n").as_bytes()).await.unwrap();
        sink.emit(UiEvent::PreviewEnded);
        let ended: Event = serde_json::from_str(&lines1.next_line().await.unwrap().unwrap()).unwrap();
        assert_eq!(ended, Event::PreviewEnded);
        drop(wr1);
        drop(lines1);
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
        assert!(!sink.has_client());
        let log = got.lock().unwrap().join("|");
        assert!(log.contains("ClientConnected"));
        assert!(log.contains("StopwatchLap"));
        assert!(log.contains("ClientDisconnected"));
    }
}
