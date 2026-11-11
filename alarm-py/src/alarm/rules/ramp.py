"""Volume ramp and fades (spec 3.9). Scalar maths only: the mixer vectorises it."""

MIN_LEVEL = 0.015
FADE_DEFAULT_S = 0.120
FADE_DISMISS_S = 0.250
TIMER_VOLUME = 0.9
TIMER_RAMP_S = 3
PREVIEW_TIMER_VOLUME = 0.9


def gain(t: float, volume: float, ramp_seconds: float) -> float:
    """gain(t) = volume × (0.015 + 0.985 × x²), x = t / ramp, clamped to [0, 1]."""
    if ramp_seconds <= 0:
        return volume
    x = min(1.0, max(0.0, t / ramp_seconds))
    return volume * (MIN_LEVEL + (1 - MIN_LEVEL) * x * x)
