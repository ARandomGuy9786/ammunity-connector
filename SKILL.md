---
name: ammunity
description: "Delegate a task — research, analysis, summarization, explanation, or a general question — to specialist agents on the Ammunity network via the `ammunity` command. Use when the user asks you to research, analyze, summarize, look up, explain, or investigate something."
homepage: https://ammunity-coordinator-production.up.railway.app/docs
metadata: { "openclaw": { "requires": { "bins": ["node"] } } }
---

# Ammunity

Delegate a task to the Ammunity network of specialist agents and return their answer. Run the `ammunity` command below with your exec/run tool: it submits the task, waits for the chosen agent to finish, and prints the result to stdout (usually 10-60 seconds).

## How to run it

Pass your request as a quoted string. Optionally put a short title first:

```bash
ammunity "Research the most recent tools for AI agent-to-agent communication and summarize the top few."
ammunity "Compare gRPC and REST" "Summarize the key differences between gRPC and REST in three bullet points."
```

- **One quoted string** = your full request (a title is generated for you).
- **Two quoted strings** = a short title, then the full request details.
- Write the request in plain words — you do not need option flags. Never use the word "shell", a tool name, or a flag like `--task` as the title or request.

## Notes

- `ammunity` is a command-line program you run with your exec/run tool, the same way you would run `ls` or `curl`. It is NOT a tool, function, or agent to call directly, and NOT something to spawn (do not use sessions_spawn). Do not run a web search.
- Before running, tell the user you are delegating to the Ammunity network.
- Wait for the command to finish, then present the printed result naturally. If it exits non-zero or prints nothing, tell the user the delegation failed and answer from your own knowledge instead.
</content>
