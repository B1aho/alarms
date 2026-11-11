import threading
import time
from typing import Any, ClassVar

from alarm.kernel import Actor, ask, registry, tell
from alarm.kernel.supervisor import Supervisor


class Echo(Actor):
    name = "echo"
    instances: ClassVar[list["Echo"]] = []

    def __init__(self, *, restarted: bool = False) -> None:
        super().__init__(restarted=restarted)
        self.seen: list[object] = []
        Echo.instances.append(self)

    def receive(self, message: object) -> Any:
        if message == "boom":
            raise RuntimeError("boom")
        if message == "slow-boom":
            time.sleep(0.05)
            raise RuntimeError("boom")
        self.seen.append(message)
        return ("echo", message, self.restarted)


def wait_for(cond: Any, timeout: float = 5.0) -> None:
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        if cond():
            return
        time.sleep(0.01)
    raise AssertionError("condition not met")


def make_sup(**kw: Any) -> Supervisor:
    Echo.instances.clear()
    sup = Supervisor(backoff=(0.05, 0.05, 0.05, 0.05), **kw)
    sup.add("echo", lambda restarted: Echo(restarted=restarted))
    sup.start()
    return sup


def test_ask_and_tell() -> None:
    sup = make_sup()
    assert ask("echo", "hi") == ("echo", "hi", False)
    sup.stop()


def test_crashed_actor_is_restarted_and_keeps_mail() -> None:
    sup = make_sup()
    tell("echo", "slow-boom")
    tell("echo", "after-1")  # queued behind the crash: must reach the new instance
    tell("echo", "after-2")
    wait_for(lambda: len(Echo.instances) == 2 and Echo.instances[1].seen == ["after-1", "after-2"])
    assert ask("echo", "x") == ("echo", "x", True)
    assert sup.restarts("echo") == 1
    sup.stop()


def test_ask_while_down_is_answered_after_restart() -> None:
    sup = make_sup()
    tell("echo", "boom")
    wait_for(lambda: not registry.address("echo").alive)
    assert ask("echo", "late", timeout=5) == ("echo", "late", True)
    sup.stop()


def test_too_many_crashes_is_fatal() -> None:
    fatal = threading.Event()
    sup = make_sup(on_fatal=lambda name: fatal.set())
    for _ in range(6):
        wait_for(lambda: registry.address("echo").alive)
        tell("echo", "boom")
        wait_for(lambda: not registry.address("echo").alive)
    assert fatal.wait(5)
    sup.stop()
