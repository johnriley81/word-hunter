import test from "node:test";
import assert from "node:assert/strict";
import { LEADERBOARD_META_LIVE_PREVIEW } from "../js/leaderboard-api.js";
import { normalizeLeaderboardRows } from "../js/leaderboard-api.js";
import { sanitizeLeaderboardName } from "../js/leaderboard-lifecycle.js";
import {
  buildLeaderboardRowViewModels,
  createLeaderboardRowRenderContext,
} from "../js/leaderboard-row-view-model.js";
import {
  renderLeaderboardTableDom,
  LB_SELF_ROW_FG,
} from "../js/leaderboard-table-render.js";
import {
  LEADERBOARD_SUBMIT_BUTTON_LABEL,
  applyLeaderboardSubmitButtonVisibility,
} from "../js/leaderboard-ui-submit-visibility.js";

function createClassList() {
  const set = new Set();
  const list = {
    _set: set,
    add(...classes) {
      for (const c of classes) set.add(c);
    },
    remove(...classes) {
      for (const c of classes) set.delete(c);
    },
    toggle(c, on) {
      if (on) set.add(c);
      else set.delete(c);
    },
    contains(c) {
      return set.has(c);
    },
  };
  return list;
}

function installMinimalDom() {
  if (globalThis.document?.createElement) return globalThis.document;

  function makeElement(tag) {
    const classList = createClassList();
    const el = {
      tagName: tag.toUpperCase(),
      children: [],
      attributes: new Map(),
      classList,
      get className() {
        return [...(classList._set ?? classList)].join(" ");
      },
      set className(value) {
        const set = classList._set ?? (classList._set = new Set());
        set.clear();
        for (const part of String(value || "").split(/\s+/)) {
          if (part) set.add(part);
        }
      },
      style: {
        setProperty(name, value) {
          this[name] = value;
        },
      },
      dataset: {},
      textContent: "",
      innerHTML: "",
      appendChild(child) {
        this.children.push(child);
        child.parentElement = this;
      },
      removeAttribute(name) {
        this.attributes.delete(name);
        delete this.dataset[name === "data-inline-self-name" ? "inlineSelfName" : name];
      },
      setAttribute(name, value) {
        this.attributes.set(name, value);
        if (name.startsWith("data-")) {
          const key = name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
          this.dataset[key] = value;
        }
      },
      getAttribute(name) {
        return this.attributes.get(name) ?? null;
      },
      querySelector() {
        return null;
      },
      closest() {
        return null;
      },
    };
    return el;
  }

  const doc = {
    createElement(tag) {
      return makeElement(tag);
    },
    createTextNode(text) {
      return { nodeType: 3, textContent: String(text) };
    },
  };
  globalThis.document = doc;
  return doc;
}

function renderRows(rows, ctxInput) {
  const doc = installMinimalDom();
  const table = doc.createElement("table");
  const renderCtx = createLeaderboardRowRenderContext(ctxInput);
  const { viewModels, playerPosition } = buildLeaderboardRowViewModels(rows, renderCtx);
  renderLeaderboardTableDom(table, viewModels, { document: doc });
  return { table, viewModels, playerPosition, doc };
}

function tableBodyRows(table) {
  const tbody = table.children.find((c) => c.tagName === "TBODY");
  return tbody?.children ?? [];
}

function cellText(td) {
  if (td.children?.length) {
    return td.children.map((c) => c.textContent ?? "").join("");
  }
  return td.textContent ?? "";
}

test("buildLeaderboardRowViewModels: live preview row carries meta flag", () => {
  const rows = normalizeLeaderboardRows([
    ["ALICE", 0, 120, "STAR"],
    ["BOB", 0, 88, "MOON", LEADERBOARD_META_LIVE_PREVIEW],
  ]);
  const { viewModels } = buildLeaderboardRowViewModels(
    rows,
    createLeaderboardRowRenderContext({
      useDemoData: false,
      demoSubmitUsed: false,
      turnSpent: false,
      typedPlayerName: "Bob",
      runScore: 88,
      runTrophyWord: "MOON",
      perfectTarget: null,
    })
  );
  const preview = viewModels.find((vm) => vm.isLiveCurrentRunPreviewRow);
  assert.ok(preview);
  assert.equal(preview.displayNameCell, "BOB");
  assert.equal(preview.displayScoreCell, "88");
  assert.equal(preview.useInlineNameCell, true);
});

test("renderLeaderboardTableDom: self row uses highlight color on name cell", () => {
  const rows = normalizeLeaderboardRows([
    ["ADA", 0, 150, "QUARTZ"],
    ["BOB", 0, 88, "MOON", LEADERBOARD_META_LIVE_PREVIEW],
  ]);
  const { table, viewModels } = renderRows(rows, {
    useDemoData: false,
    demoSubmitUsed: false,
    turnSpent: false,
    typedPlayerName: "Bob",
    runScore: 88,
    runTrophyWord: "MOON",
    perfectTarget: null,
  });
  const previewVm = viewModels.find((vm) => vm.isLiveCurrentRunPreviewRow);
  assert.ok(previewVm?.highlightSelfRow);
  const bodyRows = tableBodyRows(table);
  const previewTr = bodyRows[previewVm.index];
  const nameTd = previewTr.children[1];
  assert.equal(nameTd.style.color, LB_SELF_ROW_FG);
  assert.equal(nameTd.dataset.inlineSelfName, "1");
});

test("sanitizeLeaderboardName strips non-letters from display context", () => {
  assert.equal(sanitizeLeaderboardName("a-da!2"), "ADA");
  assert.equal(sanitizeLeaderboardName("123"), "");
});

test("buildLeaderboardRowViewModels: prohibited punctuation removed from typed match key", () => {
  const rows = normalizeLeaderboardRows([
    ["ADA", 0, 88, "STAR", LEADERBOARD_META_LIVE_PREVIEW],
  ]);
  const { viewModels } = buildLeaderboardRowViewModels(
    rows,
    createLeaderboardRowRenderContext({
      useDemoData: false,
      demoSubmitUsed: false,
      turnSpent: false,
      typedPlayerName: "A-Da!",
      runScore: 88,
      runTrophyWord: "STAR",
      perfectTarget: null,
    })
  );
  assert.equal(viewModels[0].highlightSelfRow, true);
});

test("renderLeaderboardTableDom: perfect hunt score shows PERFECT HUNT trophy cell", () => {
  const rows = normalizeLeaderboardRows([["PERFECT", 0, 66, "PERFECT HUNT"]]);
  const { table, viewModels } = renderRows(rows, {
    useDemoData: false,
    demoSubmitUsed: false,
    turnSpent: false,
    typedPlayerName: "",
    runScore: 0,
    runTrophyWord: "",
    perfectTarget: 66,
  });
  assert.equal(viewModels[0].displayTrophyCell, "PERFECT HUNT");
  assert.equal(viewModels[0].nameTrophyFlash, "perfect");
  const trophyTd = tableBodyRows(table)[0].children[3];
  assert.equal(cellText(trophyTd), "PERFECT HUNT");
  assert.ok(trophyTd.children[0]?.classList.contains("leaderboard-perfect-hunt-flash"));
});

test("applyLeaderboardSubmitButtonVisibility: SUBMIT when cooldown inactive", () => {
  const leaderboardButton = {
    classList: createClassList(),
    disabled: true,
    textContent: ":45",
    style: { backgroundColor: "gray", removeProperty() {} },
  };
  applyLeaderboardSubmitButtonVisibility({
    leaderboardUseDemoData: false,
    refs: { leaderboardButton, leaderboardDemoAdd: null, playerName: { value: "Ada" } },
    qualifiesForBoardSlot: true,
    score: 88,
    scoreSubmitThreshold: 0,
    liveSubmitUsed: false,
    demoSubmitUsed: false,
    submitCooldownRemainingMs: 0,
  });
  assert.equal(leaderboardButton.disabled, false);
  assert.equal(leaderboardButton.textContent, LEADERBOARD_SUBMIT_BUTTON_LABEL);
});

test("applyLeaderboardSubmitButtonVisibility: :45 countdown while cooldown active", () => {
  const leaderboardButton = {
    classList: createClassList(),
    disabled: false,
    textContent: LEADERBOARD_SUBMIT_BUTTON_LABEL,
    style: { backgroundColor: "", removeProperty() {} },
  };
  applyLeaderboardSubmitButtonVisibility({
    leaderboardUseDemoData: false,
    refs: { leaderboardButton, leaderboardDemoAdd: null, playerName: { value: "Ada" } },
    qualifiesForBoardSlot: true,
    score: 88,
    scoreSubmitThreshold: 0,
    liveSubmitUsed: false,
    demoSubmitUsed: false,
    submitCooldownRemainingMs: 45_000,
  });
  assert.equal(leaderboardButton.disabled, true);
  assert.equal(leaderboardButton.textContent, ":45");
});

test("renderLeaderboardTableDom: submitted self row stays highlighted after turn spent", () => {
  const rows = normalizeLeaderboardRows([["CARLA", 0, 95, "ZEBRA"]]);
  const { viewModels, playerPosition } = renderRows(rows, {
    useDemoData: false,
    demoSubmitUsed: false,
    turnSpent: true,
    typedPlayerName: "Carla",
    runScore: 95,
    runTrophyWord: "ZEBRA",
    perfectTarget: null,
  });
  assert.equal(viewModels[0].highlightSelfRow, true);
  assert.equal(viewModels[0].useInlineNameCell, false);
  assert.equal(playerPosition, 1);
});
