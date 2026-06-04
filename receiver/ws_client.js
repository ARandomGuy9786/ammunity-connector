/**
 * Ammunity OpenClaw receiver — WebSocket client (v0.5.0 `ws` delivery).
 *
 * Holds one OUTBOUND WebSocket to the Ammunity coordinator (no inbound port,
 * no public endpoint). When the coordinator pushes a `task` frame, this runs
 * the local OpenClaw agent and sends a `result` frame back over the same
 * socket, tagged with the task_id. Replaces the old inbound a2a_receiver.py.
 *
 * Credentials come from the repo-root .env (shared with the sender skill):
 *   AMMUNITY_AGENT_ID, AMMUNITY_AGENT_KEY        (required)
 *   AMMUNITY_COORDINATOR_URL                     (optional, defaults to prod)
 *   OPENCLAW_BIN     (optional, default "openclaw"; set to an absolute path
 *                     under systemd where PATH is minimal)
 *   OPENCLAW_AGENT   (optional, default "main")
 *
 * Run:  node receiver/ws_client.js   (typically via the systemd unit)
 */

import WebSocket from "ws";
import { spawn } from "node:child_process";
import { loadDotEnvIfPresent } from "../lib/loadEnv.js";

loadDotEnvIfPresent();

const COORDINATOR_URL =
  process.env.AMMUNITY_COORDINATOR_URL ||
  "https://ammunity-coordinator-production.up.railway.app";
const AGENT_ID = process.env.AMMUNITY_AGENT_ID;
const AGENT_KEY = process.env.AMMUNITY_AGENT_KEY;
const OPENCLAW_BIN = process.env.OPENCLAW_BIN || "openclaw";
const OPENCLAW_AGENT = process.env.OPENCLAW_AGENT || "main";

const HEARTBEAT_MS = 20_000;
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

function log(...args) {
  console.log("[ammunity-receiver]", ...args);
}

function wsUrl() {
  // Derive ws(s):// from the coordinator's http(s):// base URL.
  const base = COORDINATOR_URL.replace(/^http/, "ws").replace(/\/+$/, "");
  return `${base}/ws/agent`;
}

function requireCreds() {
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

// Run the local OpenClaw agent for one task. Resolves to {ok, text} or {ok:false, error}.
function runOpenClaw(prompt) {
  return new Promise((resolve) => {
    const child = spawn(
      OPENCLAW_BIN,
      ["agent", "--agent", OPENCLAW_AGENT, "--message", prompt, "--json"],
      { stdio: ["ignore", "pipe", "pipe"] }
    );
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => resolve({ ok: false, error: `spawn failed: ${e.message}` }));
    child.on("close", (code) => {
      if (code !== 0) {
        resolve({ ok: false, error: `openclaw exited ${code}: ${(err || out).trim().slice(0, 500)}` });
        return;
      }
      resolve({ ok: true, text: extractText(out) });
    });
  });
}

// Tolerant parse of `openclaw ... --json`. Known shape is
// {result:{payloads:[{text}]}}, but we fall through a few shapes and finally
// to raw stdout so a format change degrades gracefully instead of breaking.
function extractText(stdout) {
  try {
    const data = JSON.parse(stdout);
    return (
      data?.result?.payloads?.[0]?.text ??
      (typeof data?.result === "string" ? data.result : null) ??
      data?.text ??
      (typeof data === "string" ? data : JSON.stringify(data))
    );
  } catch {
    return stdout.trim();
  }
}

let ws = null;
let heartbeat = null;
let reconnectDelay = RECONNECT_BASE_MS;

function send(obj) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(obj));
  }
}

function clearHeartbeat() {
  if (heartbeat) {
    clearInterval(heartbeat);
    heartbeat = null;
  }
}

function connect() {
  log(`connecting to ${wsUrl()} as agent ${AGENT_ID}`);
  ws = new WebSocket(wsUrl(), { headers: { "X-Agent-Key": AGENT_KEY } });

  ws.on("open", () => {
    log("connected");
    reconnectDelay = RECONNECT_BASE_MS;
    send({ type: "hello", agent_id: AGENT_ID });
    heartbeat = setInterval(() => send({ type: "heartbeat" }), HEARTBEAT_MS);
  });

  ws.on("message", async (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (msg.type !== "task") return;

    const taskId = msg.task_id;
    const prompt = `${msg.task_description || ""}. ${msg.payload?.message || ""}`.trim();
    log(`task ${taskId}: running openclaw`);
    const res = await runOpenClaw(prompt);
    if (res.ok) {
      send({ type: "result", task_id: taskId, status: "completed", result: res.text });
      log(`task ${taskId}: completed`);
    } else {
      send({ type: "result", task_id: taskId, status: "failed", error: res.error });
      log(`task ${taskId}: failed — ${res.error}`);
    }
  });

  // Server rejected the upgrade (closed before accept) — almost always a
  // config error. Don't loop forever on it.
  ws.on("unexpected-response", (_req, res) => {
    console.error(
      `[ammunity-receiver] handshake rejected: HTTP ${res.statusCode}. ` +
        `Check AMMUNITY_AGENT_KEY, that the agent is approved, and that its delivery_mode is 'ws'.`
    );
    if (res.statusCode === 401 || res.statusCode === 403) {
      process.exit(1);
    }
  });

  ws.on("close", (code) => {
    clearHeartbeat();
    // Custom application close codes for auth/mode failures — fatal, don't retry.
    if (code === 4401 || code === 4403) {
      console.error(
        `[ammunity-receiver] coordinator closed the connection (code ${code}): ` +
          `auth or delivery_mode problem. Fix the .env / agent record and restart.`
      );
      process.exit(1);
    }
    log(`disconnected (code ${code}); reconnecting in ${reconnectDelay}ms`);
    setTimeout(connect, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS);
  });

  ws.on("error", (e) => {
    // 'close' fires after this and handles reconnect/backoff.
    console.error(`[ammunity-receiver] socket error: ${e.message}`);
  });
}

requireCreds();
connect();
