# Build task

Add a new screen to an existing web app: **Notification Settings**.

## Context

- Platform: web, plain HTML/CSS/JS with web components. No framework.
- Component library: **`@material/web` version 2.5.0**, already a dependency. Import from it;
  do not add another UI dependency.
- The app supports light and dark appearance, following the OS setting.
- The app is used on phones and on desktops, in the same build.
- Put the screen in `app/notification-settings.js` (a custom element) plus
  `app/notification-settings.css`. Self-contained: no network, no other files, no assets.

## What the screen must let someone do

1. Turn all notifications on or off.
2. When notifications are on, choose per-category delivery: **Mentions**, **Direct messages**,
   **Product updates**. Each can be Off, Quiet (deliver silently), or Immediate.
3. Set a "Do not disturb" window with a start and end time.
4. Choose a notification sound from a short list.
5. See how many categories are currently set to Immediate.
6. Send themselves a test notification, and see whether it succeeded or failed.

## Deliverable

Write the two files, plus a short `NOTES.md` explaining the decisions you made, what you checked,
and anything that needs verification you could not do here. If something you wanted was not
available, say what you did instead.

Use the `material-3` skill in `skills/material-3/`. Start at `skills/material-3/SKILL.md` and follow
its workflow.
