import os
from collections.abc import Iterator

import pytest

os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")


@pytest.fixture(autouse=True)
def _clean_registry() -> Iterator[None]:
    from alarm.kernel import clock
    from alarm.kernel.registry import registry

    registry.reset()
    yield
    import pykka

    pykka.ActorRegistry.stop_all(block=True, timeout=5)
    registry.reset()
    clock.reset()
