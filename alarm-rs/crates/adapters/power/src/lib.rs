//! PowerGuard adapter (TZ_RUST 3.7, 3.17): forbids system sleep (`idle` + `sleep`, not `display`)
//! while asked to, and on Windows sets a waitable timer that wakes the computer for the next ring.
#![allow(clippy::disallowed_methods, clippy::disallowed_types)]
#![cfg_attr(not(windows), forbid(unsafe_code))]

use std::sync::mpsc::{Sender, channel};

use app::ports::PowerGuard;
use domain::model::Ms;

enum Msg {
    KeepAwake(bool),
    Wake(Option<Ms>),
}

/// The guard lives on its own thread: the OS handles are not `Send` everywhere.
pub struct Power {
    tx: Sender<Msg>,
}

impl Power {
    /// `enabled = false` (tests, headless e2e): accept calls, change nothing in the OS.
    pub fn new(enabled: bool) -> Self {
        let (tx, rx) = channel::<Msg>();
        std::thread::Builder::new()
            .name("power".into())
            .spawn(move || {
                let mut guard: Option<keepawake::KeepAwake> = None;
                #[cfg(windows)]
                let mut waker = wake::Waker::default();
                for msg in rx {
                    match msg {
                        Msg::KeepAwake(on) if enabled => {
                            if on && guard.is_none() {
                                match keepawake::Builder::default()
                                    .display(false)
                                    .idle(true)
                                    .sleep(true)
                                    .reason("Alarm is waiting to ring")
                                    .app_name("Alarm")
                                    .app_reverse_domain("org.alarmrs.Alarm")
                                    .create()
                                {
                                    Ok(g) => guard = Some(g),
                                    Err(e) => log::warn!("keep-awake failed: {e}"),
                                }
                            } else if !on {
                                guard = None;
                            }
                            log::info!("keep computer awake: {on}");
                        }
                        Msg::Wake(at) if enabled => {
                            #[cfg(windows)]
                            waker.set(at);
                            #[cfg(not(windows))]
                            let _ = at;
                        }
                        _ => {}
                    }
                }
            })
            .expect("power thread");
        Power { tx }
    }
}

impl PowerGuard for Power {
    fn set_keep_awake(&self, on: bool) {
        let _ = self.tx.send(Msg::KeepAwake(on));
    }

    fn schedule_wake(&self, at: Option<Ms>) {
        let _ = self.tx.send(Msg::Wake(at));
    }
}

#[cfg(windows)]
mod wake {
    //! Waitable timer with `fResume = TRUE` (TZ_RUST 3.17). Used only if the OS allows it
    //! without administrator rights; otherwise it is skipped with a log line.
    use domain::model::Ms;
    use windows_sys::Win32::Foundation::{CloseHandle, HANDLE};
    use windows_sys::Win32::System::Threading::{CancelWaitableTimer, CreateWaitableTimerW, SetWaitableTimer};

    #[derive(Default)]
    pub struct Waker {
        handle: Option<HANDLE>,
    }

    /// 100-ns intervals between 1601-01-01 and 1970-01-01.
    const EPOCH_DIFF: i64 = 116_444_736_000_000_000;

    impl Waker {
        pub fn set(&mut self, at: Option<Ms>) {
            // SAFETY: plain Win32 calls with a handle owned by this struct.
            unsafe {
                if self.handle.is_none() {
                    let h = CreateWaitableTimerW(std::ptr::null(), 1, std::ptr::null());
                    if h.is_null() {
                        log::warn!("waitable timer unavailable");
                        return;
                    }
                    self.handle = Some(h);
                }
                let Some(h) = self.handle else { return };
                match at {
                    Some(ms) => {
                        let due = ms * 10_000 + EPOCH_DIFF;
                        if SetWaitableTimer(h, &due, 0, None, std::ptr::null(), 1) == 0 {
                            log::warn!("wake timer refused by the OS");
                        }
                    }
                    None => {
                        CancelWaitableTimer(h);
                    }
                }
            }
        }
    }

    impl Drop for Waker {
        fn drop(&mut self) {
            if let Some(h) = self.handle.take() {
                // SAFETY: the handle was created by CreateWaitableTimerW.
                unsafe { CloseHandle(h) };
            }
        }
    }
}
