/**
 * A synthetic guideline used as the end-to-end fixture.
 *
 * Two reasons it exists:
 *   1. CI can run the whole pipeline (normalize → extract → compose → validate → eval) with no
 *      network and no proprietary text.
 *   2. The generated skill is committed under `examples/lumen-ds/skill/`, so anyone can read a real
 *      output of this compiler without building Apple's or W3C's content locally.
 *
 * The content is invented, but deliberately shaped like the real thing: bold-lead rules, a
 * platform-specific page, notes that carry exceptions, a spec table, a figure with no text
 * equivalent, and wording that would trip the severity heuristics if they regressed.
 */
import type { Block, DoccDocument, Inline } from "../normalize/docc.ts";

const text = (t: string): Inline => ({ type: "text", text: t });
const strong = (t: string): Inline => ({ type: "strong", inlineContent: [text(t)] });
const image = (identifier: string): Inline => ({ type: "image", identifier });
const para = (...inline: Inline[]): Block => ({ type: "paragraph", inlineContent: inline });
const rule = (lead: string, rest: string): Block => para(strong(lead), text(` ${rest}`));
const heading = (t: string, anchor: string, level = 2): Block => ({ type: "heading", level, text: t, anchor });
const note = (t: string): Block => ({ type: "aside", style: "note", name: "Note", content: [para(text(t))] });
const bullets = (...items: Block[]): Block => ({ type: "unorderedList", items: items.map((b) => ({ content: [b] })) });
const cell = (t: string): Block[] => [para(text(t))];
const table = (...rows: Block[][][]): Block => ({ type: "table", header: "row", rows });

export interface SyntheticPage {
  slug: string;
  url: string;
  category: string;
  doc: DoccDocument;
}

export const PAGES: SyntheticPage[] = [
  {
    slug: "buttons",
    url: "/design/lumen/buttons",
    category: "components",
    doc: {
      metadata: {
        title: "Buttons",
        customMetadata: { "supported-platforms": "web,desktop,mobile,tv" },
      },
      abstract: [text("A button performs a single, immediate action.")],
      primaryContentSections: [
        {
          kind: "content",
          content: [
            // Pre-heading prose: the topic's definition, which no single rule carries.
            para(text("A button combines a label, an optional icon, and a role. Use a button for actions, and a link for navigation.")),
            heading("Best practices", "Best-practices"),
            para(text("A button is recognisable when its target is large enough and its label names the action.")),
            rule("Give every button a comfortable target.", "A button needs a hit region of at least 44x44 pt on touch inputs, and 32x32 pt with a precise pointer."),
            note("On tv, a focused button grows by 10 percent, so leave room for the focused size."),
            rule("Consider using an icon-only button when the action is universally understood.", "Close, back and search read clearly without a label. Anything else needs text."),
            rule("Show only one primary button per view.", "Two primary buttons make the default action ambiguous."),
            heading("Roles", "Roles"),
            para(text("A role changes both appearance and behaviour:")),
            bullets(
              para(strong("Primary."), text(" The action the person is most likely to take.")),
              para(strong("Destructive."), text(" The action removes data and cannot be undone.")),
            ),
            rule("Never give the destructive role to the primary button.", "People activate a prominent button without reading it."),
            heading("Sizes", "Sizes"),
            para(text("Buttons come in three sizes.")),
            table(
              [cell("Size"), cell("Height"), cell("Label")],
              [cell("Small"), cell("28 pt"), cell("13 pt")],
              [cell("Medium"), cell("36 pt"), cell("15 pt")],
              [cell("Large"), cell("44 pt"), cell("17 pt")],
            ),
            heading("Change log", "Change-log"),
            table([cell("Date"), cell("Changes")], [cell("March 4, 2026"), cell("Added the focused-size note for tv.")]),
          ],
        },
      ],
      references: {},
    },
  },
  {
    slug: "designing-for-tv",
    url: "/design/lumen/designing-for-tv",
    category: "getting-started",
    doc: {
      metadata: { title: "Designing for tv", customMetadata: { "supported-platforms": "tv" } },
      abstract: [text("People use a remote from across the room.")],
      primaryContentSections: [
        {
          kind: "content",
          content: [
            para(text("A television is a shared, ten-foot display driven by a directional remote. There is no pointer, no hover, and often no keyboard, so every affordance has to be reachable by moving focus and confirming.")),
            heading("Best practices", "Best-practices"),
            para(text("A tv layout is legible from a distance and navigable with four arrows and a select button.")),
            bullets(
              para(text("Keep the focused element obvious at three metres. Focus is the only cursor a remote has.")),
              para(text("Support remote-only navigation for every task. A person may never touch a keyboard.")),
              para(text("Lay out controls on a grid so that arrow presses move focus predictably between neighbours.")),
            ),
            heading("Focus", "Focus"),
            para(text("Focus is both the selection and the pointer, so it must never be ambiguous.")),
            rule("Always show exactly one focused element.", "If nothing is focused, the remote appears broken; if two elements look focused, the person cannot predict what select will do."),
          ],
        },
      ],
      references: {},
    },
  },
  {
    slug: "color",
    url: "/design/lumen/color",
    category: "foundations",
    doc: {
      metadata: { title: "Color", customMetadata: { "supported-platforms": "web,desktop,mobile,tv" } },
      abstract: [text("Color carries meaning, but never alone.")],
      primaryContentSections: [
        {
          kind: "content",
          content: [
            heading("Contrast", "Contrast"),
            rule("Ensure text meets a contrast ratio of 4.5:1 against its background.", "Large text may use 3:1."),
            para(text("The swatches below show the accessible pairings:"), image("swatches.png")),
            rule("Avoid using color as the only way to convey information.", "Pair color with a label, an icon, or a pattern."),
          ],
        },
      ],
      references: {
        "swatches.png": { type: "image", alt: "A grid of foreground and background color pairings with their contrast ratios." },
      },
    },
  },
];
