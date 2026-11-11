//! Fake adapters in memory for the use-case tests.
#![allow(dead_code)]

use std::collections::BTreeMap;
use std::sync::{Arc, Mutex};

use app::ports::*;
use app::view::AppView;
use app::{Ports, Request, Runtime, handle};
use domain::TimeZone;
use domain::model::*;
use domain::tasks::SplitMix64;

#[derive(Default)]
pub struct World {
    pub now: Ms,
    pub alarms: BTreeMap<String, Alarm>,
    pub settings: Option<Settings>,
    pub timer: Option<Timer>,
    pub stopwatch: Stopwatch,
    pub sounds: Vec<CustomSound>,
    pub files: BTreeMap<String, FileInfo>,
    pub playable: bool,
    pub playing: BTreeMap<PlaybackId, PlayRequest>,
    pub stops: Vec<(PlaybackId, u32)>,
    pub notifications: BTreeMap<String, Notification>,
    pub notify_log: Vec<Notification>,
    pub notify_status: Option<NotifyStatus>,
    pub keep_awake: bool,
    pub login: Vec<bool>,
    pub launched: Vec<&'static str>,
    pub client: bool,
    pub events: Vec<UiEvent>,
    pub views: Vec<AppView>,
    pub tray: Option<String>,
}

#[derive(Clone, Default)]
pub struct Fake(pub Arc<Mutex<World>>);

impl Fake {
    pub fn w(&self) -> std::sync::MutexGuard<'_, World> {
        self.0.lock().unwrap()
    }
}

pub fn tz() -> TimeZone {
    TimeZone::get("Europe/Berlin").unwrap()
}

pub fn at(y: i16, mo: i8, d: i8, h: i8, mi: i8) -> Ms {
    jiff::civil::date(y, mo, d)
        .at(h, mi, 0, 0)
        .to_zoned(tz())
        .unwrap()
        .timestamp()
        .as_millisecond()
}

impl Clock for Fake {
    fn now(&self) -> Ms {
        self.w().now
    }
    fn time_zone(&self) -> TimeZone {
        tz()
    }
}

impl AlarmRepo for Fake {
    fn list(&self) -> PortResult<Vec<Alarm>> {
        Ok(self.w().alarms.values().cloned().collect())
    }
    fn get(&self, id: &str) -> PortResult<Option<Alarm>> {
        Ok(self.w().alarms.get(id).cloned())
    }
    fn put(&self, a: &Alarm) -> PortResult<()> {
        self.w().alarms.insert(a.id.clone(), a.clone());
        Ok(())
    }
    fn delete(&self, id: &str) -> PortResult<()> {
        self.w().alarms.remove(id);
        Ok(())
    }
    fn start_ringing(&self, a: &Alarm) -> PortResult<bool> {
        let mut w = self.w();
        match w.alarms.get(&a.id) {
            Some(cur) if cur.ringing_since.is_none() => {
                w.alarms.insert(a.id.clone(), a.clone());
                Ok(true)
            }
            _ => Ok(false),
        }
    }
}

impl SettingsRepo for Fake {
    fn load(&self) -> PortResult<Settings> {
        Ok(self.w().settings.clone().unwrap_or_else(domain::defaults::settings))
    }
    fn save(&self, s: &Settings) -> PortResult<()> {
        self.w().settings = Some(s.clone());
        Ok(())
    }
}

impl TimerRepo for Fake {
    fn load(&self) -> PortResult<Timer> {
        Ok(self.w().timer.clone().unwrap_or_else(domain::defaults::timer))
    }
    fn save(&self, t: &Timer) -> PortResult<()> {
        self.w().timer = Some(t.clone());
        Ok(())
    }
}

impl StopwatchRepo for Fake {
    fn load(&self) -> PortResult<Stopwatch> {
        Ok(self.w().stopwatch.clone())
    }
    fn save(&self, s: &Stopwatch) -> PortResult<()> {
        self.w().stopwatch = s.clone();
        Ok(())
    }
}

impl SoundLibrary for Fake {
    fn list(&self) -> PortResult<Vec<CustomSound>> {
        Ok(self.w().sounds.clone())
    }
    fn inspect(&self, path: &str) -> PortResult<FileInfo> {
        self.w()
            .files
            .get(path)
            .cloned()
            .ok_or_else(|| PortError("no file".into()))
    }
    fn add(&self, _path: &str, s: &CustomSound) -> PortResult<()> {
        self.w().sounds.push(s.clone());
        Ok(())
    }
    fn remove(&self, id: &str) -> PortResult<()> {
        self.w().sounds.retain(|s| s.id != id);
        Ok(())
    }
    fn file_path(&self, s: &CustomSound) -> String {
        format!("/sounds/{}.{}", s.id, s.ext)
    }
}

impl AudioOut for Fake {
    fn play(&self, id: PlaybackId, r: PlayRequest) {
        self.w().playing.insert(id, r);
    }
    fn stop(&self, id: &PlaybackId, fade: u32) {
        let mut w = self.w();
        w.playing.remove(id);
        w.stops.push((id.clone(), fade));
    }
    fn probe(&self, _path: &str) -> bool {
        self.w().playable
    }
}

impl Notifier for Fake {
    fn status(&self) -> NotifyStatus {
        self.w().notify_status.unwrap_or(NotifyStatus::On)
    }
    fn request_permission(&self) {
        self.w().notify_status = Some(NotifyStatus::On);
    }
    fn show(&self, n: &Notification) {
        let mut w = self.w();
        w.notifications.insert(n.tag.clone(), n.clone());
        w.notify_log.push(n.clone());
    }
    fn close(&self, tag: &str) {
        self.w().notifications.remove(tag);
    }
}

impl PowerGuard for Fake {
    fn set_keep_awake(&self, on: bool) {
        self.w().keep_awake = on;
    }
    fn schedule_wake(&self, _at: Option<Ms>) {}
}

impl LoginItem for Fake {
    fn set_enabled(&self, on: bool) -> PortResult<()> {
        self.w().login.push(on);
        Ok(())
    }
}

impl SystemInfo for Fake {
    fn hour_cycle(&self) -> HourCycle {
        HourCycle::H24
    }
    fn platform(&self) -> Platform {
        Platform::Macos
    }
    fn app_version(&self) -> String {
        "1.0.0".into()
    }
}

impl UiLauncher for Fake {
    fn show_window(&self) {
        self.w().launched.push("window");
    }
    fn show_ringing(&self) {
        self.w().launched.push("ringing");
    }
    fn show_timer_alert(&self) {
        self.w().launched.push("timer");
    }
}

impl EventSink for Fake {
    fn has_client(&self) -> bool {
        self.w().client
    }
    fn publish(&self, v: &AppView) {
        self.w().views.push(v.clone());
    }
    fn emit(&self, e: UiEvent) {
        self.w().events.push(e);
    }
}

impl TrayMenu for Fake {
    fn set_snooze(&self, label: Option<String>) {
        self.w().tray = label;
    }
}

pub struct Harness {
    pub fake: Fake,
    pub ports: Ports,
    pub rt: Runtime,
}

impl Harness {
    pub fn new(now: Ms) -> Self {
        let fake = Fake::default();
        fake.w().now = now;
        fake.w().playable = true;
        let f = || Box::new(fake.clone());
        let ports = Ports {
            clock: f(),
            alarms: f(),
            settings: f(),
            timer: f(),
            stopwatch: f(),
            sounds: f(),
            audio: f(),
            notifier: f(),
            power: f(),
            login: f(),
            system: f(),
            launcher: f(),
            sink: f(),
            tray: f(),
        };
        Harness {
            fake,
            ports,
            rt: Runtime::new(Box::new(SplitMix64(1))),
        }
    }

    pub fn req(&mut self, r: Request) {
        handle(&self.ports, &mut self.rt, r).unwrap();
    }

    pub fn advance_to(&mut self, now: Ms) {
        self.fake.w().now = now;
        self.req(Request::Tick);
    }

    pub fn add_alarm(&mut self, hour: u8, minute: u8, days: &[u8]) -> String {
        let s = domain::defaults::settings();
        let mut d = domain::defaults::new_alarm_draft(&s, hour, minute);
        d.days = days.to_vec();
        let before: Vec<String> = self.fake.w().alarms.keys().cloned().collect();
        self.req(Request::SaveAlarm(d));
        let w = self.fake.w();
        w.alarms.keys().find(|k| !before.contains(k)).unwrap().clone()
    }

    pub fn alarm(&self, id: &str) -> Alarm {
        self.fake.w().alarms.get(id).cloned().unwrap()
    }

    pub fn last_view(&self) -> AppView {
        self.fake.w().views.last().cloned().unwrap()
    }
}
