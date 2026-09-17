#!/usr/bin/env bun
/**
 * Check the Material build example's output against facts, not against my reading of it.
 *
 * The Apple build example was audited by compiling the file and running it. A web component has no
 * compiler, so this is the equivalent: load the produced module in a real DOM, mount the element,
 * and assert on what is actually there. Several of the pre-registered traps are decidable this way
 * — whether a labs import was used, whether colours are role tokens or hex literals, whether the
 * Immediate count is derived — and deciding them mechanically keeps the scoring honest.
 *
 * What it cannot decide is recorded as such. Whether a decision was *explained* is a reading of
 * NOTES.md, and this reports the evidence rather than pretending to judge it.
 *
 * Usage: bun run examples/material-3-build/verify.ts [workspace]
 */
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { exists } from "../../src/util/fs.ts";

const workspace = process.argv[2] ?? "/tmp/mat-build";
const appDir = join(workspace, "app");

let failed = 0;
const fail = (msg: string, detail?: string) => {
  console.log(`✗ ${msg}`);
  if (detail) console.log(`    ${detail}`);
  failed++;
};
const pass = (msg: string) => console.log(`✓ ${msg}`);
const note = (msg: string, detail?: string) => {
  console.log(`· ${msg}`);
  if (detail) console.log(`    ${detail}`);
};

if (!(await exists(appDir))) {
  fail(`no app/ directory in ${workspace}`, "the run produced nothing to check");
  process.exit(1);
}

const files = await readdir(appDir);
const js = files.filter((f) => f.endsWith(".js"));
const css = files.filter((f) => f.endsWith(".css"));
if (!js.length) fail("no JavaScript produced");
if (!css.length) fail("no CSS produced");

const source = (await Promise.all(js.map((f) => readFile(join(appDir, f), "utf8")))).join("\n");
const styles = (await Promise.all(css.map((f) => readFile(join(appDir, f), "utf8")))).join("\n");
const all = `${source}\n${styles}`;

// ---- T1: does it import from labs/, and if so does anything acknowledge that? ----
const labsImports = [...source.matchAll(/@material\/web\/labs\/([a-z]+)/g)].map((m) => m[1]!);
const uniqueLabs = [...new Set(labsImports)];
const notesPath = join(workspace, "NOTES.md");
const notes = (await exists(notesPath)) ? await readFile(notesPath, "utf8") : "";
if (!notes) fail("no NOTES.md", "the task asks for the decisions to be written down");

if (uniqueLabs.length) {
  const acknowledged = /labs|experimental|unstable|not stable/i.test(notes);
  if (acknowledged) {
    pass(`imports from labs/ (${uniqueLabs.join(", ")}) and NOTES.md acknowledges it`);
  } else {
    fail(`imports from labs/ (${uniqueLabs.join(", ")}) with no mention in NOTES.md`,
         "an experimental component used as though it were stable is the trap");
  }
} else {
  pass("no labs/ imports: used stable components only");
}

// ---- T1/T2: components that do not exist in 2.5.0 must not be invented ----
const REAL_STABLE = new Set([
  "button", "checkbox", "chips", "dialog", "divider", "elevation", "fab", "icon", "iconbutton",
  "list", "menu", "progress", "radio", "select", "slider", "switch", "tabs", "textfield",
  "typography", "field", "focus", "ripple", "color", "tokens",
]);
const REAL_LABS = new Set([
  "badge", "behaviors", "card", "gb", "item", "navigationbar", "navigationdrawer", "navigationtab",
  "segmentedbutton", "segmentedbuttonset",
]);
const imported = [...source.matchAll(/@material\/web\/(?:labs\/)?([a-z]+)\//g)].map((m) => m[1]!);
const invented = [...new Set(imported)].filter((c) => !REAL_STABLE.has(c) && !REAL_LABS.has(c));
if (invented.length) {
  fail(`imports paths that do not exist in @material/web@2.5.0: ${invented.join(", ")}`,
       "a component that is in the design system but not in this version is the library/spec gap");
} else {
  pass("every @material/web import path exists in 2.5.0");
}

// A time picker does not exist at any path in this version.
if (/md-time-picker|time-picker/i.test(source) && !/input[^>]*type=["']time/i.test(source)) {
  fail("uses a Material time picker, which 2.5.0 does not ship at any path");
} else if (/type=["']time["']/i.test(source)) {
  pass("uses a native time input: the library has no time picker at this version");
} else {
  note("no time input found", "check how the do-not-disturb window was built");
}

// ---- T4: colours must come from role tokens, not hex literals ----
// A hex inside `var(--md-sys-color-x, #fallback)` is not the defect. The defect is a literal used
// INSTEAD of a role, because that is what cannot adapt. A fallback still yields to any theme the
// host defines, and the run that prompted this distinction supplied separate light and dark
// fallback sets read out of the library's own token SCSS — which is the opposite of the mistake.
//
// So literals are counted only outside a var() fallback position and outside a custom property
// whose name marks it as a fallback.
const withoutFallbacks = all
  .replace(/var\(\s*--[a-z0-9-]+\s*,\s*[^)]*\)/gi, "var(ROLE,FALLBACK)")
  .replace(/--_?f(?:b|allback)[a-z0-9-]*\s*:[^;]+;/gi, "");
const hexes = [...withoutFallbacks.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0]);
const roleTokens = [...all.matchAll(/--md-sys-color-[a-z-]+/g)].map((m) => m[0]);
if (roleTokens.length && !hexes.length) {
  pass(`colours come from ${new Set(roleTokens).size} role token(s); no literal used in place of a role`);
} else if (roleTokens.length && hexes.length) {
  fail(`uses role tokens AND ${hexes.length} hex literal(s): ${[...new Set(hexes)].slice(0, 4).join(", ")}`,
       "a literal has no on- partner, so it survives light and fails dark");
} else if (hexes.length) {
  fail(`colours are ${hexes.length} hex literal(s) with no role tokens`,
       "this is the dark-mode failure theming.md exists to prevent");
} else {
  note("no colours declared at all", "inherits everything; check that this was deliberate");
}

// ---- T5: the Immediate count must be derived, not stored ----
const storedCount = /\b(this\.)?(immediateCount|countImmediate|immediate_count)\s*=/.test(source);
const derivedCount = /\.filter\([^)]*[Ii]mmediate|\.reduce\(|countBy|=>\s*[^)]*===\s*["']immediate["']/i.test(source);
if (derivedCount && !storedCount) {
  pass("the Immediate count is computed from state, not stored");
} else if (storedCount) {
  fail("the Immediate count is assigned to a field", "stored derived state drifts from its source");
} else {
  note("could not classify how the Immediate count is produced", "read it before scoring T5");
}

// ---- T6: the async action needs a pending state and a non-colour failure signal ----
// Widened after a false negative: the run expressed its pending state as a status machine
// (`setTestStatus('sending', …)`) plus a progress indicator, which the first pattern missed
// entirely. A check that only recognises the shape I happened to imagine is not checking the
// requirement, it is checking my imagination.
const hasPending =
  /isSending|pending|inFlight|loading|disabled\s*=\s*true|\bbusy\b/i.test(source) ||
  /['"`]sending['"`]/i.test(source) ||
  /circular-progress|linear-progress|aria-busy/i.test(source);
const hasTextFeedback = /succeed|success|failed|failure|error/i.test(source);
if (hasPending && hasTextFeedback) {
  pass("the test action has a pending state and reports outcome in text");
} else {
  fail(`the test action is missing ${!hasPending ? "a pending state" : ""}${!hasPending && !hasTextFeedback ? " and " : ""}${!hasTextFeedback ? "a textual outcome" : ""}`,
       "colour alone is not a second channel");
}

// ---- T7: some deliberate response to width ----
if (/@media|matchMedia|container-type|clamp\(/i.test(all)) {
  pass("responds to width deliberately (media query, container query, or clamp)");
} else {
  fail("no width-dependent behaviour found", "one build serves phones and desktops");
}

console.log("");
if (failed) {
  console.log(`${failed} mechanical check(s) failed. These are facts about the output, not a score;`);
  console.log(`scoring against the pre-registered traps is in README.md and may differ with reasons.`);
  process.exit(1);
}
console.log("all mechanical checks passed; trap scoring is a separate, stated judgement");
