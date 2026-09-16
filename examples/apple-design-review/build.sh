#!/usr/bin/env bash
# Build one variant of the example screen, install it, and capture screenshots.
#
# No Xcode project: the screen is a single SwiftUI file compiled straight against the simulator SDK,
# so the example stays readable on GitHub and reproducible without project-file churn.
#
# Usage: ./build.sh before|after [device-name]
set -euo pipefail

VARIANT="${1:?usage: build.sh before|after [device-name]}"
DEVICE="${2:-iPhone 17 Pro}"
BUNDLE_ID="com.designskills.sharereview"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

[ -d "$ROOT/$VARIANT" ] || { echo "no such variant: $VARIANT" >&2; exit 1; }

UDID=$(xcrun simctl list devices available | grep "$DEVICE (" | head -1 | sed -E 's/.*\(([0-9A-F-]{36})\).*/\1/')
[ -n "$UDID" ] || { echo "device not found: $DEVICE" >&2; exit 1; }

RUNTIME=$(xcrun simctl list devices available | awk -v u="$UDID" '/^-- /{rt=$0} $0 ~ u {print rt; exit}' | sed 's/-- //; s/ --//')
SDK=$(xcrun --sdk iphonesimulator --show-sdk-path)

echo "== $VARIANT on $DEVICE ($RUNTIME)"

APP="$WORK/ShareReview.app"
mkdir -p "$APP"
xcrun -sdk iphonesimulator swiftc \
  -target arm64-apple-ios18.0-simulator -sdk "$SDK" \
  -O -o "$APP/ShareReview" \
  "$ROOT/$VARIANT"/*.swift "$ROOT/harness/main.swift"

cat > "$APP/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>ShareReview</string>
<key>CFBundleIdentifier</key><string>$BUNDLE_ID</string>
<key>CFBundleName</key><string>ShareReview</string>
<key>CFBundleVersion</key><string>1</string>
<key>CFBundleShortVersionString</key><string>1.0</string>
<key>UILaunchScreen</key><dict/>
<key>CFBundleSupportedPlatforms</key><array><string>iPhoneSimulator</string></array>
</dict></plist>
PLIST

xcrun simctl bootstatus "$UDID" -b >/dev/null 2>&1 || xcrun simctl boot "$UDID" >/dev/null 2>&1 || true
xcrun simctl bootstatus "$UDID" -b >/dev/null 2>&1 || true

shot() { # shot <name> <appearance> <content-size>
  local name="$1" appearance="$2" size="$3"
  xcrun simctl ui "$UDID" appearance "$appearance" >/dev/null 2>&1 || true
  xcrun simctl ui "$UDID" content_size "$size" >/dev/null 2>&1 || true
  xcrun simctl terminate "$UDID" "$BUNDLE_ID" >/dev/null 2>&1 || true
  xcrun simctl launch "$UDID" "$BUNDLE_ID" >/dev/null
  sleep 3
  xcrun simctl io "$UDID" screenshot --mask=ignored "$ROOT/screenshots/$VARIANT-$name.png" >/dev/null
  echo "   screenshots/$VARIANT-$name.png  ($appearance, text: $size)"
}

xcrun simctl uninstall "$UDID" "$BUNDLE_ID" >/dev/null 2>&1 || true
xcrun simctl install "$UDID" "$APP" >/dev/null

shot light light medium
shot dark dark medium
shot xxxl light accessibility-extra-extra-extra-large

# Record the exact conditions, so a later run can be compared to this one.
cat > "$ROOT/screenshots/$VARIANT-conditions.txt" <<COND
variant:     $VARIANT
device:      $DEVICE
runtime:     $RUNTIME
udid:        $UDID
xcode:       $(xcodebuild -version | head -1) ($(xcodebuild -version | tail -1))
sdk:         $(basename "$SDK")
swift:       $(xcrun swift --version 2>/dev/null | head -1)
target:      arm64-apple-ios18.0-simulator
captured:    $(date -u +%Y-%m-%dT%H:%M:%SZ)
shots:
  $VARIANT-light.png   appearance=light  content_size=medium
  $VARIANT-dark.png    appearance=dark   content_size=medium
  $VARIANT-xxxl.png    appearance=light  content_size=accessibility-extra-extra-extra-large
COND
echo "   screenshots/$VARIANT-conditions.txt"
