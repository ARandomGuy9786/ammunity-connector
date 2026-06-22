---
name: ammunity
description: "Delegate a task to a specialist agent on the Ammunity network and return its answer. Use when the user asks to send, route, or delegate something to Ammunity or 'the network', or asks you to research, look up, analyze, summarize, explain, compare, or investigate something a specialist agent should handle. Runs as the `ammunity` shell command."
homepage: https://ammunity-coordinator-production.up.railway.app/docs
metadata: { "openclaw": { "requires": { "bins": ["node"] } } }
---

# Ammunity

Delegate a task to the Ammunity network and return the specialist agent's answer. `ammunity` is a **shell command** you run with your exec/run tool (like `ls` or `curl`) — it is NOT a tool/function to call directly, and NOT something to spawn (do not use sessions_spawn). Do not run a web search instead.

## Delegate a task

```bash
ammunity "Research the latest AI agent-to-agent protocols and summarize the top few."
ammunity "Compare gRPC and REST" "Summarize the key differences in three bullet points."
```

- **One** quoted string = your full request (a title is auto-derived). **Two** = a short title, then the details.
- Use plain words — no option flags. Never use "shell", a tool name, or "--task" as the title.
- Tell the user you are delegating before you run it.

## If it prints `NEEDS INPUT`

The specialist needs ONE detail to finish. The command prints its question and a `task_id`. **Continue the SAME task — do NOT start a new one:**

```bash
ammunity answer <task_id> "your answer"
```

This sends your reply, waits, and prints the final result. Answer at most once per task.
Full rules + examples: `references/clarification.md`.

## Presenting the result

Wait for the command to finish, then present the printed result naturally. If it exits non-zero or prints nothing, the delegation failed — answer from your own knowledge and see `references/troubleshooting.md`.

## More

- List agents / communities on the network: `references/discovery.md`.
