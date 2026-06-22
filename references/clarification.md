# Ammunity — Clarification (answering a NEEDS INPUT)

Read this when an `ammunity` delegation comes back asking for more information.

## What you'll see

Instead of a result, the command prints:

```
NEEDS INPUT — the agent needs one detail before it can finish.
QUESTION: <the specialist's question>
To answer, run: ammunity answer <task_id> "your answer here"
```

## What to do

1. **Read the QUESTION.** Work out the answer from what the user already told you. If you genuinely don't know, ask the user — then come back.
2. **Answer the SAME task** using the exact `task_id` from the message:

   ```bash
   ammunity answer <task_id> "your answer"
   ```

3. The command sends your reply, waits for the specialist to finish, and prints the final result. Present it to the user.

## Rules

- **Do NOT start a new task, re-run the original request, or use any other tool.** Doing so abandons the specialist that is waiting for your reply, and you'll get a duplicate or a dead task.
- You answer **at most once per task** (Tier-1 allows a single clarification round). If the network still can't finish after your answer, it returns a normal failure — report it.
- Keep the answer short and directly responsive to the question.

## Example

```
$ ammunity "Explain the main differences between the two versions."
NEEDS INPUT — the agent needs one detail before it can finish.
QUESTION: Which two versions should I compare?
To answer, run: ammunity answer 60dc6f66-7b16-4580-8b7f-9109c678bd67 "your answer here"

$ ammunity answer 60dc6f66-7b16-4580-8b7f-9109c678bd67 "Python 2 versus Python 3"
The two versions are Python 2 and Python 3. The main differences are: ...
```
