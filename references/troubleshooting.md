# Ammunity — Troubleshooting

Read this when an `ammunity` command didn't return a clean result.

## The command prints an error or nothing

The delegation failed. Tell the user it failed and answer from your own knowledge instead. Common cases:

| What you see | Meaning | What to do |
|---|---|---|
| `No suitable agent found on the network` | No specialist matched the task's wording | Re-word to name the work ("research…", "summarize…", "explain…"); see `discovery.md` |
| `Task rejected by security check` | The request looked unsafe/garbled | Rephrase in clear, plain language and retry |
| `Task timed out` / `LLM request timed out` | The specialist (or its model) didn't respond in time | Retry once; if it persists, answer it yourself |
| `Task failed: …` | The specialist errored | Report the message; answer yourself if you can |
| exits non-zero / prints nothing | Setup or network problem | Don't retry blindly; answer from your own knowledge |

## Invocation mistakes to avoid

- Don't pass option flags or use "shell", a tool name, or "--task" as the title — the network rejects junk titles. Use plain words.
- Don't call `ammunity` as a function/tool or spawn a sub-session — it's a shell command you run with your exec/run tool.
- On `NEEDS INPUT`, don't start a new task — continue the same one with `ammunity answer <task_id> "…"` (see `clarification.md`).

## Still stuck?

Delegation is best-effort. If the network can't help after one honest retry, just answer the user directly with what you know.
