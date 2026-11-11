import time
from pathlib import Path

import numpy as np
import pytest

from alarm.actors.audio import synth
from alarm.actors.audio.decoder import StreamSource, probe
from alarm.actors.audio.mixer import Mixer, Voice
from alarm.rules.ramp import gain
from tests.actors.audio_files import FORMATS, write

SR = synth.SAMPLE_RATE


@pytest.mark.parametrize(
    ("sound", "seconds"),
    [("sunrise", 4.8), ("harp", 3.2), ("chimes", 3.6), ("beacon", 2.0), ("pulse", 1.6), ("classic", 2.0)],
)
def test_builtin_loop_lengths(sound: str, seconds: float) -> None:
    buf = synth.render(sound)
    assert buf.shape == (round(seconds * SR), 2)
    assert buf.dtype == np.float32
    assert 0.05 < float(np.abs(buf).max()) <= 1.0


def onsets(mono: np.ndarray, threshold: float) -> list[float]:
    """Times where the 2 ms peak envelope jumps up (note starts)."""
    hop = SR // 500
    n = len(mono) // hop
    env = np.abs(mono[: n * hop]).reshape(n, hop).max(axis=1)
    out: list[float] = []
    for i in range(n):
        prev = env[i - 1] if i else 0.0
        if env[i] > threshold and env[i] > 1.6 * prev + 0.005:
            t = i * hop / SR
            if not out or t - out[-1] > 0.05:
                out.append(t)
    return out


def test_beacon_pattern() -> None:
    mono = synth.render("beacon")[:, 0]
    assert onsets(mono, 0.05) == pytest.approx([0.0, 0.16, 0.32, 0.48], abs=0.01)
    assert np.abs(mono[int(0.8 * SR) :]).max() < 0.01  # then silence


def test_pulse_pattern_is_square_1khz() -> None:
    mono = synth.render("pulse")[:, 0]
    assert onsets(mono, 0.02) == pytest.approx([0.0, 0.2, 0.4], abs=0.01)
    spectrum = np.abs(np.fft.rfft(mono[: int(0.1 * SR)]))
    freqs = np.fft.rfftfreq(int(0.1 * SR), 1 / SR)
    assert abs(freqs[int(np.argmax(spectrum))] - 1000) < 15
    third = spectrum[np.argmin(np.abs(freqs - 3000))]
    assert third > 0.15 * spectrum.max()  # odd harmonics: a square wave


def test_chimes_onsets() -> None:
    mono = synth.render("chimes")[:, 0]
    assert onsets(mono, 0.03)[:6] == pytest.approx([0, 0.45, 0.9, 1.35, 1.95, 2.4], abs=0.02)


def render(m: Mixer, seconds: float) -> np.ndarray:
    blocks = []
    out = np.zeros((1024, 2), dtype=np.float32)
    for _ in range(int(seconds * SR / 1024)):
        m.render(out, 1024)
        blocks.append(out.copy())
    return np.concatenate(blocks)


def test_ramp_curve_in_mixer() -> None:
    m = Mixer()
    ones = np.ones((SR, 2), dtype=np.float32)
    m.add(Voice(key="k", volume=0.8, ramp_s=2.0, loop=True, buffer=ones))
    data = render(m, 3.0)[:, 0]
    for t in (0.0, 0.5, 1.0, 1.5, 2.5):
        assert data[int(t * SR)] == pytest.approx(gain(t, 0.8, 2.0), abs=1e-3)


def test_ramp_off_is_full_volume_and_loops() -> None:
    m = Mixer()
    buf = np.zeros((1000, 2), dtype=np.float32)
    buf[0] = 1.0
    m.add(Voice(key="k", volume=0.5, ramp_s=0, loop=True, buffer=buf))
    data = render(m, 0.1)[:, 0]
    assert list(np.flatnonzero(data)[:4]) == [0, 1000, 2000, 3000]
    assert data[0] == pytest.approx(0.5)


@pytest.mark.parametrize("fade_s", [0.120, 0.250])
def test_stop_fades_out(fade_s: float) -> None:
    m = Mixer()
    m.add(Voice(key="k", volume=1.0, ramp_s=0, loop=True, buffer=np.ones((SR, 2), dtype=np.float32)))
    render(m, 0.1)
    v = m.get("k")
    assert v is not None
    v.stop(fade_s)
    data = render(m, 0.5)[:, 0]
    n = int(fade_s * SR)
    assert data[0] == pytest.approx(1.0, abs=1e-3)
    assert data[n // 2] == pytest.approx(0.5, abs=0.01)
    assert np.all(data[n + 1 :] == 0)
    assert np.all(np.diff(data[: n + 1]) <= 1e-6)  # monotonic, no click
    assert m.remove_finished() == [v]


def test_preview_without_loop_finishes() -> None:
    m = Mixer()
    m.add(Voice(key="preview", volume=1.0, ramp_s=0, loop=False, buffer=synth.render("pulse")))
    render(m, 2.0)
    assert [v.key for v in m.remove_finished()] == ["preview"]


@pytest.mark.parametrize("ext", sorted(FORMATS))
def test_all_formats_probe_and_stream(tmp_path: Path, ext: str) -> None:
    path = write(tmp_path / f"tone.{ext}")
    assert probe(str(path))
    src = StreamSource(str(path), loop=True)
    out = np.zeros((48_000, 2), dtype=np.float32)
    deadline = time.monotonic() + 5
    got = 0
    while got < 48_000 and time.monotonic() < deadline:  # 1 s of a 0.5 s file: it looped
        got += src.pull(out[got:], 48_000 - got)
        time.sleep(0.005)
    src.close()
    assert got == 48_000
    assert float(np.abs(out).max()) > 0.2


def test_not_audio_fails_probe(tmp_path: Path) -> None:
    junk = tmp_path / "junk.mp3"
    junk.write_bytes(b"this is not audio" * 100)
    assert not probe(str(junk))


def test_ring_buffer_stays_small(tmp_path: Path) -> None:
    path = write(tmp_path / "long.wav", seconds=6.0)
    src = StreamSource(str(path), loop=False)
    time.sleep(0.5)
    assert src.written <= src.cap  # never more than ~2 s ahead of the reader
    out = np.zeros((SR * 7, 2), dtype=np.float32)
    total = 0
    deadline = time.monotonic() + 10
    while not src.finished and time.monotonic() < deadline:
        total += src.pull(out[total:], min(4096, len(out) - total))
        time.sleep(0.001)
    assert 6 * SR <= total <= 6 * SR + 1024  # the writer pads the last frame


def test_audio_actor_restart_asks_for_resend(tmp_path: Path) -> None:
    from alarm.actors.audio.actor import AudioActor
    from alarm.kernel import ask, tell
    from alarm.messages import system as sys_msg
    from alarm.messages.audio import Play, Probe
    from alarm.messages.system import ResendPlayback
    from tests.actors.world import World, wait_for

    w = World(tmp_path, 0, stubs=(sys_msg.ALARMS, sys_msg.TIMER))
    actors: list[AudioActor] = []

    def make(restarted: bool) -> AudioActor:
        a = AudioActor(restarted=restarted, null_output=True)
        actors.append(a)
        return a

    w.add(sys_msg.AUDIO, make)
    w.start()
    tell(sys_msg.AUDIO, Play("alarm:x", "beacon", None, 1.0, 0, True))
    w.sync(sys_msg.AUDIO)
    assert actors[0].mixer.get("alarm:x") is not None
    assert ask(sys_msg.AUDIO, Probe(str(tmp_path / "missing.mp3"))) is False
    tell(sys_msg.AUDIO, Play("bad", "beacon", None, "loud", 0, True))  # type: ignore[arg-type]  # crash
    wait_for(lambda: w.sup.restarts(sys_msg.AUDIO) == 1, timeout=3)
    w.sync(sys_msg.AUDIO)
    assert w.stubs[sys_msg.ALARMS].of(ResendPlayback) and w.stubs[sys_msg.TIMER].of(ResendPlayback)
    w.stop()
