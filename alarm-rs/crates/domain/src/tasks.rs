//! Dismissal tasks (3.6). Randomness comes in as an argument.

pub use rand_core::RngCore;
use serde::{Deserialize, Serialize};

use crate::model::{Difficulty, DismissTask, TaskType};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ProblemKind {
    Math,
    Retype,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Problem {
    pub kind: ProblemKind,
    /// What is shown: `7 × 12 + 30` or `ABCD EFGH JK`.
    pub prompt: String,
    pub answer: String,
}

pub const CODE_ALPHABET: &str = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/// `rand(a, b)`: a uniform integer, both ends included.
fn rand_int(rng: &mut dyn RngCore, min: i64, max: i64) -> i64 {
    let unit = (rng.next_u64() >> 11) as f64 / (1u64 << 53) as f64;
    min + (unit * (max - min + 1) as f64).floor() as i64
}

fn coin(rng: &mut dyn RngCore) -> bool {
    rng.next_u32() & 1 == 0
}

pub fn math_problem(difficulty: Difficulty, rng: &mut dyn RngCore) -> Problem {
    let (prompt, answer) = match difficulty {
        Difficulty::Easy => {
            let a = rand_int(rng, 12, 59);
            let b = rand_int(rng, 11, 39);
            if coin(rng) {
                (format!("{a} + {b}"), a + b)
            } else {
                (format!("{} − {b}", a + b), a)
            }
        }
        Difficulty::Medium => {
            let a = rand_int(rng, 3, 9);
            let b = rand_int(rng, 12, 29);
            let c = rand_int(rng, 11, 89);
            (format!("{a} × {b} + {c}"), a * b + c)
        }
        Difficulty::Hard => {
            let a = rand_int(rng, 6, 19);
            let b = rand_int(rng, 13, 49);
            let c = rand_int(rng, 3, 9);
            let d = rand_int(rng, 11, 29);
            (format!("{a} × {b} − {c} × {d}"), a * b - c * d)
        }
    };
    Problem {
        kind: ProblemKind::Math,
        prompt,
        answer: answer.to_string(),
    }
}

pub fn code_length(difficulty: Difficulty) -> usize {
    match difficulty {
        Difficulty::Easy => 6,
        Difficulty::Medium => 10,
        Difficulty::Hard => 14,
    }
}

pub fn retype_problem(difficulty: Difficulty, rng: &mut dyn RngCore) -> Problem {
    let alphabet: Vec<char> = CODE_ALPHABET.chars().collect();
    let code: String = (0..code_length(difficulty))
        .map(|_| alphabet[rand_int(rng, 0, alphabet.len() as i64 - 1) as usize])
        .collect();
    let grouped = code
        .chars()
        .collect::<Vec<_>>()
        .chunks(4)
        .map(|c| c.iter().collect::<String>())
        .collect::<Vec<_>>()
        .join(" ");
    Problem {
        kind: ProblemKind::Retype,
        prompt: grouped,
        answer: code,
    }
}

pub fn generate(task: &DismissTask, rng: &mut dyn RngCore) -> Option<Problem> {
    match task.kind {
        TaskType::None => None,
        TaskType::Math => Some(math_problem(task.difficulty, rng)),
        TaskType::Retype => Some(retype_problem(task.difficulty, rng)),
    }
}

/// Math: spaces ignored, `−` and `–` are a plain minus. Code: case and spaces ignored.
pub fn check_answer(problem: &Problem, input: &str) -> bool {
    let normalized: String = match problem.kind {
        ProblemKind::Math => input
            .chars()
            .map(|c| if c == '−' || c == '–' { '-' } else { c })
            .filter(|c| !c.is_whitespace())
            .collect(),
        ProblemKind::Retype => input.to_uppercase().chars().filter(|c| !c.is_whitespace()).collect(),
    };
    normalized == problem.answer
}

/// A small deterministic generator (SplitMix64), for tests and for the editor example.
#[derive(Clone, Debug)]
pub struct SplitMix64(pub u64);

impl RngCore for SplitMix64 {
    fn next_u32(&mut self) -> u32 {
        (self.next_u64() >> 32) as u32
    }
    fn next_u64(&mut self) -> u64 {
        self.0 = self.0.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut z = self.0;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^ (z >> 31)
    }
    fn fill_bytes(&mut self, dest: &mut [u8]) {
        rand_core::impls::fill_bytes_via_next(self, dest)
    }
    fn try_fill_bytes(&mut self, dest: &mut [u8]) -> Result<(), rand_core::Error> {
        self.fill_bytes(dest);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Evaluates `a × b + c` style prompts.
    fn eval(prompt: &str) -> i64 {
        let tokens: Vec<&str> = prompt.split(' ').collect();
        // Products first, then left-to-right sums.
        let mut terms: Vec<(i64, i64)> = Vec::new(); // (sign, value)
        let mut sign = 1;
        let mut i = 0;
        while i < tokens.len() {
            let mut v: i64 = tokens[i].parse().unwrap();
            while i + 2 < tokens.len() && tokens[i + 1] == "×" {
                v *= tokens[i + 2].parse::<i64>().unwrap();
                i += 2;
            }
            terms.push((sign, v));
            if i + 1 < tokens.len() {
                sign = if tokens[i + 1] == "+" { 1 } else { -1 };
            }
            i += 2;
        }
        terms.iter().map(|(s, v)| s * v).sum()
    }

    #[test]
    fn math_answers_match_prompt() {
        for d in [Difficulty::Easy, Difficulty::Medium, Difficulty::Hard] {
            let mut rng = SplitMix64(42);
            for _ in 0..500 {
                let p = math_problem(d, &mut rng);
                assert_eq!(eval(&p.prompt).to_string(), p.answer, "{}", p.prompt);
            }
        }
    }

    #[test]
    fn math_ranges() {
        let mut rng = SplitMix64(7);
        let mut seen_easy_forms = (false, false);
        for _ in 0..1000 {
            let p = math_problem(Difficulty::Medium, &mut rng);
            let n: Vec<i64> = p.prompt.split(' ').filter_map(|t| t.parse().ok()).collect();
            assert!((3..=9).contains(&n[0]) && (12..=29).contains(&n[1]) && (11..=89).contains(&n[2]));
            let h = math_problem(Difficulty::Hard, &mut rng);
            let n: Vec<i64> = h.prompt.split(' ').filter_map(|t| t.parse().ok()).collect();
            assert!((6..=19).contains(&n[0]) && (13..=49).contains(&n[1]));
            assert!((3..=9).contains(&n[2]) && (11..=29).contains(&n[3]));
            let e = math_problem(Difficulty::Easy, &mut rng);
            if e.prompt.contains('+') {
                seen_easy_forms.0 = true;
            } else {
                seen_easy_forms.1 = true;
            }
        }
        assert!(seen_easy_forms.0 && seen_easy_forms.1);
    }

    #[test]
    fn symbols_are_spaced_unicode() {
        let mut rng = SplitMix64(3);
        let p = math_problem(Difficulty::Hard, &mut rng);
        assert!(p.prompt.contains(" × ") && p.prompt.contains(" − "));
    }

    #[test]
    fn accepts_whitespace_and_unicode_minus() {
        let p = Problem {
            kind: ProblemKind::Math,
            prompt: String::new(),
            answer: "-12".into(),
        };
        assert!(check_answer(&p, " −12 "));
        assert!(check_answer(&p, "–1 2"));
        let p = Problem {
            kind: ProblemKind::Math,
            prompt: String::new(),
            answer: "42".into(),
        };
        assert!(!check_answer(&p, "41"));
    }

    #[test]
    fn retype_lengths_and_alphabet() {
        let p = retype_problem(Difficulty::Medium, &mut SplitMix64(1));
        assert_eq!(p.answer.len(), 10);
        assert!(p.answer.chars().all(|c| CODE_ALPHABET.contains(c)));
        assert_eq!(p.prompt.split(' ').map(str::len).collect::<Vec<_>>(), vec![4, 4, 2]);
        assert!(check_answer(&p, &p.prompt.to_lowercase()));
        assert_eq!(retype_problem(Difficulty::Hard, &mut SplitMix64(2)).answer.len(), 14);
        assert_eq!(retype_problem(Difficulty::Easy, &mut SplitMix64(2)).answer.len(), 6);
    }

    #[test]
    fn none_task_has_no_problem() {
        let t = DismissTask {
            kind: TaskType::None,
            difficulty: Difficulty::Easy,
            count: 1,
        };
        assert!(generate(&t, &mut SplitMix64(0)).is_none());
    }
}
