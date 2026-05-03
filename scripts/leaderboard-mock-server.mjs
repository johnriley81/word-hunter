/**
 * Local `/leaderboard/*` stub. Use `npm run dev:leaderboard` or aim the proxy with `LEADERBOARD_PROXY_TARGET`.
 * Env: `LEADERBOARD_MOCK_PORT` (default 9777), `LEADERBOARD_MOCK_SCENARIO` (success|profanity|400|array|empty).
 */
import http from "node:http";

const PORT = Number(process.env.LEADERBOARD_MOCK_PORT || 9777);
const SCENARIO = String(process.env.LEADERBOARD_MOCK_SCENARIO || "success")
  .trim()
  .toLowerCase();

function json(res, status, body) {
  const s = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(s),
  });
  res.end(s);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function parsePostPlayer(bodyBuf) {
  if (!bodyBuf || bodyBuf.length === 0) return null;
  try {
    const o = JSON.parse(bodyBuf.toString("utf8"));
    if (o && typeof o === "object") {
      return {
        player: String(o.player ?? "").trim() || "YOU",
        score: Number(o.score) || 0,
        trophy: String(o.trophy ?? "").trim() || "",
      };
    }
  } catch {
    /* ignore */
  }
  return null;
}

function successTop10FromPost(parsed) {
  const p = parsed || { player: "YOU", score: 0, trophy: "" };
  return {
    message: "Record inserted successfully.",
    top_10: [
      ["Bob", 100, "zzz"],
      [p.player, p.score, p.trophy],
    ],
  };
}

const server = http.createServer(async (req, res) => {
  const url = req.url || "/";
  console.log(`[leaderboard-mock] ${req.method} ${url}`);

  if (!url.startsWith("/leaderboard/")) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }

  if (req.method === "GET") {
    json(res, 200, []);
    return;
  }

  if (req.method === "POST") {
    const raw = await readBody(req);
    const parsed = parsePostPlayer(raw);

    if (SCENARIO === "400") {
      json(res, 400, {});
      return;
    }
    if (SCENARIO === "profanity") {
      json(res, 200, {
        message: "Profanity rejected",
        top_10: [["Ada", 88, "STAR"]],
      });
      return;
    }
    if (SCENARIO === "array") {
      const p = parsed || { player: "Ada", score: 88, trophy: "STAR" };
      json(res, 200, [
        ["Zoe", 90, "SUN"],
        [p.player, p.score, p.trophy],
      ]);
      return;
    }
    if (SCENARIO === "empty") {
      json(res, 200, {});
      return;
    }

    json(res, 200, successTop10FromPost(parsed));
    return;
  }

  res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Method not allowed");
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[leaderboard-mock] http://127.0.0.1:${PORT} scenario=${SCENARIO}`);
});
