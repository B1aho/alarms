//! The `Clock` port: system time, optionally shifted by an offset file (fake clock for e2e).

use std::path::PathBuf;

use app::ports::Clock;
use domain::TimeZone;
use domain::model::Ms;

pub struct SystemClock {
    offset_file: Option<PathBuf>,
    tz: Option<TimeZone>,
}

impl SystemClock {
    pub fn new(offset_file: Option<PathBuf>, tz: Option<String>) -> Self {
        let tz = tz.and_then(|name| {
            TimeZone::get(&name)
                .map_err(|e| log::warn!("bad --tz {name}: {e}"))
                .ok()
        });
        SystemClock { offset_file, tz }
    }

    fn offset(&self) -> Ms {
        self.offset_file
            .as_ref()
            .and_then(|p| std::fs::read_to_string(p).ok())
            .and_then(|s| s.trim().parse::<i64>().ok())
            .unwrap_or(0)
    }
}

impl Clock for SystemClock {
    fn now(&self) -> Ms {
        jiff::Timestamp::now().as_millisecond() + self.offset()
    }

    fn time_zone(&self) -> TimeZone {
        self.tz.clone().unwrap_or_else(TimeZone::system)
    }
}
