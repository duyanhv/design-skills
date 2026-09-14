/**
 * Severity from wording. Deliberately simple and documented so it can be reviewed and tuned.
 *
 * The only job here is to report how strongly the *source* worded a rule — never to promote a
 * keyword guess into a normative requirement. Two guards keep that honest:
 *   1. Strength words must be doing grammatical work. "only" in "an icon-only button" is part of a
 *      compound adjective, not a restriction, so it does not make the rule a MUST.
 *   2. Explicitly soft phrasing ("Consider…", "In rare cases…") wins over any strong word.
 * Anything we cannot read as prohibitive or optional stays SHOULD, the source's default voice.
 */

/** Prohibitions and absolutes: the source is ruling something out. */
const PROHIBITIVE = /\b(avoid|never|don't|do not|must|must not|shouldn't|should not|cannot|can't|required|refrain from)\b/i;
/** Directives the source states without hedging. */
const EMPHATIC = /\b(always|ensure|make sure|be sure|be certain)\b/i;
/**
 * "only" restricts when it governs a clause ("Use a sheet only when…", "Display only one sheet"),
 * not when it is glued to a noun as a compound modifier ("an icon-only button", "keyboard-only users").
 */
const RESTRICTIVE_ONLY = /(^|[^\w-])only(?=\s+(?:when|if|after|for|in|on|to|with|as|the|a|an|one|two|three|those|these|that|this|your|its|people|use|include|display|show|present|support|offer|allow|enable|apply|\d))/i;
const MAY = /\b(consider|can|may|might|optionally|it's fine|it is fine|if you want|if needed|feel free)\b/i;

export type Severity = "must" | "should" | "may";

/** Apple's copy uses typographic apostrophes/quotes; fold them so word lists match. */
export function foldQuotes(s: string): string {
  return s.replace(/[\u2018\u2019\u02BC]/g, "'").replace(/[\u201C\u201D]/g, '"');
}

/** Explicitly optional phrasing wins over strong words in the same sentence ("In rare cases, consider using only…"). */
const OPTIONAL = /\b(consider|optionally|in rare cases|if you want|it's fine|it is fine)\b/i;
/** Hedged phrasing: a recommendation, not an absolute. Caps severity at SHOULD. */
const HEDGED = /\b(prefer|try to|aim to|in general|generally|typically|usually|when possible|where possible|if possible|whenever possible)\b/i;

export function severityOf(statement: string): Severity {
  const s = foldQuotes(statement);
  if (OPTIONAL.test(s)) return "may";
  const strong = PROHIBITIVE.test(s) || EMPHATIC.test(s) || RESTRICTIVE_ONLY.test(s);
  if (strong) return HEDGED.test(s) ? "should" : "must";
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
