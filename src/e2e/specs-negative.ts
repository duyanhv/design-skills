#!/usr/bin/env bun
/**
 * What `specs.ts` catches, and what it lets through.
 *
 * The scan was described as making a reintroduced measurement literal "mechanically impossible",
 * which a review correctly rejected: it is a pattern match over prose, and a pattern match has
 * holes. Those holes are now documented in `specs.ts`, and documentation drifts. This pins both
 * halves — the catches *and* the known misses — so the caveat stays true, and so a later
 * improvement that closes a hole shows up here as a failing expectation rather than as a stale
 * comment nobody rechecked.
 *
 * A miss recorded here is not an endorsement. It is the current boundary, stated honestly.
 */
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { log } from "../util/log.ts";

const REPO = process.cwd();

interface Case {
  name: string;
  prose: string;
  /** Does the scan flag it today? */
  caught: boolean;
  /** Why the boundary sits here. */
  note: string;
}

const CASES: Case[] = [
  // Caught: the shapes the patterns were built for.
  { name: "a length with a unit", prose: "Targets must be 44pt.", caught: true, note: "the audited defect's shape" },
  { name: "a spelled-out unit", prose: "Use 17 points for body text.", caught: true, note: "" },
  { name: "a pixel dimension", prose: "Targets must be 44x44.", caught: true, note: "" },
  { name: "a contrast ratio", prose: "Aim for a 4.5:1 ratio.", caught: true, note: "" },
  { name: "a hex colour", prose: "Use #1a73e8 for the accent.", caught: true, note: "" },
  { name: "an rgb() colour", prose: "Use rgb(26, 115, 232).", caught: true, note: "" },

  // Missed: stated in specs.ts's header, and true.
  {
    name: "a value written in words",
    prose: "Targets must be forty-four points square.",
    caught: false,
    note: "no digits to match; a prose scan cannot read numerals written as English",
  },
  {
    name: "a unitless number",
    prose: "Targets must be at least 44 square.",
    caught: false,
    note: "a bare number is indistinguishable from a version, a count, or a year",
  },
  {
    name: "a ratio phrased as prose",
    prose: "Aim for a contrast ratio of four and a half to one.",
    caught: false,
    note: "same reason as words above",
  },
  {
    name: "a specification inside a fenced code block",
    prose: "```swift\n.frame(width: 44, height: 44)\n```",
    caught: false,
    note: "fences are skipped on purpose, since an example may name a real API constant",
  },
];

let failed = 0;
const scratch: string[] = [];

try {
  for (const testCase of CASES) {
    // A minimal repository shaped the way specs.ts expects: one authored source, one guidance file.
    const root = await mkdtemp(join(tmpdir(), "ds-specs-negative-"));
    scratch.push(root);
    await mkdir(join(root, "sources"), { recursive: true });
    await mkdir(join(root, "guidance", "probe"), { recursive: true });
    await writeFile(
      join(root, "sources", "probe.yaml"),
      JSON.stringify({
        id: "probe",
        name: "Probe",
        kind: "authored",
        entry: "/",
        base_url: "https://example.invalid/probe",
        license: { spdx: "MIT", redistributable: true, attribution: "probe" },
        skill: { name: "probe", description: "probe" },
      }),
    );
    await writeFile(join(root, "guidance", "probe", "SKILL.md"), `# Probe\n\n${testCase.prose}\n`);

    const proc = Bun.spawn([process.execPath, join(REPO, "src", "e2e", "specs.ts")], {
      cwd: root,
      stdout: "pipe",
      stderr: "pipe",
    });
    await new Response(proc.stdout).text();
    const flagged = (await proc.exited) !== 0;

    if (flagged === testCase.caught) {
      console.log(`✓ ${testCase.name}`);
      console.log(`    → ${flagged ? "flagged, as it must be" : `not flagged — known hole: ${testCase.note}`}`);
    } else {
      failed++;
      console.log(`✗ ${testCase.name}`);
      console.log(
        flagged
          ? `    now flagged, but recorded as a known miss. If the scan improved, update specs.ts's header and this case.`
          : `    expected the scan to flag this and it did not.`,
      );
    }
  }
} finally {
  await Promise.all(scratch.map((p) => rm(p, { recursive: true, force: true })));
}

const caught = CASES.filter((c) => c.caught).length;
if (failed) {
  log.warn(`${failed} specification-scan expectation(s) no longer hold`);
  process.exit(1);
}
log.info(`specification scan: ${caught} shapes caught, ${CASES.length - caught} known misses, all as documented`);
