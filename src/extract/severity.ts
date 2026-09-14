/**
 * Severity from wording. Deliberately simple and documented so it can be reviewed and tuned.
 * Order matters: "must" phrasing wins over "may" phrasing in the same sentence.
 */
const MUST = /\b(avoid|never|don't|do not|always|must|ensure|make sure|be sure|only|required|shouldn't|should not)\b/i;
const MAY = /\b(consider|can|may|might|optionally|it's fine|it is fine)\b/i;

export type Severity = "must" | "should" | "may";

/** Apple's copy uses typographic apostrophes/quotes; fold them so word lists match. */
export function foldQuotes(s: string): string {
  return s.replace(/[\u2018\u2019\u02BC]/g, "'").replace(/[\u201C\u201D]/g, '"');
}

export function severityOf(statement: string): Severity {
  const s = foldQuotes(statement);
  if (MUST.test(s)) return "must";
  if (MAY.test(s)) return "may";
  return "should";
}

/** First concrete figure with a unit, e.g. "at least 44x44 pt", "4.5:1", "no more than five tabs". */
const VALUE =
  /\b(?:(?:at least|at most|a minimum of|a maximum of|up to|no more than|no fewer than|fewer than|more than|between|about|approximately|around|roughly)\s+)?\d+(?:\.\d+)?(?:\s?[x×]\s?\d+(?:\.\d+)?)?\s?(?:pt|px|dp|pixels?|points?|mm|cm|in|ms|s|sec|seconds?|minutes?|hours?|%|percent|:1|degrees?|°|fps|Hz)\b/i;
const VALUE_RATIO = /\b\d+(?:\.\d+)?:\d+\b/;

export function valueOf(text: string): string | undefined {
  const m = VALUE.exec(text) ?? VALUE_RATIO.exec(text);
  return m ? m[0].trim().slice(0, 80) : undefined;
}
