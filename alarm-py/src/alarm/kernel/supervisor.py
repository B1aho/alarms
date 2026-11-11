"""Supervisor: restarts crashed actors with back-off; too many crashes end the process.

Policy (TZ 5.3): pause 0.5 → 1 → 2 → 5 s; more than 5 crashes of one actor in
60 s → exit with an error code so the login agent restarts the process.
"""

import logging
import threading
import time
from collections import deque
from collections.abc import Callable
from dataclasses import dataclass, field

import pykka

from alarm.kernel.actor import Actor
from alarm.kernel.registry import registry

log = logging.getLogger("alarm.supervisor")

BACKOFF_S: tuple[float, ...] = (0.5, 1.0, 2.0, 5.0)
WINDOW_S = 60.0
MAX_CRASHES = 5
EXIT_CODE = 70

Factory = Callable[[bool], Actor]  # restarted → fresh instance


@dataclass
class _Child:
    name: str
    factory: Factory
    crashes: deque[float] = field(default_factory=deque[float])
    restarts: int = 0


class Supervisor:
    def __init__(
        self,
        on_fatal: Callable[[str], None] | None = None,
        backoff: tuple[float, ...] = BACKOFF_S,
        monotonic: Callable[[], float] = time.monotonic,
    ) -> None:
        self._children: dict[str, _Child] = {}
        self._order: list[str] = []
        self._lock = threading.Lock()
        self._stopping = False
        self._backoff = backoff
        self._monotonic = monotonic
        self._on_fatal = on_fatal or _default_fatal
        self._timers: list[threading.Timer] = []

    def add(self, name: str, factory: Factory) -> None:
        self._children[name] = _Child(name, factory)
        self._order.append(name)

    def start(self) -> None:
        for name in self._order:
            self._spawn(name, restarted=False)

    def restarts(self, name: str) -> int:
        return self._children[name].restarts

    def _spawn(self, name: str, restarted: bool) -> None:
        child = self._children[name]
        actor = child.factory(restarted)
        address = registry.address(name)
        actor.attach(address, self._failed)
        # Bind before the thread runs so setup() can already receive replies.
        with address.lock():
            pykka.ActorRegistry.register(actor.actor_ref)
            address.bind(actor.actor_ref)
            actor._start_actor_loop()  # pyright: ignore[reportPrivateUsage]

    def _failed(self, name: str, exc: BaseException) -> None:
        log.error("actor %s crashed: %r", name, exc, exc_info=exc)
        with self._lock:
            if self._stopping:
                return
            child = self._children[name]
            now = self._monotonic()
            child.crashes.append(now)
            while child.crashes and now - child.crashes[0] > WINDOW_S:
                child.crashes.popleft()
            count = len(child.crashes)
            if count > MAX_CRASHES:
                fatal = True
                delay = 0.0
            else:
                fatal = False
                delay = self._backoff[min(count, len(self._backoff)) - 1]
        if fatal:
            log.critical("actor %s crashed %d times in %ds: giving up", name, count, int(WINDOW_S))
            self._on_fatal(name)
            return
        timer = threading.Timer(delay, self._restart, args=(name,))
        timer.daemon = True
        with self._lock:
            self._timers.append(timer)
        timer.start()

    def _restart(self, name: str) -> None:
        with self._lock:
            if self._stopping:
                return
            self._children[name].restarts += 1
        log.warning("restarting actor %s", name)
        self._spawn(name, restarted=True)

    def stop(self) -> None:
        with self._lock:
            self._stopping = True
            timers, self._timers = self._timers, []
        for t in timers:
            t.cancel()
        for name in reversed(self._order):
            address = registry.address(name)
            with address.lock():
                ref = address._ref  # pyright: ignore[reportPrivateUsage]
            if ref is not None and ref.is_alive():
                try:
                    ref.stop(block=True, timeout=5)
                except Exception:
                    log.exception("stopping %s failed", name)


def _default_fatal(name: str) -> None:
    import os

    logging.shutdown()
    os._exit(EXIT_CODE)
