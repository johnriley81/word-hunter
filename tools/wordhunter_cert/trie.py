"""Prefix trie from wordlist.txt (lowercase words, one per line)."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, Iterator, Set


@dataclass
class TrieNode:
    children: Dict[str, "TrieNode"] = field(default_factory=dict)
    terminal: bool = False


class WordTrie:
    def __init__(self) -> None:
        self.root = TrieNode()

    def add(self, word: str) -> None:
        node = self.root
        for ch in word:
            node = node.children.setdefault(ch, TrieNode())
        node.terminal = True

    def has_prefix(self, s: str) -> bool:
        node = self.root
        for ch in s:
            node = node.children.get(ch)
            if node is None:
                return False
        return True

    def is_word(self, s: str) -> bool:
        node = self.root
        for ch in s:
            node = node.children.get(ch)
            if node is None:
                return False
        return node.terminal


def load_word_trie(path: str) -> WordTrie:
    trie = WordTrie()
    with open(path, encoding="utf-8") as f:
        for line in f:
            w = line.strip().lower()
            if w:
                trie.add(w)
    return trie


def load_word_set(path: str) -> Set[str]:
    s: Set[str] = set()
    with open(path, encoding="utf-8") as f:
        for line in f:
            w = line.strip().lower()
            if w:
                s.add(w)
    return s
