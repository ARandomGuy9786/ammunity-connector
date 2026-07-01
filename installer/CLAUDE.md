# installer/ — the v1 receive installer

You are in the receive installer: the `npx`-invokable, one-command setup that turns a fresh host into a registered, reboot-surviving receiver. Read `../CLAUDE.md` (connector) and the root `../../CLAUDE.md` first. The full build plan is `docs/architecture/agent_install.md §6.1` (pieces A–F).

## Shape
- **`../bin/ammunity-connector.js`** — the CLI entrypoint (npm `bin`). Invokable via `npx github:ARandomGuy9786/ammunity-connector` until `@ammunity/connector` is published.
- **`prompts.js`** — interactive entry (hidden credential entry, brain selection).
- **`system.js`** — OS/brain detection + preflight (Linux/macOS/Windows already detected here).
- **`runtime.js`** — places the daemon in a stable home, `npm install`, `chmod 600 .env`.
- **`service.js`** — piece D: generates + installs the per-OS service (systemd `--user` / launchd LaunchAgent) and tears it down on `--uninstall`.
- **`../wrappers/`** — piece F: `install.sh` / `install.ps1` one-liner bootstraps (ensure Node → `npx`).

## Status (as of 2026-07-01b)
- ✅ Pieces **A + B + C + D + F** shipped.
  - **D** — per-OS service generation (`service.js`): generated per-host, install/enable/start/verify + `--uninstall` teardown + `--no-service` opt-out. **Live-proven on Linux (VPS1) + macOS.** Windows = fast-follow.
  - **F** — `wrappers/install.sh` + `install.ps1`: ensure Node ≥18, then `npx` the installer. Hosting deferred to Theme 3; interim source `npx github:ARandomGuy9786/ammunity-connector`.
- ⛔ **E** (multi-platform send config) — **CUT.** The dashboard Connect panel (`ammunity-web/lib/installSnippets.ts`) is the send issuer; this installer is receive-focused. Rationale in `agent_install.md §6.1` + the 2026-07-01b handoff.
- ⏳ Remaining (not installer code): npm publish, wrapper hosting URL (Theme 3), VPS migration of `f50132b6`.

## Service model (piece D)
Per-**user** services on purpose: launchd LaunchAgents are inherently per-user (run at login, can see the user's own `~/.claude`), so systemd uses `systemctl --user` + `loginctl enable-linger` to match — neither needs root. Generated units live in `~/.config/systemd/user/` (Linux) / `~/Library/LaunchAgents/` (macOS), NOT in the install home. `--start` (foreground) skips the service so you don't run two daemons on one key.

## The cardinal rule
Everything host-specific (`.env`, service units) is **GENERATED here at install time from the live host's values — never committed.** This is the exact class of the 2026-06-29 leak. Generated files must be `chmod 600` where they hold secrets. The `secret-scan` hook blocks commits that contain host paths/IPs/secrets; do not rely on it as your only check.
