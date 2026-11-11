//! Storage adapter (ALARM_SPEC 2.7, TZ_RUST 6): `alarm.db` (SQLite, WAL, migrations)
//! and the copies of user music files in `data_dir/sounds/<id>.<ext>`.
//! A row that cannot be read is skipped (alarms) or replaced by the default (settings) and logged.
#![forbid(unsafe_code)]
#![allow(clippy::disallowed_methods, clippy::disallowed_types)]

use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, MutexGuard};

use app::ports::*;
use domain::defaults;
use domain::model::*;
use rusqlite::{Connection, OptionalExtension, Row, params};
use rusqlite_migration::{M, Migrations};
use serde::de::DeserializeOwned;
use serde_json::Value;

const MIGRATIONS: &[M<'static>] = &[M::up(
    "CREATE TABLE alarms (
        id TEXT PRIMARY KEY NOT NULL,
        hour INTEGER NOT NULL,
        minute INTEGER NOT NULL,
        label TEXT NOT NULL,
        enabled INTEGER NOT NULL,
        days TEXT NOT NULL,
        sound_kind TEXT NOT NULL,
        sound_id TEXT NOT NULL,
        volume REAL NOT NULL,
        ramp_seconds INTEGER NOT NULL,
        snooze INTEGER NOT NULL,
        task_type TEXT NOT NULL,
        task_difficulty TEXT NOT NULL,
        task_count INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        next_trigger_at INTEGER,
        snooze_until INTEGER,
        ringing_since INTEGER
    );
    CREATE TABLE settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
    CREATE TABLE timer (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        status TEXT NOT NULL,
        duration_ms INTEGER NOT NULL,
        ends_at INTEGER,
        remaining_ms INTEGER NOT NULL,
        label TEXT NOT NULL,
        sound_kind TEXT NOT NULL,
        sound_id TEXT NOT NULL,
        recents TEXT NOT NULL
    );
    CREATE TABLE stopwatch (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        started_at INTEGER,
        accumulated_ms INTEGER NOT NULL,
        laps TEXT NOT NULL
    );
    CREATE TABLE sounds (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        size INTEGER NOT NULL,
        added_at INTEGER NOT NULL,
        ext TEXT NOT NULL
    );",
)];

fn err(e: impl std::fmt::Display) -> PortError {
    PortError(e.to_string())
}

struct Inner {
    conn: Mutex<Connection>,
    dir: PathBuf,
}

/// One store behind every storage port. Cheap to clone.
#[derive(Clone)]
pub struct SqliteStore(Arc<Inner>);

impl SqliteStore {
    /// Open (or create) `dir/alarm.db` and `dir/sounds/`.
    pub fn open(dir: &Path) -> Result<Self, PortError> {
        std::fs::create_dir_all(dir.join("sounds")).map_err(err)?;
        let mut conn = Connection::open(dir.join("alarm.db")).map_err(err)?;
        conn.pragma_update(None, "journal_mode", "WAL").map_err(err)?;
        conn.pragma_update(None, "synchronous", "NORMAL").map_err(err)?;
        conn.busy_timeout(std::time::Duration::from_secs(5)).map_err(err)?;
        Migrations::from_slice(MIGRATIONS).to_latest(&mut conn).map_err(err)?;
        Ok(SqliteStore(Arc::new(Inner {
            conn: Mutex::new(conn),
            dir: dir.to_path_buf(),
        })))
    }

    fn db(&self) -> MutexGuard<'_, Connection> {
        self.0.conn.lock().unwrap_or_else(|p| p.into_inner())
    }

    pub fn sounds_dir(&self) -> PathBuf {
        self.0.dir.join("sounds")
    }
}

// ------------------------------------------------------------- encoding --

fn enum_str<T: serde::Serialize>(v: &T) -> String {
    match serde_json::to_value(v) {
        Ok(Value::String(s)) => s,
        _ => String::new(),
    }
}

fn enum_from<T: DeserializeOwned>(s: &str) -> Result<T, String> {
    serde_json::from_value(Value::String(s.to_string())).map_err(|e| e.to_string())
}

fn sound_cols(s: &SoundRef) -> (String, String) {
    match s {
        SoundRef::Builtin(b) => ("builtin".into(), enum_str(b)),
        SoundRef::Custom(id) => ("custom".into(), id.clone()),
    }
}

fn sound_from(kind: &str, id: &str) -> Result<SoundRef, String> {
    match kind {
        "builtin" => Ok(SoundRef::Builtin(enum_from(id)?)),
        "custom" if !id.is_empty() => Ok(SoundRef::Custom(id.to_string())),
        _ => Err(format!("bad sound {kind}/{id}")),
    }
}

fn days_str(days: &[u8]) -> String {
    days.iter().map(u8::to_string).collect::<Vec<_>>().join(",")
}

fn days_from(s: &str) -> Result<Vec<u8>, String> {
    if s.is_empty() {
        return Ok(Vec::new());
    }
    s.split(',')
        .map(|d| d.trim().parse::<u8>().map_err(|e| e.to_string()))
        .collect()
}

fn alarm_from_row(r: &Row<'_>) -> Result<Alarm, String> {
    let e = |e: rusqlite::Error| e.to_string();
    let small = |v: i64| u8::try_from(v).map_err(|e| e.to_string());
    let alarm = Alarm {
        id: r.get("id").map_err(e)?,
        hour: small(r.get("hour").map_err(e)?)?,
        minute: small(r.get("minute").map_err(e)?)?,
        label: r.get("label").map_err(e)?,
        enabled: r.get("enabled").map_err(e)?,
        days: days_from(&r.get::<_, String>("days").map_err(e)?)?,
        sound: sound_from(
            &r.get::<_, String>("sound_kind").map_err(e)?,
            &r.get::<_, String>("sound_id").map_err(e)?,
        )?,
        volume: r.get::<_, f64>("volume").map_err(e)? as f32,
        ramp_seconds: u32::try_from(r.get::<_, i64>("ramp_seconds").map_err(e)?).map_err(|e| e.to_string())?,
        snooze: r.get("snooze").map_err(e)?,
        task: DismissTask {
            kind: enum_from(&r.get::<_, String>("task_type").map_err(e)?)?,
            difficulty: enum_from(&r.get::<_, String>("task_difficulty").map_err(e)?)?,
            count: small(r.get("task_count").map_err(e)?)?,
        },
        created_at: r.get("created_at").map_err(e)?,
        next_trigger_at: r.get("next_trigger_at").map_err(e)?,
        snooze_until: r.get("snooze_until").map_err(e)?,
        ringing_since: r.get("ringing_since").map_err(e)?,
    };
    if defaults::alarm_is_valid(&alarm) {
        Ok(alarm)
    } else {
        Err("value out of range".into())
    }
}

const ALARM_COLUMNS: &str = "id, hour, minute, label, enabled, days, sound_kind, sound_id, volume, ramp_seconds, \
    snooze, task_type, task_difficulty, task_count, created_at, next_trigger_at, snooze_until, ringing_since";

fn put_alarm(conn: &Connection, a: &Alarm) -> rusqlite::Result<usize> {
    let (sk, sid) = sound_cols(&a.sound);
    conn.execute(
        &format!(
            "INSERT OR REPLACE INTO alarms ({ALARM_COLUMNS}) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18)"
        ),
        params![
            a.id,
            a.hour,
            a.minute,
            a.label,
            a.enabled,
            days_str(&a.days),
            sk,
            sid,
            f64::from(a.volume),
            a.ramp_seconds,
            a.snooze,
            enum_str(&a.task.kind),
            enum_str(&a.task.difficulty),
            a.task.count,
            a.created_at,
            a.next_trigger_at,
            a.snooze_until,
            a.ringing_since,
        ],
    )
}

// ---------------------------------------------------------------- alarms --

impl AlarmRepo for SqliteStore {
    fn list(&self) -> PortResult<Vec<Alarm>> {
        let db = self.db();
        let mut stmt = db
            .prepare(&format!("SELECT {ALARM_COLUMNS} FROM alarms"))
            .map_err(err)?;
        let mut rows = stmt.query([]).map_err(err)?;
        let mut out = Vec::new();
        while let Some(row) = rows.next().map_err(err)? {
            match alarm_from_row(row) {
                Ok(a) => out.push(a),
                Err(e) => {
                    let id: String = row.get::<_, String>(0).unwrap_or_default();
                    log::warn!("skipping unreadable alarm row {id:?}: {e}");
                }
            }
        }
        Ok(out)
    }

    fn get(&self, id: &str) -> PortResult<Option<Alarm>> {
        let db = self.db();
        let row = db
            .query_row(
                &format!("SELECT {ALARM_COLUMNS} FROM alarms WHERE id = ?1"),
                [id],
                |r| Ok(alarm_from_row(r)),
            )
            .optional()
            .map_err(err)?;
        Ok(row.and_then(|r| r.map_err(|e| log::warn!("unreadable alarm {id:?}: {e}")).ok()))
    }

    fn put(&self, alarm: &Alarm) -> PortResult<()> {
        put_alarm(&self.db(), alarm).map(|_| ()).map_err(err)
    }

    fn delete(&self, id: &str) -> PortResult<()> {
        self.db()
            .execute("DELETE FROM alarms WHERE id = ?1", [id])
            .map(|_| ())
            .map_err(err)
    }

    fn start_ringing(&self, a: &Alarm) -> PortResult<bool> {
        // Exactly one ring: the update only wins while `ringing_since IS NULL`.
        let db = self.db();
        let n = db
            .execute(
                "UPDATE alarms SET enabled = ?2, next_trigger_at = ?3, snooze_until = ?4, ringing_since = ?5 \
                 WHERE id = ?1 AND ringing_since IS NULL",
                params![a.id, a.enabled, a.next_trigger_at, a.snooze_until, a.ringing_since],
            )
            .map_err(err)?;
        Ok(n == 1)
    }
}

// -------------------------------------------------------------- settings --

fn field<T: DeserializeOwned>(map: &serde_json::Map<String, Value>, key: &str, default: T) -> T {
    match map.get(key) {
        None => default,
        Some(v) => serde_json::from_value(v.clone()).unwrap_or_else(|e| {
            log::warn!("setting {key:?} unreadable ({e}), using the default");
            default
        }),
    }
}

impl SettingsRepo for SqliteStore {
    fn load(&self) -> PortResult<Settings> {
        let db = self.db();
        let mut stmt = db.prepare("SELECT key, value FROM settings").map_err(err)?;
        let mut map = serde_json::Map::new();
        let rows = stmt
            .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
            .map_err(err)?;
        for (k, v) in rows.flatten() {
            match serde_json::from_str::<Value>(&v) {
                Ok(val) => {
                    map.insert(k, val);
                }
                Err(e) => log::warn!("setting {k:?} is not JSON ({e}), using the default"),
            }
        }
        let d = defaults::settings();
        Ok(defaults::sanitize_settings(Settings {
            theme: field(&map, "theme", d.theme),
            hour_cycle: field(&map, "hourCycle", d.hour_cycle),
            snooze_minutes: field(&map, "snoozeMinutes", d.snooze_minutes),
            ramp_seconds: field(&map, "rampSeconds", d.ramp_seconds),
            volume: field(&map, "volume", d.volume),
            default_sound: field(&map, "defaultSound", d.default_sound.clone()),
            default_task: field(&map, "defaultTask", d.default_task),
            keep_awake: field(&map, "keepAwake", d.keep_awake),
            missed_grace_minutes: field(&map, "missedGraceMinutes", d.missed_grace_minutes),
            open_at_login: field(&map, "openAtLogin", d.open_at_login),
        }))
    }

    fn save(&self, s: &Settings) -> PortResult<()> {
        let Value::Object(map) = serde_json::to_value(s).map_err(err)? else {
            return Err(PortError("settings are not an object".into()));
        };
        let mut db = self.db();
        let tx = db.transaction().map_err(err)?;
        for (k, v) in map {
            tx.execute(
                "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
                params![k, v.to_string()],
            )
            .map_err(err)?;
        }
        tx.commit().map_err(err)
    }
}

// ----------------------------------------------------- timer, stopwatch --

impl TimerRepo for SqliteStore {
    fn load(&self) -> PortResult<Timer> {
        let db = self.db();
        let row = db
            .query_row(
                "SELECT status, duration_ms, ends_at, remaining_ms, label, sound_kind, sound_id, recents FROM timer WHERE id = 1",
                [],
                |r| {
                    Ok((|| -> Result<Timer, String> {
                        let e = |e: rusqlite::Error| e.to_string();
                        Ok(Timer {
                            status: enum_from(&r.get::<_, String>(0).map_err(e)?)?,
                            duration_ms: r.get(1).map_err(e)?,
                            ends_at: r.get(2).map_err(e)?,
                            remaining_ms: r.get(3).map_err(e)?,
                            label: r.get(4).map_err(e)?,
                            sound: sound_from(&r.get::<_, String>(5).map_err(e)?, &r.get::<_, String>(6).map_err(e)?)?,
                            recents: serde_json::from_str(&r.get::<_, String>(7).map_err(e)?).map_err(|e| e.to_string())?,
                        })
                    })())
                },
            )
            .optional()
            .map_err(err)?;
        Ok(match row {
            Some(Ok(t)) => defaults::sanitize_timer(t),
            Some(Err(e)) => {
                log::warn!("timer row unreadable ({e}), using the default");
                defaults::timer()
            }
            None => defaults::timer(),
        })
    }

    fn save(&self, t: &Timer) -> PortResult<()> {
        let (sk, sid) = sound_cols(&t.sound);
        self.db()
            .execute(
                "INSERT OR REPLACE INTO timer (id, status, duration_ms, ends_at, remaining_ms, label, sound_kind, sound_id, recents) \
                 VALUES (1, ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![
                    enum_str(&t.status),
                    t.duration_ms,
                    t.ends_at,
                    t.remaining_ms,
                    t.label,
                    sk,
                    sid,
                    serde_json::to_string(&t.recents).map_err(err)?
                ],
            )
            .map(|_| ())
            .map_err(err)
    }
}

impl StopwatchRepo for SqliteStore {
    fn load(&self) -> PortResult<Stopwatch> {
        let db = self.db();
        let row = db
            .query_row(
                "SELECT started_at, accumulated_ms, laps FROM stopwatch WHERE id = 1",
                [],
                |r| Ok((r.get::<_, Option<i64>>(0), r.get::<_, i64>(1), r.get::<_, String>(2))),
            )
            .optional()
            .map_err(err)?;
        Ok(match row {
            Some((Ok(started_at), Ok(accumulated_ms), Ok(laps))) => match serde_json::from_str(&laps) {
                Ok(laps) => Stopwatch {
                    started_at,
                    accumulated_ms: accumulated_ms.max(0),
                    laps,
                },
                Err(e) => {
                    log::warn!("stopwatch laps unreadable ({e})");
                    Stopwatch {
                        started_at,
                        accumulated_ms: accumulated_ms.max(0),
                        laps: vec![],
                    }
                }
            },
            Some(_) => {
                log::warn!("stopwatch row unreadable, using the default");
                defaults::stopwatch()
            }
            None => defaults::stopwatch(),
        })
    }

    fn save(&self, s: &Stopwatch) -> PortResult<()> {
        self.db()
            .execute(
                "INSERT OR REPLACE INTO stopwatch (id, started_at, accumulated_ms, laps) VALUES (1, ?1, ?2, ?3)",
                params![
                    s.started_at,
                    s.accumulated_ms,
                    serde_json::to_string(&s.laps).map_err(err)?
                ],
            )
            .map(|_| ())
            .map_err(err)
    }
}

// ---------------------------------------------------------------- sounds --

impl SoundLibrary for SqliteStore {
    fn list(&self) -> PortResult<Vec<CustomSound>> {
        let db = self.db();
        let mut stmt = db
            .prepare("SELECT id, name, size, added_at, ext FROM sounds")
            .map_err(err)?;
        let rows = stmt
            .query_map([], |r| {
                Ok(CustomSound {
                    id: r.get(0)?,
                    name: r.get(1)?,
                    size: r.get::<_, i64>(2)?.max(0) as u64,
                    added_at: r.get(3)?,
                    ext: r.get(4)?,
                })
            })
            .map_err(err)?;
        let mut out = Vec::new();
        for r in rows {
            match r {
                Ok(s) => out.push(s),
                Err(e) => log::warn!("skipping unreadable sound row: {e}"),
            }
        }
        domain::sounds::sort(&mut out);
        Ok(out)
    }

    fn inspect(&self, path: &str) -> PortResult<FileInfo> {
        let p = Path::new(path);
        let meta = std::fs::metadata(p).map_err(err)?;
        if !meta.is_file() {
            return Err(PortError("not a file".into()));
        }
        Ok(FileInfo {
            file_name: p
                .file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_default(),
            size: meta.len(),
        })
    }

    fn add(&self, path: &str, s: &CustomSound) -> PortResult<()> {
        let dest = self.sounds_dir().join(format!("{}.{}", s.id, s.ext));
        std::fs::copy(path, &dest).map_err(err)?;
        let res = self.db().execute(
            "INSERT OR REPLACE INTO sounds (id, name, size, added_at, ext) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![s.id, s.name, s.size as i64, s.added_at, s.ext],
        );
        if let Err(e) = res {
            let _ = std::fs::remove_file(&dest);
            return Err(err(e));
        }
        Ok(())
    }

    fn remove(&self, id: &str) -> PortResult<()> {
        let ext: Option<String> = self
            .db()
            .query_row("SELECT ext FROM sounds WHERE id = ?1", [id], |r| r.get(0))
            .optional()
            .map_err(err)?;
        self.db()
            .execute("DELETE FROM sounds WHERE id = ?1", [id])
            .map_err(err)?;
        if let Some(ext) = ext {
            let _ = std::fs::remove_file(self.sounds_dir().join(format!("{id}.{ext}")));
        }
        Ok(())
    }

    fn file_path(&self, s: &CustomSound) -> String {
        self.sounds_dir()
            .join(format!("{}.{}", s.id, s.ext))
            .to_string_lossy()
            .into_owned()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn alarm(id: &str) -> Alarm {
        Alarm {
            id: id.into(),
            hour: 6,
            minute: 30,
            label: "Work".into(),
            enabled: true,
            days: vec![1, 2, 3, 4, 5],
            sound: SoundRef::Custom("s1".into()),
            volume: 0.85,
            ramp_seconds: 120,
            snooze: false,
            task: DismissTask {
                kind: TaskType::Retype,
                difficulty: Difficulty::Hard,
                count: 3,
            },
            created_at: 42,
            next_trigger_at: Some(1000),
            snooze_until: None,
            ringing_since: None,
        }
    }

    #[test]
    fn migrations_are_valid() {
        Migrations::from_slice(MIGRATIONS).validate().unwrap();
    }

    #[test]
    fn alarms_round_trip_and_survive_reopen() {
        let dir = tempfile::tempdir().unwrap();
        {
            let s = SqliteStore::open(dir.path()).unwrap();
            s.put(&alarm("a")).unwrap();
            s.put(&alarm("b")).unwrap();
            AlarmRepo::delete(&s, "b").unwrap();
        }
        let s = SqliteStore::open(dir.path()).unwrap();
        let all = AlarmRepo::list(&s).unwrap();
        assert_eq!(all.len(), 1);
        let a = &all[0];
        assert_eq!(a.days, vec![1, 2, 3, 4, 5]);
        assert_eq!(a.sound, SoundRef::Custom("s1".into()));
        assert!((a.volume - 0.85).abs() < 1e-6);
        assert_eq!(a.task.kind, TaskType::Retype);
        assert_eq!(s.get("a").unwrap().unwrap().created_at, 42);
    }

    #[test]
    fn broken_alarm_row_is_skipped() {
        let dir = tempfile::tempdir().unwrap();
        let s = SqliteStore::open(dir.path()).unwrap();
        s.put(&alarm("good")).unwrap();
        s.put(&alarm("bad1")).unwrap();
        s.put(&alarm("bad2")).unwrap();
        s.put(&alarm("bad3")).unwrap();
        let db = s.db();
        db.execute("UPDATE alarms SET hour = 99 WHERE id = 'bad1'", []).unwrap();
        db.execute("UPDATE alarms SET sound_kind = 'weird' WHERE id = 'bad2'", [])
            .unwrap();
        db.execute("UPDATE alarms SET days = 'x,y' WHERE id = 'bad3'", [])
            .unwrap();
        drop(db);
        let ids: Vec<String> = AlarmRepo::list(&s).unwrap().into_iter().map(|a| a.id).collect();
        assert_eq!(ids, vec!["good"]);
        assert!(s.get("bad1").unwrap().is_none());
    }

    #[test]
    fn start_ringing_is_exactly_once() {
        let dir = tempfile::tempdir().unwrap();
        let s = SqliteStore::open(dir.path()).unwrap();
        let mut a = alarm("a");
        s.put(&a).unwrap();
        a.ringing_since = Some(5);
        assert!(s.start_ringing(&a).unwrap());
        // A second process (or tick) loses.
        let other = SqliteStore::open(dir.path()).unwrap();
        assert!(!other.start_ringing(&a).unwrap());
        assert_eq!(s.get("a").unwrap().unwrap().ringing_since, Some(5));
    }

    #[test]
    fn settings_defaults_and_broken_values() {
        let dir = tempfile::tempdir().unwrap();
        let s = SqliteStore::open(dir.path()).unwrap();
        assert_eq!(SettingsRepo::load(&s).unwrap(), defaults::settings());
        let mut st = defaults::settings();
        st.snooze_minutes = 12;
        st.theme = Theme::Light;
        SettingsRepo::save(&s, &st).unwrap();
        assert_eq!(SettingsRepo::load(&s).unwrap(), st);
        s.db()
            .execute("UPDATE settings SET value = '\"purple\"' WHERE key = 'theme'", [])
            .unwrap();
        s.db()
            .execute("UPDATE settings SET value = 'not json' WHERE key = 'volume'", [])
            .unwrap();
        s.db()
            .execute("UPDATE settings SET value = '77' WHERE key = 'snoozeMinutes'", [])
            .unwrap();
        let loaded = SettingsRepo::load(&s).unwrap();
        assert_eq!(loaded.theme, Theme::System);
        assert!((loaded.volume - 0.9).abs() < 1e-6);
        assert_eq!(loaded.snooze_minutes, 9);
    }

    #[test]
    fn timer_and_stopwatch_persist() {
        let dir = tempfile::tempdir().unwrap();
        let s = SqliteStore::open(dir.path()).unwrap();
        let t = domain::timer::start(&defaults::timer(), 90_000, Some("Tea".into()), 1000);
        TimerRepo::save(&s, &t).unwrap();
        let sw = Stopwatch {
            started_at: Some(10),
            accumulated_ms: 5,
            laps: vec![1, 2],
        };
        StopwatchRepo::save(&s, &sw).unwrap();
        let s2 = SqliteStore::open(dir.path()).unwrap();
        assert_eq!(TimerRepo::load(&s2).unwrap(), t);
        assert_eq!(StopwatchRepo::load(&s2).unwrap(), sw);
        s2.db().execute("UPDATE timer SET status = 'exploded'", []).unwrap();
        assert_eq!(TimerRepo::load(&s2).unwrap(), defaults::timer());
    }

    #[test]
    fn sound_library_copies_and_removes_files() {
        let dir = tempfile::tempdir().unwrap();
        let src = dir.path().join("My Song.mp3");
        std::fs::write(&src, b"abc").unwrap();
        let s = SqliteStore::open(&dir.path().join("data")).unwrap();
        let info = s.inspect(src.to_str().unwrap()).unwrap();
        assert_eq!(
            info,
            FileInfo {
                file_name: "My Song.mp3".into(),
                size: 3
            }
        );
        let snd = CustomSound {
            id: "x1".into(),
            name: "My Song".into(),
            size: 3,
            added_at: 1,
            ext: "mp3".into(),
        };
        s.add(src.to_str().unwrap(), &snd).unwrap();
        std::fs::remove_file(&src).unwrap(); // the original may move away
        let path = s.file_path(&snd);
        assert_eq!(std::fs::read(&path).unwrap(), b"abc");
        assert_eq!(SoundLibrary::list(&s).unwrap(), vec![snd.clone()]);
        SoundLibrary::remove(&s, "x1").unwrap();
        assert!(SoundLibrary::list(&s).unwrap().is_empty());
        assert!(!Path::new(&path).exists());
    }
}
