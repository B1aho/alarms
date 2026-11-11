"""Actor base on pykka.ThreadingActor.

An actor handles one message at a time in its own thread. Any exception while
handling a message is a crash: the actor stops at once, its unprocessed mail is
parked in its address, and the supervisor restarts a fresh instance.
"""

import logging
from collections.abc import Callable
from typing import Any, ClassVar

import pykka
from pykka.messages import _ActorStop  # pyright: ignore[reportPrivateUsage]

from alarm.kernel.registry import Address, publish, registry, tell

log = logging.getLogger("alarm.kernel")

FailureHook = Callable[[str, BaseException], None]


class Barrier:
    """Answered by every actor after all mail sent before it: `ask(name, Barrier())`."""


class Poison:
    """Makes the receiving actor crash (fault-injection for tests and the `--test-control` socket)."""


class Actor(pykka.ThreadingActor):
    name: ClassVar[str] = "actor"

    def __init__(self, *, restarted: bool = False) -> None:
        super().__init__()
        self.restarted = restarted
        self._failure_hook: FailureHook | None = None
        self._address: Address | None = None

    # -- wiring (called by the supervisor before start)
    def attach(self, address: Address, on_failure: FailureHook) -> None:
        self._address = address
        self._failure_hook = on_failure

    # -- messaging helpers for subclasses
    def tell(self, to: str, message: object) -> None:
        tell(to, message)

    def ask(self, to: str, message: object, timeout: float = 10.0) -> Any:
        return registry.address(to).ask(message, timeout)

    def publish(self, event: object) -> None:
        publish(event)

    # -- to implement
    def setup(self) -> None:
        """Runs in the actor thread before the first message (load state here)."""

    def receive(self, message: object) -> Any:
        raise NotImplementedError

    def unknown(self, message: object) -> None:
        log.warning("%s ignored unknown message %r", self.name, message)

    def teardown(self) -> None:
        """Runs on a normal stop."""

    # -- pykka hooks
    def on_start(self) -> None:
        try:
            self.setup()
        except Exception as exc:
            self._crash(exc)
            raise

    def on_receive(self, message: Any) -> Any:
        if isinstance(message, Barrier):
            return True
        try:
            if isinstance(message, Poison):
                raise RuntimeError(f"{self.name}: poisoned")
            return self.receive(message)
        except Exception as exc:
            self._crash(exc)
            raise

    def on_stop(self) -> None:
        self.teardown()

    def _crash(self, exc: BaseException) -> None:
        address = self._address
        if address is None:
            return
        with address.lock():
            leftovers: list[Any] = []
            while not self.actor_inbox.empty():
                env = self.actor_inbox.get()
                if isinstance(env.message, _ActorStop):
                    continue
                leftovers.append(env)
            address.unbind(leftovers)
            self._stop()  # also runs teardown() through on_stop
        if self._failure_hook is not None:
            self._failure_hook(self.name, exc)
