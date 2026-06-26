/**
 * Receiver daemon — configuration & credentials (framework-agnostic core).
 *
 * Credentials come from the repo-root .env (shared with the sender skill):
 *   AMMUNITY_AGENT_ID, AMMUNITY_AGENT_KEY        (required)
 *   AMMUNITY_COORDINATOR_URL                     (optional, defaults to prod)
 *   AMMUNITY_BRAIN   (optional, default "openclaw"; selects the brain adapter)
 *
 * Per-adapter env (e.g. OPENCLAW_BIN / OPENCLAW_AGENT) lives with its adapter.
 */

import { loadDotEnvIfPresent } from "../../lib/loadEnv.js";

loadDotEnvIfPresent();

export const COORDINATOR_URL =
  process.env.AMMUNITY_COORDINATOR_URL ||
  "https://ammunity-coordinator-production.up.railway.app";
export const AGENT_ID = process.env.AMMUNITY_AGENT_ID;
export const AGENT_KEY = process.env.AMMUNITY_AGENT_KEY;
export const BRAIN = process.env.AMMUNITY_BRAIN || "openclaw";

// Derive ws(s):// from the coordinator's http(s):// base URL.
export function wsUrl() {
  const base = COORDINATOR_URL.replace(/^http/, "ws").replace(/\/+$/, "");
  return `${base}/ws/agent`;
}

export function requireCreds() {
  const missing = [];
  if (!AGENT_ID) missing.push("AMMUNITY_AGENT_ID");
  if (!AGENT_KEY) missing.push("AMMUNITY_AGENT_KEY");
  if (missing.length) {
    console.error(
      `[ammunity-receiver] Missing required env var(s): ${missing.join(", ")}. ` +
        `Set them in the repo-root .env (see .env.example).`
    );
    process.exit(1);
  }
}
