import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Minimal zero-dependency .env loader, shared by the sender skill (lib/index.js)
// and the receiver (receiver/ws_client.js). Reads a .env file at the repo root
// (one level up from lib/) if present; real environment variables always take
// precedence. The path is computed relative to THIS file, so it resolves to the
// repo root regardless of which module imports it.
export function loadDotEnvIfPresent() {
  try {
    const here = dirname(fileURLToPath(import.meta.url)); // .../lib
    const envPath = join(here, "..", ".env");
    const raw = readFileSync(envPath, "utf8");
    for (const line of raw.split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq === -1) continue;
      const key = t.slice(0, eq).trim();
      let val = t.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = val;
    }
  } catch {
    // No .env file present — fall back to the real environment.
  }
}
