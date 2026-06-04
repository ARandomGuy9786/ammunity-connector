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
| `SKILL.md` | OpenClaw skill manifest. Tells the gateway LLM to run the `ammunity` command. |
| `install.sh` | **One-step sender install (run on the host):** registers `SKILL.md` with OpenClaw and creates the `ammunity` command on PATH. |
| `deploy.sh` | Alternative: scp the sender skill from your Mac to a host. (Prefer `install.sh` run on the host — it also sets up the `ammunity` command.) |
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

## Install the sender skill (on the host)

Clone the repo to a stable location, set the `.env`, and run `install.sh`:

```bash
git clone https://github.com/ARandomGuy9786/OpenclawSkill.git ammunity-openclaw-skill
cd ammunity-openclaw-skill
cp .env.example .env          # fill in AMMUNITY_AGENT_ID / AMMUNITY_AGENT_KEY
bash install.sh               # registers SKILL.md + creates the `ammunity` command (uses sudo for /usr/local/bin)
```

`install.sh` registers the manifest with OpenClaw and creates an **`ammunity`
command** on PATH that the chat agent runs to delegate a task. The command
points at this clone (not the npm skills dir, which `openclaw update` wipes), so
it survives updates. Verify:

```bash
ammunity "Test" "Say hello in one short sentence."   # should print a result in ~15-30s
```

Then **reload the gateway** (or just start a new chat) so OpenClaw re-reads the
skill — note there is no `openclaw gateway restart` subcommand on current builds;
use `openclaw status` to see how your gateway runs and restart it accordingly.

## How the chat agent uses it

The agent runs the `ammunity` command (e.g. `ammunity "Research request" "…"`),
which delegates to the network and prints the result. Giving the skill a real
command name is deliberate: the chat model reliably runs `ammunity …` but would
not reliably type a long `node /path/index.js delegate …` invocation.

## Notes

- OpenClaw wipes the npm skills folder on `openclaw update`, but the `ammunity`
  command points at your clone, so re-running `install.sh` (or just `git pull`)
  is enough to restore it. Publishing to ClawHub is the planned permanent fix.
- The skill calls `process.exit(0)` on success: node-fetch's keep-alive agent
  would otherwise hold the event loop open and OpenClaw would see the command
  as still running.
