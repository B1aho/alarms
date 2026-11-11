//! The stopwatch (3.11).

use crate::model::{Ms, Stopwatch};

pub fn elapsed_at(s: &Stopwatch, now: Ms) -> i64 {
    s.accumulated_ms + s.started_at.map(|t| (now - t).max(0)).unwrap_or(0)
}

pub fn start(s: &Stopwatch, now: Ms) -> Option<Stopwatch> {
    s.started_at.is_none().then(|| Stopwatch {
        started_at: Some(now),
        ..s.clone()
    })
}

pub fn stop(s: &Stopwatch, now: Ms) -> Option<Stopwatch> {
    s.started_at.map(|_| Stopwatch {
        accumulated_ms: elapsed_at(s, now),
        started_at: None,
        ..s.clone()
    })
}

pub fn lap(s: &Stopwatch, now: Ms) -> Option<Stopwatch> {
    s.started_at.map(|_| {
        let mut laps = s.laps.clone();
        laps.push(elapsed_at(s, now));
        Stopwatch { laps, ..s.clone() }
    })
}

pub fn reset() -> Stopwatch {
    Stopwatch::default()
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LapTone {
    Normal,
    Best,
    Worst,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct LapRow {
    pub n: usize,
    pub ms: i64,
    pub tone: LapTone,
}

/// Current lap first, then completed laps newest first; best/worst once there are 2+ completed laps.
pub fn lap_rows(s: &Stopwatch, now: Ms) -> (LapRow, Vec<LapRow>) {
    let splits: Vec<i64> = s
        .laps
        .iter()
        .enumerate()
        .map(|(i, t)| t - if i == 0 { 0 } else { s.laps[i - 1] })
        .collect();
    let (min, max) = if splits.len() >= 2 {
        (splits.iter().min().copied(), splits.iter().max().copied())
    } else {
        (None, None)
    };
    let mut completed: Vec<LapRow> = splits
        .iter()
        .enumerate()
        .map(|(i, ms)| LapRow {
            n: i + 1,
            ms: *ms,
            tone: if Some(*ms) == min {
                LapTone::Best
            } else if Some(*ms) == max {
                LapTone::Worst
            } else {
                LapTone::Normal
            },
        })
        .collect();
    completed.reverse();
    let current = elapsed_at(s, now) - s.laps.last().copied().unwrap_or(0);
    (
        LapRow {
            n: s.laps.len() + 1,
            ms: current,
            tone: LapTone::Normal,
        },
        completed,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn run_and_laps() {
        let s = start(&reset(), 1000).unwrap();
        assert!(start(&s, 2000).is_none());
        let s = lap(&s, 3000).unwrap(); // lap 1: 2000
        let s = lap(&s, 8000).unwrap(); // lap 2: 5000
        let s = lap(&s, 9000).unwrap(); // lap 3: 1000
        let (current, done) = lap_rows(&s, 9500);
        assert_eq!(
            current,
            LapRow {
                n: 4,
                ms: 500,
                tone: LapTone::Normal
            }
        );
        assert_eq!(
            done.iter().map(|r| (r.n, r.tone)).collect::<Vec<_>>(),
            vec![(3, LapTone::Best), (2, LapTone::Worst), (1, LapTone::Normal)]
        );
        let stopped = stop(&s, 10_000).unwrap();
        assert_eq!(elapsed_at(&stopped, 99_999), 9000);
        assert!(lap(&stopped, 0).is_none());
    }

    #[test]
    fn single_lap_not_highlighted() {
        let s = lap(&start(&reset(), 0).unwrap(), 10).unwrap();
        assert_eq!(lap_rows(&s, 20).1[0].tone, LapTone::Normal);
    }
}
