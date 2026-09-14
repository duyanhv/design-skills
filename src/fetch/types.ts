export interface PageEntry {
  slug: string;
  url: string;        // absolute page URL (human-readable)
  data_url: string;   // URL the raw payload was fetched from
  title: string;
  category: string;
  parent: string | null;
  raw_hash: string;
  fetched_at: string;
}

export interface Manifest {
  source: string;
  entry: string;
  fetched_at: string;
  /** Upstream version when the source exposes one (e.g. a git commit date). */
  version?: string;
  /** Immutable revision the crawl was pinned to (e.g. a resolved git SHA), when the source has one. */
  revision?: string;
  /**
   * True when this crawl did not cover the whole source: pages failed, or `--limit` capped it.
   * Downstream stages refuse to reconcile against a partial crawl, so a network blip cannot
   * silently delete guidance from the skill.
   */
  partial?: boolean;
  /** Pages that could not be fetched, with the reason. Present whenever `partial` is true. */
  failed?: { url: string; error: string }[];
  /** Set when `--limit` capped the crawl rather than a failure. */
  limited?: boolean;
  pages: Record<string, PageEntry>;
}
