//! Every use case with fake adapters in memory (TZ_RUST 8, level `app`).

mod common;

use app::Request;
use app::ports::{FileInfo, PlaybackId, SoundSource, UiEvent};
use common::*;
use domain::model::*;
use domain::tasks::ProblemKind;

#[test]
fn alarm_rings_once_and_one_shot_turns_off() {
    let mut h = Harness::new(at(2026, 11, 10, 6, 0));
    let id = h.add_alarm(7, 0, &[]);
    assert_eq!(h.alarm(&id).next_trigger_at, Some(at(2026, 11, 10, 7, 0)));
    h.advance_to(at(2026, 11, 10, 6, 59));
    assert!(h.alarm(&id).ringing_since.is_none());

    h.advance_to(at(2026, 11, 10, 7, 0));
    let a = h.alarm(&id);
    assert_eq!(a.ringing_since, Some(at(2026, 11, 10, 7, 0)));
    assert!(!a.enabled && a.next_trigger_at.is_none());
    let w = h.fake.w();
    let play = w.playing.get(&PlaybackId::Alarm(id.clone())).expect("sound");
    assert_eq!(play.source, SoundSource::Builtin(BuiltinSound::Sunrise));
    assert!(play.looped);
    assert_eq!(play.ramp_seconds, 60);
    let n = w.notifications.get(&format!("alarm-{id}")).unwrap();
    assert_eq!(n.title, "⏰ Alarm");
    assert_eq!(n.body, "07:00\nOpen the app to turn it off.");
    assert_eq!(n.snooze_action.as_deref(), Some("Snooze 9 min"));
    assert!(n.persistent);
    // No client: the daemon starts it on the ringing screen.
    assert_eq!(w.launched, vec!["ringing"]);
    assert_eq!(w.tray.as_deref(), Some("Snooze 9 min"));
    drop(w);

    // More ticks do not ring again.
    h.advance_to(at(2026, 11, 10, 7, 1));
    assert_eq!(h.fake.w().notify_log.len(), 1);
    assert_eq!(h.fake.w().launched.len(), 1);
}

#[test]
fn ringing_with_client_emits_show_ringing() {
    let mut h = Harness::new(at(2026, 11, 10, 6, 0));
    h.fake.w().client = true;
    h.add_alarm(6, 1, &[]);
    h.advance_to(at(2026, 11, 10, 6, 1));
    let w = h.fake.w();
    assert!(w.events.contains(&UiEvent::ShowRinging));
    assert!(w.launched.is_empty());
    assert_eq!(w.views.last().unwrap().ringing.len(), 1);
}

#[test]
fn repeating_alarm_moves_to_next_day() {
    let mut h = Harness::new(at(2026, 11, 13, 6, 0)); // Friday
    let id = h.add_alarm(7, 0, &[1, 2, 3, 4, 5]);
    h.advance_to(at(2026, 11, 13, 7, 0));
    let a = h.alarm(&id);
    assert!(a.enabled);
    assert_eq!(a.next_trigger_at, Some(at(2026, 11, 16, 7, 0)));
}

#[test]
fn missed_alarm_after_sleep() {
    let mut h = Harness::new(at(2026, 11, 10, 6, 0));
    let id = h.add_alarm(7, 0, &[]);
    // Woke 2 h late: grace 60 min → missed, no sound.
    h.advance_to(at(2026, 11, 10, 9, 0));
    let a = h.alarm(&id);
    assert!(a.ringing_since.is_none() && !a.enabled);
    let w = h.fake.w();
    assert!(w.playing.is_empty());
    let n = w.notify_log.last().unwrap();
    assert_eq!(n.title, "Missed alarm: Alarm");
    assert_eq!(
        n.body,
        "It was set for 07:00, while the computer was asleep or the app was closed."
    );
}

#[test]
fn late_within_grace_still_rings() {
    let mut h = Harness::new(at(2026, 11, 10, 6, 0));
    let id = h.add_alarm(7, 0, &[]);
    h.advance_to(at(2026, 11, 10, 7, 45));
    assert!(h.alarm(&id).ringing_since.is_some());
}

#[test]
fn missed_more_than_12h_is_silent() {
    let mut h = Harness::new(at(2026, 11, 10, 6, 0));
    h.add_alarm(7, 0, &[]);
    h.advance_to(at(2026, 11, 11, 8, 0));
    assert!(h.fake.w().notify_log.is_empty());
}

#[test]
fn snooze_then_ring_again_and_cancel() {
    let mut h = Harness::new(at(2026, 11, 10, 6, 0));
    let id = h.add_alarm(7, 0, &[]);
    h.advance_to(at(2026, 11, 10, 7, 0));
    h.req(Request::Snooze(id.clone()));
    let a = h.alarm(&id);
    assert_eq!(a.snooze_until, Some(at(2026, 11, 10, 7, 9)));
    assert!(a.ringing_since.is_none());
    {
        let w = h.fake.w();
        assert!(w.playing.is_empty());
        assert_eq!(w.stops.last(), Some(&(PlaybackId::Alarm(id.clone()), 120)));
        assert!(w.notifications.is_empty());
        assert_eq!(w.tray, None);
    }
    // A one-shot alarm that turned itself off still rings after the snooze.
    h.advance_to(at(2026, 11, 10, 7, 9));
    assert!(h.alarm(&id).ringing_since.is_some());
    // Snooze again (unlimited), then cancel from the list.
    h.req(Request::Snooze(id.clone()));
    h.req(Request::CancelSnooze(id.clone()));
    assert_eq!(h.alarm(&id).snooze_until, None);
    h.advance_to(at(2026, 11, 10, 7, 30));
    assert!(h.alarm(&id).ringing_since.is_none());
}

#[test]
fn snooze_is_refused_when_disabled_for_the_alarm() {
    let mut h = Harness::new(at(2026, 11, 10, 6, 0));
    let s = domain::defaults::settings();
    let mut d = domain::defaults::new_alarm_draft(&s, 7, 0);
    d.snooze = false;
    h.req(Request::SaveAlarm(d));
    let id = h.fake.w().alarms.keys().next().unwrap().clone();
    h.advance_to(at(2026, 11, 10, 7, 0));
    assert_eq!(h.fake.w().notify_log[0].snooze_action, None);
    assert_eq!(h.fake.w().tray, None);
    h.req(Request::Snooze(id.clone()));
    assert!(h.alarm(&id).ringing_since.is_some());
}

#[test]
fn stop_without_task_turns_off_with_250ms_fade() {
    let mut h = Harness::new(at(2026, 11, 10, 6, 0));
    let s = domain::defaults::settings();
    let mut d = domain::defaults::new_alarm_draft(&s, 7, 0);
    d.task.kind = TaskType::None;
    h.req(Request::SaveAlarm(d));
    let id = h.fake.w().alarms.keys().next().unwrap().clone();
    h.advance_to(at(2026, 11, 10, 7, 0));
    h.req(Request::Stop(id.clone()));
    assert!(h.alarm(&id).ringing_since.is_none());
    assert_eq!(h.fake.w().stops.last(), Some(&(PlaybackId::Alarm(id), 250)));
}

#[test]
fn task_flow_wrong_then_right() {
    let mut h = Harness::new(at(2026, 11, 10, 6, 0));
    h.fake.w().client = true;
    let id = h.add_alarm(7, 0, &[]); // Math · Medium · 2
    h.advance_to(at(2026, 11, 10, 7, 0));
    h.req(Request::Stop(id.clone()));
    let task = h.last_view().ringing[0].task.clone().expect("task card");
    assert_eq!(task.kind, ProblemKind::Math);
    assert_eq!((task.solved, task.total, task.wrong), (0, 2, 0));
    // The sound keeps playing during the task.
    assert!(h.fake.w().playing.contains_key(&PlaybackId::Alarm(id.clone())));

    h.req(Request::SubmitAnswer {
        id: id.clone(),
        answer: "nonsense".into(),
    });
    let after_wrong = h.last_view().ringing[0].task.clone().unwrap();
    assert_eq!((after_wrong.solved, after_wrong.wrong), (0, 1));

    for _ in 0..2 {
        let answer = h.rt.tasks.get(&id).unwrap().problem.answer.clone();
        h.req(Request::SubmitAnswer { id: id.clone(), answer });
    }
    assert!(h.alarm(&id).ringing_since.is_none());
    assert!(h.last_view().ringing.is_empty());
    assert!(h.fake.w().playing.is_empty());
}

#[test]
fn back_from_task_returns_to_buttons() {
    let mut h = Harness::new(at(2026, 11, 10, 6, 0));
    h.fake.w().client = true;
    let id = h.add_alarm(7, 0, &[]);
    h.advance_to(at(2026, 11, 10, 7, 0));
    h.req(Request::Stop(id.clone()));
    h.req(Request::BackFromTask(id.clone()));
    assert!(h.last_view().ringing[0].task.is_none());
}

#[test]
fn ringing_survives_restart_and_resumes_ramp() {
    let mut h = Harness::new(at(2026, 11, 10, 6, 0));
    let id = h.add_alarm(7, 0, &[]);
    h.advance_to(at(2026, 11, 10, 7, 0));
    // A new daemon process: fresh runtime, same storage.
    h.rt = app::Runtime::new(Box::new(domain::tasks::SplitMix64(9)));
    h.fake.w().playing.clear();
    h.fake.w().now = at(2026, 11, 10, 7, 0) + 30_000;
    h.req(Request::Startup);
    let w = h.fake.w();
    let play = w.playing.get(&PlaybackId::Alarm(id)).expect("still ringing");
    assert!((play.elapsed_seconds - 30.0).abs() < 1e-6);
}

#[test]
fn save_reschedules_and_clears_snooze() {
    let mut h = Harness::new(at(2026, 11, 10, 6, 0));
    let id = h.add_alarm(7, 0, &[]);
    h.req(Request::SetAlarmEnabled {
        id: id.clone(),
        enabled: false,
    });
    assert_eq!(h.alarm(&id).next_trigger_at, None);
    let mut d = AlarmDraft::from_alarm(&h.alarm(&id));
    d.hour = 5;
    h.req(Request::SaveAlarm(d));
    let a = h.alarm(&id);
    assert!(a.enabled);
    assert_eq!(a.next_trigger_at, Some(at(2026, 11, 11, 5, 0)));
    h.req(Request::SetAlarmEnabled {
        id: id.clone(),
        enabled: true,
    });
    h.req(Request::DeleteAlarm(id.clone()));
    assert!(h.fake.w().alarms.is_empty());
}

#[test]
fn keep_awake_follows_policy() {
    let mut h = Harness::new(at(2026, 11, 10, 6, 0));
    let id = h.add_alarm(7, 0, &[]);
    assert!(!h.fake.w().keep_awake);
    let mut s = domain::defaults::settings();
    s.keep_awake = true;
    h.req(Request::UpdateSettings(s));
    assert!(h.fake.w().keep_awake);
    h.req(Request::SetAlarmEnabled { id, enabled: false });
    assert!(!h.fake.w().keep_awake);
}

#[test]
fn open_at_login_goes_to_login_item() {
    let mut h = Harness::new(at(2026, 11, 10, 6, 0));
    h.req(Request::Startup);
    assert_eq!(h.fake.w().login, vec![true]);
    let mut s = domain::defaults::settings();
    s.open_at_login = false;
    h.req(Request::UpdateSettings(s));
    assert_eq!(h.fake.w().login, vec![true, false]);
}

#[test]
fn timer_rings_and_late_timer_only_notifies() {
    let mut h = Harness::new(at(2026, 11, 10, 6, 0));
    h.req(Request::StartTimer {
        duration_ms: 60_000,
        label: None,
    });
    h.advance_to(at(2026, 11, 10, 6, 1));
    {
        let w = h.fake.w();
        assert_eq!(w.timer.as_ref().unwrap().status, TimerStatus::Ringing);
        let play = w.playing.get(&PlaybackId::Timer).unwrap();
        assert_eq!(play.source, SoundSource::Builtin(BuiltinSound::Chimes));
        assert_eq!(play.ramp_seconds, 3);
        assert!((play.volume - 0.9).abs() < 1e-6);
        assert_eq!(w.notifications["timer"].title, "⏱ Timer");
        assert_eq!(w.notifications["timer"].body, "01:00 timer is done.");
        assert_eq!(w.launched, vec!["timer"]);
    }
    h.req(Request::RepeatTimer);
    assert_eq!(h.fake.w().timer.as_ref().unwrap().status, TimerStatus::Running);
    assert!(h.fake.w().playing.is_empty());
    // Asleep for 30 min.
    h.advance_to(at(2026, 11, 10, 6, 31));
    let w = h.fake.w();
    assert_eq!(w.timer.as_ref().unwrap().status, TimerStatus::Idle);
    assert_eq!(w.notify_log.last().unwrap().title, "Timer ended");
    assert!(w.playing.is_empty());
}

#[test]
fn timer_pause_resume_cancel() {
    let mut h = Harness::new(1_000_000);
    h.req(Request::SetTimerDuration(90_000));
    h.req(Request::StartTimer {
        duration_ms: 90_000,
        label: Some("Tea".into()),
    });
    h.fake.w().now = 1_030_000;
    h.req(Request::PauseTimer);
    assert_eq!(h.fake.w().timer.as_ref().unwrap().remaining_ms, 60_000);
    h.fake.w().now = 2_000_000;
    h.req(Request::ResumeTimer);
    assert_eq!(h.fake.w().timer.as_ref().unwrap().ends_at, Some(2_060_000));
    h.req(Request::CancelTimer);
    let t = h.fake.w().timer.clone().unwrap();
    assert_eq!(t.status, TimerStatus::Idle);
    assert_eq!(
        t.recents[0],
        Recent {
            duration_ms: 90_000,
            label: "Tea".into()
        }
    );
}

#[test]
fn stopwatch_commands() {
    let mut h = Harness::new(0);
    h.req(Request::StopwatchStart);
    h.fake.w().now = 1500;
    h.req(Request::StopwatchLap);
    h.fake.w().now = 2000;
    h.req(Request::StopwatchStop);
    let s = h.fake.w().stopwatch.clone();
    assert_eq!(
        (s.started_at, s.accumulated_ms, s.laps.clone()),
        (None, 2000, vec![1500])
    );
    h.req(Request::StopwatchReset);
    assert_eq!(h.fake.w().stopwatch, Stopwatch::default());
}

#[test]
fn import_sound_validates_and_reports() {
    let mut h = Harness::new(1000);
    h.fake.w().files.insert(
        "/a/song.mp3".into(),
        FileInfo {
            file_name: "song.mp3".into(),
            size: 1000,
        },
    );
    h.fake.w().files.insert(
        "/a/doc.pdf".into(),
        FileInfo {
            file_name: "doc.pdf".into(),
            size: 10,
        },
    );
    h.fake.w().files.insert(
        "/a/big.wav".into(),
        FileInfo {
            file_name: "big.wav".into(),
            size: 81 * 1024 * 1024,
        },
    );
    h.req(Request::ImportSound {
        path: "/a/doc.pdf".into(),
    });
    h.req(Request::ImportSound {
        path: "/a/big.wav".into(),
    });
    h.fake.w().playable = false;
    h.req(Request::ImportSound {
        path: "/a/song.mp3".into(),
    });
    h.fake.w().playable = true;
    h.req(Request::ImportSound {
        path: "/a/song.mp3".into(),
    });
    let w = h.fake.w();
    let results: Vec<_> = w
        .events
        .iter()
        .filter_map(|e| {
            if let UiEvent::ImportResult(r) = e {
                Some(r.clone())
            } else {
                None
            }
        })
        .collect();
    assert_eq!(results[0], Err("That file is not an audio file.".into()));
    assert_eq!(results[1], Err("That file is larger than 80 MB.".into()));
    assert_eq!(
        results[2],
        Err("This audio format cannot be played on this computer.".into())
    );
    assert!(results[3].is_ok());
    assert_eq!(w.sounds.len(), 1);
    assert_eq!(w.sounds[0].name, "song");
}

#[test]
fn missing_custom_sound_plays_sunrise() {
    let mut h = Harness::new(at(2026, 11, 10, 6, 0));
    let s = domain::defaults::settings();
    let mut d = domain::defaults::new_alarm_draft(&s, 7, 0);
    d.sound = SoundRef::Custom("gone".into());
    h.req(Request::SaveAlarm(d));
    h.advance_to(at(2026, 11, 10, 7, 0));
    let w = h.fake.w();
    let play = w.playing.values().next().unwrap();
    assert_eq!(play.source, SoundSource::Builtin(BuiltinSound::Sunrise));
}

#[test]
fn preview_play_stop_and_disconnect() {
    let mut h = Harness::new(0);
    h.fake.w().client = true;
    h.req(Request::PreviewPlay {
        sound: SoundRef::Builtin(BuiltinSound::Harp),
        volume: 0.5,
        ramp_seconds: 0,
        looped: false,
    });
    assert!(h.fake.w().playing.contains_key(&PlaybackId::Preview));
    assert!(h.last_view().preview_playing);
    h.req(Request::PreviewEnded);
    assert!(h.fake.w().events.contains(&UiEvent::PreviewEnded));
    h.req(Request::PreviewPlay {
        sound: SoundRef::Builtin(BuiltinSound::Harp),
        volume: 0.5,
        ramp_seconds: 60,
        looped: true,
    });
    h.req(Request::ClientDisconnected);
    assert!(!h.fake.w().playing.contains_key(&PlaybackId::Preview));
}

#[test]
fn tray_snooze_all_and_open_window() {
    let mut h = Harness::new(at(2026, 11, 10, 6, 0));
    let a = h.add_alarm(7, 0, &[]);
    let b = h.add_alarm(7, 0, &[2]); // Tuesday
    h.advance_to(at(2026, 11, 10, 7, 0));
    // Both ring: both sounds play.
    assert_eq!(h.fake.w().playing.len(), 2);
    h.req(Request::OpenWindow);
    assert_eq!(h.fake.w().launched.last(), Some(&"ringing"));
    h.req(Request::SnoozeAllRinging);
    assert!(h.alarm(&a).snooze_until.is_some() && h.alarm(&b).snooze_until.is_some());
    h.req(Request::OpenWindow);
    assert_eq!(h.fake.w().launched.last(), Some(&"window"));
}

#[test]
fn snapshot_has_next_alarm_and_template() {
    let mut h = Harness::new(at(2026, 11, 10, 6, 0));
    h.fake.w().client = true;
    h.add_alarm(7, 0, &[]);
    let v = h.last_view();
    assert_eq!(v.next_alarm_at, Some(at(2026, 11, 10, 7, 0)));
    assert_eq!((v.new_alarm.hour, v.new_alarm.minute), (6, 0));
    assert_eq!(v.new_alarm.task, domain::defaults::DEFAULT_TASK);
    assert_eq!(v.hour_cycle, HourCycle::H24);
}

#[test]
fn two_daemons_on_one_store_ring_once() {
    let mut h = Harness::new(at(2026, 11, 10, 6, 0));
    let id = h.add_alarm(7, 0, &[]);
    // A second runtime over the same storage, as if a second process ticked too.
    let mut other = app::Runtime::new(Box::new(domain::tasks::SplitMix64(5)));
    h.fake.w().now = at(2026, 11, 10, 7, 0);
    // The second process read the alarm before the first one wrote `ringing_since`.
    let stale = h.alarm(&id);
    h.req(Request::Tick);
    assert!(
        !app::ports::AlarmRepo::start_ringing(
            &h.fake,
            &domain::schedule::ring(
                &stale,
                domain::schedule::Source::Schedule,
                stale.next_trigger_at.unwrap(),
                at(2026, 11, 10, 7, 0),
                &tz()
            )
        )
        .unwrap()
    );
    app::handle(&h.ports, &mut other, Request::Tick).unwrap();
    assert_eq!(h.fake.w().notify_log.len(), 1);
}
