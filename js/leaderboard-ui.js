import {
  LEADERBOARD_USE_DEMO_DATA,
  LEADERBOARD_DEMO_EMPTY_BOARD,
  DEMO_LEADERBOARD_NAME_MAX,
  LEADERBOARD_OVERLAY_FADE_OUT_TOTAL_MS,
  LEADERBOARD_COPY_SCORE_AFTER_OVERLAY_FADE_MS as DEFAULT_COPY_SCORE_AFTER_OVERLAY_MS,
  SCORE_SUBMIT_THRESHOLD,
  CURRENT_WORD_BRIEF_FADE_IN_MS,
  happyHuntingColor,
} from "./config.js";
import {
  normalizeLeaderboardRows,
  leaderboardDebugWarn,
  padNormalizedLeaderboardToTop10,
} from "./leaderboard-api.js";
import {
  fetchLiveLeaderboardNetworkResult,
  invalidateLeaderboardFetchCache,
} from "./leaderboard-client.js";
import {
  applyLiveLeaderboardPreviewMerge,
  buildDemoLeaderboardRows,
  runQualifiesForLeaderboardTop10,
  mergeRunIntoTop10,
  leaderboardLiveSelfRowIndex,
  leaderboardLiveSubmitNameFallbackRaw,
  sanitizeLeaderboardName,
  stripLiveLeaderboardPreviewRows,
} from "./leaderboard-lifecycle.js";
import {
  leaderboardCanPostLive,
  deriveLiveLeaderboardAfterFetch,
  isProhibitedLeaderboardSubmitClick,
  liveLeaderboardTurnSpent,
} from "./leaderboard-live-flow.js";
import { mergeDemoLeaderboardPreviewRows } from "./leaderboard-ui-demo-merge.js";
import {
  applyLeaderboardSubmitButtonVisibility,
  leaderboardSubmitCooldownRemainingMs,
  clearPersistedLeaderboardSubmitAt,
  syncLiveLeaderboardSubmitCooldown,
  writePersistedLeaderboardSubmitAt,
} from "./leaderboard-ui-submit-visibility.js";
import {
  leaderboardNumericScore,
  shouldDeferLeaderboardTableRender,
  syncLeaderboardNameCellSubPerfect,
} from "./leaderboard-ui-helpers.js";
import {
  buildLeaderboardRowViewModels,
  createLeaderboardRowRenderContext,
} from "./leaderboard-row-view-model.js";
import { renderLeaderboardTableDom } from "./leaderboard-table-render.js";
import { clearWordLineTimers, fadeInCurrentWordLine } from "./ui-word-line.js";
import { unlockGameAudio } from "./audio.js";

function trimLeaderboardSubmitName(raw) {
  return String(sanitizeLeaderboardName(raw) || String(raw ?? "").trim()).trim();
}

export function createLeaderboardController(rt) {
  const refs = () => rt.ctx.refs;
  const st = rt.state;
  /** @type {Promise<void> | null} */
  let refreshLeaderboardInFlight = null;

  function liveSubmitCooldownRemainingMs() {
    return leaderboardSubmitCooldownRemainingMs(st.liveLeaderboardSubmitCooldownAt);
  }

  function liveRateLimitRemainingMs() {
    return leaderboardSubmitCooldownRemainingMs(st.liveLeaderboardRateLimitAt);
  }

  function submitButtonFeedbackRemainingMs() {
    return Math.max(liveSubmitCooldownRemainingMs(), liveRateLimitRemainingMs());
  }

  function clearSubmitCooldownTimer() {
    if (st.liveLeaderboardSubmitCooldownTimer !== null) {
      window.clearInterval(st.liveLeaderboardSubmitCooldownTimer);
      st.liveLeaderboardSubmitCooldownTimer = null;
    }
  }

  function armSubmitCooldownRefresh() {
    clearSubmitCooldownTimer();
    const remaining = submitButtonFeedbackRemainingMs();
    if (remaining <= 0) return;
    applySubmitButtonVisibility();
    st.liveLeaderboardSubmitCooldownTimer = window.setInterval(() => {
      const rem = submitButtonFeedbackRemainingMs();
      if (rem <= 0) {
        clearSubmitCooldownTimer();
        if (st.liveLeaderboardSubmitCooldownAt != null) {
          clearPersistedLeaderboardSubmitAt(rt.getLeaderboardPuzzleId());
          st.liveLeaderboardSubmitCooldownAt = null;
        }
        st.liveLeaderboardRateLimitAt = null;
      }
      applySubmitButtonVisibility();
    }, 1000);
  }

  function markLiveLeaderboardSubmitCooldown() {
    const at = Date.now();
    st.liveLeaderboardSubmitCooldownAt = at;
    writePersistedLeaderboardSubmitAt(rt.getLeaderboardPuzzleId(), at);
    if (!st.liveLeaderboardSubmitUsed) {
      armSubmitCooldownRefresh();
    }
  }

  function syncSubmitCooldownFromStorage() {
    syncLiveLeaderboardSubmitCooldown(st, rt.getLeaderboardPuzzleId());
    armSubmitCooldownRefresh();
  }

  function liveTurnSpent() {
    return liveLeaderboardTurnSpent(st);
  }

  function applySubmitButtonVisibility() {
    applyLeaderboardSubmitButtonVisibility({
      leaderboardUseDemoData: LEADERBOARD_USE_DEMO_DATA,
      refs: refs(),
      qualifiesForBoardSlot: st.qualifiesForBoardSlot ?? false,
      score: rt.getScore(),
      scoreSubmitThreshold: SCORE_SUBMIT_THRESHOLD,
      liveSubmitUsed: st.liveLeaderboardSubmitUsed,
      liveNameRejected: st.liveLeaderboardNameRejected,
      demoSubmitUsed: st.demoLeaderboardSubmitUsed,
      submitCooldownRemainingMs: st.liveLeaderboardSubmitUsed
        ? 0
        : Math.max(liveSubmitCooldownRemainingMs(), liveRateLimitRemainingMs()),
    });
  }

  function hasLeaderboardInlineNameInput() {
    const input = refs().leaderboardTable?.querySelector(
      ".leaderboard-inline-name-input"
    );
    return input instanceof HTMLInputElement;
  }

  function syncLiveLeaderboardPreviewState(merged) {
    const perfectTargetForDemoMerge = rt.getPerfectHuntTargetSum?.() ?? null;
    let rows = mergeDemoLeaderboardPreviewRows(
      normalizeLeaderboardRows(Array.isArray(merged) ? merged : []),
      perfectTargetForDemoMerge
    );
    rows = padNormalizedLeaderboardToTop10(rows);
    st.liveLeaderboardPreviewRows = rows.map((r) => r.slice(0, 5));
    st.qualifiesForBoardSlot =
      runQualifiesForLeaderboardTop10(
        st.liveLeaderboardEligibilityRows ?? rows,
        rt.getScore()
      ) && !liveTurnSpent();
    applySubmitButtonVisibility();
  }

  function refreshLivePreviewFromEligibility(options = {}) {
    if (LEADERBOARD_USE_DEMO_DATA || liveTurnSpent()) return;
    const base = st.liveLeaderboardEligibilityRows ?? st.liveLeaderboardPreviewRows;
    if (!base?.length) return;
    const norm = normalizeLeaderboardRows(
      stripLiveLeaderboardPreviewRows(base.map((r) => r.slice(0, 5)))
    );
    const nameTrim = trimLeaderboardSubmitName(refs().playerName.value);
    const merged = applyLiveLeaderboardPreviewMerge(
      norm,
      nameTrim,
      rt.getScore(),
      rt.getTrophyWord(),
      { useDemoData: false, liveSubmitUsed: liveTurnSpent() }
    );
    if (
      shouldDeferLeaderboardTableRender({
        forceTableRender: options.forceTableRender,
        skipTableRender: options.skipTableRender,
        hasInlineNameInput: hasLeaderboardInlineNameInput(),
      })
    ) {
      syncLiveLeaderboardPreviewState(merged);
      return;
    }
    renderLeaderboardTable(merged);
  }

  function syncLiveNamePolicyUi(options = {}) {
    refreshLivePreviewFromEligibility(options);
  }

  function findDemoSelfRowIndex() {
    const rows = st.demoLeaderboardRows;
    if (!LEADERBOARD_USE_DEMO_DATA || !rows) return -1;
    const trophy = String(rt.getTrophyWord() || "").trim();
    const want = Number(rt.getScore());
    return rows.findIndex(
      (r) => leaderboardNumericScore(r) === want && String(r[3] || "").trim() === trophy
    );
  }

  function findLiveSelfRowIndex() {
    return leaderboardLiveSelfRowIndex(
      st.liveLeaderboardPreviewRows,
      refs().playerName.value,
      rt.getScore(),
      rt.getTrophyWord()
    );
  }

  function openLeaderboardInlineNameEdit(td) {
    let rows;
    let idx;
    if (LEADERBOARD_USE_DEMO_DATA) {
      rows = st.demoLeaderboardRows;
      idx = findDemoSelfRowIndex();
    } else {
      rows = st.liveLeaderboardPreviewRows;
      idx = findLiveSelfRowIndex();
    }
    if (idx < 0 || !rows) return;
    const nameVal = sanitizeLeaderboardName(rows[idx][0]) || "";

    td.textContent = "";
    td.removeAttribute("data-inline-self-name");
    td.classList.add("leaderboard-name-cell--editing-name");
    td.classList.add("leaderboard-name-cell--you-pseudo-select");
    syncLeaderboardNameCellSubPerfect(td, true);

    const input = document.createElement("input");
    input.type = "text";
    input.className =
      "leaderboard-inline-name-input leaderboard-inline-name-input--sub-perfect";
    input.maxLength = DEMO_LEADERBOARD_NAME_MAX;
    input.setAttribute("inputmode", "text");
    input.setAttribute("pattern", "[A-Za-z]*");
    input.value = nameVal;
    input.setAttribute("aria-label", "Your name");
    input.setAttribute("autocomplete", "off");
    input.setAttribute("spellcheck", "false");
    td.appendChild(input);
    input.focus();
    input.select();
    input.addEventListener("input", () => {
      const v = sanitizeLeaderboardName(input.value);
      input.value = v;
      rows[idx][0] = v;
      refs().playerName.value = v;
      syncLiveNamePolicyUi({ skipTableRender: true });
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        input.blur();
      }
    });
    input.addEventListener("blur", () => {
      const v = sanitizeLeaderboardName(input.value);
      rows[idx][0] = v || "";
      refs().playerName.value = v || "";
      syncLiveNamePolicyUi({ forceTableRender: true });
    });
  }

  function renderLeaderboardTable(leaderboard) {
    const { leaderboardTable, playerName } = refs();
    st.playerPosition = undefined;
    leaderboardTable.innerHTML = "";

    const perfectTargetForDemoMerge = rt.getPerfectHuntTargetSum?.() ?? null;
    let rows = mergeDemoLeaderboardPreviewRows(
      normalizeLeaderboardRows(Array.isArray(leaderboard) ? leaderboard : []),
      perfectTargetForDemoMerge
    );
    if (!LEADERBOARD_USE_DEMO_DATA) {
      rows = padNormalizedLeaderboardToTop10(rows);
      st.liveLeaderboardPreviewRows = rows.map((r) => r.slice(0, 5));
    }

    const renderCtx = createLeaderboardRowRenderContext({
      useDemoData: LEADERBOARD_USE_DEMO_DATA,
      demoSubmitUsed: st.demoLeaderboardSubmitUsed,
      turnSpent: liveTurnSpent(),
      typedPlayerName: playerName.value,
      runScore: rt.getScore(),
      runTrophyWord: rt.getTrophyWord(),
      perfectTarget: perfectTargetForDemoMerge,
    });
    const { viewModels, playerPosition } = buildLeaderboardRowViewModels(
      rows,
      renderCtx
    );
    if (playerPosition != null) {
      st.playerPosition = playerPosition;
    }
    renderLeaderboardTableDom(leaderboardTable, viewModels);

    const qualifiesForBoardSlot = LEADERBOARD_USE_DEMO_DATA
      ? runQualifiesForLeaderboardTop10(
          LEADERBOARD_DEMO_EMPTY_BOARD ? [] : buildDemoLeaderboardRows(),
          rt.getScore()
        )
      : runQualifiesForLeaderboardTop10(
          st.liveLeaderboardEligibilityRows ?? rows,
          rt.getScore()
        ) && !liveTurnSpent();
    st.qualifiesForBoardSlot = qualifiesForBoardSlot;
    applySubmitButtonVisibility();
  }

  function finalizeDemoLeaderboardSubmit() {
    const rows = st.demoLeaderboardRows;
    if (!LEADERBOARD_USE_DEMO_DATA || st.demoLeaderboardSubmitUsed) return;
    if (Number(rt.getScore()) <= 0) return;
    const idx = findDemoSelfRowIndex();
    if (idx < 0 || !rows) return;
    const { leaderboardTable } = refs();
    const input = leaderboardTable.querySelector(".leaderboard-inline-name-input");
    let name;
    if (input) {
      name = sanitizeLeaderboardName(input.value);
    } else {
      name = sanitizeLeaderboardName(rows[idx][0]);
    }
    if (!name) return;
    rt.playSound("submit", rt.getIsMuted());
    rows[idx][0] = name;
    st.demoLeaderboardSubmitUsed = true;
    renderLeaderboardTable(rows);
  }

  function finalizePostgameLeaderboardOverlayHidden() {
    const {
      leaderboardElements,
      leaderboardTable,
      leaderboardDemoAdd,
      leaderboardButton,
    } = refs();
    leaderboardElements.style.display = "none";
    leaderboardElements.setAttribute("aria-hidden", "true");
    leaderboardTable.classList.add("hiddenDisplay");
    leaderboardTable.classList.remove("visibleDisplay");
    leaderboardElements.classList.remove("visibleDisplay");
    if (leaderboardDemoAdd) {
      leaderboardDemoAdd.classList.remove("leaderboard-demo-add--eligible");
      leaderboardDemoAdd.classList.remove("leaderboard-demo-add--spent");
      leaderboardDemoAdd.disabled = false;
      leaderboardDemoAdd.classList.add("hiddenDisplay");
    }
    leaderboardButton.classList.add("hiddenDisplay");
    leaderboardButton.classList.add("leaderboard-action--concealed");
  }

  function hidePostgameLeaderboardOverlay() {
    const t1 = st.postgameCopyScoreTimer;
    if (t1 !== null) {
      window.clearTimeout(t1);
      st.postgameCopyScoreTimer = null;
    }
    const t2 = st.leaderboardFadeOutTimer;
    if (t2 !== null) {
      window.clearTimeout(t2);
      st.leaderboardFadeOutTimer = null;
    }
    refs().leaderboardElements.classList.remove("leaderboard-elements--visible");
    finalizePostgameLeaderboardOverlayHidden();
  }

  function beginPostgameLeaderboardOverlayFadeOut() {
    const t1 = st.postgameCopyScoreTimer;
    if (t1 !== null) {
      window.clearTimeout(t1);
      st.postgameCopyScoreTimer = null;
    }
    const t2 = st.leaderboardFadeOutTimer;
    if (t2 !== null) {
      window.clearTimeout(t2);
      st.leaderboardFadeOutTimer = null;
    }
    const { leaderboardElements } = refs();
    if (!leaderboardElements.classList.contains("leaderboard-elements--visible")) {
      return false;
    }
    leaderboardElements.classList.remove("leaderboard-elements--visible");
    st.leaderboardFadeOutTimer = window.setTimeout(() => {
      st.leaderboardFadeOutTimer = null;
      finalizePostgameLeaderboardOverlayHidden();
    }, LEADERBOARD_OVERLAY_FADE_OUT_TOTAL_MS);
    return true;
  }

  function revealPostGameCopyScoreLine() {
    clearWordLineTimers(rt.ctx);
    refs().currentWordElement.classList.remove("current-word--valid-solve");
    st.endgameUiShown = true;
    fadeInCurrentWordLine(rt.ctx, "Copy Score", happyHuntingColor, {});
    window.setTimeout(() => {
      rt.revealPostgameRetryAfterCopyScoreVisible?.();
    }, CURRENT_WORD_BRIEF_FADE_IN_MS);
    rt.updateNextLetters();
    refs().playerName.classList.add("hiddenDisplay");
  }

  function resolveLiveLeaderboardNameTrimForSubmit() {
    const { leaderboardTable, playerName } = refs();
    const inlineInput = leaderboardTable.querySelector(
      ".leaderboard-inline-name-input"
    );
    if (inlineInput) {
      const v = trimLeaderboardSubmitName(inlineInput.value);
      playerName.value = v;
      return v;
    }
    let t = trimLeaderboardSubmitName(playerName.value);
    if (t !== "") return t;
    if (LEADERBOARD_USE_DEMO_DATA) return "";
    t = trimLeaderboardSubmitName(
      leaderboardLiveSubmitNameFallbackRaw(
        st.liveLeaderboardPreviewRows,
        playerName.value,
        rt.getScore(),
        rt.getTrophyWord()
      )
    );
    if (t) playerName.value = t;
    return t;
  }

  function markLeaderboardRateLimitFeedback() {
    st.liveLeaderboardRateLimitAt = Date.now();
    if (!st.liveLeaderboardSubmitUsed) {
      armSubmitCooldownRefresh();
    }
    applySubmitButtonVisibility();
  }

  async function refreshLeaderboardFromApi(clicked) {
    if (refreshLeaderboardInFlight) {
      if (clicked) return;
      return refreshLeaderboardInFlight;
    }

    const run = async () => {
      const { playerName, leaderboardButton } = refs();
      if (clicked) {
        playerName.disabled = true;
        leaderboardButton.disabled = true;
        leaderboardButton.style.backgroundColor = "gray";
      }

      const nameTrim = resolveLiveLeaderboardNameTrimForSubmit();
      const nameRejectedOnSubmit =
        !LEADERBOARD_USE_DEMO_DATA &&
        isProhibitedLeaderboardSubmitClick(clicked, nameTrim);
      if (nameRejectedOnSubmit) {
        st.liveLeaderboardNameRejected = true;
      }
      const canPost =
        clicked &&
        leaderboardCanPostLive(true, rt.getScore(), nameTrim, SCORE_SUBMIT_THRESHOLD);
      const deriveInput = {
        clicked,
        score: rt.getScore(),
        nameTrim,
        trophyWord: rt.getTrophyWord(),
        scoreThreshold: SCORE_SUBMIT_THRESHOLD,
        useDemoData: LEADERBOARD_USE_DEMO_DATA,
        liveSubmitUsed: st.liveLeaderboardSubmitUsed,
        liveNameRejected: st.liveLeaderboardNameRejected,
      };
      let tableRows;
      let committed = false;
      let rendered = false;

      try {
        const network = await fetchLiveLeaderboardNetworkResult({
          leaderboardLink: rt.leaderboardLink,
          puzzleId: rt.getLeaderboardPuzzleId(),
          canPost,
          playerNameTrim: nameTrim,
          score: rt.getScore(),
          trophyWord: rt.getTrophyWord(),
          scoreValidationPayload: rt.getScoreValidationPayload(),
        });

        const resolved = deriveLiveLeaderboardAfterFetch(network, deriveInput);
        tableRows = resolved.tableRows;
        committed = resolved.committed;
        st.liveLeaderboardEligibilityRows = resolved.eligibilityRows;

        if (committed) {
          rt.playSound("submit", rt.getIsMuted());
          st.liveLeaderboardSubmitUsed = true;
          st.liveLeaderboardRateLimitAt = null;
          playerName.value = nameTrim;
          markLiveLeaderboardSubmitCooldown();
        } else if (clicked && network.status === 429) {
          invalidateLeaderboardFetchCache(rt.getLeaderboardPuzzleId());
          markLeaderboardRateLimitFeedback();
          rt.playSound("click", rt.getIsMuted());
        } else if (clicked) {
          rt.playSound("click", rt.getIsMuted());
          if (nameRejectedOnSubmit) {
            tableRows = stripLiveLeaderboardPreviewRows(
              normalizeLeaderboardRows(Array.isArray(tableRows) ? tableRows : [])
            );
          }
        }

        if (
          !LEADERBOARD_USE_DEMO_DATA &&
          Array.isArray(tableRows) &&
          tableRows.length === 0 &&
          committed &&
          st.liveLeaderboardSubmitUsed &&
          !st.liveLeaderboardNameRejected
        ) {
          const prev = st.liveLeaderboardPreviewRows;
          if (prev?.length) {
            tableRows = prev.map((r) => r.slice());
          }
        }

        renderLeaderboardTable(tableRows);
        rendered = true;
      } finally {
        if (clicked) {
          playerName.disabled = false;
          if (!rendered) {
            applySubmitButtonVisibility();
          }
        }
      }
    };

    refreshLeaderboardInFlight = run();
    try {
      await refreshLeaderboardInFlight;
    } finally {
      refreshLeaderboardInFlight = null;
    }
  }

  function maybeShowPostGameUi() {
    if (!st.endgamePostUiReady || st.endgameUiShown) return;
    if (st.postgameSequenceStarted) return;
    st.postgameSequenceStarted = true;

    const { leaderboardElements, leaderboardTable, leaderboardDemoAdd } = refs();
    leaderboardElements.style.display = "flex";
    leaderboardTable.classList.remove("hiddenDisplay");
    leaderboardTable.classList.add("visibleDisplay");
    leaderboardElements.classList.add("visibleDisplay");
    leaderboardElements.setAttribute("aria-hidden", "false");

    if (LEADERBOARD_USE_DEMO_DATA) {
      if (LEADERBOARD_DEMO_EMPTY_BOARD) {
        const run = Number(rt.getScore());
        let rows = [];
        if (runQualifiesForLeaderboardTop10([], run) && run > 0) {
          rows = mergeRunIntoTop10([], "", run, rt.getTrophyWord() || "");
        }
        st.demoLeaderboardRows = rows;
        renderLeaderboardTable(rows);
      } else {
        const base = buildDemoLeaderboardRows();
        if (runQualifiesForLeaderboardTop10(base, rt.getScore())) {
          st.demoLeaderboardRows = mergeRunIntoTop10(
            base,
            "",
            rt.getScore(),
            rt.getTrophyWord() || ""
          );
        } else {
          st.demoLeaderboardRows = base;
        }
        const rows = st.demoLeaderboardRows;
        if (rows) renderLeaderboardTable(rows);
      }
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          leaderboardElements.classList.add("leaderboard-elements--visible");
        });
      });
      st.postgameCopyScoreTimer = window.setTimeout(() => {
        st.postgameCopyScoreTimer = null;
        revealPostGameCopyScoreLine();
      }, DEFAULT_COPY_SCORE_AFTER_OVERLAY_MS);
      return;
    }

    if (leaderboardDemoAdd) {
      leaderboardDemoAdd.classList.remove("leaderboard-demo-add--eligible");
      leaderboardDemoAdd.classList.remove("leaderboard-demo-add--spent");
      leaderboardDemoAdd.disabled = false;
      leaderboardDemoAdd.classList.add("hiddenDisplay");
    }

    void (async () => {
      try {
        await refreshLeaderboardFromApi(false);
      } catch (err) {
        leaderboardDebugWarn(err);
      }
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          leaderboardElements.classList.add("leaderboard-elements--visible");
        });
      });
      st.postgameCopyScoreTimer = window.setTimeout(() => {
        st.postgameCopyScoreTimer = null;
        revealPostGameCopyScoreLine();
      }, DEFAULT_COPY_SCORE_AFTER_OVERLAY_MS);
    })();
  }

  const pn = refs().playerName;
  if (pn && !pn.dataset.whNameSubmitSync) {
    pn.dataset.whNameSubmitSync = "1";
    pn.addEventListener("input", syncLiveNamePolicyUi);
    pn.addEventListener("blur", syncLiveNamePolicyUi);
  }

  async function getLeaderboard(clicked = false) {
    if (LEADERBOARD_USE_DEMO_DATA) {
      if (clicked) {
        void unlockGameAudio();
        rt.playSound("click", rt.getIsMuted());
      }
      const cur = st.demoLeaderboardRows;
      const fallback = LEADERBOARD_DEMO_EMPTY_BOARD ? [] : buildDemoLeaderboardRows();
      st.demoLeaderboardRows = cur != null ? cur : fallback;
      const rows = st.demoLeaderboardRows;
      if (rows) renderLeaderboardTable(rows);
      return;
    }
    await refreshLeaderboardFromApi(clicked);
  }

  return {
    openLeaderboardInlineNameEdit,
    renderLeaderboardTable,
    finalizeDemoLeaderboardSubmit,
    finalizePostgameLeaderboardOverlayHidden,
    hidePostgameLeaderboardOverlay,
    beginPostgameLeaderboardOverlayFadeOut,
    revealPostGameCopyScoreLine,
    maybeShowPostGameUi,
    refreshLeaderboardFromApi,
    getLeaderboard,
    syncSubmitCooldownFromStorage,
  };
}
