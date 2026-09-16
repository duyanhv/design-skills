# Navigation and screen structure

Choosing how someone moves through the app. Get this wrong and every later decision inherits it, so
settle it before picking individual controls.

## Choose the structure

Work from the app's information architecture, not from a screenshot you are copying.

| The app's top level is… | Start from | Read before committing |
| --- | --- | --- |
| A few peer sections people switch between constantly | Tab bar | [Tab bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars) |
| Many collections, or a user-editable list (folders, playlists) | Sidebar | [Sidebars](https://developer.apple.com/design/human-interface-guidelines/sidebars) |
| A list whose selection drives a detail pane | Split view | [Split views](https://developer.apple.com/design/human-interface-guidelines/split-views) |
| A drill-down hierarchy within one section | Push navigation inside the section | [Toolbars](https://developer.apple.com/design/human-interface-guidelines/toolbars) |
| A self-contained task interrupting the current one | Sheet, not a new section | [Sheets](https://developer.apple.com/design/human-interface-guidelines/sheets), [Modality](https://developer.apple.com/design/human-interface-guidelines/modality) |

Apple's guidance on iPhone-sized layouts favors a tab bar over a sidebar, and its sidebar page says
to consider a tab bar first on iOS and iPadOS. Read
[Sidebars › iOS, iPadOS](https://developer.apple.com/design/human-interface-guidelines/sidebars#iOS-iPadOS)
for the actual wording before you present that as settled.

**Our judgment, not Apple's:** if you cannot name each top-level destination in one or two words, the
structure is usually wrong rather than the labels. Fix the grouping first.

## Navigation is not action

The clearest recurring mistake is putting a *verb* in a navigation surface. Apple's Tab bars page
states it plainly — use a tab bar to support navigation, **not to provide actions** — which makes
this citable guidance rather than taste. A tab switches which content you are looking at; it does
not compose, delete, or submit. Controls that act on the current view belong in a toolbar, a menu,
or the content itself. See [actions.md](actions.md).

The converse is **not** true, and this is worth stating because the symmetry is tempting. A toolbar
is a legitimate navigation surface: Apple's Toolbars page has a
[Navigation](https://developer.apple.com/design/human-interface-guidelines/toolbars#Navigation)
section describing toolbars that help people move through a hierarchy of content, often containing a
search field for moving quickly between areas, and it asks for the standard Back and Close buttons.
On iOS a navigation-specific toolbar is what was called a navigation bar. Back buttons, breadcrumbs,
and toolbar search are all navigation doing its job.

What is worth questioning is a control whose effect is *unexpected*: one that looks like an action
and silently relocates you, or that discards work on the way. Judge it by whether someone can
predict where the control leads, not by the fact that it navigates from a toolbar.

## Navigation bars merged into Toolbars

Apple's HIG no longer has a separate "Navigation bars" page; that material now lives in
[Toolbars](https://developer.apple.com/design/human-interface-guidelines/toolbars), which covers the
top bar, its item groupings, and the leading/center/trailing areas. If you recall a `navigation-bars`
URL, it is stale. The old address resolves to the Toolbars document rather than 404ing, so a link
that "works" is not evidence the page you remember still exists.

Read [Toolbars › Item groupings](https://developer.apple.com/design/human-interface-guidelines/toolbars#Item-groupings)
for how items are grouped, and the platform sections for per-platform placement.

## What to check in the code

1. **Where the destination is declared.** Find the actual navigation container (`TabView`,
   `NavigationSplitView`, `NavigationStack`, `UITabBarController`, `UISplitViewController`) rather
   than inferring structure from the visual result.
2. **Whether the bar persists.** Apple's tab bar guidance asks that the tab bar stay visible as
   people navigate between sections, and names a modal covering it as the exception, since a modal
   is temporary and self-contained. A screen that hides the tab bar for a pushed detail is making a
   deliberate choice that should be justified; check the actual behavior and read the page's own
   wording before calling it a defect.
3. **Selection state across relaunch and deep links.** A deep link that leaves the tab bar showing
   the wrong selected tab is a real defect and is invisible in a static reading.
4. **Adaptation across size classes.** A sidebar on a wide window and a tab bar on a narrow one is
   one app that must keep selection consistent across the change. See
   [Layout › Size classes](https://developer.apple.com/design/human-interface-guidelines/layout#Size-classes).
5. **Back affordance.** Whether the system supplies it, whether a custom bar broke the interactive
   back gesture, and whether a modal offers a way out. A missing escape is more serious than a
   misaligned label, so report it that way.

## Exceptions worth knowing before filing a finding

- Apple's tab bar guidance is written per platform, and tvOS, visionOS, and iPadOS each carry their
  own considerations. Do not transfer an iPhone conclusion to them; read the platform section.
- A sidebar *inside* a tab is an arrangement Apple's own pages discuss for deep hierarchies. Seeing
  both is not automatically a contradiction.
- Hiding a bar for an immersive or full-screen experience is an established pattern, not a defect.
  Check [Going full screen](https://developer.apple.com/design/human-interface-guidelines/going-full-screen)
  before reporting it.

## Verify

Static reading establishes structure. It does not establish behavior. Run the app, or say you did not:

- Switch every tab, then push and pop within one; confirm each tab keeps its own stack.
- Resize (or rotate) across the size-class boundary and confirm selection survives.
- Open a deep link into a nested screen from a cold start.
- Navigate with VoiceOver on and confirm destinations are reachable and announced. See
  [accessibility.md](accessibility.md).
