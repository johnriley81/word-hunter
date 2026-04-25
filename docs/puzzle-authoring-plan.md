# Puzzle authoring plan (word lists → constructed grids)

## Goal: reliable “perfect hunt” word bags

What we need first is a **dependable pipeline** that produces **valid word lists** whose **scores sum exactly** to the chosen perfect-hunt total (today often **1000** in cert tooling).

- The list is a **multiset of words**; **order does not affect** the total score or the sum of planning units (`tile_units` / `chars` budget) used in Step 1.
- Step 1 can intentionally **undershoot** abstract tile-unit sums vs puzzle `B`; **placement** later can force paths that use **more** distinct cells than the per-word lower bound (e.g. repeats like “binging” not laid out for minimal reuse).

### Target score experiments

- **1000** — current default in `tools/wordhunter_cert` (`TARGET_SCORE`).
- **1500** — worth trying if many candidate bags feel “flat” (few high-scoring letters / lower word scores).
- **2000** — likely to push solutions toward **higher-value letters** and **larger per-word scores**, which can make the hunt **harder** and more interesting if the design goal is “juicier” tiles.

Word planning and verification should treat **target score as a parameter** everywhere (planning, DP, `verify_ideal_trace`, etc.).

**Tooling pointers**

- `python -m tools.wordhunter_cert find-word-list` — Step 1 word bag (JSON).
- `python -m tools.wordhunter_cert plan-words` — hill-climb when knapsack-style DP is tight.
- `python -m tools.wordhunter_cert formula-bag` — fixed length mix (default 4×7, 3×8, 2×9, 1×10), per-length **mean / upper-third** score targets, formula CSV + backtracking scan for a multiset hitting `--target-score` with **Σ min_distinct ≤ B** (puzzle char budget by default).
- Precompute `text/word_metrics_{min}_{max}.csv` via `build-word-metrics` (also writes a sibling `.pkl` for **fast startup**; `plan-words` / `compose-witness` load the pickle when it is at least as new as the CSV).

### Mixing 7–9 letter words (not all 10s)

`plan-words` defaults are tuned for a **flatter length histogram**:

- `--length-mix-bias` (default **1.1**) — boosts underrepresented lengths while building/swapping.
- `--length-quota-strength` (default **0.55**) — often picks a deficit length bucket, then samples within that length with the same juice tiers.
- `--max-length-10-words` (default **0** = no cap; try **4** to force shorter words to appear).
- `--max-words` (default **14**) — room for more words when many are 7–9 letters vs six 10s.

Disable quota with `--length-quota-strength 0`; disable mix multiplier with `--length-mix-bias 0`.

### Dual budget (recommended for `plan-words`)

With **`--budget-metric dual`** (the `plan-words` default), the hill-climb enforces:

- **Σ tile_units ≥ B** — total path length across all words is at least the puzzle character budget (e.g. six 10-letter words alone are invalid when B = 66).
- **Σ min_distinct ≤ B** — sum of per-word minimum distinct cells (heuristic) does not exceed B; equivalently **Σ tile_units ≤ B + Σᵢ (Lᵢ − mtᵢ)** per word.

Stratified sampling uses **`score / tile_units`**. **`compose-witness --budget-metric dual`** uses **DP on `min_tiles` only** (same numeric B) as a fast approximation; use **`--refine-plan-words`** so `plan_words` can satisfy the full dual constraints.

Legacy **`chars`** still optimizes a **single** sum of tile-units near B, with an optional relaxed band `[B−6, B]` unless `--no-budget-sum-relaxed`.

**Two-phase dual (default)** — `plan-words` with `--budget-metric dual` first **adds words until the running score reaches the target** under a **relaxed** cap on Σ min_distinct (`B + length_slack + --dual-phase1-mt-extra`), then **tightens** the cap to `B + length_slack` and continues swapping to satisfy ΣL ≥ B and Σ mt ≤ B. Opt out with `--no-dual-two-phase` to restore the older “fill ΣL ≥ B first” dual loop.

---

## Phase 2: “Puzzle creator” — build grids by playing **backwards**

Once a **valid word bag** exists, the intended construction flow is:

1. **Puzzle creator mode** (in-app side mode, or a small companion tool): the author is given the **word list**.
2. Play **backwards from the last word** (reverse solve order): start from an **empty** (or seed) grid and **place / spell** words in **reverse play order** so that each step reflects how the real game would have looked **before** that word was played forward.
3. The author **adjusts the grid between words** (swaps / edits) as needed so each word is spellable in the current state.
4. **Record** the sequence of actions (words played, paths, any shifts, queue mutations) in this backward session.
5. **Derive publishable puzzle data** by **reversing** that recorded sequence:
   - **Initial grid** and **next letters** (sack) are the state you get by reversing all placements and plays until you reach “day 0.”
   - The **forward** perfect hunt is then the reversed recording.

This keeps the human in the loop for **geometry** while guaranteeing the **word bag** and **score total** are nailed in Step 1.

---

## Open items

- Wire **target score** (1000 / 1500 / 2000) consistently in UI copy and any exported traces.
- Implement or stub **puzzle creator** UX: backward play, action log, export `grids.txt` / `nextletters.txt` (or equivalent) from reversed log.
- Step 1 **dual** metric hard-requires **Σ tile_units ≥ B** and **Σ min_distinct ≤ B** (with pick slack `B + length_slack` on mt during search); placement may still need to reconcile geometry vs these lower bounds.
