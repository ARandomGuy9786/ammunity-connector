/**
 * Receiver daemon — the uniform core (framework-agnostic).
 *
 * Wires the transport to a brain adapter: on an inbound `task` frame it renders
 * the action-contract prompt, runs the selected brain via the adapter, parses
 * the reply (`ASK:` → ask frame; otherwise → result), and sends the outcome
 * back over the same socket tagged with the task_id.
 *
 * Continuity (design §4), in the SIMPLE form for Tier-1:
 *   - The coordinator frame decides fresh vs continuation: a re-delivery carries
 *     `context.rounds` (the prior Q&A). The correlation key is the `task_id`.
 *   - REPLAY adapters (OpenClaw, supportsResume=false) re-run with the full task
 *     re-stated + Q&A (renderReplay) — exactly the pre-refactor behavior.
 *   - NATIVE-RESUME adapters (Claude, supportsResume=true) pre-assign the brain
 *     session id = task_id on the fresh turn, then `resume(task_id, answerTurn)`.
 *     If resume throws (stale/unknown/silent-no-op), we FALL BACK to replay — the
 *     coordinator log / re-stated task is always the safety net.
 *
 * The one-round Tier-1 cap is enforced here (no ASK parse on a re-delivery) and
 * in the coordinator (defence in depth — SYNC-1).
 *
 * NOT YET BUILT (flagged for next sessions — design §4 full form):
 *   - The carried `receiver_session_ref` echoed by the coordinator (step 3) — so
 *     resume survives a daemon restart and the ref is in the audit log. Today the
 *     daemon resumes by `task_id` within its own process lifetime; a restart
 *     mid-clarification degrades to the replay fallback.
 *   - The correlation Map + per-key lock — needed for Codex (captured, not
 *     pre-assigned, session ids) and for Tier-2 concurrent turns. Tier-1 can't
 *     have two concurrent turns on one task (it parks on needs_input), so the
 *     lock isn't required yet.
 */

import { Transport } from "./transport.js";
import { renderFresh, renderReplay, renderAnswerTurn, parseAsk } from "./contract.js";

export class Receiver {
  constructor({ url, agentId, agentKey, adapter, log }) {
    this.adapter = adapter;
    this.log = log || (() => {});
    this.transport = new Transport({
      url,
      agentId,
      agentKey,
      log: this.log,
      onMessage: (msg) => this.onMessage(msg),
    });
  }

  start() {
    this.transport.start();
  }

  async onMessage(msg) {
    if (!msg || msg.type !== "task") return;

    const taskId = msg.task_id;
    const isRedelivery =
      Array.isArray(msg.context?.rounds) && msg.context.rounds.length > 0;
    const resumeCapable = !!this.adapter.supportsResume;

    let res;
    if (!isRedelivery) {
      // Fresh turn. Resume-capable brains pre-assign the session id = task_id so
      // the answer turn can resume it. Persist (ephemeral:false) so Tier-1 can
      // resume; one-response tasks are cleaned up on terminal below.
      this.log(`task ${taskId}: running ${this.adapter.name}`);
      res = await this.adapter.run(renderFresh(msg), {
        sessionId: resumeCapable ? taskId : undefined,
        ephemeral: false,
      });
    } else if (resumeCapable) {
      // Continuation via native resume, with replay as the universal fallback.
      this.log(`task ${taskId}: resuming ${this.adapter.name} (with answer)`);
      try {
        res = await this.adapter.resume(taskId, renderAnswerTurn(msg), {});
      } catch (e) {
        this.log(`task ${taskId}: resume unavailable (${e.message}); replaying`);
        res = await this.adapter.run(renderReplay(msg), {});
      }
    } else {
      // REPLAY adapter (OpenClaw): re-run with the full task + Q&A. Unchanged.
      this.log(`task ${taskId}: running ${this.adapter.name} (with answer)`);
      res = await this.adapter.run(renderReplay(msg), { ephemeral: true });
    }

    if (!res.ok) {
      this.send(taskId, { type: "result", status: "failed", error: res.error });
      this.log(`task ${taskId}: failed — ${res.error}`);
      this.closeSession(taskId, resumeCapable);
      return;
    }

    // First delivery only: the brain may ask ONE clarifying question via a leading
    // `ASK:` line. On re-delivery it already has the answer, so we never parse for
    // a question (Tier-1 one-round cap — SYNC-1).
    const question = isRedelivery ? null : parseAsk(res.text);
    if (question) {
      // Not terminal — keep the session alive for the answer turn.
      this.send(taskId, { type: "ask", question });
      this.log(`task ${taskId}: asked for clarification`);
    } else {
      this.send(taskId, { type: "result", status: "completed", result: res.text });
      this.log(`task ${taskId}: completed`);
      this.closeSession(taskId, resumeCapable);
    }
  }

  send(taskId, fields) {
    this.transport.send({ protocol: "ammunity", v: 1, task_id: taskId, ...fields });
  }

  // Drop a resume-capable brain's local session state once the task is terminal,
  // so receiver runs never leave long-term clutter (design §6). Best-effort.
  closeSession(taskId, resumeCapable) {
    if (resumeCapable && typeof this.adapter.closeSession === "function") {
      try {
        this.adapter.closeSession(taskId);
      } catch {
        // best-effort — isolated home is disposable anyway
      }
    }
  }
}
