/**
 * Preflight + system detection for the installer (framework-agnostic).
 *
 * Cross-platform from the start (the standing discipline): OS detection drives
 * which service manager piece D will generate (systemd / launchd / Windows);
 * binary detection uses `command -v` on Unix and `where` on Windows. Nothing
 * here is host-specific or hardcoded — every value is read from the live host.
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const MIN_NODE_MAJOR = 18; // global fetch, fs.cpSync, stable ESM

// "darwin" | "linux" | "win32" | … — the raw process.platform.
export function detectOS() {
  return process.platform;
}

// Friendly label + which service manager piece D will target.
export function osInfo() {
  const platform = detectOS();
  switch (platform) {
    case "darwin":
      return { platform, label: "macOS", service: "launchd", supported: true };
    case "linux":
      return { platform, label: "Linux", service: "systemd", supported: true };
    case "win32":
      return { platform, label: "Windows", service: "windows", supported: false };
    default:
      return { platform, label: platform, service: "unknown", supported: false };
  }
}

// Locate an executable on PATH. Returns the absolute path or null.
// (systemd/launchd run with a minimal PATH, so the .env needs absolute bin paths.)
export function which(bin) {
  const cmd = process.platform === "win32" ? "where" : "command";
  const args = process.platform === "win32" ? [bin] : ["-v", bin];
  // `command -v` is a shell builtin → run it through the shell.
  const res =
    process.platform === "win32"
      ? spawnSync(cmd, args, { encoding: "utf8" })
      : spawnSync(process.env.SHELL || "/bin/sh", ["-c", `command -v ${bin}`], { encoding: "utf8" });
  if (res.status === 0) {
    const out = (res.stdout || "").trim().split(/\r?\n/)[0];
    return out || null;
  }
  return null;
}

export function nodeMajor() {
  return Number.parseInt(process.versions.node.split(".")[0], 10);
}

// Returns { ok, warnings[], errors[] } — errors block, warnings don't.
export function preflight({ role, brain }) {
  const warnings = [];
  const errors = [];

  const os = osInfo();
  if (!os.supported) {
    warnings.push(
      `${os.label} isn't a v1 target yet (v1 = Linux + macOS; Windows is a fast-follow). ` +
        `The .env will still be written, but per-OS service generation may not run.`
    );
  }

  const major = nodeMajor();
  if (major < MIN_NODE_MAJOR) {
    errors.push(`Node ${process.versions.node} is too old — Ammunity needs Node ${MIN_NODE_MAJOR}+.`);
  }

  if (!which("npm")) {
    warnings.push("npm not found on PATH — dependency install will be skipped (run `npm install` in the install home yourself).");
  }

  // Brain binary (receive only). Warn — the user may install it next.
  let brainBin = null;
  if (role === "receive" || role === "both") {
    if (brain === "openclaw") {
      brainBin = which("openclaw");
      if (!brainBin) warnings.push("`openclaw` not found on PATH — install it before starting the receiver, or set OPENCLAW_BIN.");
    } else if (brain === "claude") {
      brainBin = which("claude");
      if (!brainBin) warnings.push("`claude` (Claude Code CLI) not found on PATH — install it before starting the receiver, or set CLAUDE_BIN.");
    }
  }

  return { ok: errors.length === 0, warnings, errors, os, brainBin };
}

// Does this host have a usable default Claude login (~/.claude)? Used to advise
// the "use my login" auth choice for the Claude receiver brain.
export function hasClaudeLogin() {
  return existsSync(join(homedir(), ".claude"));
}
