"""Board, queue, shifts, and word application — parity with script.js."""

from __future__ import annotations

import copy
from dataclasses import dataclass
from typing import List, Sequence, Set, Tuple

from .rules import GRID_SIZE, letter_weight, normalize_tile, tiles_replace_order, word_breakdown

Coord = Tuple[int, int]


def _board_from_rows(rows: Sequence[Sequence[str]]) -> List[List[str]]:
    g = [list(r) for r in rows]
    if len(g) != GRID_SIZE or any(len(row) != GRID_SIZE for row in g):
        raise ValueError(f"board must be {GRID_SIZE}x{GRID_SIZE}")
    return g


@dataclass(frozen=True)
class GameState:
    """Immutable game snapshot (board, sack queue, running score)."""

    board_rows: Tuple[Tuple[str, ...], ...]
    queue: Tuple[str, ...]
    score: int

    @classmethod
    def from_lists(
        cls,
        board: Sequence[Sequence[str]],
        queue: Sequence[str],
        score: int = 0,
    ) -> "GameState":
        br = _board_from_rows(board)
        return cls(
            board_rows=tuple(tuple(row) for row in br),
            queue=tuple(queue),
            score=score,
        )

    def board_list(self) -> List[List[str]]:
        return [list(row) for row in self.board_rows]

    def all_empty(self) -> bool:
        return all(cell == "" for row in self.board_rows for cell in row)

    def goal(self, target_score: int = 1000) -> bool:
        return (
            self.score == target_score
            and self.all_empty()
            and len(self.queue) == 0
        )


def apply_column_shift(board: List[List[str]], signed_steps: int) -> None:
    """Mutates board like applyColumnShift in script.js."""
    n = GRID_SIZE
    kk = abs(signed_steps) % n
    if kk == 0:
        return
    snap = copy.deepcopy(board)
    right = signed_steps > 0
    for r in range(n):
        for c in range(n):
            board[r][c] = (
                snap[r][(c - kk + n * 10) % n]
                if right
                else snap[r][(c + kk) % n]
            )


def apply_row_shift(board: List[List[str]], signed_steps: int) -> None:
    """Mutates board like applyRowShift in script.js."""
    n = GRID_SIZE
    kk = abs(signed_steps) % n
    if kk == 0:
        return
    snap = copy.deepcopy(board)
    down = signed_steps > 0
    for r in range(n):
        for c in range(n):
            board[r][c] = (
                snap[(r - kk + n * 10) % n][c]
                if down
                else snap[(r + kk) % n][c]
            )


def shift_board(
    board_rows: Tuple[Tuple[str, ...], ...],
    *,
    axis: str,
    signed_steps: int,
) -> Tuple[Tuple[str, ...], ...]:
    """Return new board after global row or column shift (axis 'row' | 'col')."""
    b = [list(row) for row in board_rows]
    if axis == "col":
        apply_column_shift(b, signed_steps)
    elif axis == "row":
        apply_row_shift(b, signed_steps)
    else:
        raise ValueError("axis must be 'row' or 'col'")
    return tuple(tuple(r) for r in b)


def apply_shift_state(state: GameState, axis: str, signed_steps: int) -> GameState:
    new_board = shift_board(state.board_rows, axis=axis, signed_steps=signed_steps)
    return GameState(board_rows=new_board, queue=state.queue, score=state.score)


def path_word_and_tiles(
    board_rows: Tuple[Tuple[str, ...], ...], path: Sequence[Coord]
) -> Tuple[str, List[str]]:
    """Spelled word (concat normalized tiles) and raw tile strings per step."""
    parts: List[str] = []
    tiles: List[str] = []
    for r, c in path:
        raw = board_rows[r][c]
        tiles.append(raw)
        parts.append(normalize_tile(raw))
    return "".join(parts), tiles


def is_adjacent(a: Coord, b: Coord) -> bool:
    dr = abs(a[0] - b[0])
    dc = abs(a[1] - b[1])
    return dr <= 1 and dc <= 1 and dr + dc > 0


def validate_path(board_rows: Tuple[Tuple[str, ...], ...], path: Sequence[Coord]) -> str | None:
    """Return error message or None if path is legal (non-empty tiles, adjacency)."""
    if not path:
        return "empty path"
    n = GRID_SIZE
    for r, c in path:
        if not (0 <= r < n and 0 <= c < n):
            return f"out of bounds {(r, c)}"
        if board_rows[r][c] == "":
            return f"empty tile at {(r, c)}"
    prev = path[0]
    for i in range(1, len(path)):
        cur = path[i]
        if not is_adjacent(prev, cur):
            return f"not adjacent {prev} -> {cur}"
        prev = cur
    return None


def try_apply_word(
    state: GameState,
    path: Sequence[Coord],
    *,
    word_set: Set[str],
) -> Tuple[GameState | None, str]:
    """
    If word is valid and path is legal, return (new_state, "").
    Otherwise return (None, error_message).
    """
    err = validate_path(state.board_rows, path)
    if err:
        return None, err

    word, tile_strings = path_word_and_tiles(state.board_rows, path)
    if len(word) <= 2:
        return None, "word too short"
    if word.lower() not in word_set:
        return None, f"not in word list: {word!r}"

    _, _, word_total = word_breakdown(tile_strings)
    order = tiles_replace_order(list(path))
    q = list(state.queue)
    b = [list(row) for row in state.board_rows]

    for r, c in order:
        nxt = q.pop(0) if q else ""
        b[r][c] = nxt

    return (
        GameState(
            board_rows=tuple(tuple(row) for row in b),
            queue=tuple(q),
            score=state.score + word_total,
        ),
        "",
    )
