import fetch from "node-fetch";
import { loadDotEnvIfPresent } from "./loadEnv.js";

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

// --- Invocation hardening ------------------------------------------------
// Real agents call the `ammunity` command in inconsistent ways. We accept all
// of the following and normalize to a clean (title, message):
//   positional:  ammunity "Title" "Detailed request"
//   message-only ammunity "Detailed request"               (title auto-derived)
//   flags:       ammunity --task "Title" --details "Request"  (also --message)
//   freeform:    ammunity research the latest A2A protocols   (unquoted → joined)
// This kills the demo failure modes: a junk "shell" title, a "--task" title,
// and the rigid two-argument requirement. (flags.md 2026-06-14)
// -------------------------------------------------------------------------
const TITLE_FLAGS = new Set(["--task", "--title", "-t"]);
const MSG_FLAGS = new Set(["--details", "--detail", "--message", "--msg", "-m", "-d"]);
// Words an agent tends to latch onto as a "title" that are actually noise.
const JUNK_TITLES = new Set([
  "shell", "sh", "bash", "cmd", "command", "task", "title", "ammunity",
  "--task", "--details", "--message", "--title", "--msg",
]);

function deriveTitleFromMessage(message) {
  const flat = String(message).replace(/\s+/g, " ").trim();
  let t = flat.split(" ").slice(0, 8).join(" ");
  if (t.length > 60) t = t.slice(0, 60).trim();
  return t || "Delegated task";
}

export function normalizeTitle(rawTitle, message) {
  let t = (rawTitle == null ? "" : String(rawTitle)).replace(/\s+/g, " ").trim();
  t = t.replace(/^["']+|["']+$/g, "").trim(); // strip stray surrounding quotes
  const junk = !t || t.startsWith("-") || JUNK_TITLES.has(t.toLowerCase());
  if (junk) t = deriveTitleFromMessage(message);
  if (t.length > 80) t = t.slice(0, 80).trim();
  return t;
}

export function parseDelegateArgs(rawArgs) {
  let flagTitle = null;
  let flagMessage = null;
  const positionals = [];

  for (let i = 0; i < rawArgs.length; i++) {
    let a = rawArgs[i];
    let inlineVal = null;
    if (a.startsWith("--") && a.includes("=")) {
      const eq = a.indexOf("=");
      inlineVal = a.slice(eq + 1);
      a = a.slice(0, eq);
    }
    const takeVal = () =>
      inlineVal !== null ? inlineVal : i + 1 < rawArgs.length ? rawArgs[++i] : null;
    if (TITLE_FLAGS.has(a)) flagTitle = takeVal();
    else if (MSG_FLAGS.has(a)) flagMessage = takeVal();
    else positionals.push(rawArgs[i]);
  }

  let title = flagTitle;
  let message = flagMessage;

  if (message == null) {
    if (positionals.length === 2) {
      if (title == null) title = positionals[0];
      message = positionals[1];
    } else if (positionals.length === 1) {
      message = positionals[0];
    } else if (positionals.length >= 3) {
      message = positionals.join(" "); // unquoted freeform request
    } else if (title != null) {
      // Only a title-style flag was supplied — its content IS the request.
      message = title;
      title = null;
    }
  } else if (positionals.length === 1 && title == null) {
    // message came from a flag; a lone positional is most likely the title.
    title = positionals[0];
  }

  message = message == null ? null : String(message).trim();
  return { title: normalizeTitle(title, message), message };
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === "delegate") {
    const { title, message } = parseDelegateArgs(args.slice(1));
    if (!message) {
      console.error(
        'Usage: ammunity "Detailed request"   (or: ammunity "Short title" "Detailed request")'
      );
      process.exit(2);
    }
    try {
      const result = await delegateTask(title, message);
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
