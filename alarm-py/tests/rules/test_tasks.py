import re
from collections.abc import Callable

import pytest
from hypothesis import given
from hypothesis import strategies as st

from alarm.rules.models import DismissTask, Problem
from alarm.rules.tasks import (
    check_answer,
    display_prompt,
    generate,
    math_problem,
    retype_problem,
    task_summary,
    tasks_in_a_row,
)


def seeded(seed: int) -> Callable[[], float]:
    state = seed

    def rand() -> float:
        nonlocal state
        state = (state * 1664525 + 1013904223) % 4294967296
        return state / 4294967296

    return rand


def evaluate(prompt: str) -> int:
    expr = prompt.replace("×", "*").replace("−", "-")
    assert re.fullmatch(r"[\d +\-*]+", expr)
    return int(eval(expr))


@pytest.mark.parametrize("difficulty", ["easy", "medium", "hard"])
def test_math_answers_match_prompt(difficulty: str) -> None:
    rand = seeded(42)
    for _ in range(300):
        p = math_problem(difficulty, rand)  # type: ignore[arg-type]
        assert str(evaluate(p.prompt)) == p.answer


def test_math_ranges() -> None:
    rand = seeded(7)
    for _ in range(500):
        p = math_problem("medium", rand)
        a, b, c = map(int, re.findall(r"\d+", p.prompt))
        assert 3 <= a <= 9 and 12 <= b <= 29 and 11 <= c <= 89
        h = math_problem("hard", rand)
        a, b, c, d = map(int, re.findall(r"\d+", h.prompt))
        assert 6 <= a <= 19 and 13 <= b <= 49 and 3 <= c <= 9 and 11 <= d <= 29
        assert " − " in h.prompt and " × " in h.prompt


def test_easy_has_both_forms() -> None:
    rand = seeded(3)
    prompts = [math_problem("easy", rand).prompt for _ in range(100)]
    assert any("+" in p for p in prompts) and any("−" in p for p in prompts)


def test_answers_with_whitespace_and_unicode_minus() -> None:
    assert check_answer(Problem(kind="math", prompt="", answer="-12"), " −12 ")
    assert check_answer(Problem(kind="math", prompt="", answer="-12"), "– 12")
    assert not check_answer(Problem(kind="math", prompt="", answer="42"), "41")


@given(st.integers(0, 2**32 - 1), st.sampled_from(["easy", "medium", "hard"]))
def test_retype_codes(seed: int, difficulty: str) -> None:
    p = retype_problem(difficulty, seeded(seed))  # type: ignore[arg-type]
    assert len(p.answer) == {"easy": 6, "medium": 10, "hard": 14}[difficulty]
    assert re.fullmatch(r"[A-HJ-NP-Z2-9]+", p.answer)
    assert p.prompt.replace(" ", "") == p.answer
    assert all(len(g) <= 4 for g in p.prompt.split(" "))
    assert check_answer(p, p.prompt.lower())


def test_none_task_has_no_problem() -> None:
    assert generate(DismissTask(type="none", difficulty="easy", count=1), seeded(1)) is None


def test_summaries() -> None:
    assert task_summary(DismissTask(type="none", difficulty="easy", count=1)) == "None"
    assert task_summary(DismissTask(type="math", difficulty="medium", count=2)) == "Math · Medium · 2×"
    assert task_summary(DismissTask(type="retype", difficulty="hard", count=1)) == "Retype Code · Hard · 1×"
    assert tasks_in_a_row(1) == "1 task in a row" and tasks_in_a_row(3) == "3 tasks in a row"
    p = Problem(kind="math", prompt="3 × 4 + 5", answer="17")
    assert display_prompt(p, example=True) == "3 × 4 + 5 = ?"
    assert display_prompt(p, example=False) == "3 × 4 + 5 ="
