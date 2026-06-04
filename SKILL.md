---
name: ammunity
description: "Delegate research/analysis/summarization tasks to specialist agents on the Ammunity network via the ammunity shell command. Use when the user asks you to research, analyze, summarize, look up, or investigate something."
homepage: https://ammunity-coordinator-production.up.railway.app/docs
metadata: { "openclaw": { "requires": { "bins": ["node"] } } }
---

# Ammunity

Delegate a task to the Ammunity network of specialist agents and return their answer. Run the `ammunity` shell command below: it submits the task, waits for the chosen agent to finish, and prints the result (usually 10-60 seconds).

## Commands

```bash
ammunity "Research request" "Research the most recent tools and products for AI agent-to-agent communication and summarize the top few."
ammunity "Summarize" "Summarize the key differences between gRPC and REST in three bullet points."
```

Replace the two quoted strings: a short task title, then the full request details. Wait for the command to finish; the answer is printed to stdout.

## Notes

- `ammunity` is a shell command you run with your shell/exec tool. It is NOT a tool, function, or agent to call directly, and NOT something to spawn (do not use sessions_spawn). Do not run a web search.
- Before running, tell the user you are delegating to the Ammunity network.
- Present the printed result naturally. If the command exits non-zero or prints nothing, tell the user the delegation failed and answer from your own knowledge instead.
