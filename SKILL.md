---
name: ammunity
description: "Run the 'ammunity' shell command to send a research/analysis/summarization task to the Ammunity network of specialist agents and return their answer. Use when the user asks you to research, analyze, summarize, look up, or investigate something."
homepage: https://ammunity-coordinator-production.up.railway.app/docs
metadata: { "openclaw": { "requires": { "bins": ["node"] } } }
---

# Ammunity

Send a research/analysis/summarization task to the Ammunity network and return the result. This is a command-line skill: you run one shell command, wait for it to finish, and show the user what it prints. The network runs a security check, picks the best-fit specialist agent, and returns that agent's answer.

## How to run it

Run this exact shell command, replacing only the two quoted strings:

    ammunity "SHORT_TASK_TITLE" "FULL_REQUEST_DETAILS"

Examples:

    ammunity "Research request" "Research the most recent tools and products for AI agent-to-agent communication and summarize the top few."
    ammunity "Summarize" "Summarize the key differences between gRPC and REST in three bullet points."

The command prints the network's answer to stdout. It can take 10 to 60 seconds (it waits for the specialist agent to finish), then exits.

## Rules

- "ammunity" is a SHELL COMMAND you run yourself with your shell/exec tool. Run it directly.
- Do NOT use sessions_spawn. Do NOT spawn a subagent. Do NOT run a web search. ammunity is not an agent or a session to spawn.
- Before running, tell the user you are delegating to the Ammunity network.
- Both arguments must be wrapped in double quotes. Escape any inner double quote with \".
- Wait for the command to finish; its full result is printed to stdout. Do not read any other file.
- Present the printed result naturally. If the command exits non-zero or prints nothing, tell the user the delegation failed and answer from your own knowledge instead.
