//! `domain`: the pure rules of the alarm clock. No I/O, no clocks, no global randomness:
//! time, the time zone and random numbers come in as arguments (TZ_RUST 5.6).
#![forbid(unsafe_code)]
#![deny(clippy::disallowed_methods, clippy::disallowed_types)]

pub mod defaults;
pub mod format;
pub mod model;
pub mod power_policy;
pub mod ramp;
pub mod schedule;
pub mod sounds;
pub mod stopwatch;
pub mod strings;
pub mod tasks;
pub mod timer;

pub use jiff::tz::TimeZone;
