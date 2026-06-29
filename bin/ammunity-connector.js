#!/usr/bin/env node
/**
 * Ammunity connector installer — `npx ammunity-connector` (interim:
 * `npx github:ARandomGuy9786/ammunity-connector`).
 *
 * One interactive installer, branches on role (send / receive / both):
 *   - receive: places the uniform receiver daemon in a stable home, installs
 *     deps, writes an isolated .env (chmod 600). Per-OS service generation
 *     (systemd/launchd) lands in the next batch (piece D); until then it prints
 *     the run command (or `--start` runs it in the foreground).
 *   - send: prints the MCP-add snippet (full multi-platform issuer = the
 *     dashboard Connect panel / piece E).
 *
 * Security posture (design §6.2): interactive HIDDEN credential entry — no
 * secret in the URL, the command, or shell history. Service files are GENERATED
 * per-host, never shipped (the 2026-06-29 leak). This is piece A+B+C of
 * agent_install.md §6.1.
 */

import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { ask, askHidden, askSelect, confirm, readStdinLine } from "../installer/prompts.js";
import { preflight, hasClaudeLogin } from "../installer/system.js";
import { defaultHome, placeRuntime, installDeps, writeEnv } from "../installer/runtime.js";

const VERSION = "0.1.0";
const COORDINATOR_DEFAULT = "https://ammunity-coordinator-production.up.railway.app";
// The hosted MCP send endpoint — the trailing slash is MANDATORY (no-slash
// 307-redirects to plaintext http:// and can drop the auth header).
const MCP_URL = `${COORDINATOR_DEFAULT}/mcp/`;

// ── tiny arg parser ────────────────────────────────────────────────────────
function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      if (eq !== -1) {
        out[a.slice(2, eq)] = a.slice(eq + 1);
      } else {
        const key = a.slice(2);
        const next = argv[i + 1];
        if (next && !next.startsWith("-")) {
          out[key] = next;
          i++;
        } else {
          out[key] = true;
        }
      }
    } else if (a === "-y") out["non-interactive"] = true;
    else if (a === "-h") out.help = true;
    else if (a === "-v") out.version = true;
    else out._.push(a);
  }
  return out;
}

const log = (...a) => console.log("›", ...a);
const ok = (...a) => console.log("✓", ...a);
const warn = (...a) => console.log("⚠", ...a);

function printHelp() {
  console.log(`
Ammunity connector installer (v${VERSION})

Usage:
  npx ammunity-connector                 interactive (recommended)
  npx github:ARandomGuy9786/ammunity-connector

Options:
  --role <send|receive|both>     what this host does
  --brain <openclaw|claude>      (receive) which agent brain runs tasks
  --agent-id <uuid>              the agent's Ammunity ID
  --coordinator-url <url>        override the coordinator (default: production)
  --claude-auth <login|apikey>   (claude brain) auth mode
  --home <dir>                   install home (default: ~/.ammunity/connector)
  --start                        (receive) run the daemon in the foreground after install
  --skip-deps                    don't run npm install
  --non-interactive, -y          don't prompt; take values from flags/env
  --uninstall                    remove the install home
  --help, -h                     this help
  --version, -v                  print version

Credentials are entered HIDDEN at a prompt (never on the command line). For
automation, pass the key via the AMMUNITY_AGENT_KEY env var or on stdin.
`);
}

async function getRole(args, interactive) {
  if (args.role) return String(args.role).toLowerCase();
  if (!interactive) return "receive";
  return askSelect(
    "What should this host do?",
    [
      { value: "receive", label: "receive — do work for the network (runs a daemon)" },
      { value: "send", label: "send — delegate tasks out (MCP, no daemon)" },
      { value: "both", label: "both" },
    ],
    "receive"
  );
}

async function getBrain(args, interactive) {
  if (args.brain) return String(args.brain).toLowerCase();
  if (!interactive) return "openclaw";
  return askSelect(
    "Which agent brain runs received tasks?",
    [
      { value: "openclaw", label: "OpenClaw" },
      { value: "claude", label: "Claude Code" },
      { value: "codex", label: "Codex", disabled: true, note: "adapter lands later" },
    ],
    "openclaw"
  );
}

async function getKey(args, interactive) {
  if (process.env.AMMUNITY_AGENT_KEY) return process.env.AMMUNITY_AGENT_KEY.trim();
  if (!interactive) return (await readStdinLine()).trim();
  return askHidden("API key (hidden — starts with ammu_)");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return printHelp();
  if (args.version) return console.log(VERSION);

  const interactive = !args["non-interactive"];
  const home = args.home ? String(args.home) : defaultHome();

  console.log(`\n  Ammunity connector installer  ·  v${VERSION}\n`);

  if (args.uninstall) {
    if (!existsSync(home)) return ok(`nothing to remove (${home} doesn't exist).`);
    if (interactive && !(await confirm(`Remove the install home ${home}?`, false))) return log("cancelled.");
    rmSync(home, { recursive: true, force: true });
    ok(`removed ${home}.`);
    warn("If you installed a service (systemd/launchd), remove it manually — service teardown lands with piece D.");
    return;
  }

  // ── collect answers ────────────────────────────────────────────────────
  const role = await getRole(args, interactive);
  if (!["send", "receive", "both"].includes(role)) {
    console.error(`Invalid --role "${role}". Use send | receive | both.`);
    process.exit(1);
  }
  const brain = role === "send" ? null : await getBrain(args, interactive);
  if (brain && !["openclaw", "claude"].includes(brain)) {
    console.error(`Invalid --brain "${brain}". v1 supports openclaw | claude (codex later).`);
    process.exit(1);
  }

  // Preflight (after role/brain so we can check the right brain binary).
  const pre = preflight({ role, brain });
  log(`detected ${pre.os.label} (service manager: ${pre.os.service})`);
  for (const w of pre.warnings) warn(w);
  if (!pre.ok) {
    for (const e of pre.errors) console.error("✗", e);
    process.exit(1);
  }

  const agentId = args["agent-id"] ? String(args["agent-id"]) : interactive ? await ask("Agent ID (UUID)") : "";
  if (!agentId) {
    console.error("✗ Agent ID is required (register the agent on the dashboard first).");
    process.exit(1);
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(agentId)) {
    warn(`"${agentId}" doesn't look like a UUID — continuing, but double-check it.`);
  }

  const agentKey = await getKey(args, interactive);
  if (!agentKey) {
    console.error("✗ API key is required (generate one on the agent's manage page).");
    process.exit(1);
  }
  if (!agentKey.startsWith("ammu_")) warn("the key doesn't start with `ammu_` — double-check you copied the agent key.");

  const coordinatorUrl =
    args["coordinator-url"] && String(args["coordinator-url"]) !== COORDINATOR_DEFAULT
      ? String(args["coordinator-url"])
      : null;

  // Claude auth (receive + claude brain only).
  let claudeAuth = null;
  let claudeApiKey = null;
  if ((role === "receive" || role === "both") && brain === "claude") {
    claudeAuth = args["claude-auth"]
      ? String(args["claude-auth"]).toLowerCase()
      : interactive
        ? await askSelect(
            "How should the Claude receiver authenticate?",
            [
              {
                value: "login",
                label: hasClaudeLogin() ? "use my existing ~/.claude login (free)" : "use my ~/.claude login (none found yet)",
              },
              { value: "apikey", label: "isolated home + Anthropic API key (per-token billing)" },
            ],
            "login"
          )
        : "login";
    if (claudeAuth === "apikey") {
      claudeApiKey =
        process.env.AMMUNITY_CLAUDE_API_KEY ||
        process.env.ANTHROPIC_API_KEY ||
        (interactive ? await askHidden("Anthropic API key (hidden — starts with sk-ant-)") : "");
      if (!claudeApiKey) warn("no Anthropic API key provided — set ANTHROPIC_API_KEY before starting, or the receiver will report 'Not logged in'.");
    }
  }

  // Idempotent re-run guard.
  if (existsSync(join(home, ".env")) && interactive) {
    if (!(await confirm(`An install already exists at ${home}. Reconfigure it?`, true))) return log("cancelled — existing install untouched.");
  }

  const answers = { role, brain, agentId, agentKey, coordinatorUrl, brainBin: pre.brainBin, claudeAuth, claudeApiKey };

  // ── do the work ─────────────────────────────────────────────────────────
  console.log("");
  let placedHome = home;
  if (role === "receive" || role === "both") {
    const placed = placeRuntime(home, log);
    placedHome = placed.home;
    if (!args["skip-deps"]) installDeps(placedHome, log);
    else log("skipping npm install (--skip-deps)");
    writeEnv(placedHome, answers, log);
  } else {
    // send-only: still write the .env into the home so the key has one home,
    // but the daemon isn't placed (send uses MCP, not the daemon).
    mkdirSync(home, { recursive: true });
    writeEnv(home, answers, log);
  }

  // ── report + next steps ───────────────────────────────────────────────
  console.log("");
  ok("install complete.\n");

  if (role === "send" || role === "both") {
    console.log("SEND — add the Ammunity tool to your MCP host. For Claude Code:\n");
    console.log(`  claude mcp add --transport http ammunity \\`);
    console.log(`    ${MCP_URL} \\`);
    console.log(`    --header "Authorization: Bearer <YOUR_AMMUNITY_KEY>"\n`);
    console.log(`  Your key is saved in ${join(home, ".env")} (AMMUNITY_AGENT_KEY) — paste it in place of`);
    console.log("  <YOUR_AMMUNITY_KEY>. The dashboard's Connect panel issues ready-made snippets for all");
    console.log("  hosts; full multi-platform send config from the installer arrives in a later batch.\n");
  }

  if (role === "receive" || role === "both") {
    const runCmd = `node receiver/ws_client.js`;
    console.log("RECEIVE — the daemon is installed. Per-OS service auto-start (systemd/launchd)");
    console.log("arrives in the next batch; for now, run it like this:\n");
    console.log(`  cd ${placedHome} && ${runCmd}\n`);
    if (args.start) {
      log("starting the receiver in the foreground (Ctrl-C to stop)…\n");
      const child = spawn("node", ["receiver/ws_client.js"], { cwd: placedHome, stdio: "inherit" });
      child.on("exit", (code) => process.exit(code ?? 0));
      return; // hand the process over to the daemon
    }
    console.log("  (or re-run this installer with --start to launch it in the foreground.)\n");
  }
}

main().catch((e) => {
  console.error("\n✗ installer error:", e && e.message ? e.message : e);
  process.exit(1);
});
