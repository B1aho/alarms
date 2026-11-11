//! A decoded or synthesised sound held in memory.

use std::sync::Arc;

/// Interleaved `f32` samples.
#[derive(Debug)]
pub struct Clip {
    pub rate: u32,
    pub channels: u16,
    pub samples: Vec<f32>,
}

impl Clip {
    pub fn frames(&self) -> usize {
        self.samples.len() / usize::from(self.channels.max(1))
    }

    pub fn seconds(&self) -> f64 {
        self.frames() as f64 / f64::from(self.rate.max(1))
    }
}

pub type SharedClip = Arc<Clip>;
