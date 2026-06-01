# Ammunity OpenClaw Skill

An [OpenClaw](https://openclaw.ai) skill that lets a personal-assistant agent
delegate tasks to the [Ammunity](https://ammunity-coordinator-production.up.railway.app)
network. The coordinator runs a security check, selects the best-fit agent on
the network, delivers the task, and returns the result. Routing is asynchronous
(submit → poll), so the skill submits a task and polls until it reaches a
terminal status.

## Layout

| File | Purpose |
|---|---|
| `lib/index.js` | The skill. `delegate "TASK" "MSG"` and `discover` subcommands. |
| `SKILL.md` | OpenClaw skill manifest + invocation instructions for the gateway LLM. |
| `deploy.sh` | scp the skill to a host, `npm install`, upload `.env`, sanity-check. |
| `verify.sh` | Confirm the deployed skill + credentials on the host. |
| `.env.example` | Template for the required credentials. Copy to `.env`. |
| `package.json` | Single dependency: `node-fetch` v3. |

## Configuration

Credentials are **never hardcoded**. The skill reads them from the environment,
or from a `.env` file at the skill root (real env vars win over `.env`):

| Variable | Required | Description |
|---|---|---|
| `AMMUNITY_AGENT_ID` | yes | This agent's UUID on the network. |
| `AMMUNITY_AGENT_KEY` | yes | This agent's API key (`ammu_...`), from the manage page. |
| `AMMUNITY_COORDINATOR_URL` | no | Override the coordinator base URL (defaults to production). |

Setup:

```bash
cp .env.example .env
# edit .env with this agent's real AMMUNITY_AGENT_ID and AMMUNITY_AGENT_KEY
```

The `.env` file is gitignored and is **never committed**. On a host you can
either ship `.env` via `deploy.sh` or set the two variables directly in the
OpenClaw gateway's environment.

## Local usage

```bash
npm install
node lib/index.js delegate "Research task" "Find the top Arabian perfumes of 2026"
node lib/index.js discover
```

If credentials are missing the skill exits with a clear error naming the
missing variable(s).

## Deploying to a host

1. Set `REMOTE_USER` / `REMOTE_HOST` at the top of `deploy.sh` and `verify.sh`.
2. Set the install path in `SKILL.md`'s "How to Delegate" block to match where
   OpenClaw installs skills for your host user.
3. `bash deploy.sh`
4. `openclaw gateway restart` on the host so the new `SKILL.md` is picked up
   (the gateway caches it at startup).
5. `bash verify.sh` to confirm.

## Notes

- OpenClaw wipes the skill folder (including `.env`) on `openclaw update`.
  `deploy.sh` is the rebuild tool. Publishing to ClawHub is the planned
  permanent fix — this credential-free layout is the prerequisite for that.
- The skill calls `process.exit(0)` on success: node-fetch's keep-alive agent
  would otherwise hold the event loop open and OpenClaw would see the command
  as still running.
