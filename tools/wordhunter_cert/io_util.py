"""Load puzzle lines from text/grids.txt and text/nextletters.txt."""

from __future__ import annotations

import ast
from pathlib import Path
from typing import List, Sequence


def load_json_lines(path: str | Path) -> List:
    rows: List = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            rows.append(ast.literal_eval(line))
    return rows


def assert_paired_lengths(grids: Sequence, next_letters: Sequence) -> None:
    if len(grids) != len(next_letters):
        raise ValueError(
            f"grids ({len(grids)}) and nextletters ({len(next_letters)}) must have the same line count"
        )
