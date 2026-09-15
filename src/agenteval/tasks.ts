/**
 * Review tasks for the agent evaluation.
 *
 * Each task seeds a file with three kinds of content:
 *   violations  — real breaches of the guideline. Recall measures these.
 *   decoys      — code that pattern-matches to a "violation" but is explicitly fine per the source.
 *                 An agent working from memory tends to flag these; one reading the rule's
 *                 exceptions should not.
 *   scopeTraps  — guidance that belongs to another platform. Citing it here is a scope error, the
 *                 failure the unscoped-rules bug (AUDIT finding 3) would cause.
 *
 * Cues are lowercase substrings; every cue in a list must appear for the item to count. They are
 * written to be specific enough not to fire by accident and loose enough not to demand exact
 * phrasing.
 */
export interface Check {
  id: string;
  cues: string[];
}

/**
 * A decoy is scored twice over, because "flagged it" and "considered it and moved on" are different
 * behaviours and need different cues:
 *   cues        — the agent asserted it as a problem (a false positive)
 *   dismissCues — the agent named it and explained why it is fine (the behaviour we want)
 */
export interface Decoy extends Check {
  dismissCues: string[];
}

export interface Task {
  id: string;
  skill: string;
  /** Filename seeded into the working directory. */
  file: string;
  code: string;
  prompt: string;
  /** Appended to the prompt in the skill arm only: tells the agent the skill is available. */
  skillHint: string;
  violations: Check[];
  decoys: Decoy[];
  scopeTraps: Check[];
}

const APPLE_HINT =
  "An `apple-hig` Agent Skill is installed in .claude/skills. Use it: read the relevant reference files and cite the rule id or source URL for every finding.";
const WCAG_HINT =
  "A `wcag22` Agent Skill is installed in .claude/skills. Use it: read the relevant reference files and cite the success criterion and its level for every finding.";

export const TASKS: Task[] = [
  {
    id: "ios-buttons",
    skill: "apple-hig",
    file: "CheckoutView.swift",
    prompt:
      "Review CheckoutView.swift against Apple's Human Interface Guidelines for iOS. List every issue you find as a bullet, each with the specific guidance it breaks. Be precise: do not flag things the guidelines permit.",
    skillHint: APPLE_HINT,
    code: `import SwiftUI

/// Checkout screen for an iOS shopping app.
struct CheckoutView: View {
    @State private var showingSheet = false
    @State private var showingSecondSheet = false

    var body: some View {
        VStack(spacing: 2) {
            Text("Order summary")
                .font(.system(size: 11))

            // Delete the whole cart. Styled as the default/primary action.
            Button("Delete order", role: .destructive) { deleteOrder() }
                .buttonStyle(.borderedProminent)
                .keyboardShortcut(.defaultAction)

            // Small icon-only button with no accessibility label.
            Button { share() } label: { Image(systemName: "square.and.arrow.up") }
                .frame(width: 28, height: 28)

            // A tab item that gets hidden when the user has no saved items.
            if hasSavedItems {
                TabItem("Saved", systemImage: "heart")
            }

            // This button opens another view, and correctly uses an ellipsis.
            Button("Edit payment method…") { editPayment() }

            // Plain text label, not a control: no press state needed.
            Text("Subtotal: $42.00")

            Button("Place order") { placeOrder() }
                .buttonStyle(.borderedProminent)
                .frame(minWidth: 120, minHeight: 44)
        }
        .sheet(isPresented: $showingSheet) {
            OrderDetail()
                .sheet(isPresented: $showingSecondSheet) { PromoCodeEntry() }
        }
    }
}
`,
    violations: [
      // Destructive action given the primary role. apple-hig/buttons: "Don't assign the primary role…"
      { id: "destructive-primary", cues: ["destructive", "primary"] },
      // 28x28 is below the 44x44 pt hit region.
      { id: "hit-region", cues: ["44"] },
      // Two sheets stacked. apple-hig/sheets: "Display only one sheet at a time".
      { id: "stacked-sheets", cues: ["sheet"] },
      // Hiding a tab item when its content is unavailable.
      { id: "hidden-tab", cues: ["tab"] },
    ],
    decoys: [
      // Apple explicitly *requires* the trailing ellipsis here, so flagging it is a false positive.
      { id: "ellipsis-is-correct", cues: ["ellipsis", "remove"], dismissCues: ["ellipsis"] },
      // A Text label is not a control; demanding a press state for it is a misapplied rule.
      { id: "press-state-on-text", cues: ["subtotal", "press state"], dismissCues: ["subtotal"] },
    ],
    scopeTraps: [
      // visionOS: 60x60 pt and no custom hover effects. Neither applies to an iOS view.
      { id: "visionos-60pt-on-ios", cues: ["60x60"] },
      // watchOS/tvOS guidance has no bearing on this file.
      { id: "tvos-focus-on-ios", cues: ["siri remote"] },
    ],
  },
  {
    id: "wcag-form",
    skill: "wcag22",
    file: "signup.html",
    prompt:
      "Audit signup.html for WCAG 2.2 conformance at Level AA. List every issue as a bullet with the success criterion it fails. Be precise: do not report anything that conforms at AA.",
    skillHint: WCAG_HINT,
    code: `<!doctype html>
<html lang="en">
<head><title>Sign up</title></head>
<body>
  <!-- #767676 on white is 4.54:1 — passes AA for normal text. -->
  <p style="color:#767676;background:#fff">Create an account to track your orders.</p>

  <!-- #999999 on white is 2.85:1 — fails AA for normal text. -->
  <p style="color:#999999;background:#fff;font-size:14px">Fields marked in red are required.</p>

  <!-- 28px bold on white at #949494 is 3.03:1 — passes AA as large-scale text. -->
  <h1 style="color:#949494;background:#fff;font-size:28px;font-weight:bold">Sign up</h1>

  <form>
    <!-- No label and no accessible name. -->
    <input type="email" placeholder="Email" />

    <!-- Visible label says "Post code", accessible name says something else. -->
    <label for="zip">Post code</label>
    <input id="zip" aria-label="Zip" />

    <!-- Correctly labelled and autocompletable. -->
    <label for="name">Full name</label>
    <input id="name" autocomplete="name" />

    <!-- 20x20 CSS px target with no spacing: below the 24x24 minimum. -->
    <button style="width:20px;height:20px" onclick="help()">?</button>

    <!-- Error state conveyed by colour alone. -->
    <span style="color:red">Invalid</span>

    <!-- Inline link inside a sentence: exempt from target size. -->
    <p>Read our <a href="/terms">terms</a> before continuing.</p>
  </form>

  <!-- Auto-playing audio longer than 3 seconds with no control. -->
  <audio src="/welcome.mp3" autoplay></audio>
</body>
</html>
`,
    violations: [
      { id: "contrast-999", cues: ["1.4.3"] },
      { id: "unlabelled-input", cues: ["email"] },
      { id: "label-in-name", cues: ["2.5.3"] },
      { id: "target-size", cues: ["2.5.8"] },
      { id: "colour-alone", cues: ["1.4.1"] },
      { id: "audio-autoplay", cues: ["1.4.2"] },
    ],
    decoys: [
      // 4.54:1 passes AA; flagging it is a false positive.
      { id: "767676-is-fine", cues: ["#767676", "fail"], dismissCues: ["767676"] },
      // Large-scale text only needs 3:1.
      { id: "large-text-is-fine", cues: ["#949494", "fail"], dismissCues: ["949494"] },
      // Inline links are explicitly exempt from 2.5.8.
      { id: "inline-link-target", cues: ["terms", "24 by 24"], dismissCues: ["terms", "inline"] },
    ],
    scopeTraps: [
      // AAA criteria are not required at an AA target; reporting them as failures overstates the bar.
      { id: "aaa-as-required", cues: ["1.4.6", "fail"] },
      { id: "aaa-target-enhanced", cues: ["2.5.5", "fail"] },
    ],
  },
  {
    // Built to tempt a scope error: a watch screen is small, so an agent may import visionOS or tvOS
    // numbers that do not apply to watchOS.
    //
    // Writing this task also caught a mistake of *mine*. The first draft treated "44x44 pt" as an
    // iOS-only figure and scored it as a scope error. The skill arm quoted it, and quoted Apple's
    // control-size table back: watchOS is also 44x44 pt default / 28x28 pt minimum. The agent was
    // right and the trap was wrong — a useful reminder that these tasks assert facts and have to be
    // checked against the source like anything else. The trap is now the figures watchOS genuinely
    // does not share.
    id: "watchos-scope",
    skill: "apple-hig",
    file: "WorkoutSummary.swift",
    prompt:
      "Review WorkoutSummary.swift against Apple's Human Interface Guidelines for watchOS. List every issue as a bullet with the specific guidance it breaks. Only report guidance that applies to watchOS — say so explicitly if a rule you considered belongs to another platform.",
    skillHint: APPLE_HINT,
    code: `import SwiftUI

/// Post-workout summary, watchOS.
struct WorkoutSummary: View {
    @State private var page = 0

    var body: some View {
        ScrollView {
            VStack {
                // Six tappable stat tiles crammed into a watch screen.
                LazyVGrid(columns: Array(repeating: GridItem(.fixed(38)), count: 3)) {
                    ForEach(stats) { stat in
                        Button { open(stat) } label: { StatTile(stat) }
                            .frame(width: 38, height: 38)
                    }
                }

                // A five-level drill-down inside a watch app.
                NavigationLink("Splits") {
                    SplitsList { NavigationLink("Split detail") {
                        SplitDetail { NavigationLink("Segment") {
                            SegmentDetail { NavigationLink("Lap") { LapDetail() } }
                        } }
                    } }
                }

                // The Digital Crown is not wired to scrolling; only drag works.
                Text(longNotes)
                    .font(.system(size: 11))

                // Correct: complication data is glanceable and updates on wrist raise.
                ComplicationPreview(family: .graphicCircular, data: .heartRate)

                // Correct on watchOS: a full-width capsule button at the bottom of a scroll view.
                Button("Done") { dismiss() }
                    .buttonStyle(.borderedProminent)
                    .frame(maxWidth: .infinity, minHeight: 44)
            }
        }
    }
}
`,
    violations: [
      // 38x38 tiles sit below the 44x44 pt default for watchOS.
      { id: "small-targets", cues: ["38"] },
      // Deep hierarchy contradicts watchOS's own "minimize the depth of hierarchy" guidance.
      { id: "deep-hierarchy", cues: ["hierarchy"] },
      // The Digital Crown should drive vertical navigation/scrolling.
      { id: "no-crown", cues: ["digital crown"] },
      // Hardcoded 11 pt defeats the watch's text-size settings.
      { id: "fixed-font", cues: ["11"] },
    ],
    decoys: [
      // A full-width prominent button is the watchOS pattern (apple-hig/buttons/034: "Prefer buttons
      // that span the width of the screen for primary actions"). Flagging it is a false positive.
      { id: "full-width-button-is-fine", cues: ["done", "span", "breaks"], dismissCues: ["done", "span"] },
      // Complications on the watch face are exactly what Apple recommends.
      { id: "complication-is-fine", cues: ["complication", "remove"], dismissCues: ["complication"] },
    ],
    scopeTraps: [
      // 60x60 pt is the visionOS control size; 66x66 pt is tvOS. Neither applies to a watch.
      { id: "visionos-60-on-watchos", cues: ["60x60"] },
      { id: "tvos-66-on-watchos", cues: ["66x66"] },
      // The 60 pt centre-to-centre spacing is visionOS eye-targeting guidance.
      { id: "visionos-spacing-on-watchos", cues: ["60 pt", "apart"] },
      // Hover effects do not exist on watchOS; that is visionOS/macOS guidance.
      { id: "hover-on-watchos", cues: ["hover effect"] },
    ],
  },
];

/**
 * Every citation the built skill actually contains: rule ids, source URLs (fragment stripped) and
 * WCAG criterion numbers, keyed the way `score` keys them.
 *
 * Handing this to `score` is what separates "the finding is citation-shaped" from "the thing it
 * cites exists". Without it the scorer awards the same credit to `apple-hig/buttons/999` as to a
 * real id, which is the false positive the seeded decoys cannot enumerate.
 *
 * Returns `undefined` when the skill is not built locally, so the caller can report that it did not
 * check rather than reporting that nothing resolved.
 */
export async function knownCitations(skill: string): Promise<Set<string> | undefined> {
  const { join } = await import("node:path");
  const { readFile } = await import("node:fs/promises");
  const { exists, listDirs, listFiles, paths } = await import("../util/fs.ts");
  const { CITATION, citationKey } = await import("./score.ts");
  const root = join(paths.skill(skill), "references");
  if (!(await exists(root))) return undefined;
  const out = new Set<string>();
  for (const cat of await listDirs(root)) {
    for (const f of await listFiles(join(root, cat), ".md")) {
      const doc = await readFile(join(root, cat, f), "utf8");
      for (const m of doc.matchAll(CITATION)) out.add(citationKey(m[0]!));
    }
  }
  return out;
}
