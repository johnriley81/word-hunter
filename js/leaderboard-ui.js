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
  goldTextColor,
  leaderboardSubPerfectRowColor,
  redTextColorLeaderboard,
} from "./config.js";
import {
  normalizeLeaderboardRows,
  leaderboardDebugWarn,
  padNormalizedLeaderboardToTop10,
} from "./leaderboard-api.js";
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
  submittingSubPerfectFromRun,
  rowPerfectOverFlags,
  setLeaderboardCellFlash,
  syncLeaderboardNameCellSubPerfect,
} from "./leaderboard-ui-helpers.js";
import { clearWordLineTimers, fadeInCurrentWordLine } from "./ui-word-line.js";
import { unlockGameAudio } from "./audio.js";

function trimLeaderboardSubmitName(raw) {
  return String(sanitizeDemoLeaderboardName(raw) || String(raw ?? "").trim()).trim();
}

export function createLeaderboardController(rt) {
  const refs = () => rt.ctx.refs;

  function findDemoSelfRowIndex() {
    const rows = rt.getDemoRows();
    if (!LEADERBOARD_USE_DEMO_DATA || !rows) return -1;
    const trophy = String(rt.getLongestWord() || "").trim();
    const want = Number(rt.getScore());
    return rows.findIndex(
      (r) => leaderboardNumericScore(r) === want && String(r[3] || "").trim() === trophy
    );
  }

  function findLiveSelfRowIndex() {
    return leaderboardLiveSelfRowIndex(
      rt.getLiveLeaderboardPreviewRows?.(),
      refs().playerName.value,
      rt.getScore(),
      rt.getLongestWord()
    );
  }

  function openLeaderboardInlineNameEdit(td) {
    let rows;
    let idx;
    if (LEADERBOARD_USE_DEMO_DATA) {
      rows = rt.getDemoRows();
      idx = findDemoSelfRowIndex();
    } else {
      rows = rt.getLiveLeaderboardPreviewRows?.();
      idx = findLiveSelfRowIndex();
    }
    if (idx < 0 || !rows) return;
    const nameVal = sanitizeDemoLeaderboardName(rows[idx][0]) || "YOU";
    const row = rows[idx];
    const perfectTarget = rt.getPerfectHuntTargetSum?.() ?? null;
    const runScoreNum = Number(rt.getScore());
    const submittingSubPerfect = submittingSubPerfectFromRun(
      perfectTarget,
      runScoreNum
    );
    const { isPerfectHuntScore, isAbovePerfectHunt } = rowPerfectOverFlags(
      perfectTarget,
      row
    );

    td.textContent = "";
    td.removeAttribute("data-inline-self-name");
    td.classList.add("leaderboard-name-cell--editing-name");
    td.classList.add("leaderboard-name-cell--you-pseudo-select");
    syncLeaderboardNameCellSubPerfect(td, submittingSubPerfect);

    const input = document.createElement("input");
    input.type = "text";
    const inputClasses = ["leaderboard-inline-name-input"];
    if (submittingSubPerfect) {
      inputClasses.push("leaderboard-inline-name-input--sub-perfect");
    } else if (isPerfectHuntScore) {
      inputClasses.push("leaderboard-perfect-hunt-flash");
    } else if (isAbovePerfectHunt) {
      inputClasses.push("leaderboard-over-perfect-glow");
    } else {
      inputClasses.push("leaderboard-inline-name-input--player-gold");
    }
    input.className = inputClasses.join(" ");
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
      if (!LEADERBOARD_USE_DEMO_DATA) {
        refs().playerName.value = v;
      }
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        input.blur();
      }
    });
    input.addEventListener("blur", () => {
      const v = sanitizeDemoLeaderboardName(input.value);
      rows[idx][0] = v || "YOU";
      if (!LEADERBOARD_USE_DEMO_DATA) {
        refs().playerName.value = v || "";
      }
      renderLeaderboardTable(rows);
    });
  }

  function renderLeaderboardTable(leaderboard) {
    const { leaderboardTable, playerName } = refs();
    rt.setPlayerPosition(undefined);
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
      rt.setLiveLeaderboardPreviewRows(rows.map((r) => r.slice()));
    }
    const headerRow = document.createElement("tr");
    ["", "👤", "🏹", "🏆"].forEach((headerText) => {
      const th = document.createElement("th");
      th.textContent = headerText;
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);

    const perfectTarget = rt.getPerfectHuntTargetSum?.() ?? null;
    const runScoreNum = Number(rt.getScore());
    const submittingSubPerfect = submittingSubPerfectFromRun(
      perfectTarget,
      runScoreNum
    );
    const typedPlayerName = String(playerName.value || "").trim();
    const typedCanonical = String(
      sanitizeDemoLeaderboardName(typedPlayerName) || typedPlayerName
    ).trim();
    const previewNameKey = leaderboardPreviewNameKey(playerName.value);

    rows.forEach((row, index) => {
      let [playerRaw, rowHardFlag, , rowTrophy] = row;
      const tr = document.createElement("tr");
      let color = "white";
      const hardFlag = Number(rowHardFlag) === 1 ? 1 : 0;

      const playerStr = String(playerRaw || "").trim();
      const scoreNum = leaderboardNumericScore(row);
      const hasScore = scoreNum !== null;
      const { isPerfectHuntScore, isAbovePerfectHunt } = rowPerfectOverFlags(
        perfectTarget,
        row
      );
      const trophyStr = String(rowTrophy || "").trim();
      const trophyMatches = trophyStr === String(rt.getLongestWord() || "").trim();
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
      const isLivePreviewRunRow =
        sameScoreAndTrophyAsRun && rowPreviewNameKey === previewNameKey;
      const isLiveInlineSelfRow =
        !LEADERBOARD_USE_DEMO_DATA &&
        !rt.getLiveLeaderboardSubmitUsed() &&
        isLivePreviewRunRow;
      const isLiveSubmittedSelfRow =
        !LEADERBOARD_USE_DEMO_DATA &&
        rt.getLiveLeaderboardSubmitUsed() &&
        isLivePreviewRunRow;
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
        (LEADERBOARD_USE_DEMO_DATA || rowPreviewNameKey === previewNameKey);

      let displayPlayer = playerStr;
      if (playerStr.toLowerCase() === "doughack") {
        displayPlayer = "doug";
      }

      if (hardFlag === 1) {
        color = redTextColorLeaderboard;
      } else if (isDemoSelfRow || isLiveInlineSelfRow || isLiveSubmittedSelfRow) {
        rt.setPlayerPosition(index + 1);
        color = "white";
      } else if (playerStr.toLowerCase() === "doughack") {
        color = "magenta";
      } else if (nameMatchesHighlight) {
        rt.setPlayerPosition(index + 1);
        color = "white";
      }

      tr.style.color = color;

      const displayNameCell = displayPlayer || "";
      const displayScoreCell = scoreNum === null ? "" : String(scoreNum);
      const displayTrophyCell = isPerfectHuntScore ? "PERFECT HUNT" : trophyStr || "";
      const nameTrophyFlash = isPerfectHuntScore
        ? "perfect"
        : isAbovePerfectHunt
          ? "over"
          : null;
      const submitRowBeigeNameTrophy =
        submittingSubPerfect &&
        (isDemoSelfRow ||
          isLiveInlineSelfRow ||
          isLiveSubmittedSelfRow ||
          nameMatchesHighlight);
      const playerRowGoldNameTrophy =
        hardFlag !== 1 &&
        playerStr.toLowerCase() !== "doughack" &&
        (isDemoSelfRow ||
          isLiveInlineSelfRow ||
          isLiveSubmittedSelfRow ||
          nameMatchesHighlight) &&
        !submittingSubPerfect &&
        !nameTrophyFlash;

      const useInlineNameCell =
        (isDemoSelfRow && !rt.getDemoSubmitUsed()) || isLiveInlineSelfRow;

      const positionDisplay = `${index + 1}.`;

      [positionDisplay, displayNameCell, displayScoreCell, displayTrophyCell].forEach(
        (cellText, cellIndex) => {
          const td = document.createElement("td");
          if (cellIndex === 1 && useInlineNameCell) {
            td.dataset.inlineSelfName = "1";
            td.classList.add("leaderboard-name-cell--you-pseudo-select");
            syncLeaderboardNameCellSubPerfect(td, submittingSubPerfect);
            td.style.cursor = "pointer";
            if (submitRowBeigeNameTrophy)
              td.style.color = leaderboardSubPerfectRowColor;
            setLeaderboardCellFlash(td, displayNameCell, nameTrophyFlash);
            if (playerRowGoldNameTrophy) td.style.color = goldTextColor;
          } else if (cellIndex === 1 || cellIndex === 3) {
            if (submitRowBeigeNameTrophy)
              td.style.color = leaderboardSubPerfectRowColor;
            setLeaderboardCellFlash(td, cellText, nameTrophyFlash);
            if (playerRowGoldNameTrophy) td.style.color = goldTextColor;
          } else {
            td.textContent = cellText;
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
      : demoRunQualifiesForLeaderboard(rows, rt.getScore()) &&
        !rt.getLiveLeaderboardSubmitUsed();

    applyLeaderboardSubmitButtonVisibility({
      leaderboardUseDemoData: LEADERBOARD_USE_DEMO_DATA,
      refs: refs(),
      qualifiesForBoardSlot,
      score: rt.getScore(),
      scoreSubmitThreshold: SCORE_SUBMIT_THRESHOLD,
      liveSubmitUsed: rt.getLiveLeaderboardSubmitUsed(),
      demoSubmitUsed: rt.getDemoSubmitUsed(),
    });
  }

  function finalizeDemoLeaderboardSubmit() {
    const rows = rt.getDemoRows();
    if (!LEADERBOARD_USE_DEMO_DATA || rt.getDemoSubmitUsed()) return;
    if (Number(rt.getScore()) <= 0) return;
    const idx = findDemoSelfRowIndex();
    if (idx < 0 || !rows) return;
    rt.playSound("submit", rt.getIsMuted());
    const { leaderboardTable } = refs();
    const input = leaderboardTable.querySelector(".leaderboard-inline-name-input");
    let name;
    if (input) {
      name = sanitizeDemoLeaderboardName(input.value) || "YOU";
    } else {
      name = sanitizeDemoLeaderboardName(rows[idx][0]) || "YOU";
    }
    rows[idx][0] = name;
    rt.setDemoSubmitUsed(true);
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
    const t1 = rt.getPostgameCopyScoreTimer();
    if (t1 !== null) {
      window.clearTimeout(t1);
      rt.setPostgameCopyScoreTimer(null);
    }
    const t2 = rt.getLeaderboardFadeOutTimer();
    if (t2 !== null) {
      window.clearTimeout(t2);
      rt.setLeaderboardFadeOutTimer(null);
    }
    refs().leaderboardElements.classList.remove("leaderboard-elements--visible");
    finalizePostgameLeaderboardOverlayHidden();
  }

  function beginPostgameLeaderboardOverlayFadeOut() {
    const t1 = rt.getPostgameCopyScoreTimer();
    if (t1 !== null) {
      window.clearTimeout(t1);
      rt.setPostgameCopyScoreTimer(null);
    }
    const t2 = rt.getLeaderboardFadeOutTimer();
    if (t2 !== null) {
      window.clearTimeout(t2);
      rt.setLeaderboardFadeOutTimer(null);
    }
    const { leaderboardElements } = refs();
    if (!leaderboardElements.classList.contains("leaderboard-elements--visible")) {
      return false;
    }
    leaderboardElements.classList.remove("leaderboard-elements--visible");
    rt.setLeaderboardFadeOutTimer(
      window.setTimeout(() => {
        rt.setLeaderboardFadeOutTimer(null);
        finalizePostgameLeaderboardOverlayHidden();
      }, LEADERBOARD_OVERLAY_FADE_OUT_TOTAL_MS)
    );
    return true;
  }

  function revealPostGameCopyScoreLine() {
    clearWordLineTimers(rt.ctx);
    refs().currentWordElement.classList.remove("current-word--valid-solve");
    rt.setEndgameUiShown(true);
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
        rt.getLiveLeaderboardPreviewRows?.(),
        playerName.value,
        rt.getScore(),
        rt.getLongestWord()
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
      longestWord: rt.getLongestWord(),
      scoreThreshold: SCORE_SUBMIT_THRESHOLD,
      useDemoData: LEADERBOARD_USE_DEMO_DATA,
      liveSubmitUsed: rt.getLiveLeaderboardSubmitUsed(),
    };
    let tableRows;
    let committed = false;

    try {
      try {
        const requestURL = `${rt.leaderboardLink}${rt.getLeaderboardPuzzleId()}`;
        const requestOptions = {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        };
        if (canPost) {
          const postBody = {
            player: nameTrim,
            score: rt.getScore(),
            trophy: rt.getLongestWord(),
          };
          if (LEADERBOARD_SUBMIT_SCORE_VALIDATION) {
            postBody.scoreValidation = rt.getScoreValidationTurns();
          }
          requestOptions.method = "POST";
          requestOptions.body = JSON.stringify(postBody);
        }

        const response = await fetch(requestURL, requestOptions);
        let raw = {};
        try {
          raw = await response.json();
        } catch {}
        ({ tableRows, committed } = deriveLiveLeaderboardAfterFetch(
          { ok: response.ok, status: response.status, raw },
          deriveInput
        ));
      } catch (err) {
        leaderboardDebugWarn(err);
        ({ tableRows, committed } = deriveLiveLeaderboardAfterFetch(
          { ok: false, status: 0, raw: {} },
          deriveInput
        ));
      }

      if (committed) {
        rt.playSound("submit", rt.getIsMuted());
        rt.setLiveLeaderboardSubmitUsed(true);
        playerName.value = nameTrim;
      } else if (clicked) {
        rt.playSound("click", rt.getIsMuted());
      }

      if (
        !LEADERBOARD_USE_DEMO_DATA &&
        Array.isArray(tableRows) &&
        tableRows.length === 0 &&
        rt.getLiveLeaderboardSubmitUsed()
      ) {
        const prev = rt.getLiveLeaderboardPreviewRows?.();
        if (prev?.length) {
          tableRows = prev.map((r) => r.slice());
        }
      }

      renderLeaderboardTable(tableRows);
    } finally {
      if (clicked) {
        playerName.disabled = false;
        if (rt.getLiveLeaderboardSubmitUsed()) {
          leaderboardButton.disabled = true;
          leaderboardButton.style.backgroundColor = "rgba(95, 95, 95, 0.92)";
        } else {
          leaderboardButton.disabled = false;
          leaderboardButton.style.removeProperty("background-color");
        }
      }
    }
  }

  function maybeShowPostGameUi() {
    if (!rt.getEndgamePostUiReady() || rt.getEndgameUiShown()) return;
    if (rt.getPostgameSequenceStarted()) return;
    rt.setPostgameSequenceStarted(true);

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
          rows = mergeDemoRunIntoTop10([], "YOU", run, rt.getLongestWord() || "");
        }
        rt.setDemoRows(rows);
        renderLeaderboardTable(rows);
      } else {
        const base = buildDemoLeaderboardRows();
        if (demoRunQualifiesForLeaderboard(base, rt.getScore())) {
          rt.setDemoRows(
            mergeDemoRunIntoTop10(base, "YOU", rt.getScore(), rt.getLongestWord() || "")
          );
        } else {
          rt.setDemoRows(base);
        }
        const rows = rt.getDemoRows();
        if (rows) renderLeaderboardTable(rows);
      }
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          leaderboardElements.classList.add("leaderboard-elements--visible");
        });
      });
      rt.setPostgameCopyScoreTimer(
        window.setTimeout(() => {
          rt.setPostgameCopyScoreTimer(null);
          revealPostGameCopyScoreLine();
        }, DEFAULT_COPY_SCORE_AFTER_OVERLAY_MS)
      );
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
      rt.setPostgameCopyScoreTimer(
        window.setTimeout(() => {
          rt.setPostgameCopyScoreTimer(null);
          revealPostGameCopyScoreLine();
        }, DEFAULT_COPY_SCORE_AFTER_OVERLAY_MS)
      );
    })();
  }

  async function getLeaderboard(clicked = false) {
    if (LEADERBOARD_USE_DEMO_DATA) {
      if (clicked) {
        void unlockGameAudio();
        rt.playSound("click", rt.getIsMuted());
      }
      const cur = rt.getDemoRows();
      const fallback = LEADERBOARD_DEMO_EMPTY_BOARD ? [] : buildDemoLeaderboardRows();
      rt.setDemoRows(cur != null ? cur : fallback);
      const rows = rt.getDemoRows();
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
