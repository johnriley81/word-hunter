import {
  LEADERBOARD_USE_DEMO_DATA,
  LEADERBOARD_DEMO_EMPTY_BOARD,
  LEADERBOARD_SUBMIT_SCORE_VALIDATION,
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
  LEADERBOARD_META_LIVE_PREVIEW,
} from "./leaderboard-api.js";
import { fetchLiveLeaderboardNetworkResult } from "./leaderboard-client.js";
import {
  buildDemoLeaderboardRows,
  demoRunQualifiesForLeaderboard,
  mergeDemoRunIntoTop10,
  leaderboardPreviewNameKey,
  leaderboardLiveSelfRowIndex,
  leaderboardLiveSubmitNameFallbackRaw,
  sanitizeDemoLeaderboardName,
} from "./leaderboard-lifecycle.js";
import {
  leaderboardCanPostLive,
  deriveLiveLeaderboardAfterFetch,
} from "./leaderboard-live-flow.js";
import { mergeDemoLeaderboardPreviewRows } from "./leaderboard-ui-demo-merge.js";
import { applyLeaderboardSubmitButtonVisibility } from "./leaderboard-ui-submit-visibility.js";
import {
  leaderboardNumericScore,
  rowPerfectOverFlags,
  setLeaderboardCellFlash,
  syncLeaderboardNameCellSubPerfect,
} from "./leaderboard-ui-helpers.js";
import { clearWordLineTimers, fadeInCurrentWordLine } from "./ui-word-line.js";
import { unlockGameAudio } from "./audio.js";

const LB_SELF_ROW_FG = "var(--leaderboard-self-row-highlight-color)";

function trimLeaderboardSubmitName(raw) {
  return String(sanitizeDemoLeaderboardName(raw) || String(raw ?? "").trim()).trim();
}

export function createLeaderboardController(rt) {
  const refs = () => rt.ctx.refs;
  const st = rt.state;

  function applySubmitButtonVisibility() {
    applyLeaderboardSubmitButtonVisibility({
      leaderboardUseDemoData: LEADERBOARD_USE_DEMO_DATA,
      refs: refs(),
      qualifiesForBoardSlot: st.qualifiesForBoardSlot ?? false,
      score: rt.getScore(),
      scoreSubmitThreshold: SCORE_SUBMIT_THRESHOLD,
      liveSubmitUsed: st.liveLeaderboardSubmitUsed,
      demoSubmitUsed: st.demoLeaderboardSubmitUsed,
    });
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
    const nameVal = sanitizeDemoLeaderboardName(rows[idx][0]) || "";

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
      const v = sanitizeDemoLeaderboardName(input.value);
      input.value = v;
      rows[idx][0] = v;
      refs().playerName.value = v;
      applySubmitButtonVisibility();
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        input.blur();
      }
    });
    input.addEventListener("blur", () => {
      const v = sanitizeDemoLeaderboardName(input.value);
      rows[idx][0] = v || "";
      refs().playerName.value = v || "";
      renderLeaderboardTable(rows);
    });
  }

  function renderLeaderboardTable(leaderboard) {
    const { leaderboardTable, playerName } = refs();
    st.playerPosition = undefined;
    leaderboardTable.innerHTML = "";
    const thead = document.createElement("thead");
    const tbody = document.createElement("tbody");

    const perfectTargetForDemoMerge = rt.getPerfectHuntTargetSum?.() ?? null;
    let rows = mergeDemoLeaderboardPreviewRows(
      normalizeLeaderboardRows(Array.isArray(leaderboard) ? leaderboard : []),
      perfectTargetForDemoMerge
    );
    if (!LEADERBOARD_USE_DEMO_DATA) {
      rows = padNormalizedLeaderboardToTop10(rows);
      st.liveLeaderboardPreviewRows = rows.map((r) => r.slice(0, 5));
    }
    const headerRow = document.createElement("tr");
    ["", "👤", "🏹", "🏆"].forEach((headerText) => {
      const th = document.createElement("th");
      th.textContent = headerText;
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);

    const typedPlayerName = String(playerName.value || "").trim();
    const typedCanonical = String(
      sanitizeDemoLeaderboardName(typedPlayerName) || typedPlayerName
    ).trim();
    const previewNameKey = leaderboardPreviewNameKey(playerName.value);

    const perfectTarget = rt.getPerfectHuntTargetSum?.() ?? null;
    const runScoreNum = Number(rt.getScore());

    rows.forEach((row, index) => {
      let [playerRaw, , , rowTrophy] = row;
      const tr = document.createElement("tr");
      let color = "white";

      const playerStr = String(playerRaw || "").trim();
      const scoreNum = leaderboardNumericScore(row);
      const hasScore = scoreNum !== null;
      const { isPerfectHuntScore, isAbovePerfectHunt } = rowPerfectOverFlags(
        perfectTarget,
        row
      );
      const trophyStr = String(rowTrophy || "").trim();
      const trophyMatches = trophyStr === String(rt.getTrophyWord() || "").trim();
      const isDemoSelfRow =
        LEADERBOARD_USE_DEMO_DATA &&
        hasScore &&
        Number.isFinite(runScoreNum) &&
        scoreNum === runScoreNum &&
        trophyMatches;
      const sameScoreAndTrophyAsRun =
        hasScore &&
        Number.isFinite(runScoreNum) &&
        scoreNum === runScoreNum &&
        trophyMatches;
      const rowPreviewNameKey = leaderboardPreviewNameKey(playerStr);
      const isLiveStatsAndNameMatch =
        sameScoreAndTrophyAsRun && rowPreviewNameKey === previewNameKey;
      const isLiveCurrentRunPreviewRow =
        isLiveStatsAndNameMatch && row[4] === LEADERBOARD_META_LIVE_PREVIEW;
      const isLiveInlineSelfRow =
        !LEADERBOARD_USE_DEMO_DATA &&
        !st.liveLeaderboardSubmitUsed &&
        isLiveCurrentRunPreviewRow;
      const isLiveSubmittedSelfRow =
        !LEADERBOARD_USE_DEMO_DATA &&
        st.liveLeaderboardSubmitUsed &&
        isLiveStatsAndNameMatch;
      const playerCanonical = String(
        sanitizeDemoLeaderboardName(playerStr) || playerStr
      ).trim();
      const nameMatches =
        Boolean(typedCanonical) &&
        Boolean(playerCanonical) &&
        playerCanonical === typedCanonical;
      const scoreMatches =
        scoreNum !== null && Number.isFinite(runScoreNum) && scoreNum === runScoreNum;
      const nameMatchesHighlight =
        nameMatches &&
        scoreMatches &&
        trophyMatches &&
        (LEADERBOARD_USE_DEMO_DATA ||
          (rowPreviewNameKey === previewNameKey &&
            (st.liveLeaderboardSubmitUsed ||
              row[4] === LEADERBOARD_META_LIVE_PREVIEW)));

      const displayNameCell = playerStr || "";
      const displayScoreCell = scoreNum === null ? "" : String(scoreNum);
      const displayTrophyCell = isPerfectHuntScore ? "PERFECT HUNT" : trophyStr || "";
      const nameTrophyFlash = isPerfectHuntScore
        ? "perfect"
        : isAbovePerfectHunt
          ? "over"
          : null;

      const useInlineNameCell =
        (isDemoSelfRow && !st.demoLeaderboardSubmitUsed) || isLiveInlineSelfRow;

      const highlightSelfRow =
        isDemoSelfRow ||
        isLiveInlineSelfRow ||
        isLiveSubmittedSelfRow ||
        nameMatchesHighlight;

      if (
        isDemoSelfRow ||
        isLiveInlineSelfRow ||
        isLiveSubmittedSelfRow ||
        nameMatchesHighlight
      ) {
        st.playerPosition = index + 1;
        color = LB_SELF_ROW_FG;
      }

      tr.style.color = color;

      const positionDisplay = `${index + 1}.`;

      [positionDisplay, displayNameCell, displayScoreCell, displayTrophyCell].forEach(
        (cellText, cellIndex) => {
          const td = document.createElement("td");
          if (cellIndex === 0) {
            td.textContent = cellText;
            td.style.color = highlightSelfRow ? LB_SELF_ROW_FG : "white";
          } else if (cellIndex === 1 && useInlineNameCell) {
            td.dataset.inlineSelfName = "1";
            td.classList.add("leaderboard-name-cell--you-pseudo-select");
            syncLeaderboardNameCellSubPerfect(td, true);
            td.style.cursor = "pointer";
            if (highlightSelfRow) {
              td.style.color = LB_SELF_ROW_FG;
            }
            td.textContent = displayNameCell;
          } else if (cellIndex === 1 || cellIndex === 2) {
            if (highlightSelfRow) {
              td.style.color = LB_SELF_ROW_FG;
            }
            td.textContent = cellText;
          } else {
            setLeaderboardCellFlash(td, cellText, nameTrophyFlash);
            if (highlightSelfRow && String(cellText).trim() !== "") {
              td.style.color = LB_SELF_ROW_FG;
            }
          }

          tr.appendChild(td);
        }
      );
      tbody.appendChild(tr);
    });

    if (rows.length > 0) {
      tbody.style.setProperty("--lb-rows", String(rows.length));
    }

    leaderboardTable.appendChild(thead);
    leaderboardTable.appendChild(tbody);

    const qualifiesForBoardSlot = LEADERBOARD_USE_DEMO_DATA
      ? demoRunQualifiesForLeaderboard(
          LEADERBOARD_DEMO_EMPTY_BOARD ? [] : buildDemoLeaderboardRows(),
          rt.getScore()
        )
      : demoRunQualifiesForLeaderboard(
          st.liveLeaderboardEligibilityRows ?? rows,
          rt.getScore()
        ) && !st.liveLeaderboardSubmitUsed;
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
      name = sanitizeDemoLeaderboardName(input.value);
    } else {
      name = sanitizeDemoLeaderboardName(rows[idx][0]);
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

  async function refreshLeaderboardFromApi(clicked) {
    const { playerName, leaderboardButton } = refs();
    if (clicked) {
      playerName.disabled = true;
      leaderboardButton.disabled = true;
      leaderboardButton.style.backgroundColor = "gray";
    }

    const nameTrim = resolveLiveLeaderboardNameTrimForSubmit();
    const canPost = leaderboardCanPostLive(
      clicked,
      rt.getScore(),
      nameTrim,
      SCORE_SUBMIT_THRESHOLD
    );
    const deriveInput = {
      clicked,
      score: rt.getScore(),
      nameTrim,
      trophyWord: rt.getTrophyWord(),
      scoreThreshold: SCORE_SUBMIT_THRESHOLD,
      useDemoData: LEADERBOARD_USE_DEMO_DATA,
      liveSubmitUsed: st.liveLeaderboardSubmitUsed,
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
        attachScoreValidation: LEADERBOARD_SUBMIT_SCORE_VALIDATION,
        scoreValidationTurns: rt.getScoreValidationTurns(),
      });

      const resolved = deriveLiveLeaderboardAfterFetch(network, deriveInput);
      tableRows = resolved.tableRows;
      committed = resolved.committed;
      st.liveLeaderboardEligibilityRows = resolved.eligibilityRows;

      if (committed) {
        rt.playSound("submit", rt.getIsMuted());
        st.liveLeaderboardSubmitUsed = true;
        playerName.value = nameTrim;
      } else if (clicked) {
        rt.playSound("click", rt.getIsMuted());
      }

      if (
        !LEADERBOARD_USE_DEMO_DATA &&
        Array.isArray(tableRows) &&
        tableRows.length === 0 &&
        st.liveLeaderboardSubmitUsed
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
        if (demoRunQualifiesForLeaderboard([], run) && run > 0) {
          rows = mergeDemoRunIntoTop10([], "", run, rt.getTrophyWord() || "");
        }
        st.demoLeaderboardRows = rows;
        renderLeaderboardTable(rows);
      } else {
        const base = buildDemoLeaderboardRows();
        if (demoRunQualifiesForLeaderboard(base, rt.getScore())) {
          st.demoLeaderboardRows = mergeDemoRunIntoTop10(
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
    pn.addEventListener("input", applySubmitButtonVisibility);
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
  };
}
