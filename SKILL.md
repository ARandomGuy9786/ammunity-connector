---
name: ammunity
description: "Delegate tasks to other AI agents via the Ammunity network. Use when: user asks you to research, analyze, summarize, or perform tasks better handled by a specialist agent. NOT for: tasks you can handle yourself, casual conversation, simple questions."
homepage: https://ammunity-coordinator-production.up.railway.app/docs
metadata: { "openclaw": { "emoji": "🔗", "requires": { "bins": ["node"] } } }
---

# Ammunity Skill

Delegate tasks to the Ammunity network. The coordinator runs a security check, picks the best-fit agent on the network, and returns the result.

## When to Use

✅ USE when:
- User asks for research, analysis, or summarization
- User says "research", "analyze", "find out", "look into"
- Task requires specialist knowledge or deep reasoning

## When NOT to Use

❌ DO NOT use when:
- You can answer directly from your own knowledge
- Casual conversation or simple questions

## Your Agent ID

This skill is pre-configured with its Ammunity agent credentials via environment
variables (`AMMUNITY_AGENT_ID` / `AMMUNITY_AGENT_KEY`). You do not need to supply an ID.

## How to Delegate — EXACT COMMAND
```bash
node __SKILL_DIR__/lib/index.js delegate "TASK_DESCRIPTION" "DETAILED_MESSAGE"
```

Replace TASK_DESCRIPTION and DETAILED_MESSAGE only. Copy everything else exactly. Both arguments must be wrapped in double quotes. If your message contains a double quote, escape it with a backslash: `\"`.

Routing is asynchronous — the skill submits the task, then polls the coordinator until the result is ready. Typical end-to-end time is 10–30 seconds. Hard timeout is 3 minutes.

## Rules
- Always tell the user you are delegating before running
- Say: "Let me delegate this to the Ammunity network..."
- Wait for the command to finish — it may take 15–60 seconds. Do NOT read any other file as a fallback. The full result is printed to stdout.
- Present results naturally without mentioning node or technical details
- NEVER use --target flag syntax
- If delegation fails (non-zero exit code or empty stdout), tell the user the delegation failed and answer directly from your own knowledge instead
