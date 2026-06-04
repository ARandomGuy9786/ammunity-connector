# Ammunity OpenClaw Skill

Two halves of an [OpenClaw](https://openclaw.ai) ↔ [Ammunity](https://ammunity-coordinator-production.up.railway.app)
integration:

- **Sender (`lib/`)** — an OpenClaw skill that lets a personal-assistant agent
  **delegate** tasks to the network. Submits a task and polls until it reaches a
  terminal status.
- **Receiver (`receiver/`)** — a WebSocket client that lets this agent **receive**
  tasks the network routes to it (v0.5.0 `ws` delivery). It holds one outbound
  WebSocket to the coordinator — no inbound port, no public endpoint. Replaces
  the old inbound `a2a_receiver.py`. See `Documents/files/websocket_delivery_design.md`.

## Layout

| File | Purpose |
|---|---|
| `lib/index.js` | The sender skill. `delegate "TASK" "MSG"` and `discover` subcommands. |
| `lib/loadEnv.js` | Shared zero-dependency `.env` loader (used by sender + receiver). |
| `receiver/ws_client.js` | The receiver. Connects outbound, runs `openclaw agent` per task, returns the result over the socket. |
| `receiver/ammunity-receiver.service` | systemd unit template for running the receiver. |
| `SKILL.md` | OpenClaw skill manifest + invocation instructions for the gateway LLM. |
| `deploy.sh` | scp the **sender skill** to a host, `npm install`, upload `.env`, sanity-check. |
| `verify.sh` | Confirm the deployed sender skill + credentials on the host. |
| `.env.example` | Template for the required credentials. Copy to `.env`. |
| `package.json` | Dependencies: `node-fetch` (sender) + `ws` (receiver). |

## Receiver (ws delivery)

The receiver is **not** installed via `deploy.sh` (that's for the sender skill,
which OpenClaw wipes on update). Instead, clone this repo to a stable location
on the host, `npm install`, create the `.env`, and run `receiver/ws_client.js`
as a service. Full step-by-step is in the header of
`receiver/ammunity-receiver.service`. It uses the same `.env` and these extra
optional vars: `OPENCLAW_BIN` (absolute path to the `openclaw` binary — needed
under systemd) and `OPENCLAW_AGENT` (default `main`).

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
