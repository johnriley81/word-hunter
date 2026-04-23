import {
  LEADERBOARD_USE_DEMO_DATA,
  DEMO_LEADERBOARD_NAME_MAX,
  LEADERBOARD_POSTGAME_FADE_MS,
  LEADERBOARD_OVERLAY_FADE_SETTLE_MS,
  LEADERBOARD_COPY_SCORE_AFTER_OVERLAY_FADE_MS,
  SCORE_SUBMIT_THRESHOLD,
  happyHuntingColor,
  goldTextColor,
  redTextColorLeaderboard,
} from "./config.js";
import {
  buildDemoLeaderboardRows,
  demoRunQualifiesForLeaderboard,
  mergeDemoRunIntoTop10,
  sanitizeDemoLeaderboardName,
} from "./leaderboard-lifecycle.js";
import { clearWordLineTimers, fadeInCurrentWordLine } from "./ui-word-line.js";

export function createLeaderboardController(rt) {
  const refs = () => rt.ctx.refs;

  function findDemoSelfRowIndex() {
    const rows = rt.getDemoRows();
    if (!LEADERBOARD_USE_DEMO_DATA || !rows) return -1;
    const trophy = String(rt.getLongestWord() || "").trim();
    return rows.findIndex(
      (r) =>
        Number(r[2]) === rt.getScore() && String(r[3] || "").trim() === trophy
    );
  }

  function openDemoLeaderboardInlineNameEdit(td) {
    const rows = rt.getDemoRows();
    const idx = findDemoSelfRowIndex();
    if (idx < 0 || !rows) return;
    const nameVal = sanitizeDemoLeaderboardName(rows[idx][0]) || "YOU";
    td.textContent = "";
    td.removeAttribute("data-demo-self-name");
    td.classList.remove("leaderboard-name-cell--you-pseudo-select");
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
    });
  }

  function applyLeaderboardSubmitButtonVisibility(rows) {
    const {
      leaderboardButton,
      leaderboardDemoAdd,
      playerName,
    } = refs();
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
        const raw = rows[9][2];
        const tenthNum = Number(raw);
        const tenthSlotOccupied =
          raw !== "" &&
          raw !== null &&
          raw !== undefined &&
          !Number.isNaN(tenthNum) &&
          tenthNum > 0;
        if (tenthSlotOccupied) {
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
    leaderboardButton.classList.toggle(
      "leaderboard-action--concealed",
      !qualifies
    );
  }

  function renderLeaderboardTable(leaderboard) {
    const {
      leaderboardTable,
      playerName,
    } = refs();
    rt.setPlayerPosition(undefined);
    leaderboardTable.innerHTML = "";
    const tbody = document.createElement("tbody");

    const headerRow = document.createElement("tr");
    ["", "👤", "🏹", "🏆"].forEach((headerText) => {
      const th = document.createElement("th");
      th.textContent = headerText;
      headerRow.appendChild(th);
    });
    headerRow.style.backgroundColor = "black";
    headerRow.style.color = "white";
    tbody.appendChild(headerRow);

    leaderboard.forEach((row, index) => {
      let [playerRaw, rowHardFlag, rowScore, rowTrophy] = row;
      const tr = document.createElement("tr");
      let color = "white";
      const hardFlag = Number(rowHardFlag) === 1 ? 1 : 0;

      const playerStr = String(playerRaw || "").trim();
      const hasScore =
        rowScore !== "" &&
        rowScore !== null &&
        rowScore !== undefined &&
        !Number.isNaN(Number(rowScore));
      const scoreNum = hasScore ? Number(rowScore) : null;
      const trophyStr = String(rowTrophy || "").trim();
      const trophyMatches =
        trophyStr === String(rt.getLongestWord() || "").trim();
      const isDemoSelfRow =
        LEADERBOARD_USE_DEMO_DATA &&
        hasScore &&
        scoreNum === rt.getScore() &&
        trophyMatches;

      let displayPlayer = playerStr;
      if (playerStr.toLowerCase() === "doughack") {
        displayPlayer = "doug";
      }

      if (hardFlag === 1) {
        color = redTextColorLeaderboard;
      } else if (isDemoSelfRow) {
        rt.setPlayerPosition(index + 1);
        color = goldTextColor;
      } else if (playerStr.toLowerCase() === "doughack") {
        color = "magenta";
      } else {
        const nameMatches =
          playerStr && playerStr === String(playerName.value || "").trim();
        const scoreMatches = scoreNum !== null && scoreNum === rt.getScore();
        if (nameMatches && scoreMatches && trophyMatches) {
          rt.setPlayerPosition(index + 1);
          color = goldTextColor;
        }
      }

      tr.style.color = color;

      const displayNameCell = displayPlayer || "";
      const displayScoreCell = scoreNum === null ? "" : String(scoreNum);
      const displayTrophyCell = trophyStr || "";

      const positionDisplay = `${index + 1}.`;

      [
        positionDisplay,
        displayNameCell,
        displayScoreCell,
        displayTrophyCell,
      ].forEach((cellText, cellIndex) => {
        const td = document.createElement("td");
        if (
          cellIndex === 1 &&
          isDemoSelfRow &&
          !rt.getDemoSubmitUsed()
        ) {
          td.textContent = displayNameCell;
          td.dataset.demoSelfName = "1";
          td.classList.add("leaderboard-name-cell--you-pseudo-select");
          td.style.cursor = "pointer";
        } else {
          td.textContent = cellText;
        }

        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });

    leaderboardTable.appendChild(tbody);
    applyLeaderboardSubmitButtonVisibility(leaderboard);
  }

  function finalizeDemoLeaderboardSubmit() {
    const rows = rt.getDemoRows();
    if (!LEADERBOARD_USE_DEMO_DATA || rt.getDemoSubmitUsed()) return;
    if (Number(rt.getScore()) <= 0) return;
    const idx = findDemoSelfRowIndex();
    if (idx < 0 || !rows) return;
    rt.playSound("submit", rt.getIsMuted());
    const { leaderboardTable } = refs();
    const input = leaderboardTable.querySelector(
      ".leaderboard-inline-name-input"
    );
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
    refs().leaderboardElements.classList.remove(
      "leaderboard-elements--visible"
    );
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
      }, LEADERBOARD_POSTGAME_FADE_MS + LEADERBOARD_OVERLAY_FADE_SETTLE_MS)
    );
    return true;
  }

  function revealPostGameCopyScoreLine() {
    clearWordLineTimers(rt.ctx);
    refs().currentWordElement.classList.remove("current-word--valid-solve");
    rt.setEndgameUiShown(true);
    fadeInCurrentWordLine(rt.ctx, "Copy Score", happyHuntingColor, {});
    rt.updateNextLetters();
    const { playerName, leaderboardButton } = refs();
    playerName.classList.add("hiddenDisplay");
    leaderboardButton.classList.add("hiddenDisplay");
    leaderboardButton.classList.add("leaderboard-action--concealed");
  }

  async function refreshLeaderboardFromApi(clicked) {
    const {
      playerName,
      leaderboardButton,
    } = refs();
    if (clicked) {
      rt.playSound("click", rt.getIsMuted());
      playerName.disabled = true;
      leaderboardButton.disabled = true;
      leaderboardButton.style.backgroundColor = "gray";
    }

    const requestURL = `${rt.leaderboardLink}${rt.getDiffDays()}`;
    const requestOptions = {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    };

    const willSubmit =
      rt.getScore() > SCORE_SUBMIT_THRESHOLD && playerName.value !== "";
    if (willSubmit) {
      requestOptions.method = "POST";
      requestOptions.body = JSON.stringify({
        player: playerName.value,
        hard: false,
        score: rt.getScore(),
        trophy: rt.getLongestWord(),
      });
    }

    const response = await fetch(requestURL, requestOptions);
    if (willSubmit && response.ok) {
      rt.playSound("submit", rt.getIsMuted());
    }
    const data = await response.json();
    const parsedBody = JSON.parse(data["body"]);
    const leaderboard =
      rt.getScore() > SCORE_SUBMIT_THRESHOLD && playerName.value !== ""
        ? parsedBody.top_10
        : parsedBody;

    renderLeaderboardTable(leaderboard);
  }

  function maybeShowPostGameUi() {
    if (!rt.getEndgamePostUiReady() || rt.getEndgameUiShown()) return;
    if (rt.getPostgameSequenceStarted()) return;
    rt.setPostgameSequenceStarted(true);

    const {
      leaderboardElements,
      leaderboardTable,
      leaderboardDemoAdd,
    } = refs();
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
        }, LEADERBOARD_COPY_SCORE_AFTER_OVERLAY_FADE_MS)
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
        }, LEADERBOARD_COPY_SCORE_AFTER_OVERLAY_FADE_MS)
      );
    })();
  }

  async function getLeaderboard(clicked = false) {
    if (LEADERBOARD_USE_DEMO_DATA) {
      if (clicked) {
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
