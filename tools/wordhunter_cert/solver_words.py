"""Enumerate legal word paths on the board (trie-pruned DFS)."""

from __future__ import annotations

from typing import List, Tuple

from .rules import GRID_SIZE, normalize_tile
from .trie import WordTrie

Coord = Tuple[int, int]

ADJ = [
    (-1, -1),
    (-1, 0),
    (-1, 1),
    (0, -1),
    (0, 1),
    (1, -1),
    (1, 0),
    (1, 1),
]


def enumerate_word_paths(
    board_rows: Tuple[Tuple[str, ...], ...],
    trie: WordTrie,
    max_path_len: int,
):
    n = GRID_SIZE
    for sr in range(n):
        for sc in range(n):
            if board_rows[sr][sc] == "":
                continue
            t0 = normalize_tile(board_rows[sr][sc])
            if not trie.has_prefix(t0):
                continue
            path = [(sr, sc)]
            yield from _extend_path(board_rows, trie, max_path_len, path, t0)


def _extend_path(
    board_rows: Tuple[Tuple[str, ...], ...],
    trie: WordTrie,
    max_path_len: int,
    path: List[Coord],
    wstring: str,
):
    n = GRID_SIZE
    if len(wstring) >= 3 and trie.is_word(wstring):
        yield list(path)
    if len(path) >= max_path_len:
        return
    if not trie.has_prefix(wstring):
        return
    r, c = path[-1]
    for dr, dc in ADJ:
        nr, nc = r + dr, c + dc
        if not (0 <= nr < n and 0 <= nc < n):
            continue
        if board_rows[nr][nc] == "":
            continue
        norm = normalize_tile(board_rows[nr][nc])
        nw = wstring + norm
        if not trie.has_prefix(nw):
            continue
        path.append((nr, nc))
        yield from _extend_path(board_rows, trie, max_path_len, path, nw)
        path.pop()
