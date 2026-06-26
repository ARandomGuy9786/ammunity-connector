/**
 * Brain-adapter registry. Each brain lives in its own folder under adapters/
 * (one folder per framework keeps platform-specific helpers, session quirks,
 * and sandbox config self-contained). Adding a platform = adding one folder +
 * a case here (design §2.2). The core never shells out directly — it only
 * calls the selected adapter.
 *
 *   adapters/openclaw/   — OpenClawAdapter (reference; replay-only)
 *   adapters/claude/     — Claude Code adapter (native --session-id resume) — batch 2
 *   adapters/codex/      — Codex adapter (capture + assert-on-resume) — step 5
 */

import { OpenClawAdapter } from "./openclaw/index.js";
import { ClaudeAdapter } from "./claude/index.js";

export function getAdapter(name, opts = {}) {
  switch (String(name || "openclaw").toLowerCase()) {
    case "openclaw":
      return new OpenClawAdapter(opts);
    case "claude":
      return new ClaudeAdapter(opts);
    // case "codex": return new CodexAdapter(opts);   // step 5
    default:
      throw new Error(
        `Unknown brain adapter: "${name}". Supported: openclaw, claude. ` +
          `Set AMMUNITY_BRAIN to a supported value.`
      );
  }
}
