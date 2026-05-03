/**
 * Live submit / demo-add visibility (score threshold vs board eligibility).
 */
export function applyLeaderboardSubmitButtonVisibility({
  leaderboardUseDemoData,
  refs,
  qualifiesForBoardSlot,
  score,
  scoreSubmitThreshold,
  liveSubmitUsed,
  demoSubmitUsed,
}) {
  const { leaderboardButton, leaderboardDemoAdd } = refs;

  if (leaderboardUseDemoData) {
    leaderboardButton.classList.add("hiddenDisplay");
    leaderboardButton.classList.add("leaderboard-action--concealed");
    if (leaderboardDemoAdd) {
      if (demoSubmitUsed) {
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

      if (qualifiesForBoardSlot) {
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

  const runScore = Number(score);
  const meetsSubmitScoreMinimum =
    Number.isFinite(runScore) && runScore > scoreSubmitThreshold;
  if (!meetsSubmitScoreMinimum) {
    leaderboardButton.classList.add("hiddenDisplay");
    leaderboardButton.classList.add("leaderboard-action--concealed");
    leaderboardButton.disabled = true;
    leaderboardButton.style.removeProperty("background-color");
    return;
  }

  leaderboardButton.classList.remove("hiddenDisplay");
  leaderboardButton.classList.toggle(
    "leaderboard-action--concealed",
    !qualifiesForBoardSlot
  );
  leaderboardButton.disabled = liveSubmitUsed;
  if (liveSubmitUsed) {
    leaderboardButton.style.backgroundColor = "rgba(95, 95, 95, 0.92)";
  } else {
    leaderboardButton.style.removeProperty("background-color");
  }
}
