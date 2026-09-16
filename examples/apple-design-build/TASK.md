# Build task

Add a new screen to an existing iOS app: **Notification Settings**.

## Context

- Platform: iOS (iPhone), SwiftUI
- Minimum deployment target: **iOS 16**
- The app already ships; this screen will be reachable from the app's settings list.
- Put the screen in `app/NotificationSettingsView.swift`. It must compile against the iOS 16 SDK
  floor and be self-contained (no other files, no assets, no network).
- A preview/host harness is not needed; just the view and whatever types it requires.

## What the screen must let someone do

1. Turn all notifications on or off.
2. When notifications are on, choose per-category delivery: **Mentions**, **Direct messages**,
   **Product updates**. Each can be Off, Quiet (deliver silently), or Immediate.
3. Set a "Do not disturb" window with a start and end time.
4. Choose a notification sound from a short list.
5. See how many categories are currently set to Immediate.
6. Send themselves a test notification, and see whether it succeeded or failed.

## Deliverable

Write the SwiftUI file, plus a short `NOTES.md` explaining the decisions you made, what you checked,
and anything that needs verification you could not do here.

Use the `apple-design` skill in `skills/apple-design/`. Start at `skills/apple-design/SKILL.md` and
follow its workflow.
