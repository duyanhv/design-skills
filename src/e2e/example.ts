#!/usr/bin/env bun
/**
 * Do the numbers the README and the example claim still match the artifacts they describe?
 *
 * The worked example makes quantitative claims in four places — the repository README, the example
 * README, `scoring.md`, and `measurements.md` — and every one of them is a number I typed. Three
 * separate audits found figures that disagreed with each other or with the files they summarised: a
 * score counting one item twice, a "14 of 15" left in the checklist beside a correction saying
 * otherwise, a measurement whose instrument was not committed.
 *
 * Prose does not stay consistent on its own, so the invariants are checked here instead:
 *
 *   1. The scoring table's own rows have to add up, and the summary has to agree with the table it
 *      summarises. This is the defect that survived two rounds of correction.
 *   2. Every document quoting a headline figure has to quote the same one.
 *   3. The measurements have to match the committed probe output, not a remembered number.
 *   4. The review and the pre-registered defect list must not have been edited after the fact —
 *      their whole evidential value is that they were written before the result was known.
 *
 * Usage: bun run src/e2e/example.ts
 */
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { ROOT, exists } from "../util/fs.ts";
import { log } from "../util/log.ts";
import { checkPilotClaims, markdownTables } from "./pilot-claims.ts";

const EXAMPLE = join(ROOT, "examples", "apple-design-review");

let failed = 0;
const fail = (msg: string, detail?: string) => {
  console.log(`✗ ${msg}`);
  if (detail) console.log(`    ${detail}`);
  failed++;
};
const pass = (msg: string) => console.log(`✓ ${msg}`);

if (!(await exists(EXAMPLE))) {
  log.info("no worked example present, nothing to check");
  process.exit(0);
}

const read = async (p: string) => readFile(join(EXAMPLE, p), "utf8");
const scoring = await read("scoring.md");
const exampleReadme = await read("README.md");
const measurements = await read("measurements.md");
const repoReadme = await readFile(join(ROOT, "README.md"), "utf8");
const checklist = await readFile(join(ROOT, "docs", "public-output-checklist.md"), "utf8");

// 1. The item-by-item table is the ground truth; the summary must agree with it.
const outcomes = [...scoring.matchAll(/^\| P\d+ \|[^|]*\|([^|]*)\|$/gm)].map((m) => m[1]!.trim());
const found = outcomes.filter((o) => o.startsWith("found")).length;
const dismissed = outcomes.filter((o) => o.includes("wrongly dismissed")).length;
const invalid = outcomes.filter((o) => o.includes("invalid planted item")).length;

if (!outcomes.length) {
  fail("could not read the item-by-item outcome table in scoring.md");
} else {
  pass(`scoring table lists ${outcomes.length} planted items: ${found} found, ${dismissed} dismissed, ${invalid} invalid`);

  const claimedValid = Number(/\| \*\*Valid planted defects\*\* \| \*\*(\d+)\*\* \|/.exec(scoring)?.[1] ?? NaN);
  const claimedFound = Number(/\| Found \| \*\*(\d+)\*\* \|/.exec(scoring)?.[1] ?? NaN);
  const claimedDismissed = Number(/\| Wrongly dismissed \| (\d+)/.exec(scoring)?.[1] ?? NaN);

  if (claimedFound !== found) fail(`scoring summary says ${claimedFound} found, table shows ${found}`);
  else pass(`summary's "found" matches the table (${found})`);

  if (claimedDismissed !== dismissed) fail(`scoring summary says ${claimedDismissed} dismissed, table shows ${dismissed}`);
  else pass(`summary's "wrongly dismissed" matches the table (${dismissed})`);

  // The arithmetic that was wrong twice: valid = found + dismissed, and invalid items are excluded
  // from the denominator rather than charged to either side.
  if (claimedValid !== found + dismissed) {
    fail(`valid (${claimedValid}) should equal found + dismissed (${found + dismissed})`,
         "an invalidated item must leave the denominator, not also be charged as a dismissal");
  } else {
    pass(`valid = found + dismissed (${claimedValid} = ${found} + ${dismissed})`);
  }

  const claimedPlanted = Number(/\| Planted items, as written \| (\d+) \|/.exec(scoring)?.[1] ?? NaN);
  if (claimedPlanted !== outcomes.length) fail(`summary says ${claimedPlanted} planted items, table lists ${outcomes.length}`);
  else if (claimedPlanted - invalid !== claimedValid) {
    fail(`planted (${claimedPlanted}) minus invalid (${invalid}) should equal valid (${claimedValid})`);
  } else {
    pass(`planted - invalid = valid (${claimedPlanted} - ${invalid} = ${claimedValid})`);
  }
}

// 2. Every document quoting the headline score has to quote the same one.
const headline = `${found} of ${found + dismissed}`;
for (const [name, text] of [["README.md", repoReadme], ["examples/.../README.md", exampleReadme], ["checklist", checklist]] as const) {
  const stale = [...text.matchAll(/(\d+) of (\d+) valid planted/g)].filter((m) => `${m[1]} of ${m[2]}` !== headline);
  if (stale.length) fail(`${name} quotes "${stale[0]![1]} of ${stale[0]![2]}", scoring table gives "${headline}"`);
  else pass(`${name} agrees with the scoring table, or does not quote it`);
}

// 3. Measurements must match the committed probe output rather than a remembered figure.
const probeResult = join(EXAMPLE, "probe", "results", "before.txt");
if (!(await exists(probeResult))) {
  fail("probe/results/before.txt is missing", "the headline measurement must ship with its instrument's output");
} else {
  const raw = await readFile(probeResult, "utf8");
  const measured = /touchable region: ([\d.]+) x ([\d.]+) pt/.exec(raw);
  if (!measured) {
    fail("could not parse a touchable region from probe/results/before.txt");
  } else {
    const figure = `${measured[1]} × ${measured[2]} pt`;
    for (const [name, text] of [["measurements.md", measurements], ["example README", exampleReadme], ["README.md", repoReadme], ["scoring.md", scoring]] as const) {
      if (!text.includes(figure)) fail(`${name} does not quote the measured figure ${figure}`);
      else pass(`${name} quotes the probe's measured ${figure}`);
    }
  }
}



// 3b. The React Native pilot's percentages must match its harness output.
//
// The logic lives in pilot-claims.ts so it can be tested. Four rounds of audits found defects in
// these checks, each fixed by hand with no committed regression, so the next round rediscovered
// the same shape of hole. Now the checks have tests.
const rnResults = join(ROOT, "examples", "react-native-pilot", "harness", "results.tsv");
if (!(await exists(rnResults))) {
  fail("react-native-pilot/harness/results.tsv is missing", "published percentages need the run that produced them");
} else {
  const pilot = checkPilotClaims({
    resultsTsv: await readFile(rnResults, "utf8"),
    pilotReadme: await readFile(join(ROOT, "examples", "react-native-pilot", "README.md"), "utf8"),
    frameworkReference: await readFile(
      join(ROOT, "guidance", "apple-design", "references", "frameworks", "react-native.md"), "utf8"),
  });
  for (const problem of pilot.problems) fail(problem.message, problem.detail);
  for (const message of pilot.passes) pass(message);
}

// 3c. The Material examples' published scores must match their own artifacts.
//
// Same rule as the Apple example's scoring table, applied to the two Material examples as they were
// added. The number in a README is the thing a reader takes away, and nothing but a check keeps it
// tied to the file it summarises — three separate audits found drifted figures in the Apple example
// before this class of check existed.
for (const [name, dir, expectations] of [
  ["material-3-review", "material-3-review", "planted-defects.md"],
  ["material-3-build", "material-3-build", "expectations.md"],
  ["accessibility-claims-review", "accessibility-claims-review", "planted-defects.md"],
] as const) {
  const readmePath = join(ROOT, "examples", dir, "README.md");
  const listPath = join(ROOT, "examples", dir, expectations);
  if (!(await exists(readmePath)) || !(await exists(listPath))) {
    fail(`${name} is missing README.md or ${expectations}`);
    continue;
  }
  const readme = await readFile(readmePath, "utf8");
  const list = await readFile(listPath, "utf8");

  // Count the pre-registered items from the list itself, so the README cannot claim more than
  // were planted. Review items are M1..Mn; build traps are T1..Tn.
  // Three list formats across the examples: "**M1.** …", "| **T1** |", "**A1. …". The prefix
  // letter is per-example and carries no meaning beyond distinguishing the lists.
  const planted = new Set([...list.matchAll(/\*\*([MTA]\d+)(?:[.,]|\*\*)/g)].map((m) => m[1]!));
  if (!planted.size) {
    fail(`${expectations} names no pre-registered items`, "the scoring has nothing to be scored against");
    continue;
  }
  // The scoring table adjudicates each pre-registered item. Read it, then derive the score from
  // the adjudications rather than trusting the sentence in the README.
  //
  // Checking the denominator alone was not enough, and an audit showed it three ways: "11 of 10"
  // passed, changing a Found row to Missed passed, and replacing the entire review with "I found
  // no problems" passed. A published score has to follow from the table it summarises.
  // The review examples adjudicate in scoring.md; the build example does it in its README's trap
  // table. Either is fine — what matters is that an adjudication exists and the headline follows
  // from it, not which file it lives in.
  const scoringPath = join(ROOT, "examples", dir, "scoring.md");
  const scoring = ((await exists(scoringPath)) ? await readFile(scoringPath, "utf8") : "") + "\n" + readme;

  /**
   * id -> the outcome its scoring row records, read from the column the table header names.
   *
   * The first version scanned every cell after the id for a bolded phrase, which an audit defeated
   * by putting "**Found**" in the *Defect* column while the Outcome column said "**Missed**". That
   * is the same wrong-cell mistake the RN pixel table had, reproduced in a new scorer, so this
   * resolves the column by header exactly as the RN check does.
   */
  const adjudicated = new Map<string, string>();
  const ALLOWED = ["found", "handled", "avoided", "partial", "missed", "not flagged", "half-flagged"];
  const CREDITED = ["found", "handled", "avoided"];

  for (const table of markdownTables(scoring)) {
    const idColumn = table.header.findIndex((h) => /^#$|\bid\b/i.test(h));
    const outcomeColumn = table.header.findIndex((h) => /outcome|result|verdict/i.test(h));
    if (idColumn < 0 || outcomeColumn < 0) continue;

    for (const cells of table.rows) {
      const id = /^\*{0,2}([MTA]\d+)\*{0,2}$/.exec((cells[idColumn] ?? "").trim())?.[1];
      if (!id) continue;
      const cell = (cells[outcomeColumn] ?? "").replace(/[*_`]/g, "").trim().toLowerCase();
      const outcome = ALLOWED.find((a) => cell.startsWith(a));
      if (!outcome) {
        fail(`${name}: ${id}'s ${table.header[outcomeColumn]} cell reads "${(cells[outcomeColumn] ?? "").trim().slice(0, 40)}"`,
             `an outcome has to be one of: ${ALLOWED.join(", ")}`);
        continue;
      }
      // Two rows adjudicating one item is ambiguous, and silently overwriting hid it.
      if (adjudicated.has(id)) {
        fail(`${name}: ${id} is adjudicated more than once (${adjudicated.get(id)}, then ${outcome})`);
        continue;
      }
      adjudicated.set(id, outcome);
    }
  }

  const unadjudicated = [...planted].filter((id) => !adjudicated.has(id));
  if (unadjudicated.length) {
    fail(`${name}: ${unadjudicated.length} pre-registered item(s) have no scoring row: ${unadjudicated.join(", ")}`,
         "an item that was registered and never adjudicated is missing from the result, not passing");
  }
  const invented = [...adjudicated.keys()].filter((id) => !planted.has(id));
  if (invented.length) {
    fail(`${name}: scoring.md adjudicates item(s) that were never pre-registered: ${invented.join(", ")}`);
  }

  // Outcomes that count toward a "found"/"handled" headline. Anything else — partial, missed —
  // does not, which is what makes the derived numerator meaningful.
  const credited = [...adjudicated.values()].filter((o) => CREDITED.some((c) => o.startsWith(c))).length;

  // Bold or plain: an audit replaced the bolded headline with the same sentence unbolded, and the
  // loop simply found nothing and printed that the README agreed. A README carrying no parseable
  // headline is now a failure, not a silent pass.
  const headlines = [...readme.matchAll(/(?:\*\*)?(\d+) of (\d+)(?:\*\*)?\s+(?:planted|credited|traps|handled|found|reached)/g)];
  if (!headlines.length) {
    fail(`${name}/README.md states no parseable "N of M" headline`,
         "the score has to be checkable against the adjudications, so it has to be findable");
  }
  for (const claim of headlines) {
    const [numerator, denominator] = [Number(claim[1]), Number(claim[2])];
    if (denominator !== planted.size) {
      fail(`${name}/README.md claims "${claim[0]}", but ${expectations} pre-registers ${planted.size}`,
           "a denominator that does not match the list is a score against a different experiment");
    }
    if (numerator > denominator) {
      fail(`${name}/README.md claims "${claim[0]}", which is more than the total`);
    }
    if (numerator !== credited) {
      fail(`${name}/README.md claims ${numerator}, but scoring.md credits ${credited}`,
           `outcomes recorded: ${[...adjudicated.values()].join(", ")}`);
    }
  }
  pass(`${name}: ${credited} credited outcome(s) across ${planted.size} pre-registered item(s), and the README agrees`);

  // The review example's before/ screen has to still run: a straw man that throws on load tests
  // nothing, because any reviewer would find "it does not run" and stop.
  //
  // This was deleted by accident while replacing the HEAD-diff preservation block, and its own
  // committed test caught that — which is the argument for the tests existing, applied to me.
  if (dir === "material-3-review") {
    const proc = Bun.spawn(["node", join(ROOT, "examples", dir, "before", "renders.mjs")], {
      cwd: ROOT, stdout: "pipe", stderr: "pipe",
    });
    const out = (await new Response(proc.stdout).text()) + (await new Response(proc.stderr).text());
    const code = await proc.exited;
    if (code !== 0 || out.includes("MISSING")) {
      fail("the review example's before/ screen no longer renders its controls",
           out.split("\n").filter((l) => l.includes("MISSING")).join("; ") || `exit ${code}`);
    } else {
      pass("the review example's before/ screen still renders");
    }
  }
}

// 3c-bis. Preserved artifacts must match their recorded digests.
//
// Comparing against HEAD was not preservation: it catches an uncommitted rewrite and makes a
// committed one the new reference. An audit replaced a review, committed it, and got a clean pass —
// and a CI checkout is always already committed, so the guard was absent exactly where the
// repository publishes the evidence.
//
// examples/preserved.json pins a digest per artifact. Replacing one now requires updating that file
// in the same commit, which makes it a reviewable act instead of an invisible one. It cannot stop a
// determined rewrite; it stops a silent one, and that is the honest claim.
const preservedPath = join(ROOT, "examples", "preserved.json");
if (!(await exists(preservedPath))) {
  fail("examples/preserved.json is missing", "nothing pins the artifacts whose value is being unchanged");
} else {
  const preserved = JSON.parse(await readFile(preservedPath, "utf8")) as {
    artifacts: Record<string, { sha256: string; bytes: number }>;
  };
  const entries = Object.entries(preserved.artifacts ?? {});
  if (!entries.length) fail("examples/preserved.json pins no artifacts");

  for (const [relative, expected] of entries) {
    const path = join(ROOT, relative);
    if (!(await exists(path))) {
      fail(`${relative} is pinned but missing`, "a deleted artifact is not a passing one");
      continue;
    }
    const bytes = await Bun.file(path).arrayBuffer();
    const actual = new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
    if (actual !== expected.sha256) {
      fail(`${relative} does not match its recorded digest`,
           `expected ${expected.sha256.slice(0, 16)}… (${expected.bytes} bytes), ` +
             `found ${actual.slice(0, 16)}… (${bytes.byteLength} bytes). ` +
             `If the change is a deliberate appended correction, update examples/preserved.json in ` +
             `the same commit and say so; never edit what a run produced.`);
    }
  }

  // Every produced-or-pre-registered artifact must be pinned. An unpinned one is unprotected, and
  // the previous guard covered reviewer output while leaving the pre-registration files out.
  const REQUIRED = ["REVIEW.md", "NOTES.md", "planted-defects.md", "expectations.md"];
  for (const example of await readdir(join(ROOT, "examples"))) {
    const dir = join(ROOT, "examples", example);
    if (!(await exists(join(dir, "README.md")))) continue;
    for (const artifact of REQUIRED) {
      if (!(await exists(join(dir, artifact)))) continue;
      const key = `examples/${example}/${artifact}`;
      if (!preserved.artifacts?.[key]) {
        fail(`${key} exists but is not pinned in examples/preserved.json`,
             "an unpinned produced artifact can be rewritten without trace");
      }
    }
  }
  pass(`${entries.length} preserved artifact(s) match their recorded digests`);
}

// 3d. Levels cited in a preserved review must match WCAG.
//
// An audit found the accessibility review calling SC 2.4.7 Focus Visible "Level A" when it is AA.
// The review is published verbatim and is not edited, so the correction lives in ERRATA.md — and
// this is what makes that promise real: every "SC n.n.n (Level X)" in a preserved review is
// resolved against the local WCAG build. Skips when wcag22 is not built, like the other checks
// that need it, so it is silent in CI and meaningful locally.
const wcagPages = join(ROOT, "ir", "wcag22", "pages");
if (await exists(wcagPages)) {
  const levels = new Map<string, string>();
  for (const file of (await readdir(wcagPages)).filter((f) => f.endsWith(".json"))) {
    const page = JSON.parse(await readFile(join(wcagPages, file), "utf8")) as {
      rules?: { section?: string; conformance_level?: string }[];
    };
    for (const rule of page.rules ?? []) {
      const number = /^(\d+\.\d+\.\d+)\s/.exec(rule.section ?? "")?.[1];
      if (number && rule.conformance_level) levels.set(number, rule.conformance_level);
    }
  }

  for (const dir of ["accessibility-claims-review", "material-3-review", "apple-design-review"]) {
    const reviewPath = join(ROOT, "examples", dir, "REVIEW.md");
    if (!(await exists(reviewPath))) continue;
    const review = await readFile(reviewPath, "utf8");
    const errataPath = join(ROOT, "examples", dir, "ERRATA.md");
    const errata = (await exists(errataPath)) ? await readFile(errataPath, "utf8") : "";

    let checked = 0;
    const wrong: string[] = [];
    for (const cite of review.matchAll(/SC (\d+\.\d+\.\d+)[^(]{0,60}\(Level (A{1,3})\b/g)) {
      const [number, claimed] = [cite[1]!, cite[2]!];
      const actual = levels.get(number);
      if (!actual) continue;
      checked++;
      if (actual !== claimed) wrong.push(`SC ${number} cited as Level ${claimed}, actually ${actual}`);
    }

    /**
     * Structured erratum records: `erratum: criterion=2.4.7 cited=A corrected=AA`.
     *
     * Presence of the criterion number was not enough. An audit replaced the whole erratum with a
     * sentence asserting the review was right, and the check accepted it as the correction — so a
     * document reinforcing the error qualified as fixing it. The record now has to state the level
     * the review cited AND the level the source gives, and both are verified.
     */
    const corrections = new Map<string, { cited: string; corrected: string }>();
    for (const record of errata.matchAll(/erratum:\s*criterion=(\S+)\s+cited=(\S+)\s+corrected=(\S+)/g)) {
      corrections.set(record[1]!, { cited: record[2]!, corrected: record[3]! });
    }

    for (const problem of wrong) {
      const number = /SC (\d+\.\d+\.\d+)/.exec(problem)![1]!;
      const claimed = /Level (A{1,3})/.exec(problem)![1]!;
      const actual = levels.get(number)!;
      const correction = corrections.get(number);

      if (!correction) {
        fail(`${dir}/REVIEW.md: ${problem}`,
             `preserve the review and add to ERRATA.md: \`erratum: criterion=${number} cited=${claimed} corrected=${actual}\``);
      } else if (correction.cited !== claimed) {
        fail(`${dir}/ERRATA.md says the review cited Level ${correction.cited} for SC ${number}, but it cites ${claimed}`);
      } else if (correction.corrected !== actual) {
        fail(`${dir}/ERRATA.md corrects SC ${number} to Level ${correction.corrected}; the WCAG build gives ${actual}`,
             "an erratum that restates the error is not a correction");
      } else {
        pass(`${dir}: ${problem} — corrected in ERRATA.md to Level ${actual}`);
      }
    }

    // A correction for something the review does not get wrong is stale or fabricated.
    for (const [number, correction] of corrections) {
      if (wrong.some((w) => w.includes(`SC ${number} `))) continue;
      fail(`${dir}/ERRATA.md records a correction for SC ${number}, which the review does not miscite`,
           `the review's own citation and the build agree at Level ${levels.get(number) ?? "?"}; ` +
             `remove the stale record (it claims cited=${correction.cited})`);
    }

    if (checked) pass(`${dir}: ${checked} criterion level(s) cited, resolved against the WCAG build`);
  }
}

// 4. The pre-registered artifacts must not have been edited after the review was scored.
//
// Two different questions, and the first version only asked one of them. Counting commits catches
// a rewrite that was committed; it says nothing about the file on disk right now. A sweep of the
// checks found that REVIEW.md could be rewritten entirely — new findings, different conclusions —
// and this reported "1 commit(s) touching it" and passed. The whole evidential value of a
// pre-registered artifact is that it has not changed since it was registered, so the content has
// to be compared against what was committed, not just the commit counted.
for (const file of ["REVIEW.md", "planted-defects.md"]) {
  const path = `examples/apple-design-review/${file}`;

  const logProc = Bun.spawn(["git", "log", "--format=%h %s", "--", path], {
    cwd: ROOT, stdout: "pipe", stderr: "ignore",
  });
  const commits = (await new Response(logProc.stdout).text()).trim().split("\n").filter(Boolean);
  await logProc.exited;

  // One commit introduces it. planted-defects.md legitimately gains appended corrections, which are
  // additions after the fact and are labelled as such; REVIEW.md must never change at all.
  if (file === "REVIEW.md" && commits.length > 1) {
    fail(`REVIEW.md has ${commits.length} commits; it must be published verbatim and never edited`,
         commits.map((l) => `      ${l}`).join("\n"));
  } else {
    pass(`${file}: ${commits.length} commit(s) touching it`);
  }

  // And the working copy must match what git holds. This predates examples/preserved.json and is
  // kept because it says something different: the digest catches any change, committed or not,
  // while this catches an uncommitted one *before* it is staged, with a line count. Cheap, and the
  // two failures read differently enough to be worth both.
  const diffProc = Bun.spawn(["git", "diff", "HEAD", "--", path], {
    cwd: ROOT, stdout: "pipe", stderr: "ignore",
  });
  const diff = (await new Response(diffProc.stdout).text()).trim();
  const diffCode = await diffProc.exited;
  if (diffCode !== 0) {
    log.warn(`git unavailable: ${file} was not checked against its committed content`);
  } else if (diff) {
    const changed = diff.split("\n").filter((l) => /^[+-][^+-]/.test(l)).length;
    fail(`${file} differs from its committed content (${changed} changed line(s))`,
         "a pre-registered artifact is evidence only while it is unchanged; commit the edit or revert it");
  } else {
    pass(`${file} matches its committed content`);
  }
}

if (failed) {
  log.warn(`${failed} claim(s) about the worked example do not match its artifacts`);
  process.exit(1);
}
log.info("the worked example's published numbers match its artifacts");
