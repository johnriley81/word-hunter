/** Starts mock API then CORS proxy aimed at it (`LEADERBOARD_PROXY_TARGET`). Ctrl+C to stop. */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const mockPort = process.env.LEADERBOARD_MOCK_PORT || "9777";
const node = process.execPath;

const children = [];

const mock = spawn(node, [join(root, "scripts/leaderboard-mock-server.mjs")], {
  cwd: root,
  env: { ...process.env, LEADERBOARD_MOCK_PORT: mockPort },
  stdio: "inherit",
});
children.push(mock);

mock.on("exit", (code) => {
  if (code != null && code !== 0) process.exit(code);
});

function startProxy() {
  const target = `http://127.0.0.1:${mockPort}`;
  const proxy = spawn(node, [join(root, "scripts/leaderboard-cors-proxy.mjs")], {
    cwd: root,
    env: {
      ...process.env,
      LEADERBOARD_PROXY_TARGET: target,
    },
    stdio: "inherit",
  });
  children.push(proxy);
  proxy.on("exit", (code) => process.exit(code ?? 0));
}

setTimeout(startProxy, 250);

function shutdown() {
  for (const c of children) {
    try {
      c.kill("SIGTERM");
    } catch {
      /* ignore */
    }
  }
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
