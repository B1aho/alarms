"""Addresses: a stable name for each actor that survives restarts.

`tell` and `ask` go through an `Address`. While an actor is down (between a
crash and its restart) messages wait in the address and are delivered, in order,
to the next incarnation. Subscriptions (`*Changed` events) are set by bootstrap.
"""

import threading
from collections import defaultdict
from collections.abc import Callable
from typing import Any, Protocol

import pykka
from pykka._envelope import Envelope  # pyright: ignore[reportPrivateImportUsage]

ASK_TIMEOUT_S = 10.0


class Mailbox(Protocol):
    """Anything that can receive a message: an actor address or the UI bridge."""

    def tell(self, message: object) -> None: ...


class Address:
    def __init__(self, name: str) -> None:
        self.name = name
        self._lock = threading.RLock()
        self._ref: pykka.ActorRef[Any] | None = None
        self._pending: list[Envelope[Any]] = []

    # -- runtime side
    def bind(self, ref: pykka.ActorRef[Any]) -> None:
        with self._lock:
            self._ref = ref
            pending, self._pending = self._pending, []
            for env in pending:
                ref.actor_inbox.put(env)

    def unbind(self, leftovers: list[Envelope[Any]]) -> None:
        """Called by a crashing actor from its own thread: park unprocessed mail."""
        with self._lock:
            self._ref = None
            self._pending = leftovers + self._pending

    def lock(self) -> threading.RLock:
        return self._lock

    @property
    def alive(self) -> bool:
        with self._lock:
            return self._ref is not None and self._ref.is_alive()

    # -- client side
    def tell(self, message: object) -> None:
        with self._lock:
            if self._ref is not None and self._ref.is_alive():
                self._ref.actor_inbox.put(Envelope(message))
            else:
                self._pending.append(Envelope(message))

    def ask_future(self, message: object) -> pykka.Future[Any]:
        future: pykka.Future[Any] = pykka.ThreadingFuture()
        with self._lock:
            env = Envelope(message, reply_to=future)
            if self._ref is not None and self._ref.is_alive():
                self._ref.actor_inbox.put(env)
            else:
                self._pending.append(env)
        return future

    def ask(self, message: object, timeout: float = ASK_TIMEOUT_S) -> Any:
        return self.ask_future(message).get(timeout=timeout)


class Registry:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._boxes: dict[str, Mailbox] = {}
        self._subs: dict[type, list[str]] = defaultdict(list)

    def address(self, name: str) -> Address:
        with self._lock:
            box = self._boxes.get(name)
            if box is None:
                box = Address(name)
                self._boxes[name] = box
        if not isinstance(box, Address):
            raise TypeError(f"{name} is not an actor address")
        return box

    def register(self, name: str, box: Mailbox) -> None:
        with self._lock:
            self._boxes[name] = box

    def get(self, name: str) -> Mailbox:
        with self._lock:
            box = self._boxes.get(name)
        return box if box is not None else self.address(name)

    def subscribe(self, event: type, name: str) -> None:
        with self._lock:
            if name not in self._subs[event]:
                self._subs[event].append(name)

    def subscribers(self, event: type) -> list[str]:
        with self._lock:
            return list(self._subs.get(event, ()))

    def reset(self) -> None:
        with self._lock:
            self._boxes.clear()
            self._subs.clear()


registry = Registry()


def tell(name: str, message: object) -> None:
    registry.get(name).tell(message)


def ask(name: str, message: object, timeout: float = ASK_TIMEOUT_S) -> Any:
    return registry.address(name).ask(message, timeout)


def publish(event: object) -> None:
    for name in registry.subscribers(type(event)):
        registry.get(name).tell(event)


class CallbackMailbox:
    """A mailbox that calls a function (used by the UI bridge and tests)."""

    def __init__(self, fn: Callable[[object], None]) -> None:
        self._fn = fn

    def tell(self, message: object) -> None:
        self._fn(message)
