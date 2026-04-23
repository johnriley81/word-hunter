"""Scoring and tile normalization — parity with script.js LETTER_WEIGHTS / getLiveWordScoreBreakdown."""

from __future__ import annotations

from typing import Iterable, List, Tuple

GRID_SIZE = 4

LETTER_WEIGHTS = {
    "a": 1,
    "b": 3,
    "c": 3,
    "d": 2,
    "e": 1,
    "f": 4,
    "g": 2,
    "h": 4,
    "i": 1,
    "j": 8,
    "k": 5,
    "l": 1,
    "m": 3,
    "n": 1,
    "o": 1,
    "p": 3,
    "q": 10,  # normalized to qu before lookup
    "qu": 11,
    "r": 1,
    "s": 1,
    "t": 1,
    "u": 1,
    "v": 4,
    "w": 4,
    "x": 8,
    "y": 4,
    "z": 10,
}


def normalize_tile(text: str) -> str:
    """Match normalizeTileText in script.js."""
    s = (text or "").strip().lower()
    if s == "q":
        return "qu"
    return s


def letter_weight(tile_text: str) -> int:
    """Match getLetterWeight after normalize."""
    key = normalize_tile(tile_text)
    return LETTER_WEIGHTS.get(key, 1)


def word_to_tile_strings(word: str) -> List[str]:
    """
    Split a dictionary word into per-tile strings for scoring parity.
    Greedy: 'qu' in the spelling maps to one tile; lone 'q' maps to one Q tile (→ qu).
    """
    w = (word or "").strip().lower()
    parts: List[str] = []
    i = 0
    while i < len(w):
        if w[i] == "q" and i + 1 < len(w) and w[i + 1] == "u":
            parts.append("qu")
            i += 2
        elif w[i] == "q":
            parts.append("q")
            i += 1
        else:
            parts.append(w[i])
            i += 1
    return parts


def score_word_as_tiles(word: str) -> Tuple[int, int, int]:
    """
    Planned word score as if each tile were played once in order (no board revisits).
    Returns (letter_sum, tile_char_length, word_total).
    """
    return word_breakdown(word_to_tile_strings(word))


def word_breakdown(path_tile_strings: Iterable[str]) -> Tuple[int, int, int]:
    """
    Match getLiveWordScoreBreakdown(selectedButtons) using tile strings
    already resolved from the board at each step.

    Returns (letter_sum, length, word_total) where word_total = letter_sum * length.
    """
    letter_sum = 0
    length = 0
    for raw in path_tile_strings:
        norm = normalize_tile(raw)
        letter_sum += letter_weight(norm)
        length += len(norm)
    if length == 0:
        return 0, 0, 0
    return letter_sum, length, letter_sum * length


def tiles_replace_order(path: List[Tuple[int, int]]) -> List[Tuple[int, int]]:
    """Match Array.from(selectedButtonSet) insertion order in script.js."""
    seen: set = set()
    order: List[Tuple[int, int]] = []
    for rc in path:
        if rc not in seen:
            seen.add(rc)
            order.append(rc)
    return order
