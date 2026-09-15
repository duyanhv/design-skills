import type { Source } from "../schema/source.ts";
import type { Manifest } from "./types.ts";
import { fetchDocc } from "./docc.ts";
import { fetchWcag } from "./wcag.ts";

export async function fetchSource(source: Source, opts: { limit?: number } = {}): Promise<Manifest> {
  switch (source.kind) {
    case "authored":
      throw new Error(`Source ${source.id} is authored locally; use build instead of fetch.`);
    case "docc":
      return fetchDocc(source, opts);
    case "wcag":
      return fetchWcag(source, opts);
    case "html":
      throw new Error(`fetcher for kind "html" not implemented yet (source ${source.id})`);
  }
}
