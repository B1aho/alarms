"""Dismissal tasks (spec 3.6). The random source is an argument."""

import re
from collections.abc import Callable

from alarm.rules.models import Difficulty, DismissTask, Problem

Rand = Callable[[], float]  # uniform in [0, 1)

CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
CODE_LENGTH: dict[Difficulty, int] = {"easy": 6, "medium": 10, "hard": 14}
MINUS = "−"
TIMES = "×"


def rand_int(rand: Rand, lo: int, hi: int) -> int:
    return lo + int(rand() * (hi - lo + 1))


def math_problem(difficulty: Difficulty, rand: Rand) -> Problem:
    if difficulty == "easy":
        a = rand_int(rand, 12, 59)
        b = rand_int(rand, 11, 39)
        if rand() < 0.5:
            return Problem(kind="math", prompt=f"{a} + {b}", answer=str(a + b))
        return Problem(kind="math", prompt=f"{a + b} {MINUS} {b}", answer=str(a))
    if difficulty == "medium":
        a = rand_int(rand, 3, 9)
        b = rand_int(rand, 12, 29)
        c = rand_int(rand, 11, 89)
        return Problem(kind="math", prompt=f"{a} {TIMES} {b} + {c}", answer=str(a * b + c))
    a = rand_int(rand, 6, 19)
    b = rand_int(rand, 13, 49)
    c = rand_int(rand, 3, 9)
    d = rand_int(rand, 11, 29)
    return Problem(kind="math", prompt=f"{a} {TIMES} {b} {MINUS} {c} {TIMES} {d}", answer=str(a * b - c * d))


def retype_problem(difficulty: Difficulty, rand: Rand) -> Problem:
    code = "".join(CODE_ALPHABET[rand_int(rand, 0, len(CODE_ALPHABET) - 1)] for _ in range(CODE_LENGTH[difficulty]))
    grouped = " ".join(code[i : i + 4] for i in range(0, len(code), 4))
    return Problem(kind="retype", prompt=grouped, answer=code)


def generate(task: DismissTask, rand: Rand) -> Problem | None:
    if task.type == "math":
        return math_problem(task.difficulty, rand)
    if task.type == "retype":
        return retype_problem(task.difficulty, rand)
    return None


def check_answer(problem: Problem, text: str) -> bool:
    if problem.kind == "math":
        normalized = re.sub(r"\s+", "", re.sub("[−–]", "-", text.strip()))
    else:
        normalized = re.sub(r"\s+", "", text.upper())
    return normalized == problem.answer


def task_summary(task: DismissTask) -> str:
    if task.type == "none":
        return "None"
    kind = "Math" if task.type == "math" else "Retype Code"
    return f"{kind} · {task.difficulty.capitalize()} · {task.count}×"


def tasks_in_a_row(count: int) -> str:
    return f"{count} {'task' if count == 1 else 'tasks'} in a row"


def display_prompt(problem: Problem, *, example: bool) -> str:
    """Example page ends math with ` = ?`, the ringing card with ` =`."""
    if problem.kind != "math":
        return problem.prompt
    return f"{problem.prompt} = ?" if example else f"{problem.prompt} ="
