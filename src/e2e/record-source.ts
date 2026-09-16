/**
 * Reading a source page as structure rather than as text.
 *
 * Split out from `records.ts` so the negative suite can drive the same resolution logic against a
 * cached fixture, offline and deterministically. The audit that prompted this file made exactly
 * that point: the mutations were run against a cached response, and the repository had no committed
 * test that could have caught them.
 */

const UA = "design-skills/0.1 (+https://github.com/duyanhv/design-skills; guideline compiler)";

export interface SourceTable {
  anchor: string | null;
  header: string[];
  /** Body rows, each a list of cell strings, header row excluded. */
  rows: string[][];
}

export interface PageData {
  title: string | null;
  anchors: Set<string>;
  raw: string;
  tables: SourceTable[];
  /** Visible prose per section anchor, for prose-sourced records. */
  prose: Map<string, string>;
}

/** Visible text of a DocC inline-content node. */
export function nodeText(node: unknown): string {
  if (Array.isArray(node)) return node.map(nodeText).join("");
  if (node && typeof node === "object") {
    const r = node as Record<string, unknown>;
    if (r.type === "text" && typeof r.text === "string") return r.text;
    // A reference renders as its overriding title, which is how "buttons" appears mid-sentence.
    if (r.type === "reference" && Array.isArray(r.overridingTitleInlineContent)) {
      return nodeText(r.overridingTitleInlineContent);
    }
    return Object.values(r).map(nodeText).join("");
  }
  return "";
}

/**
 * Walk a DocC render, tracking the current heading anchor, collecting tables and prose per section.
 *
 * Apple emits `{type:"table", header:"row", rows:[...]}`, so the header cells are the first row.
 */
export function parsePage(data: unknown, raw: string): PageData {
  const anchors = new Set<string>();
  for (const m of raw.matchAll(/"anchor"\s*:\s*"([^"]+)"/g)) anchors.add(m[1]!);
  const tables: SourceTable[] = [];
  const prose = new Map<string, string>();
  const current = { anchor: null as string | null };

  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const child of node) walk(child);
      return;
    }
    if (!node || typeof node !== "object") return;
    const r = node as Record<string, unknown>;

    if (r.type === "heading" && typeof r.anchor === "string") current.anchor = r.anchor;

    if (r.type === "table" && Array.isArray(r.rows) && r.rows.length) {
      const rows = (r.rows as unknown[]).map((row) => (row as unknown[]).map(nodeText));
      tables.push({ anchor: current.anchor, header: rows[0]!, rows: rows.slice(1) });
      return; // do not fold table cells into the section's prose
    }

    if (r.type === "paragraph" && current.anchor) {
      const text = nodeText(r.inlineContent ?? r);
      if (text.trim()) prose.set(current.anchor, `${prose.get(current.anchor) ?? ""} ${text}`.trim());
    }

    for (const value of Object.values(r)) walk(value);
  };
  walk(data);

  const title = (data as { metadata?: { title?: string } })?.metadata?.title ?? null;
  return { title, anchors, raw, tables, prose };
}

const cache = new Map<string, PageData | null>();

export async function fetchPage(page: string): Promise<PageData | null> {
  if (cache.has(page)) return cache.get(page)!;
  const url = `https://developer.apple.com/tutorials/data/design/human-interface-guidelines/${page}.json`;
  try {
    const res = await fetch(url, { headers: { "user-agent": UA, accept: "application/json" } });
    if (!res.ok) {
      cache.set(page, null);
      return null;
    }
    const raw = await res.text();
    const parsed = parsePage(JSON.parse(raw), raw);
    cache.set(page, parsed);
    return parsed;
  } catch {
    cache.set(page, null);
    return null;
  }
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").replace(/[×✕]/g, "x").trim();

/**
 * Resolve section → table → row → column to a single cell.
 *
 * This is what makes a record verifiable rather than merely plausible. Searching a page for
 * "28x28 pt" finds it under three platforms and two meanings; asking for the cell where the row
 * says "iOS, iPadOS" and the column says "Minimum control size" finds exactly one.
 *
 * Returns null when any step fails to resolve, which the caller reports with the options it had.
 */
export function resolveTableCell(page: PageData, anchor: string, row: string, column: string): string | null {
  for (const table of page.tables) {
    if (table.anchor !== anchor) continue;
    const columnIndex = table.header.findIndex((h) => norm(h) === norm(column));
    if (columnIndex < 0) continue;
    const match = table.rows.find((r) => r.length && norm(r[0]!) === norm(row));
    if (!match) continue;
    const cell = match[columnIndex];
    if (cell !== undefined) return cell;
  }
  return null;
}

/** The prose under one section, for records whose value is stated in a sentence. */
export function sectionText(page: PageData, anchor: string): string | null {
  return page.prose.get(anchor) ?? null;
}
