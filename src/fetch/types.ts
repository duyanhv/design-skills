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
  pages: Record<string, PageEntry>;
}
