/**
 * Receiver core unit tests — focus on the Step 3 `receiver_session_ref` carry
 * (connector half, 2026-06-30) plus the surrounding fresh/resume/replay seam.
 *
 * No test framework: a mock BrainAdapter records its calls and returns
 * programmable results; the Transport is replaced with a frame-capturing stub.
 * Run:  node tests/test_receiver.mjs
 */

import assert from "node:assert/strict";
import { Receiver } from "../receiver/core/receiver.js";

let passed = 0;
function pass(name) {
  passed += 1;
  console.log(`PASS  ${name}`);
}

// A mock adapter that records run/resume/close calls and returns canned results.
function makeAdapter({ supportsResume, runResult, resumeResult, resumeThrows }) {
  const calls = { run: [], resume: [], close: [] };
  return {
    name: supportsResume ? "claude" : "openclaw",
    supportsResume,
    async run(prompt, opts = {}) {
      calls.run.push({ prompt, opts });
      return runResult;
    },
    async resume(ref, prompt, opts = {}) {
      calls.resume.push({ ref, prompt, opts });
      if (resumeThrows) throw new Error("ResumeUnavailable: boom");
      return resumeResult;
    },
    closeSession(ref) {
      calls.close.push(ref);
    },
    calls,
  };
}

// Drive a single inbound frame through a Receiver, capturing outbound frames.
async function deliver(adapter, msg) {
  const r = new Receiver({
    url: "ws://test",
    agentId: "agent-1",
    agentKey: "k",
    adapter,
    log: () => {},
  });
  const sent = [];
  r.transport = { send: (f) => sent.push(f) }; // never connect; just capture
  await r.onMessage(msg);
  return sent;
}

const TASK = "11111111-1111-1111-1111-111111111111";
function freshTask() {
  return { type: "task", task_id: TASK, task_description: "Explain X", payload: {} };
}
function redelivery(extraContext = {}) {
  return {
    type: "task",
    task_id: TASK,
    task_description: "Explain X",
    payload: {},
    context: { rounds: [{ question: "Which X?", answer: "the second" }], ...extraContext },
  };
}

await (async () => {
  // 1. Resume brain, fresh ASK → ask frame carries the brain's native sessionRef.
  {
    const a = makeAdapter({
      supportsResume: true,
      runResult: { ok: true, text: "ASK: Which city?", sessionRef: "sess-xyz" },
    });
    const sent = await deliver(a, freshTask());
    assert.equal(sent.length, 1);
    assert.equal(sent[0].type, "ask");
    assert.equal(sent[0].question, "Which city?");
    assert.equal(sent[0].receiver_session_ref, "sess-xyz"); // the REAL native ref
    assert.equal(sent[0].task_id, TASK);
    // fresh turn pre-assigns sessionId = task_id for resume-capable brains
    assert.equal(a.calls.run[0].opts.sessionId, TASK);
    pass("resume brain: fresh ASK carries native receiver_session_ref");
  }

  // 2. Resume brain, fresh ASK but run() returns no sessionRef → fall back to task_id.
  {
    const a = makeAdapter({
      supportsResume: true,
      runResult: { ok: true, text: "ASK: Which city?" }, // no sessionRef
    });
    const sent = await deliver(a, freshTask());
    assert.equal(sent[0].receiver_session_ref, TASK);
    pass("resume brain: ASK falls back to task_id when no native ref returned");
  }

  // 3. Replay brain (OpenClaw), fresh ASK → NO receiver_session_ref field at all.
  {
    const a = makeAdapter({
      supportsResume: false,
      runResult: { ok: true, text: "ASK: Which city?" },
    });
    const sent = await deliver(a, freshTask());
    assert.equal(sent[0].type, "ask");
    assert.equal(sent[0].question, "Which city?");
    assert.ok(!("receiver_session_ref" in sent[0]), "replay brain must omit the ref");
    pass("replay brain: ASK omits receiver_session_ref (→ coordinator stores none)");
  }

  // 4. Resume brain, re-delivery WITH coordinator-echoed ref → resume uses THAT ref.
  {
    const a = makeAdapter({
      supportsResume: true,
      runResult: { ok: true, text: "ASK: Which city?", sessionRef: "sess-xyz" },
      resumeResult: { ok: true, text: "The answer is 42." },
    });
    const sent = await deliver(a, redelivery({ receiver_session_ref: "sess-from-coord" }));
    assert.equal(a.calls.resume.length, 1);
    assert.equal(a.calls.resume[0].ref, "sess-from-coord"); // NOT task_id
    assert.equal(a.calls.run.length, 0); // native resume, no replay
    assert.equal(sent[0].type, "result");
    assert.equal(sent[0].status, "completed");
    assert.equal(sent[0].result, "The answer is 42.");
    // re-delivery never parses for a new question (Tier-1 one-round cap)
    assert.equal(a.calls.close[0], TASK);
    pass("resume brain: re-delivery resumes the coordinator-echoed ref (survives restart)");
  }

  // 5. Resume brain, re-delivery WITHOUT a ref → resume falls back to task_id.
  {
    const a = makeAdapter({
      supportsResume: true,
      resumeResult: { ok: true, text: "done" },
    });
    const sent = await deliver(a, redelivery());
    assert.equal(a.calls.resume[0].ref, TASK);
    assert.equal(sent[0].status, "completed");
    pass("resume brain: re-delivery without a ref falls back to task_id");
  }

  // 6. Resume brain, re-delivery, resume throws → replay fallback (universal safety net).
  {
    const a = makeAdapter({
      supportsResume: true,
      resumeThrows: true,
      runResult: { ok: true, text: "replayed answer" },
    });
    const sent = await deliver(a, redelivery({ receiver_session_ref: "stale-ref" }));
    assert.equal(a.calls.resume[0].ref, "stale-ref");
    assert.equal(a.calls.run.length, 1); // fell back to replay
    assert.equal(sent[0].status, "completed");
    assert.equal(sent[0].result, "replayed answer");
    pass("resume brain: stale ref → resume throws → replay fallback");
  }

  // 7. Replay brain, re-delivery → renderReplay run, never resume.
  {
    const a = makeAdapter({
      supportsResume: false,
      runResult: { ok: true, text: "openclaw answer" },
    });
    const sent = await deliver(a, redelivery());
    assert.equal(a.calls.resume.length, 0);
    assert.equal(a.calls.run.length, 1);
    assert.equal(sent[0].status, "completed");
    pass("replay brain: re-delivery replays (no resume)");
  }

  console.log(`\n${passed} passed`);
})();
