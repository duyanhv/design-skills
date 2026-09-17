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
  /** Optional records file, so a case can test the measurement-to-record binding. */
  records?: string;
  /** True when passing is the intended behaviour rather than a gap in the scan. */
  allowed?: boolean;
}

/** Two records publishing different values, so a mis-citation is distinguishable from a citation. */
const RECORDS = `topic: t
provenance:
  accessibility: { url: "https://example.invalid", retrieved: "x", sha256: "y", snapshot: "s" }
source_page: accessibility
source_anchor: Mobility
records:
  - id: control-size.ios
    platform: [iOS]
    row: "iOS, iPadOS"
    values: { default: "44x44 pt", minimum: "28x28 pt" }
    columns: { default: "Default control size", minimum: "Minimum control size" }
    meaning: { default: "d", minimum: "m" }
    conditions: "c"
  - id: control-size.tvos
    platform: [tvOS]
    row: "tvOS"
    values: { default: "66x66 pt" }
    columns: { default: "Default control size" }
    meaning: { default: "d" }
    conditions: "c"
`;

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
  // The fence exemption, tested as a *pair*. The first version of this case used
  // `.frame(width: 44, height: 44)`, which the patterns miss outside a fence as well — so the case
  // passed whether fence handling existed or not, and a review proved it by deleting the exemption
  // and watching all ten cases still pass. A control case must differ from its partner in exactly
  // the one variable under test, so both halves below carry text that is known to be caught.
  {
    name: "a caught literal is still caught in ordinary prose (fence control)",
    prose: "Targets must be 44pt.",
    caught: true,
    note: "the partner of the fenced case: identical text, no fence",
  },
  {
    name: "the identical caught literal inside a fenced code block is missed",
    prose: "```swift\nTargets must be 44pt.\n```",
    caught: false,
    note: "fences are skipped on purpose, since an example may name a real API constant",
  },

  // ---- Record-bearing cases. The suite had none, so it could not have caught an audit finding:
  // prose citing *a* record while quoting a value only some *other* record publishes.
  {
    name: "a measurement citing the record that publishes it is licensed",
    prose: "Targets are 44x44 pt on iOS (`control-size.ios`).",
    caught: false,
    note: "a value bound to the record that carries it is exactly what records are for",
    allowed: true,
    records: RECORDS,
  },
  {
    name: "a measurement citing a record that does NOT publish it is flagged",
    prose: "Use 66x66 pt on iOS (`control-size.ios`).",
    caught: true,
    note: "",
    records: RECORDS,
  },
  {
    name: "a recorded value with no record cited nearby is flagged",
    prose: "Targets are 44x44 pt.",
    caught: true,
    note: "",
    records: RECORDS,
  },
  {
    name: "a value no record publishes is flagged even when a record is cited",
    prose: "Targets are 50x50 pt on iOS (`control-size.ios`).",
    caught: true,
    note: "",
    records: RECORDS,
  },
  {
    name: "a colour literal is flagged even when a record is cited",
    prose: "Use #1a73e8 (`control-size.ios`).",
    caught: true,
    note: "no record can license a colour literal",
    records: RECORDS,
  },
  {
    // A line window let one table row borrow its neighbour's citation. A row is its own scope.
    name: "a table row cannot borrow the adjacent row's citation",
    prose: [
      "| Platform | Size | Record |",
      "| --- | --- | --- |",
      "| iOS | 66x66 pt | `control-size.ios` |",
      "| tvOS | 66x66 pt | `control-size.tvos` |",
    ].join("\n"),
    caught: true,
    note: "",
    records: RECORDS,
  },
  {
    name: "a table row citing its own correct record is licensed",
    prose: [
      "| Platform | Size | Record |",
      "| --- | --- | --- |",
      "| tvOS | 66x66 pt | `control-size.tvos` |",
    ].join("\n"),
    caught: false,
    note: "the row carries the record that publishes its value",
    allowed: true,
    records: RECORDS,
  },
  {
    name: "a paragraph cannot borrow a citation from a different paragraph",
    prose: "Targets are 44x44 pt here.\n\nA separate paragraph mentions `control-size.ios`.",
    caught: true,
    note: "",
    records: RECORDS,
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
    if (testCase.records) {
      await mkdir(join(root, "guidance", "probe", "records"), { recursive: true });
      await writeFile(join(root, "guidance", "probe", "records", "r.yaml"), testCase.records);
    }

    const proc = Bun.spawn([process.execPath, join(REPO, "src", "e2e", "specs.ts")], {
      cwd: root,
      stdout: "pipe",
      stderr: "pipe",
    });
    await new Response(proc.stdout).text();
    const flagged = (await proc.exited) !== 0;

    if (flagged === testCase.caught) {
      console.log(`✓ ${testCase.name}`);
      console.log(`    → ${flagged ? "flagged, as it must be" : `${testCase.allowed ? "allowed" : "not flagged — known hole"}: ${testCase.note}`}`);
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
const allowed = CASES.filter((c) => !c.caught && c.allowed).length;
if (failed) {
  log.warn(`${failed} specification-scan expectation(s) no longer hold`);
  process.exit(1);
}
log.info(`specification scan: ${caught} shapes caught, ${allowed} deliberately allowed, ${CASES.length - caught - allowed} known misses, all as documented`);
