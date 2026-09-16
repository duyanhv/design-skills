#!/usr/bin/env bash
# Report the laid-out size of the controls whose target size is in question.
#
# Patches a *copy* of the variant to attach `.reportSize(...)` at specific call sites, so the
# committed before/ and after/ files stay exactly as reviewed. Prints the raw result.
#
# Usage: ./probe/sizes.sh before|after [device-name]
set -euo pipefail

VARIANT="${1:?usage: probe/sizes.sh before|after [device-name]}"
DEVICE="${2:-iPhone 17 Pro}"
BUNDLE_ID="com.designskills.sizeprobe"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

SRC="$WORK/Screen.swift"
cp "$ROOT/$VARIANT/ShareSheetView.swift" "$SRC"

# Attach the reporter at the call sites under question. Each pattern is anchored on a line that
# exists only at that site; a miss is reported rather than silently producing fewer measurements.
attach() { # attach <anchor-line> <label>
  if ! grep -qF "$1" "$SRC"; then echo "note: anchor not present in $VARIANT: $1" >&2; return; fi
  python3 - "$SRC" "$1" "$2" <<'PY'
import sys, pathlib
path, anchor, label = sys.argv[1], sys.argv[2], sys.argv[3]
p = pathlib.Path(path); lines = p.read_text().split("\n")
for i, line in enumerate(lines):
    if anchor in line:
        indent = len(line) - len(line.lstrip())
        lines.insert(i + 1, " " * indent + f'.reportSize("{label}")')
        break
p.write_text("\n".join(lines))
PY
}

case "$VARIANT" in
  before)
    attach ".frame(width: 24, height: 24)" "toolbar item"
    attach ".frame(width: 20, height: 20)" "row remove control"
    attach ".background(Color(red: 0.0, green: 0.48, blue: 1.0))" "Send button"
    ;;
  after)
    attach ".accessibilityLabel(\"More sharing options\")" "toolbar item"
    attach ".disabled(!store.canSend)" "Send button"
    ;;
esac

cat > "$WORK/main.swift" <<'MAIN'
import SwiftUI
struct SizeProbeApp: App { var body: some Scene { WindowGroup { ShareSheetView() } } }
SizeProbeApp.main()
MAIN

UDID=$(xcrun simctl list devices available | grep "$DEVICE (" | head -1 | sed -E 's/.*\(([0-9A-F-]{36})\).*/\1/')
[ -n "$UDID" ] || { echo "device not found: $DEVICE" >&2; exit 1; }
SDK=$(xcrun --sdk iphonesimulator --show-sdk-path)
APP="$WORK/SizeProbe.app"; mkdir -p "$APP"
xcrun -sdk iphonesimulator swiftc -target arm64-apple-ios18.0-simulator -sdk "$SDK" -O \
  -o "$APP/SizeProbe" "$SRC" "$ROOT/probe/SizeReport.swift" "$WORK/main.swift"
cat > "$APP/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>SizeProbe</string>
<key>CFBundleIdentifier</key><string>$BUNDLE_ID</string>
<key>CFBundleName</key><string>SizeProbe</string>
<key>CFBundleVersion</key><string>1</string>
<key>CFBundleShortVersionString</key><string>1.0</string>
<key>UILaunchScreen</key><dict/>
<key>CFBundleSupportedPlatforms</key><array><string>iPhoneSimulator</string></array>
</dict></plist>
PLIST

xcrun simctl bootstatus "$UDID" -b >/dev/null 2>&1 || xcrun simctl boot "$UDID" >/dev/null 2>&1 || true
for setting in "appearance light" "content_size medium"; do
  # shellcheck disable=SC2086
  xcrun simctl ui "$UDID" $setting >/dev/null 2>&1 || { echo "error: could not set $setting" >&2; exit 1; }
done
xcrun simctl uninstall "$UDID" "$BUNDLE_ID" >/dev/null 2>&1 || true
xcrun simctl install "$UDID" "$APP" >/dev/null
xcrun simctl launch "$UDID" "$BUNDLE_ID" >/dev/null
sleep 6
RESULT="$(xcrun simctl get_app_container "$UDID" "$BUNDLE_ID" data)/tmp/sizes.txt"
[ -f "$RESULT" ] || { echo "error: probe produced no output" >&2; exit 1; }
echo "variant: $VARIANT  (device: $DEVICE, light, default text size)"
sort -u "$RESULT"
