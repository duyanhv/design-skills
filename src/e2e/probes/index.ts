/**
 * Loads every probe module in this directory and concatenates its checks and defects.
 *
 * Discovery is by directory listing rather than a hand-written list, because the list was the thing
 * that went wrong: a requirement table naming a check that did not exist reads exactly like one
 * naming a check that does. A module that is present is loaded; a module that is absent cannot be
 * silently claimed. The order is alphabetical by filename so a run is reproducible.
 */
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type { Case, Check } from "./types.ts";

export type { Case, Check } from "./types.ts";

interface ProbeModule {
  CHECKS?: Check[];
  CASES?: Case[];
}

async function modules(): Promise<{ file: string; mod: ProbeModule }[]> {
  const here = import.meta.dir;
  const files = (await readdir(here))
    .filter((f) => f.endsWith(".ts") && f !== "types.ts" && f !== "index.ts")
    .sort();
  const out: { file: string; mod: ProbeModule }[] = [];
  for (const file of files) out.push({ file, mod: (await import(join(here, file))) as ProbeModule });
  return out;
}

export async function probeChecks(): Promise<Check[]> {
  const out: Check[] = [];
  for (const { file, mod } of await modules()) {
    for (const c of mod.CHECKS ?? []) {
      if (!c.finding || !c.requirement) throw new Error(`${file}: a check must name its finding and requirement`);
      out.push(c);
    }
  }
  return out;
}

export async function probeCases(): Promise<Case[]> {
  const out: Case[] = [];
  const findings = new Set((await probeChecks()).map((c) => c.finding));
  for (const { file, mod } of await modules()) {
    for (const c of mod.CASES ?? []) {
      // A defect pointing at a finding no one checks would report "still passed" forever and read
      // as a missing fix rather than a missing check. Say which it is.
      if (!findings.has(c.finding)) throw new Error(`${file}: defect "${c.name}" names finding ${c.finding}, which no check asserts`);
      out.push(c);
    }
  }
  return out;
}
