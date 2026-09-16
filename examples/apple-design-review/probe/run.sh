#!/usr/bin/env bash
# Run the hit-test probe against one variant and print its raw output.
#
# Usage: ./probe/run.sh before|after [device-name]
set -euo pipefail

VARIANT="${1:?usage: probe/run.sh before|after [device-name]}"
DEVICE="${2:-iPhone 17 Pro}"
BUNDLE_ID="com.designskills.hitprobe"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

[ -d "$ROOT/$VARIANT" ] || { echo "no such variant: $VARIANT" >&2; exit 1; }

UDID=$(xcrun simctl list devices available | grep "$DEVICE (" | head -1 | sed -E 's/.*\(([0-9A-F-]{36})\).*/\1/')
[ -n "$UDID" ] || { echo "device not found: $DEVICE" >&2; exit 1; }

SDK=$(xcrun --sdk iphonesimulator --show-sdk-path)
APP="$WORK/HitProbe.app"
mkdir -p "$APP"

# The probe replaces the normal harness: same screen, instrumented host.
xcrun -sdk iphonesimulator swiftc \
  -target arm64-apple-ios18.0-simulator -sdk "$SDK" \
  -O -o "$APP/HitProbe" \
  "$ROOT/$VARIANT"/*.swift "$ROOT/probe/main.swift"

cat > "$APP/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>HitProbe</string>
<key>CFBundleIdentifier</key><string>$BUNDLE_ID</string>
<key>CFBundleName</key><string>HitProbe</string>
<key>CFBundleVersion</key><string>1</string>
<key>CFBundleShortVersionString</key><string>1.0</string>
<key>UILaunchScreen</key><dict/>
<key>CFBundleSupportedPlatforms</key><array><string>iPhoneSimulator</string></array>
</dict></plist>
PLIST

xcrun simctl bootstatus "$UDID" -b >/dev/null 2>&1 || xcrun simctl boot "$UDID" >/dev/null 2>&1 || true
xcrun simctl bootstatus "$UDID" -b >/dev/null 2>&1 || true

# Measure in a known state, and refuse to report if it could not be established.
for setting in "appearance light" "content_size medium"; do
  # shellcheck disable=SC2086
  xcrun simctl ui "$UDID" $setting >/dev/null 2>&1 || { echo "error: could not set $setting" >&2; exit 1; }
done

xcrun simctl uninstall "$UDID" "$BUNDLE_ID" >/dev/null 2>&1 || true
xcrun simctl install "$UDID" "$APP" >/dev/null
xcrun simctl launch "$UDID" "$BUNDLE_ID" >/dev/null

# The probe scans a grid, which takes a few seconds after its 3s settling delay.
CONTAINER=$(xcrun simctl get_app_container "$UDID" "$BUNDLE_ID" data)
RESULT="$CONTAINER/tmp/hitprobe.txt"
for _ in $(seq 1 40); do
  if [ -f "$RESULT" ] && grep -q "=== end ===" "$RESULT" 2>/dev/null; then break; fi
  sleep 1
done

[ -f "$RESULT" ] || { echo "error: probe produced no output" >&2; exit 1; }
echo "variant: $VARIANT"
cat "$RESULT"
