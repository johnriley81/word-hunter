/**
 * CORS proxy for local dev. Prefer `npm run dev:leaderboard` (mock + proxy). Otherwise set `LEADERBOARD_PROXY_TARGET` (origin only).
 * Default upstream is production host from `js/config.js`. Env: `LEADERBOARD_PROXY_PORT` (8765).
 */
import http from "node:http";
import { LEADERBOARD_PRODUCTION_API_BASE } from "../js/config.js";

const UPSTREAM_RAW =
  process.env.LEADERBOARD_PROXY_TARGET ||
  new URL(LEADERBOARD_PRODUCTION_API_BASE).origin;
const UPSTREAM = UPSTREAM_RAW.replace(/\/$/, "");
const PORT = Number(process.env.LEADERBOARD_PROXY_PORT || 8765);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

function forwardHeaderPairs(req) {
  const out = [];
  const allow = new Set(["content-type", "accept", "accept-language", "user-agent"]);
  for (const [k, v] of Object.entries(req.headers)) {
    if (!allow.has(k.toLowerCase()) || v == null) continue;
    const val = Array.isArray(v) ? v.join(",") : v;
    out.push([k, val]);
  }
  return out;
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  for (const [k, v] of Object.entries(CORS)) {
    res.setHeader(k, v);
  }

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  let pathQuery = req.url || "/";
  if (!pathQuery.startsWith("/")) pathQuery = `/${pathQuery}`;

  const targetUrl = `${UPSTREAM}${pathQuery}`;
  let body;
  if (req.method !== "GET" && req.method !== "HEAD") {
    body = await readRawBody(req);
  }

  const init = {
    method: req.method || "GET",
    headers: Object.fromEntries(forwardHeaderPairs(req)),
  };
  if (body && body.length > 0) {
    init.body = body;
  }

  let fr;
  try {
    fr = await fetch(targetUrl, init);
  } catch (e) {
    console.error("leaderboard-proxy fetch failed:", e.message || e);
    res.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Bad gateway (upstream unreachable)");
    return;
  }

  const buf = Buffer.from(await fr.arrayBuffer());
  res.writeHead(fr.status, {
    "Content-Type": fr.headers.get("content-type") || "application/json",
  });
  res.end(buf);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(
    `Leaderboard CORS proxy http://127.0.0.1:${PORT} → ${UPSTREAM} (stop with Ctrl+C)`
  );
});
