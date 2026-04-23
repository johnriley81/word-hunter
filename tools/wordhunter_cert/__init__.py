"""Word Hunter ideal-puzzle certification (parity with script.js)."""

from .rules import (
    GRID_SIZE,
    LETTER_WEIGHTS,
    letter_weight,
    normalize_tile,
    score_word_as_tiles,
    word_breakdown,
    word_to_tile_strings,
)
from .state import GameState

__all__ = [
    "LETTER_WEIGHTS",
    "GRID_SIZE",
    "normalize_tile",
    "letter_weight",
    "word_breakdown",
    "word_to_tile_strings",
    "score_word_as_tiles",
    "GameState",
]
