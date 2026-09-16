# Reviewing with evidence

A finding is a claim. This file is about making claims that survive being checked.

## Where a finding comes from

Start from observable behavior or a specific code path, never from a general impression of the
screen. Follow the candidate to the official page via [the source map](../research/topics.md) or the
relevant [task file](../tasks/navigation.md), then ask three questions in order:

1. **Does this guidance apply here?** Right platform section, right component, right state, right OS
   version. See [platforms.md](../context/platforms.md).
2. **Does the neighboring text change it?** Read the paragraphs around the sentence and any
   exception. A statement quoted without its caveat is a different statement.
3. **Is the code actually doing the thing?** See the next section. Most retracted findings die here.

## Verify against the code, not the appearance

Source and screenshots both mislead, in opposite directions:

- **A small visible icon is not a small target.** It may sit inside a much larger interactive
  region. Trace padding, frame, content shape, button style, and the parent container before
  claiming a target is too small.
- **A missing state may be supplied by the framework.** A system control brings press, focus,
  disabled, and accessibility behavior that is nowhere in the local code. "No press state" is a
  finding about a *custom* control.
- **A screenshot cannot show** hit regions, accessibility labels, focus order, keyboard behavior,
  Dynamic Type response, or what happens in dark mode. If a screenshot is all you have, these are
  unverified, and you should say so rather than inferring.

## What a finding must carry

- The affected control or code location, and how to reproduce it.
- The consequence for someone using the interface. If you cannot state one, it may be a preference.
- The official page **and section**, with a concise paraphrase of the relevant guidance.
- The platform, OS version where relevant, and any exception that changes the decision.
- A proposed fix, and the observation that would confirm the fix worked.
- Whether you verified it in a running app or only by reading.

## Label the claim honestly

Three distinct things, which must not be blurred:

| Kind | How to write it |
| --- | --- |
| The source prohibits or requires it | Cite the page and section, and quote the prohibition |
| The source prefers or recommends it | Say "recommends", and link the page |
| You think it would be better | Say "design suggestion", and attach no citation |

Do not attach an Apple citation to your own preference to make it sound mandatory. **This bundle
contains no extracted rule catalogue, so a rule ID such as `HIG-1234` cited from it is fabricated.**
Use real URLs and section names.

If you could not open the source, say the finding is unverified and name what you would check.

## Report what you left alone

A review that finds only problems is not a review. Name at least one pattern you checked and
deliberately left unchanged, with the reason it is permitted. This is what distinguishes a review
from a style complaint, and it tells the reader which conventions you examined.

Also state what you did not check: the platforms you did not run, the settings you did not toggle,
the states you could not reach.

## Order by consequence

Rank findings by what they cost the person using the app, not by how easy they are to see:

1. Blocks a task, loses data, or is unreachable with an assistive technology.
2. Makes a task materially harder: unlabelled control, unreadable text at larger sizes, unclear
   destructive action.
3. Inconsistent with the platform or the app's own conventions.
4. Cosmetic.

An unlabelled icon button outranks a spacing inconsistency, even though the spacing is more obvious
in a screenshot.

## A worked shape

Reviewing an iOS checkout screen with an icon-only button and a destructive action:

- Establish platform, minimum OS, framework, and which controls are system versus custom.
- Read [Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons) including its
  Role section, and [Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility).
- Inspect the *actual* interaction bounds of the icon button, and whether the destructive action uses
  a destructive role or merely red styling.
- Run VoiceOver and the largest text size; record both results.
- Report each finding with page, section, platform, consequence, and fix, plus one pattern you
  verified as correct and left alone, plus the checks you could not run.
