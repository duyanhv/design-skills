/**
 * Severity from wording. Deliberately simple and documented so it can be reviewed and tuned.
 *
 * The only job here is to report how strongly the *source* worded a rule — never to promote a
 * keyword guess into a normative requirement. Four guards keep that honest:
 *   1. Strength words must be doing grammatical work. "only" in "an icon-only button" is part of a
 *      compound adjective, not a restriction, so it does not make the rule a MUST.
 *   2. Explicitly soft phrasing ("Consider…", "In rare cases…") wins over any strong word.
 *   3. A strength word inside a purpose clause is the rule's *goal*, not its directive
 *      ("Choose items deliberately to avoid overcrowding" tells you to choose).
 *   4. A modal is permission only when it governs the reader ("you can"), not a third party
 *      ("people can have more than one home" is a fact the rule rests on).
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
/**
 * A purpose clause states the *goal*, not the directive: in "Choose items deliberately to avoid
 * overcrowding" the instruction is "choose" and "avoid" is what choosing achieves. Reading the
 * strong word out of the goal turned seven suggestions into prohibitions (AUDIT-OUTPUT finding 9).
 * "Help ensure" is hedged by construction and is stripped for the same reason.
 */
const PURPOSE_CLAUSE = /\b(?:so as )?to (?:help |better )?(?:avoid|ensure|prevent|make sure)\b.*$/i;
/**
 * A modal only softens the *addressee's* obligation. "You can skip this" is permission; "people can
 * have more than one home" is a statement of fact inside a directive, and reading it as permission
 * made 39 recommendations look optional.
 */
const ADDRESSEE_MODAL = /\b(?:you|your app|your game|apps?|games?)\s+(?:can|might|may)\b/i;
/** A bare modal governing a third party: "people can", "a destination can", "content might". */
const THIRD_PARTY_MODAL = /\b(can|may|might)\b/i;

export type Severity = "must" | "should" | "may";

/** Apple's copy uses typographic apostrophes/quotes; fold them so word lists match. */
export function foldQuotes(s: string): string {
  return s.replace(/[\u2018\u2019\u02BC]/g, "'").replace(/[\u201C\u201D]/g, '"');
}

/** Explicitly optional phrasing wins over strong words in the same sentence ("In rare cases, consider using only…"). */
const OPTIONAL = /\b(consider|optionally|in rare cases|if you want|if needed|feel free|it's fine|it is fine)\b/i;
/** Hedged phrasing: a recommendation, not an absolute. Caps severity at SHOULD. */
const HEDGED = /\b(prefer|try to|aim to|in general|generally|typically|usually|when possible|where possible|if possible|whenever possible)\b/i;

export function severityOf(statement: string): Severity {
  const s = foldQuotes(statement);
  if (OPTIONAL.test(s)) return "may";
  // The main clause is what the source is telling you to do; a trailing purpose clause is why.
  const main = s.replace(PURPOSE_CLAUSE, "").trim() || s;
  const strong = PROHIBITIVE.test(main) || EMPHATIC.test(main) || RESTRICTIVE_ONLY.test(main);
  if (strong) return HEDGED.test(s) ? "should" : "must";
  // A bare modal is permission only when it governs the reader; otherwise it is part of the
  // situation the rule describes and the rule is still a recommendation.
  if (THIRD_PARTY_MODAL.test(s)) return ADDRESSEE_MODAL.test(s) ? "may" : "should";
  return "should";
}

/** Words that turn a number into a limit. A figure carrying one is the rule's own constraint. */
const BOUND = "at least|at most|a minimum of|a maximum of|no lower than|no higher than|no more than|no fewer than|no longer than|up to|fewer than|more than";
/** Words that place a number without constraining it: approximations and ranges. */
const APPROX = "between|about|approximately|around|roughly";
/**
 * Concrete figure with a unit, e.g. "at least 44x44 pt", "4.5:1", "30 to 60 fps".
 * A range is captured whole: matching only its upper bound turned "a consistent frame rate of 30 to
 * 60 fps" into a "60 fps" requirement.
 */
const VALUE = new RegExp(
  `\\b(?:(?:${BOUND}|${APPROX})\\s+)?\\d+(?:\\.\\d+)?(?:\\s?[x×]\\s?\\d+(?:\\.\\d+)?)?(?:\\s*(?:to|and|[-–—])\\s*\\d+(?:\\.\\d+)?)?\\s?` +
    `(?:pt|px|dp|pixels?|points?|mm|cm|in|ms|s|sec|seconds?|minutes?|hours?|%|percent|:1|degrees?|°|fps|Hz)\\b`,
  "i",
);
const VALUE_RATIO = /\b\d+(?:\.\d+)?:\d+\b/;
const IS_BOUNDED = new RegExp(`^(?:${BOUND})\\b`, "i");
/** A sentence that illustrates rather than requires. Its numbers are one app's choice, not a spec. */
const ILLUSTRATIVE = /\b(for example|for instance|such as|e\.g\.)\b/i;

export function valueOf(text: string): string | undefined {
  const m = VALUE.exec(text) ?? VALUE_RATIO.exec(text);
  return m ? m[0].trim().slice(0, 80) : undefined;
}

/** Every distinct unit-bearing figure in `text`, in order, deduplicated by normalized form. */
function valuesIn(text: string): string[] {
  const seen = new Map<string, string>();
  const scan = (re: RegExp) => {
    for (const m of text.matchAll(new RegExp(re.source, `${re.flags.replace("g", "")}g`))) {
      const v = m[0].trim();
      const key = v.toLowerCase().replace(/\s+/g, " ");
      if (!seen.has(key)) seen.set(key, v.slice(0, 80));
    }
  };
  scan(VALUE);
  scan(VALUE_RATIO);
  return [...seen.values()];
}

/**
 * The value badge renders in the same position and typography as a load-bearing spec ("at least
 * 44x44 pt"), so it has to *be* one. Taking the first unit-bearing number anywhere in the rule body
 * put "5 minutes" on "Create engaging challenges." and "24 hours" on a rule about chart labels
 * (AUDIT-OUTPUT finding 5). Three restrictions keep the badge honest:
 *   1. Sentences that illustrate ("For example, a parking app could offer 5 minutes…") are skipped
 *      entirely. Their numbers are one app's choice, not the guideline's requirement.
 *   2. Within a sentence, a figure carrying an explicit bound ("at least 44x44 pt") is the rule's
 *      constraint and outranks a bare figure beside it ("— in visionOS, 60x60 pt").
 *   3. When a sentence offers two figures with equal claim, none is emitted: a single badge cannot
 *      represent "60 points from the top and bottom, and 80 points from the sides".
 * The full text always ships in the rationale, so a suppressed badge loses nothing but the summary.
 */
export function ruleValue(statement: string, rationale?: string): string | undefined {
  const sentences = [statement, ...(rationale ?? "").split(/(?<=[.!?])\s+/)];
  for (const s of sentences) {
    if (!s.trim() || ILLUSTRATIVE.test(s)) continue;
    const found = valuesIn(s);
    if (!found.length) continue;
    const bounded = found.filter((v) => IS_BOUNDED.test(v));
    if (bounded.length === 1) return bounded[0];
    if (bounded.length > 1) return undefined; // two limits, one badge: neither can stand for the rule
    return found.length === 1 ? found[0] : undefined;
  }
  return undefined;
}
