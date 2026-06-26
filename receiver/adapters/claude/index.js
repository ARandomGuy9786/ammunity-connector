/**
 * Claude Code brain adapter (`supportsResume = true`).
 *
 * Runs Claude Code headlessly per task: `claude -p "<prompt>" --output-format json`.
 * Continuity uses NATIVE resume (design §3.2): the core pre-assigns the brain
 * session id = the Ammunity task_id (a UUID — the CLI requires `--session-id` be
 * a valid UUID), so the answer turn resumes that exact session deterministically.
 *
 * SECURITY (design §8 — a receiver runs NETWORK-SUPPLIED instructions through a
 * coding agent): this adapter is sandboxed by default —
 *   - isolated `CLAUDE_CONFIG_DIR` (receiver runs never touch the user's personal
 *     Claude history),
 *   - a dedicated low-privilege working dir (NEVER the Ammunity workspace),
 *   - restricted `--permission-mode` (default = no auto tool use),
 *   - a per-task `--max-budget-usd` cost cap.
 * Opening tools up (for the "offload real work" use) is a deliberate operator
 * choice via the env knobs below — not the default.
 *
 * AUTH (verified 2026-06-25): an isolated CLAUDE_CONFIG_DIR has NO interactive
 * login → "Not logged in". Three modes (see constructor):
 *   - AMMUNITY_CLAUDE_USE_LOGIN=1 → reuse the user's default ~/.claude login (no
 *     override). Free (subscription), but receiver runs share the personal home.
 *   - AMMUNITY_CLAUDE_API_KEY / ANTHROPIC_API_KEY → isolated home + API key
 *     (production-safe; per-token billing).
 *   - AMMUNITY_CLAUDE_CONFIG_DIR=<dir> → isolate at a specific already-logged-in dir.
 *
 * Adapter env (all optional unless noted):
 *   CLAUDE_BIN                       default "claude"
 *   AMMUNITY_CLAUDE_USE_LOGIN        "1" → inherit ~/.claude login (no isolation)
 *   AMMUNITY_CLAUDE_CONFIG_DIR       isolated home; default ~/.ammunity-receiver/claude
 *   AMMUNITY_CLAUDE_WORKDIR          low-priv cwd;  default ~/.ammunity-receiver/work
 *   AMMUNITY_CLAUDE_API_KEY          API key for the child (→ ANTHROPIC_API_KEY)
 *   AMMUNITY_CLAUDE_PERMISSION_MODE  default "default" (others: plan/acceptEdits/dontAsk/bypassPermissions)
 *   AMMUNITY_CLAUDE_ALLOWED_TOOLS    e.g. "Read Grep" (space/comma-separated); default none
 *   AMMUNITY_CLAUDE_MAX_BUDGET_USD   per-task cost cap; default "1.0"
 *   AMMUNITY_CLAUDE_MODEL            optional model override
 */

import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync, mkdirSync, rmSync } from "node:fs";

export class ClaudeAdapter {
  constructor(opts = {}) {
    this.name = "claude";
    this.supportsResume = true;
    this.log = opts.log || (() => {});

    this.bin = opts.bin || process.env.CLAUDE_BIN || "claude";
    const root = join(homedir(), ".ammunity-receiver");
    const defaultHome = join(homedir(), ".claude");

    // Home/auth resolution (3 modes):
    //   1. explicit config dir (opts/env) → isolate there.
    //   2. else AMMUNITY_CLAUDE_USE_LOGIN truthy → DON'T override CLAUDE_CONFIG_DIR;
    //      inherit the user's default ~/.claude login. Dev/test path: free, reuses
    //      the subscription, but receiver runs share the personal home (less isolated).
    //   3. else → isolated default ~/.ammunity-receiver/claude (production-safe;
    //      needs an API key since an empty home has no login).
    const explicitDir = opts.configDir || process.env.AMMUNITY_CLAUDE_CONFIG_DIR;
    this.useLogin =
      !explicitDir && truthy(opts.useLogin ?? process.env.AMMUNITY_CLAUDE_USE_LOGIN);
    if (this.useLogin) {
      this.configDir = null; // null = leave CLAUDE_CONFIG_DIR unset → inherit default login
      this.effectiveConfigDir = defaultHome; // where sessions land (for closeSession)
    } else {
      this.configDir = expandTilde(explicitDir || join(root, "claude"));
      this.effectiveConfigDir = this.configDir;
    }
    this.workdir = expandTilde(
      opts.workdir || process.env.AMMUNITY_CLAUDE_WORKDIR || join(root, "work")
    );
    this.apiKey =
      opts.apiKey || process.env.AMMUNITY_CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
    this.permissionMode =
      opts.permissionMode || process.env.AMMUNITY_CLAUDE_PERMISSION_MODE || "default";
    this.allowedTools = opts.allowedTools || process.env.AMMUNITY_CLAUDE_ALLOWED_TOOLS || "";
    this.maxBudgetUsd =
      opts.maxBudgetUsd || process.env.AMMUNITY_CLAUDE_MAX_BUDGET_USD || "1.0";
    this.model = opts.model || process.env.AMMUNITY_CLAUDE_MODEL || "";

    // Ensure the dirs we own exist (best-effort; spawn surfaces real failures).
    // In useLogin mode we don't create/own the config dir — Claude's default.
    const ensure = [this.workdir];
    if (this.configDir) ensure.push(this.configDir);
    for (const d of ensure) {
      try {
        if (!existsSync(d)) mkdirSync(d, { recursive: true });
      } catch {
        /* surfaced later if it actually breaks the run */
      }
    }
  }

  // Common flags for every invocation (sandbox + output shape).
  baseArgs() {
    const a = ["--output-format", "json", "--permission-mode", this.permissionMode];
    if (this.maxBudgetUsd) a.push("--max-budget-usd", String(this.maxBudgetUsd));
    if (this.allowedTools) a.push("--allowedTools", ...this.allowedTools.split(/[,\s]+/).filter(Boolean));
    if (this.model) a.push("--model", this.model);
    return a;
  }

  // Fresh, isolated run. opts: { sessionId?, ephemeral? }.
  run(prompt, opts = {}) {
    const args = ["-p", prompt, ...this.baseArgs()];
    if (opts.sessionId) args.push("--session-id", opts.sessionId);
    if (opts.ephemeral) args.push("--no-session-persistence");
    return this.exec(args);
  }

  // Continue a session by explicit ref (NEVER ambient --continue/--last). Throws
  // on failure so the core falls back to replay (design §4).
  async resume(sessionRef, prompt, _opts = {}) {
    const args = ["-p", prompt, "--resume", sessionRef, ...this.baseArgs()];
    const res = await this.exec(args);
    if (!res.ok) {
      throw new Error(`resume failed for ${sessionRef}: ${res.error}`);
    }
    return res;
  }

  // Best-effort cleanup of the session transcript in the isolated home (design
  // §6). Claude writes it at <config>/projects/<cwd-slug>/<session>.jsonl, where
  // the slug is the workdir path with every non-alphanumeric char → "-".
  // MINIMAL: best-effort + flagged; the isolated home is disposable regardless.
  closeSession(sessionRef) {
    try {
      const slug = this.workdir.replace(/[^a-zA-Z0-9]/g, "-");
      const file = join(this.effectiveConfigDir, "projects", slug, `${sessionRef}.jsonl`);
      if (existsSync(file)) rmSync(file, { force: true });
    } catch {
      /* best-effort */
    }
  }

  // Spawn claude, capture stdout, parse the single-result JSON.
  // Resolves to {ok, text, sessionRef} or {ok:false, error}.
  exec(args) {
    return new Promise((resolve) => {
      const env = { ...process.env };
      // null configDir (useLogin) → leave CLAUDE_CONFIG_DIR alone so Claude finds
      // the user's default login; otherwise point it at the isolated home.
      if (this.configDir) env.CLAUDE_CONFIG_DIR = this.configDir;
      if (this.apiKey) env.ANTHROPIC_API_KEY = this.apiKey;

      const child = spawn(this.bin, args, {
        cwd: this.workdir,
        stdio: ["ignore", "pipe", "pipe"],
        env,
      });
      let out = "";
      let err = "";
      child.stdout.on("data", (d) => (out += d));
      child.stderr.on("data", (d) => (err += d));
      child.on("error", (e) => resolve({ ok: false, error: `spawn failed: ${e.message}` }));
      child.on("close", (code) => {
        const parsed = parseResult(out);
        if (parsed && parsed.is_error) {
          // Surface Claude's own error text (e.g. "Not logged in", budget cap).
          resolve({ ok: false, error: `${parsed.subtype || "error"}: ${parsed.result || ""}`.trim() });
          return;
        }
        if (parsed && typeof parsed.result === "string") {
          resolve({ ok: true, text: parsed.result, sessionRef: parsed.session_id });
          return;
        }
        // Couldn't parse a result — fall back to exit code + captured streams.
        if (code !== 0) {
          resolve({ ok: false, error: `claude exited ${code}: ${(err || out).trim().slice(0, 500)}` });
          return;
        }
        resolve({ ok: false, error: `claude returned no parseable result: ${out.trim().slice(0, 300)}` });
      });
    });
  }
}

function truthy(v) {
  return ["1", "true", "yes", "on"].includes(String(v ?? "").trim().toLowerCase());
}

function expandTilde(p) {
  if (typeof p === "string" && (p === "~" || p.startsWith("~/"))) {
    return join(homedir(), p.slice(1));
  }
  return p;
}

// Parse `claude -p --output-format json` (single result object). Tolerant: if
// stdout has leading noise, grab the last JSON object line.
function parseResult(stdout) {
  const trimmed = String(stdout || "").trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    // Some environments may emit log lines before the JSON — try the last line
    // that parses as an object.
    const lines = trimmed.split(/\r?\n/).reverse();
    for (const line of lines) {
      const s = line.trim();
      if (s.startsWith("{") && s.endsWith("}")) {
        try {
          return JSON.parse(s);
        } catch {
          /* keep looking */
        }
      }
    }
    return null;
  }
}
