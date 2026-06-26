/**
 * OpenClaw brain adapter (`supportsResume = false`).
 *
 * The reference adapter — this is the existing, proven receive path. Invokes
 * the local OpenClaw agent headlessly per task and extracts the reply text.
 * Continuity for Tier-1 clarification rides the coordinator's frame
 * (`context.rounds`, rendered by the core), so OpenClaw needs no native
 * session resume; the universal replay fallback (design §4) covers it.
 *
 * Adapter env:
 *   OPENCLAW_BIN     (optional, default "openclaw"; set to an absolute path
 *                     under systemd where PATH is minimal)
 *   OPENCLAW_AGENT   (optional, default "main")
 */

import { spawn } from "node:child_process";

export class OpenClawAdapter {
  constructor({ bin, agent, log } = {}) {
    this.name = "openclaw";
    this.supportsResume = false;
    this.bin = bin || process.env.OPENCLAW_BIN || "openclaw";
    this.agent = agent || process.env.OPENCLAW_AGENT || "main";
    this.log = log || (() => {});
  }

  // Start a fresh, isolated run. Resolves to {ok, text} or {ok:false, error}.
  // (OpenClaw runs are stateless per invocation, so every run is "fresh".)
  run(prompt, _opts = {}) {
    return new Promise((resolve) => {
      const child = spawn(
        this.bin,
        ["agent", "--agent", this.agent, "--message", prompt, "--json"],
        { stdio: ["ignore", "pipe", "pipe"] }
      );
      let out = "";
      let err = "";
      child.stdout.on("data", (d) => (out += d));
      child.stderr.on("data", (d) => (err += d));
      child.on("error", (e) =>
        resolve({ ok: false, error: `spawn failed: ${e.message}` })
      );
      child.on("close", (code) => {
        if (code !== 0) {
          resolve({
            ok: false,
            error: `openclaw exited ${code}: ${(err || out).trim().slice(0, 500)}`,
          });
          return;
        }
        resolve({ ok: true, text: extractText(out) });
      });
    });
  }

  // OpenClaw has no native session resume; the core falls back to replay
  // (continuity via the coordinator's frame). Present for interface parity.
  resume() {
    throw new Error("ResumeUnavailable: OpenClaw has no native resume; use replay");
  }

  closeSession() {
    // No local session state to drop.
  }
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
