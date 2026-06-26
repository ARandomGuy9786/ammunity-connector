/**
 * Receiver daemon — action-contract rendering & parsing (framework-agnostic).
 *
 * The verb set is platform-neutral plain text (SYNC-1): the brain learns only
 * `ASK:` (ask one clarifying question) and DONE (any normal reply). The brain
 * never sees frames, keys, or protocol (principle 4) — this core renders the
 * task into a prompt and parses the brain's reply back into a verb.
 *
 * Three render modes, because continuity is achieved two different ways:
 *   - renderFresh      — first delivery (task + the always-on ASK convention).
 *   - renderReplay     — re-delivery for REPLAY adapters (OpenClaw) or the
 *                        resume fallback: the FULL task re-stated + the prior
 *                        Q&A, since the brain has no memory of the first turn.
 *   - renderAnswerTurn — re-delivery for NATIVE-RESUME adapters (Claude/Codex):
 *                        ONLY the answer, because the resumed session already
 *                        holds the original task + the brain's question.
 *
 * Kept short on purpose (progressive disclosure — SYNC-1 / principle 7).
 */

function taskText(msg) {
  return `${msg.task_description || ""}. ${msg.payload?.message || ""}`.trim();
}

function rounds(msg) {
  return Array.isArray(msg.context?.rounds) ? msg.context.rounds : [];
}

// First delivery: the task plus the tiny always-on action-contract.
export function renderFresh(msg) {
  return (
    `${taskText(msg)}\n\n` +
    `If — and only if — you genuinely cannot complete this without ONE specific ` +
    `missing detail, reply with exactly one line:\n` +
    `ASK: <your single question>\n` +
    `and nothing else. Otherwise, just complete the task and reply with the result.`
  );
}

// Re-delivery for REPLAY adapters (no native memory of the first turn): re-state
// the whole task and fold in the prior Q&A (restart-with-context).
export function renderReplay(msg) {
  const qa = rounds(msg)
    .filter((r) => r && r.answer != null)
    .map((r) => `You asked: "${r.question}"\nThe requester answered: "${r.answer}"`)
    .join("\n\n");
  return (
    `${taskText(msg)}\n\n` +
    `Earlier you needed more information to do this.\n${qa}\n\n` +
    `Now complete the original task using that answer. ` +
    `Do not ask any more questions — give your best result.`
  );
}

// Re-delivery for NATIVE-RESUME adapters: the session already has the task and
// the brain's own question, so feed ONLY the answer (the latest round).
export function renderAnswerTurn(msg) {
  const rs = rounds(msg).filter((r) => r && r.answer != null);
  const last = rs[rs.length - 1] || {};
  return (
    `The requester answered your question.\n` +
    `You asked: "${last.question || ""}"\n` +
    `They answered: "${last.answer || ""}"\n\n` +
    `Now complete the original task using that answer. ` +
    `Do not ask any more questions — give your best result.`
  );
}

// First-line-only `ASK:` detection (SYNC-1 §8.2). Returns the question, or null
// if the reply is a normal (DONE) result.
export function parseAsk(text) {
  const firstLine = String(text == null ? "" : text)
    .replace(/^\s+/, "")
    .split(/\r?\n/, 1)[0]
    .trim();
  const m = /^ASK:\s*(.+)$/i.exec(firstLine);
  return m ? m[1].trim() : null;
}
