//! `app`: use cases and ports. Reads state through ports, asks `domain` for every
//! decision, writes the result and only then triggers effects (TZ_RUST 5.6).
#![forbid(unsafe_code)]
#![deny(clippy::disallowed_methods, clippy::disallowed_types)]

pub mod ports;
pub mod state;
pub mod usecases;
pub mod view;

pub use ports::Ports;
pub use state::Runtime;
pub use usecases::{Request, handle};
