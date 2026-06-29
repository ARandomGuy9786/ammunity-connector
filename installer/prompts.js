/**
 * Interactive prompt helpers for the Ammunity connector installer.
 *
 * Zero-dependency (Node built-ins only) so `npx` stays fast and the package
 * stays lean. Hidden entry (for the API key) mutes the terminal echo like
 * `gh auth login` — the secret never appears on screen or in shell history.
 *
 * Non-TTY fallback: when stdin isn't a terminal (piped input / CI), prompts
 * read a plain line instead of muting — so automation can feed answers.
 */

import readline from "node:readline";
import { Writable } from "node:stream";

const isTTY = () => Boolean(process.stdin.isTTY);

// One visible question. Returns the trimmed answer, or `fallback` if blank.
export function ask(query, fallback = "") {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const suffix = fallback ? ` [${fallback}]` : "";
    rl.question(`${query}${suffix}: `, (answer) => {
      rl.close();
      const a = (answer || "").trim();
      resolve(a || fallback);
    });
  });
}

// Hidden question (terminal echo muted). Used for the API key.
export function askHidden(query) {
  if (!isTTY()) return ask(query); // piped/CI — can't mute; read plainly
  return new Promise((resolve) => {
    // A writable that swallows everything once muted, so typed chars don't echo.
    const muted = new Writable({
      write(chunk, _enc, cb) {
        if (!muted.isMuted) process.stdout.write(chunk);
        cb();
      },
    });
    muted.isMuted = false;
    const rl = readline.createInterface({ input: process.stdin, output: muted, terminal: true });
    rl.question(`${query}: `, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve((answer || "").trim());
    });
    muted.isMuted = true; // mute AFTER the prompt text is written
  });
}

// Single-choice menu. `choices` = array of { value, label, disabled?, note? }.
// Returns the chosen value. Empty input picks `fallback` (a value).
export async function askSelect(query, choices, fallback) {
  const enabled = choices.filter((c) => !c.disabled);
  while (true) {
    console.log(`\n${query}`);
    choices.forEach((c, i) => {
      const n = `${i + 1}`.padStart(2);
      const dim = c.disabled ? " (not yet available)" : "";
      const note = c.note ? `  — ${c.note}` : "";
      const def = c.value === fallback ? "  (default)" : "";
      console.log(`  ${n}) ${c.label}${dim}${def}${note}`);
    });
    const raw = await ask("Choose", fallback ? `${choices.findIndex((c) => c.value === fallback) + 1}` : "");
    // Accept either the number or the value string.
    const byNum = Number.parseInt(raw, 10);
    let pick;
    if (Number.isInteger(byNum) && byNum >= 1 && byNum <= choices.length) {
      pick = choices[byNum - 1];
    } else {
      pick = choices.find((c) => c.value.toLowerCase() === String(raw).toLowerCase());
    }
    if (!pick) {
      console.log("  ↳ Please pick one of the listed options.");
      continue;
    }
    if (pick.disabled) {
      console.log(`  ↳ "${pick.label}" isn't available yet — pick another.`);
      continue;
    }
    return pick.value;
  }
  // eslint-disable-next-line no-unreachable
  return enabled[0]?.value;
}

// Yes/no. Returns boolean. Empty input picks `defaultYes`.
export async function confirm(query, defaultYes = false) {
  const hint = defaultYes ? "Y/n" : "y/N";
  const raw = (await ask(`${query} (${hint})`, defaultYes ? "y" : "n")).toLowerCase();
  return raw === "y" || raw === "yes";
}

// Read a single line from stdin without a prompt (for piped key in --non-interactive).
export function readStdinLine() {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin });
    rl.once("line", (line) => {
      rl.close();
      resolve((line || "").trim());
    });
    rl.once("close", () => resolve(""));
  });
}
