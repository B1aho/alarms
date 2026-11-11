"""AudioActor: one output stream, the mixer, built-in buffers, previews and probes.

A dead or changed output device raises inside this actor; the supervisor then
restarts it on the default device, and the new instance asks the alarm and timer
actors to resend what should be playing.
"""

import logging
import os
import threading
from dataclasses import dataclass
from typing import Any, Protocol, assert_never

import numpy as np
import numpy.typing as npt

from alarm.actors.audio import synth
from alarm.actors.audio.decoder import StreamSource, probe
from alarm.actors.audio.mixer import BLOCK, Mixer, Voice
from alarm.kernel import Actor
from alarm.messages import system as sys_msg
from alarm.messages.audio import Play, PreviewEnded, PreviewPlay, PreviewStop, Probe, StopSound
from alarm.messages.system import ResendPlayback
from alarm.rules.ramp import FADE_DEFAULT_S

log = logging.getLogger("alarm.audio")

SWEEP_S = 0.1
PREVIEW = "preview"


class OutputError(RuntimeError):
    pass


class Output(Protocol):
    def start(self) -> None: ...
    def close(self) -> None: ...
    @property
    def ok(self) -> bool: ...


class DeviceOutput:
    """sounddevice.OutputStream at 48 kHz, float32, stereo, 1024-frame blocks."""

    def __init__(self, mixer: Mixer) -> None:
        import sounddevice as sd

        self._failed = False
        self._mixer = mixer
        self._stream = sd.OutputStream(
            samplerate=synth.SAMPLE_RATE,
            channels=2,
            dtype="float32",
            blocksize=BLOCK,
            callback=self._callback,
            finished_callback=self._finished,
        )
        self._closing = False

    def _callback(self, outdata: npt.NDArray[np.float32], frames: int, _time: object, _status: object) -> None:
        self._mixer.render(outdata, frames)

    def _finished(self) -> None:
        if not self._closing:
            self._failed = True

    def start(self) -> None:
        self._stream.start()

    def close(self) -> None:
        self._closing = True
        try:
            self._stream.close(ignore_errors=True)
        except Exception:
            log.exception("closing the output stream failed")

    @property
    def ok(self) -> bool:
        return not self._failed and self._stream.active


class NullOutput:
    """No device: pulls the mixer in real time from a thread (tests, headless CI)."""

    def __init__(self, mixer: Mixer) -> None:
        self._mixer = mixer
        self._stop = threading.Event()
        self._buf = np.zeros((BLOCK, 2), dtype=np.float32)
        self._thread = threading.Thread(target=self._run, name="null-audio", daemon=True)
        self.rms = 0.0

    def _run(self) -> None:
        period = BLOCK / synth.SAMPLE_RATE
        while not self._stop.wait(period):
            self._mixer.render(self._buf, BLOCK)
            self.rms = float(np.sqrt(np.mean(self._buf * self._buf)))

    def start(self) -> None:
        self._thread.start()

    def close(self) -> None:
        self._stop.set()

    @property
    def ok(self) -> bool:
        return True


@dataclass(frozen=True, slots=True)
class _Sweep:
    pass


Msg = Play | StopSound | PreviewPlay | PreviewStop | Probe | _Sweep


class AudioActor(Actor):
    name = sys_msg.AUDIO

    def __init__(self, *, restarted: bool = False, null_output: bool | None = None) -> None:
        super().__init__(restarted=restarted)
        self.mixer = Mixer()
        self.output: Output | None = None
        self.null = os.environ.get("ALARM_AUDIO") == "null" if null_output is None else null_output
        self.preview_token: int | None = None
        self.timer: threading.Timer | None = None
        self.fallback = False  # device failed to open: running silent, retrying
        self.retry_in = 0

    def setup(self) -> None:
        synth.render_all()  # computed once per process, cached for restarts
        self.open_output()
        self.schedule_sweep()
        if self.restarted:
            for to in (sys_msg.ALARMS, sys_msg.TIMER):
                self.tell(to, ResendPlayback())

    def open_output(self) -> None:
        if self.null:
            self.output = NullOutput(self.mixer)
        else:
            import sounddevice as sd

            if self.restarted:  # refresh PortAudio's device list: pick up the new default device
                sd._terminate()  # pyright: ignore[reportPrivateUsage]
                sd._initialize()  # pyright: ignore[reportPrivateUsage]
            try:
                self.output = DeviceOutput(self.mixer)
                self.output.start()
            except Exception:
                log.exception("no audio output device: retrying every 5 s")
                self.fallback = True
                self.retry_in = int(5 / SWEEP_S)
                self.output = NullOutput(self.mixer)
                self.output.start()
                return
            self.fallback = False
            log.info("audio output open (device)")
            return
        self.output.start()
        log.info("audio output open (null)")

    def teardown(self) -> None:
        if self.timer is not None:
            self.timer.cancel()
        for v in self.mixer.voices:
            if v.stream is not None:
                v.stream.close()
        if self.output is not None:
            self.output.close()

    def schedule_sweep(self) -> None:
        self.timer = threading.Timer(SWEEP_S, self.tell, args=(self.name, _Sweep()))
        self.timer.daemon = True
        self.timer.start()

    def receive(self, message: object) -> Any:
        if not isinstance(message, Msg):
            return self.unknown(message)
        return self.handle(message)

    def handle(self, m: Msg) -> Any:
        match m:
            case Play(key=key, builtin=builtin, file=file, volume=volume, ramp_s=ramp, loop=loop):
                self.start_voice(key, builtin, file, volume, ramp, loop)
            case StopSound(key=key, fade_s=fade):
                v = self.mixer.get(key)
                if v is not None:
                    v.stop(fade)
                    log.info("stop %s (fade %.0f ms)", key, fade * 1000)
            case PreviewPlay(token=token, builtin=builtin, file=file, volume=volume, ramp_s=ramp, loop=loop):
                self.preview_token = token
                self.start_voice(PREVIEW, builtin, file, volume, ramp, loop)
            case PreviewStop(token=token):
                v = self.mixer.get(PREVIEW)
                if v is not None and (token is None or token == self.preview_token):
                    v.stop(FADE_DEFAULT_S)
            case Probe(path=path):
                return probe(path)
            case _Sweep():
                self.sweep()
            case _:
                assert_never(m)
        return None

    def start_voice(self, key: str, builtin: str, file: str | None, volume: float, ramp: float, loop: bool) -> None:
        old = self.mixer.get(key)
        if old is not None:
            old.stop(FADE_DEFAULT_S)
            old.key = f"{key}#old{id(old)}"
        voice = Voice(key=key, volume=float(volume), ramp_s=float(ramp), loop=loop)
        if file is not None and os.path.exists(file):
            voice.stream = StreamSource(file, loop)
            what = file
        else:
            voice.buffer = synth.render(builtin)
            what = builtin
        self.mixer.add(voice)
        log.info("play %s: %s volume %.2f ramp %ss loop %s", key, what, volume, ramp, loop)

    def sweep(self) -> None:
        for v in self.mixer.remove_finished():
            if v.stream is not None:
                v.stream.close()
            if v.key == PREVIEW and self.preview_token is not None:
                self.publish(PreviewEnded(self.preview_token))
            elif v.stream is not None and v.stream.failed and not v.key.startswith(PREVIEW):
                # The file could not be played after all: ring Sunrise instead.
                self.start_voice(v.key, "sunrise", None, v.volume, v.ramp_s, v.loop)
        if self.fallback:
            self.retry_in -= 1
            if self.retry_in <= 0 and self.output is not None:
                self.output.close()
                self.restarted = True  # re-scan devices
                self.open_output()
        if self.output is not None and not self.output.ok:
            raise OutputError("audio output stopped (device removed or changed)")
        self.schedule_sweep()
