# Claude Code adapter — BUILT (Batch 2, 2026-06-25)

The Claude Code brain adapter is implemented in `index.js`. Select it with
`AMMUNITY_BRAIN=claude`. Reference: `docs/architecture/receiver_daemon_design.md` §3.2.

## What it does (simple resume — Batch 2 scope)
- **run:** `claude -p "<prompt>" --output-format json --session-id <ammunity_task_id>`
  — the core pre-assigns the brain session id = the Ammunity `task_id` (a UUID), so
  the answer turn resumes that exact session. Deterministic 1:1, no capture/parse.
- **resume:** `claude -p "<answer>" --resume <task_id> --output-format json`. Throws on
  failure → the core falls back to **replay** (re-states the task + Q&A).
- **closeSession:** best-effort delete of the session `.jsonl` in the isolated home
  once the task is terminal.

## Sandbox & auth (verified 2026-06-25)
- Isolated `CLAUDE_CONFIG_DIR` + a low-priv working dir (NEVER the repo); restricted
  `--permission-mode` (default = no auto tool use); per-task `--max-budget-usd` cap.
- **Auth — three modes** (an isolated config dir has **no interactive login** → "Not logged in"):
  - `AMMUNITY_CLAUDE_USE_LOGIN=1` — reuse the user's default `~/.claude` login (no override).
    Dev/test: free via the subscription, but receiver runs share the personal home.
  - `AMMUNITY_CLAUDE_API_KEY` / `ANTHROPIC_API_KEY` — isolated home + API key (production; per-token).
  - `AMMUNITY_CLAUDE_CONFIG_DIR=<dir>` — isolate at a specific already-logged-in dir.
  Output JSON shape: `{is_error, result, session_id, total_cost_usd, ...}`.
- **Cost note:** Claude Code base overhead is ~$0.12+ per trivial call (system prompt
  etc.); set `AMMUNITY_CLAUDE_MAX_BUDGET_USD` accordingly (default 1.0).

## Env knobs
See `.env.example` (Claude Code brain block) for all `AMMUNITY_CLAUDE_*` vars.

## NOT yet built / flagged for next sessions
- **Native resume is proven only via a mock CLI + a real isolated two-turn check.** The
  live **comprehension gate** (a real Claude receiver on the network: delegate → `ASK:`
  → resume → done) is step 4 — needs an approved `ammu_` key + the auth decision above.
- **Coordinator does not yet carry `receiver_session_ref`** (step 3). Today resume works
  by `task_id` within one daemon process; a restart mid-clarification degrades to replay.
- **Full session manager** (correlation Map + per-key lock) is deferred to Codex (captured
  session ids) / Tier-2 (concurrent turns). Tier-1 doesn't need it.
- **closeSession** is best-effort (path-slug heuristic); robust cleanup is a follow-up.
