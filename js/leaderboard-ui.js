import {
  LEADERBOARD_USE_DEMO_DATA,
  LEADERBOARD_SUBMIT_SCORE_VALIDATION,
  LEADERBOARD_DEMO_INJECT_PERFECT_HUNT_ROW,
  LEADERBOARD_DEMO_INJECT_OVER_PERFECT_HUNT_ROW,
  LEADERBOARD_DEMO_OVER_PERFECT_SCORE_EXTRA,
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
  buildDemoLeaderboardRows,
  demoRunQualifiesForLeaderboard,
  mergeDemoRunIntoTop10,
  sanitizeDemoLeaderboardName,
} from "./leaderboard-lifecycle.js";
import { clearWordLineTimers, fadeInCurrentWordLine } from "./ui-word-line.js";
import { unlockGameAudio } from "./audio.js";

function normalizeLeaderboardRow(row) {
  if (!Array.isArray(row)) return ["", 0, "", ""];
  if (row.length >= 4) {
    return [
      String(row[0] ?? ""),
      Number(row[1]) === 1 ? 1 : 0,
      row[2],
      String(row[3] ?? ""),
    ];
  }
  if (row.length >= 3) {
    return [String(row[0] ?? ""), 0, row[1], String(row[2] ?? "")];
  }
  return ["", 0, "", ""];
}

function normalizeLeaderboardRows(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeLeaderboardRow);
}

function parsedFetchPayload(raw) {
  if (raw == null || typeof raw !== "object" || !("body" in raw)) return raw;
  const b = raw.body;
  if (typeof b === "string") {
    try {
      return JSON.parse(b);
    } catch {
      return {};
    }
  }
  return b ?? {};
}

function leaderboardRowsFromResponse(response, payload, didSubmit) {
  if (!response.ok) {
    if (
      didSubmit &&
      payload &&
      typeof payload === "object" &&
      Array.isArray(payload.top_10)
    ) {
      return payload.top_10;
    }
    console.error("Leaderboard request failed", response.status, payload);
    return [];
  }
  if (didSubmit) {
    return payload && typeof payload === "object" && Array.isArray(payload.top_10)
      ? payload.top_10
      : [];
  }
  return Array.isArray(payload) ? payload : [];
}

function leaderboardNumericScore(row) {
  const raw = row[2];
  if (raw === "" || raw === null || raw === undefined || Number.isNaN(Number(raw))) {
    return null;
  }
  return Number(raw);
}

function setLeaderboardCellFlash(td, text, kind) {
  const cls =
    kind === "perfect"
      ? "leaderboard-perfect-hunt-flash"
      : kind === "over"
        ? "leaderboard-over-perfect-glow"
        : null;
  if (cls) {
    const span = document.createElement("span");
    span.className = cls;
    span.textContent = text;
    td.appendChild(span);
    return;
  }
  td.textContent = text;
}

export function createLeaderboardController(rt) {
  const refs = () => rt.ctx.refs;

  function isRunSubmittingSubPerfect() {
    const cap = rt.getPerfectHuntTargetSum?.() ?? null;
    const run = Number(rt.getScore());
    return cap != null && Number.isFinite(cap) && Number.isFinite(run) && run < cap;
  }

  function syncDemoSelfPseudoSelectSubPerfect(td, subPerfect) {
    td.classList.toggle(
      "leaderboard-name-cell--you-pseudo-select--sub-perfect",
      subPerfect
    );
  }

  function findDemoSelfRowIndex() {
    const rows = rt.getDemoRows();
    if (!LEADERBOARD_USE_DEMO_DATA || !rows) return -1;
    const trophy = String(rt.getLongestWord() || "").trim();
    const want = rt.getScore();
    return rows.findIndex(
      (r) => leaderboardNumericScore(r) === want && String(r[3] || "").trim() === trophy
    );
  }

  function openDemoLeaderboardInlineNameEdit(td) {
    const rows = rt.getDemoRows();
    const idx = findDemoSelfRowIndex();
    if (idx < 0 || !rows) return;
    const nameVal = sanitizeDemoLeaderboardName(rows[idx][0]) || "YOU";
    td.textContent = "";
    td.removeAttribute("data-demo-self-name");
    td.classList.remove(
      "leaderboard-name-cell--you-pseudo-select",
      "leaderboard-name-cell--you-pseudo-select--sub-perfect"
    );
    const input = document.createElement("input");
    input.type = "text";
    input.className = "leaderboard-inline-name-input";
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
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        input.blur();
      }
    });
    input.addEventListener("blur", () => {
      const v = sanitizeDemoLeaderboardName(input.value);
      const stored = v || "YOU";
      rows[idx][0] = stored;
      td.innerHTML = "";
      td.textContent = stored.toLowerCase() === "doughack" ? "doug" : stored;
      td.dataset.demoSelfName = "1";
      td.classList.add("leaderboard-name-cell--you-pseudo-select");
      syncDemoSelfPseudoSelectSubPerfect(td, isRunSubmittingSubPerfect());
    });
  }

  function applyLeaderboardSubmitButtonVisibility(rows) {
    const { leaderboardButton, leaderboardDemoAdd, playerName } = refs();
    let qualifies;
    if (LEADERBOARD_USE_DEMO_DATA) {
      qualifies = demoRunQualifiesForLeaderboard(
        buildDemoLeaderboardRows(),
        rt.getScore()
      );
    } else {
      const playerHasScore = Number(rt.getScore()) > 0;
      qualifies = playerHasScore;
      if (qualifies && rows && rows.length >= 10) {
        const tenthNum = leaderboardNumericScore(rows[9]);
        if (tenthNum != null && tenthNum > 0) {
          qualifies = rt.getScore() > tenthNum;
        }
      }
    }

    if (LEADERBOARD_USE_DEMO_DATA) {
      leaderboardButton.classList.add("hiddenDisplay");
      leaderboardButton.classList.add("leaderboard-action--concealed");
      if (leaderboardDemoAdd) {
        if (rt.getDemoSubmitUsed()) {
          leaderboardDemoAdd.classList.remove("leaderboard-demo-add--eligible");
          leaderboardDemoAdd.classList.remove("leaderboard-demo-add--spent");
          leaderboardDemoAdd.disabled = true;
          leaderboardDemoAdd.classList.add("hiddenDisplay");
          leaderboardDemoAdd.classList.add("leaderboard-action--concealed");
          return;
        }

        leaderboardDemoAdd.classList.remove("hiddenDisplay");
        leaderboardDemoAdd.classList.remove("leaderboard-action--concealed");
        leaderboardDemoAdd.disabled = false;
        leaderboardDemoAdd.classList.remove("leaderboard-demo-add--spent");
        leaderboardDemoAdd.classList.remove("leaderboard-demo-add--eligible");

        if (qualifies) {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              leaderboardDemoAdd.classList.add("leaderboard-demo-add--eligible");
            });
          });
        }
      }
      return;
    }

    if (leaderboardDemoAdd) {
      leaderboardDemoAdd.classList.remove("leaderboard-demo-add--eligible");
      leaderboardDemoAdd.classList.remove("leaderboard-demo-add--spent");
      leaderboardDemoAdd.disabled = false;
      leaderboardDemoAdd.classList.add("hiddenDisplay");
    }
    leaderboardButton.classList.remove("hiddenDisplay");
    leaderboardButton.classList.toggle("leaderboard-action--concealed", !qualifies);
  }

  function mergeDemoLeaderboardPreviewRows(leaderboard) {
    if (!LEADERBOARD_USE_DEMO_DATA) return leaderboard;
    const target = rt.getPerfectHuntTargetSum?.() ?? null;
    if (target == null || !Number.isFinite(target)) return leaderboard;
    let rows = leaderboard;
    if (LEADERBOARD_DEMO_INJECT_PERFECT_HUNT_ROW) {
      const hasPerfect = rows.some(
        (r) =>
          String(r[0] || "")
            .trim()
            .toUpperCase() === "PERFECT" &&
          Number(r[2]) === target &&
          String(r[3] || "")
            .trim()
            .toUpperCase() === "PERFECT HUNT"
      );
      if (!hasPerfect) {
        rows = mergeDemoRunIntoTop10(rows, "PERFECT", target, "PERFECT HUNT");
      }
    }
    if (LEADERBOARD_DEMO_INJECT_OVER_PERFECT_HUNT_ROW) {
      const extra = Math.max(1, Number(LEADERBOARD_DEMO_OVER_PERFECT_SCORE_EXTRA) || 1);
      const overScore = target + extra;
      const hasOver = rows.some((r) => {
        const n = leaderboardNumericScore(r);
        return (
          n != null &&
          n > target &&
          String(r[0] || "")
            .trim()
            .toUpperCase() === "TOOHIGH"
        );
      });
      if (!hasOver) {
        rows = mergeDemoRunIntoTop10(rows, "TOOHIGH", overScore, "HOW??");
      }
    }
    return rows;
  }

  function renderLeaderboardTable(leaderboard) {
    const { leaderboardTable, playerName } = refs();
    rt.setPlayerPosition(undefined);
    leaderboardTable.innerHTML = "";
    const tbody = document.createElement("tbody");

    const rows = mergeDemoLeaderboardPreviewRows(
      normalizeLeaderboardRows(Array.isArray(leaderboard) ? leaderboard : [])
    );
    const headerRow = document.createElement("tr");
    ["", "👤", "🏹", "🏆"].forEach((headerText) => {
      const th = document.createElement("th");
      th.textContent = headerText;
      headerRow.appendChild(th);
    });
    headerRow.style.backgroundColor = "black";
    headerRow.style.color = "white";
    tbody.appendChild(headerRow);

    const perfectTarget = rt.getPerfectHuntTargetSum?.() ?? null;
    const runScoreNum = Number(rt.getScore());
    const submittingSubPerfect =
      perfectTarget != null &&
      Number.isFinite(perfectTarget) &&
      Number.isFinite(runScoreNum) &&
      runScoreNum < perfectTarget;
    const typedPlayerName = String(playerName.value || "").trim();

    rows.forEach((row, index) => {
      let [playerRaw, rowHardFlag, , rowTrophy] = row;
      const tr = document.createElement("tr");
      let color = "white";
      const hardFlag = Number(rowHardFlag) === 1 ? 1 : 0;

      const playerStr = String(playerRaw || "").trim();
      const scoreNum = leaderboardNumericScore(row);
      const hasScore = scoreNum !== null;
      const trophyStr = String(rowTrophy || "").trim();
      const trophyMatches = trophyStr === String(rt.getLongestWord() || "").trim();
      const isDemoSelfRow =
        LEADERBOARD_USE_DEMO_DATA &&
        hasScore &&
        Number.isFinite(runScoreNum) &&
        scoreNum === runScoreNum &&
        trophyMatches;
      const nameMatches = Boolean(playerStr) && playerStr === typedPlayerName;
      const scoreMatches =
        scoreNum !== null && Number.isFinite(runScoreNum) && scoreNum === runScoreNum;
      const isPerfectHuntScore =
        perfectTarget != null && hasScore && scoreNum === perfectTarget;
      const isAbovePerfectHunt =
        perfectTarget != null && hasScore && scoreNum > perfectTarget;

      let displayPlayer = playerStr;
      if (playerStr.toLowerCase() === "doughack") {
        displayPlayer = "doug";
      }

      if (hardFlag === 1) {
        color = redTextColorLeaderboard;
      } else if (isDemoSelfRow) {
        rt.setPlayerPosition(index + 1);
        color = submittingSubPerfect ? "white" : goldTextColor;
      } else if (playerStr.toLowerCase() === "doughack") {
        color = "magenta";
      } else if (nameMatches && scoreMatches && trophyMatches) {
        rt.setPlayerPosition(index + 1);
        color = submittingSubPerfect ? "white" : goldTextColor;
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
        (isDemoSelfRow || (nameMatches && scoreMatches && trophyMatches));

      const positionDisplay = `${index + 1}.`;

      [positionDisplay, displayNameCell, displayScoreCell, displayTrophyCell].forEach(
        (cellText, cellIndex) => {
          const td = document.createElement("td");
          if (cellIndex === 1 && isDemoSelfRow && !rt.getDemoSubmitUsed()) {
            td.dataset.demoSelfName = "1";
            td.classList.add("leaderboard-name-cell--you-pseudo-select");
            syncDemoSelfPseudoSelectSubPerfect(td, submittingSubPerfect);
            td.style.cursor = "pointer";
            if (submitRowBeigeNameTrophy)
              td.style.color = leaderboardSubPerfectRowColor;
            setLeaderboardCellFlash(td, displayNameCell, nameTrophyFlash);
          } else if (cellIndex === 1 || cellIndex === 3) {
            if (submitRowBeigeNameTrophy)
              td.style.color = leaderboardSubPerfectRowColor;
            setLeaderboardCellFlash(td, cellText, nameTrophyFlash);
          } else {
            td.textContent = cellText;
          }

          tr.appendChild(td);
        }
      );
      tbody.appendChild(tr);
    });

    leaderboardTable.appendChild(tbody);
    applyLeaderboardSubmitButtonVisibility(rows);
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
    const { playerName, leaderboardButton } = refs();
    playerName.classList.add("hiddenDisplay");
    leaderboardButton.classList.add("hiddenDisplay");
    leaderboardButton.classList.add("leaderboard-action--concealed");
  }

  async function refreshLeaderboardFromApi(clicked) {
    const { playerName, leaderboardButton } = refs();
    if (clicked) {
      rt.playSound("click", rt.getIsMuted());
      playerName.disabled = true;
      leaderboardButton.disabled = true;
      leaderboardButton.style.backgroundColor = "gray";
    }

    try {
      const requestURL = `${rt.leaderboardLink}${rt.getLeaderboardPuzzleId()}`;
      const requestOptions = {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      };

      const willSubmit =
        rt.getScore() > SCORE_SUBMIT_THRESHOLD && playerName.value !== "";
      if (willSubmit) {
        const postBody = {
          player: playerName.value,
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
      const payload = parsedFetchPayload(raw);
      const leaderboard = leaderboardRowsFromResponse(response, payload, willSubmit);

      if (willSubmit && response.ok) {
        rt.playSound("submit", rt.getIsMuted());
      }

      renderLeaderboardTable(leaderboard);
    } finally {
      if (clicked) {
        playerName.disabled = false;
        leaderboardButton.disabled = false;
        leaderboardButton.style.backgroundColor = "";
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
        console.error(err);
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
      rt.setDemoRows(cur || buildDemoLeaderboardRows());
      const rows = rt.getDemoRows();
      if (rows) renderLeaderboardTable(rows);
      return;
    }
    await refreshLeaderboardFromApi(clicked);
  }

  return {
    findDemoSelfRowIndex,
    openDemoLeaderboardInlineNameEdit,
    applyLeaderboardSubmitButtonVisibility,
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
