# Leaderboard

Client-side leaderboard flow for Word Hunter post-game UI: fetch top-10, preview the current run, submit once per puzzle day, and enforce name policy.

## Module map

| Module                                | Role                                                                                                          |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `leaderboard-api.js`                  | Wire-format helpers: normalize rows, parse GET/POST payloads, `LEADERBOARD_META_LIVE_PREVIEW` tag             |
| `leaderboard-client.js`               | Browser fetch with GET cache (~60s), POST submit, score-validation sidecar                                    |
| `leaderboard-lifecycle.js`            | Pure merge/qualify/sanitize: `mergeRunIntoTop10`, `runQualifiesForLeaderboardTop10`, preview merge, name keys |
| `leaderboard-live-flow.js`            | Live POST eligibility, prohibited-name submit guard, derive table rows after fetch                            |
| `leaderboard-name-policy.js`          | Prohibited-name set (mirrors server); `isLeaderboardNameAllowed`                                              |
| `leaderboard-score-validation.js`     | Builds POST body for server replay validation (`scoreValidation` payload)                                     |
| `leaderboard-row-view-model.js`       | Classifies rows for display (self, preview, perfect/over flags)                                               |
| `leaderboard-table-render.js`         | DOM mount from row view models (thead + tbody)                                                                |
| `leaderboard-ui.js`                   | Controller: overlay, table refresh, inline name edit, copy-score handoff; owns `rt.state`                     |
| `leaderboard-ui-demo-merge.js`        | Demo-only injected rows (perfect / over-perfect hunt fixtures)                                                |
| `leaderboard-ui-helpers.js`           | Shared table utilities (numeric score, cell flash, defer-render while typing)                                 |
| `leaderboard-ui-submit-visibility.js` | SUBMIT button vs cooldown label, localStorage persistence                                                     |

## Live vs demo

- **Live (default):** `LEADERBOARD_USE_DEMO_DATA = false` in `config.js`. API base resolves to production on wordhunter.io hosts and to `http://127.0.0.1:8765/leaderboard/` on localhost (see dev proxy below).
- **Demo:** Set `LEADERBOARD_USE_DEMO_DATA = true` for offline table UX. Uses `buildDemoLeaderboardRows()` and the demo ADD button instead of network POST. Optional flags: `LEADERBOARD_DEMO_EMPTY_BOARD`, inject perfect/over rows via `leaderboard-ui-demo-merge.js`.

## Preview row

Before submit, a qualifying run is merged into the displayed top-10 with index `[4] === LEADERBOARD_META_LIVE_PREVIEW` (`"live-preview"`). That row:

- Ranks by score like a real entry
- Uses the sanitized inline name (may be empty)
- Enables inline name editing until submit
- Is stripped from eligibility rows sent back to the API (`stripLiveLeaderboardPreviewRows`)

Preview merge runs in `applyLiveLeaderboardPreviewMerge` when score beats the threshold, qualifies for top-10, and the submit turn is not yet spent.

## Submit cooldown (60s)

After a successful live POST, the SUBMIT button shows a countdown (`:45`, `:01`, …) for **60 seconds**, matching the GET fetch cache window (`LEADERBOARD_FETCH_CACHE_MS`). Cooldown is keyed per puzzle day in `localStorage` (`wordhunter:lb-submit-at:{puzzleId}`) so a reload within the window still disables submit. After submit on the **same run**, the button hides entirely (`liveLeaderboardSubmitUsed`).

## Name policy

Names are uppercased A–Z only, max 8 characters (`sanitizeLeaderboardName` / `DEMO_LEADERBOARD_NAME_MAX`). Prohibited tokens are rejected on submit click (`isProhibitedLeaderboardSubmitClick`); the preview row is removed and the name field stays editable.

## Score validation POST

Live submit sends the player row plus a `scoreValidation` object from `buildScoreValidationPayload()` (game letters + words played) so the server can replay-check the score. See `leaderboard-score-validation.js` and server tests in `tests/leaderboard-score-validation.test.js`.

## Local dev proxy (:8765)

```bash
npm run dev:leaderboard
```

Starts the mock API (default port 9777) and a CORS proxy on **8765** that forwards to it. With the static site served on localhost, `LEADERBOARD_API_BASE` automatically points at `http://127.0.0.1:8765/leaderboard/`.

Alternatives:

- `npm run leaderboard-mock` — mock API only
- `npm run leaderboard-proxy` — proxy only (`LEADERBOARD_PROXY_TARGET`)

Run leaderboard tests:

```bash
npm run test:leaderboard
```
