import { LB_SELF_ROW_FG, LB_TABLE_DEFAULT_FG } from "./leaderboard-row-view-model.js";
import {
  setLeaderboardCellFlash,
  syncLeaderboardNameCellSubPerfect,
} from "./leaderboard-ui-helpers.js";

export function renderLeaderboardTableDom(
  table,
  viewModels,
  { document: doc = document } = {}
) {
  table.innerHTML = "";
  const thead = doc.createElement("thead");
  const tbody = doc.createElement("tbody");

  const headerRow = doc.createElement("tr");
  ["", "👤", "🏹", "🏆"].forEach((headerText) => {
    const th = doc.createElement("th");
    th.textContent = headerText;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);

  viewModels.forEach((vm) => {
    const tr = doc.createElement("tr");
    tr.style.color = vm.rowColor;

    [
      vm.positionDisplay,
      vm.displayNameCell,
      vm.displayScoreCell,
      vm.displayTrophyCell,
    ].forEach((cellText, cellIndex) => {
      const td = doc.createElement("td");
      if (cellIndex === 0) {
        td.textContent = cellText;
        td.style.color = vm.highlightSelfRow ? LB_SELF_ROW_FG : LB_TABLE_DEFAULT_FG;
      } else if (cellIndex === 1 && vm.useInlineNameCell) {
        td.dataset.inlineSelfName = "1";
        td.classList.add("leaderboard-name-cell--you-pseudo-select");
        syncLeaderboardNameCellSubPerfect(td, true);
        td.style.cursor = "pointer";
        if (vm.highlightSelfRow) {
          td.style.color = LB_SELF_ROW_FG;
        }
        td.textContent = cellText;
      } else if (cellIndex === 1 || cellIndex === 2) {
        if (vm.highlightSelfRow) {
          td.style.color = LB_SELF_ROW_FG;
        }
        td.textContent = cellText;
      } else {
        setLeaderboardCellFlash(td, cellText, vm.nameTrophyFlash);
        if (vm.highlightSelfRow && String(cellText).trim() !== "") {
          td.style.color = LB_SELF_ROW_FG;
        }
      }
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });

  if (viewModels.length > 0) {
    tbody.style.setProperty("--lb-rows", String(viewModels.length));
  }

  table.appendChild(thead);
  table.appendChild(tbody);
}

export { LB_SELF_ROW_FG, LB_TABLE_DEFAULT_FG };
