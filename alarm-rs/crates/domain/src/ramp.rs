//! Volume ramp (3.9).

/// Starting level of the ramp: 1.5 % of the target volume.
pub const MIN_LEVEL: f32 = 0.015;
/// Fade when a sound stops in general.
pub const FADE_STOP_MS: u32 = 120;
/// Fade when an alarm is turned off.
pub const FADE_DISMISS_MS: u32 = 250;
/// Timer alert: volume 0.9 with a 3 s ramp (3.10).
pub const TIMER_VOLUME: f32 = 0.9;
pub const TIMER_RAMP_SECONDS: u32 = 3;

/// `gain(t) = volume × (0.015 + 0.985 × x²)`, `x = t / rampSeconds` clamped to 0…1.
/// `ramp_seconds = 0` means full volume at once.
pub fn gain(t_seconds: f64, volume: f32, ramp_seconds: f64) -> f32 {
    if ramp_seconds <= 0.0 {
        return volume;
    }
    let x = (t_seconds / ramp_seconds).clamp(0.0, 1.0) as f32;
    volume * (MIN_LEVEL + (1.0 - MIN_LEVEL) * x * x)
}

/// Linear fade-out multiplier `elapsed / fade` → 1…0.
pub fn fade_out(elapsed_ms: f64, fade_ms: f64) -> f32 {
    if fade_ms <= 0.0 {
        return 0.0;
    }
    (1.0 - elapsed_ms / fade_ms).clamp(0.0, 1.0) as f32
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn curve_points() {
        assert!((gain(0.0, 1.0, 60.0) - 0.015).abs() < 1e-6);
        assert!((gain(30.0, 1.0, 60.0) - (0.015 + 0.985 * 0.25)).abs() < 1e-6);
        assert!((gain(60.0, 0.5, 60.0) - 0.5).abs() < 1e-6);
        assert!((gain(600.0, 0.5, 60.0) - 0.5).abs() < 1e-6);
        assert!((gain(0.0, 0.7, 0.0) - 0.7).abs() < 1e-6);
    }

    #[test]
    fn curve_is_monotonic() {
        let mut prev = 0.0;
        for i in 0..=600 {
            let g = gain(i as f64 * 0.1, 0.9, 60.0);
            assert!(g >= prev);
            prev = g;
        }
    }

    #[test]
    fn fade() {
        assert_eq!(fade_out(0.0, 120.0), 1.0);
        assert!((fade_out(60.0, 120.0) - 0.5).abs() < 1e-6);
        assert_eq!(fade_out(200.0, 120.0), 0.0);
    }
}
