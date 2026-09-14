export function withFrontmatter(meta: Record<string, string | number | boolean>, body: string): string {
  const fm = Object.entries(meta)
    .map(([k, v]) => `${k}: ${typeof v === "string" ? JSON.stringify(v) : v}`)
    .join("\n");
  return `---\n${fm}\n---\n\n${body}\n`;
}

export function parseFrontmatter(text: string): { meta: Record<string, string>; body: string } {
  const m = /^---\n([\s\S]*?)\n---\n\n?([\s\S]*)$/.exec(text);
  if (!m) return { meta: {}, body: text };
  const meta: Record<string, string> = {};
  for (const line of (m[1] ?? "").split("\n")) {
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const k = line.slice(0, idx).trim();
    let v = line.slice(idx + 1).trim();
    if (v.startsWith('"')) v = JSON.parse(v);
    meta[k] = v;
  }
  return { meta, body: m[2] ?? "" };
}
