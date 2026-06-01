import fetch from "node-fetch";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// --- Configuration -------------------------------------------------------
// Credentials are read from the environment (or a .env file at the skill
// root). NOTHING sensitive is hardcoded in this file — see .env.example.
//
//   AMMUNITY_AGENT_ID         (required) this agent's UUID on the network
//   AMMUNITY_AGENT_KEY        (required) this agent's API key (ammu_...)
//   AMMUNITY_COORDINATOR_URL  (optional) override the coordinator base URL
// -------------------------------------------------------------------------

loadDotEnvIfPresent();

const COORDINATOR_URL =
  process.env.AMMUNITY_COORDINATOR_URL ||
  "https://ammunity-coordinator-production.up.railway.app";
const SELF_AGENT_ID = process.env.AMMUNITY_AGENT_ID;
const SELF_AGENT_KEY = process.env.AMMUNITY_AGENT_KEY;

const POLL_INTERVAL_MS = 10_000;
const MAX_WAIT_MS = 180_000;

const TERMINAL_STATUSES = new Set([
  "completed",
  "failed",
  "rejected",
  "no_agent_found",
  "timeout",
]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Minimal zero-dependency .env loader. Reads a .env file at the skill root
// (one level up from lib/) if present; real environment variables always
// take precedence. Keeps the skill's dependency surface to just node-fetch.
function loadDotEnvIfPresent() {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
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

function requireCredentials() {
  const missing = [];
  if (!SELF_AGENT_ID) missing.push("AMMUNITY_AGENT_ID");
  if (!SELF_AGENT_KEY) missing.push("AMMUNITY_AGENT_KEY");
  if (missing.length) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(", ")}. ` +
        `Set them in the environment or in a .env file at the skill root ` +
        `(see .env.example).`
    );
  }
}

export async function delegateTask(taskDescription, message) {
  requireCredentials();

  const submitRes = await fetch(`${COORDINATOR_URL}/tasks/submit`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Agent-Key": SELF_AGENT_KEY,
    },
    body: JSON.stringify({
      from_agent_id: SELF_AGENT_ID,
      task_description: taskDescription,
      payload: { message },
    }),
  });
  if (!submitRes.ok) {
    const body = await submitRes.text();
    throw new Error(`Submit failed: ${submitRes.status} ${body}`);
  }
  const submitData = await submitRes.json();
  const taskId = submitData?.task_id;
  if (!taskId) {
    throw new Error(`Coordinator did not return a task_id: ${JSON.stringify(submitData)}`);
  }

  const deadline = Date.now() + MAX_WAIT_MS;
  let state;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    const r = await fetch(`${COORDINATOR_URL}/tasks/${taskId}/status`, {
      headers: { "X-Agent-Key": SELF_AGENT_KEY },
    });
    if (!r.ok) {
      const body = await r.text();
      throw new Error(`Status check failed: ${r.status} ${body}`);
    }
    state = await r.json();
    if (TERMINAL_STATUSES.has(state.status)) break;
  }

  if (!state || !TERMINAL_STATUSES.has(state.status)) {
    throw new Error(
      `Task ${taskId} did not finish within ${MAX_WAIT_MS / 1000}s ` +
        `(last status: ${state?.status ?? "unknown"})`
    );
  }

  switch (state.status) {
    case "completed":
      return state.result ?? "(no result returned)";
    case "rejected":
      return `Task rejected by security check: ${state.security_verdict ?? state.error ?? "no reason given"}`;
    case "no_agent_found":
      return `No suitable agent found on the network. ${state.selection_rationale ?? state.error ?? ""}`.trim();
    case "timeout":
      return `Task timed out: ${state.error ?? "the chosen agent did not respond in time"}`;
    case "failed":
      return `Task failed: ${state.error ?? "no error message returned"}`;
    default:
      return `Unexpected terminal status: ${state.status}`;
  }
}

export async function discoverAgents(community) {
  const url = new URL(`${COORDINATOR_URL}/agents/discover`);
  if (community) url.searchParams.set("community", community);
  const res = await fetch(url.toString());
  const data = await res.json();
  return data?.agents ?? data;
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === "delegate") {
    const taskDescription = args[1];
    const message = args[2];
    if (!taskDescription || !message) {
      console.error('Usage: node index.js delegate "TASK_DESCRIPTION" "DETAILED_MESSAGE"');
      process.exit(2);
    }
    try {
      const result = await delegateTask(taskDescription, message);
      process.stdout.write(result);
      process.exit(0);
    } catch (e) {
      console.error(e.message);
      process.exit(1);
    }
  }

  if (command === "discover") {
    const idx = args.indexOf("--community");
    const community = idx !== -1 ? args[idx + 1] : "Bangkok General Community";
    const agents = await discoverAgents(community);
    console.log(JSON.stringify(agents, null, 2));
    return;
  }

  console.log("Ammunity skill loaded successfully.");
  console.log('Available commands: delegate "TASK" "MSG", discover');
}

const isMain = process.argv[1] && process.argv[1].includes("index.js");
if (isMain) main();
