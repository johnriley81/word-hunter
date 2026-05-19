import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");

const catalogFromEnv = process.env.PATH_CATALOG;
export const DEFAULT_PATH_CATALOG = catalogFromEnv
  ? catalogFromEnv.startsWith("/")
    ? catalogFromEnv
    : resolve(repoRoot, catalogFromEnv)
  : resolve(repoRoot, "text/gamemaker/pregen/path-signature-catalog.json");

export const PUZZLE_POOL_JSON = resolve(
  repoRoot,
  process.env.PUZZLE_POOL || "text/gamemaker/pregen/puzzle-pool.json"
);

export { repoRoot };
