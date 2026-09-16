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

# Conditions are only worth recording if they were actually applied. `simctl ui` can fail (an older
# runtime, a device that is not fully booted), and a suppressed failure would leave us captioning a
# screenshot with a setting the device never adopted. So: set it, read it back, and abort on a
# mismatch rather than writing a caption we cannot support.
apply() { # apply <appearance|content_size> <value>
  local key="$1" want="$2" got
  if ! xcrun simctl ui "$UDID" "$key" "$want" >/dev/null 2>&1; then
    echo "error: could not set $key=$want on $DEVICE" >&2; exit 1
  fi
  if got=$(xcrun simctl ui "$UDID" "$key" 2>/dev/null); then
    got="${got//$'\n'/}"
    if [ "$got" != "$want" ]; then
      echo "error: asked for $key=$want but the device reports $key=$got" >&2; exit 1
    fi
    printf '%s' "$got"
  else
    # No read-back available on this runtime: say so instead of implying verification.
    printf '%s (requested; not read back)' "$want"
  fi
}

shot() { # shot <name> <appearance> <content-size>
  local name="$1" appearance="$2" size="$3" gotA gotS
  gotA=$(apply appearance "$appearance")
  gotS=$(apply content_size "$size")
  xcrun simctl terminate "$UDID" "$BUNDLE_ID" >/dev/null 2>&1 || true
  xcrun simctl launch "$UDID" "$BUNDLE_ID" >/dev/null
  sleep 3
  xcrun simctl io "$UDID" screenshot --mask=ignored "$ROOT/screenshots/$VARIANT-$name.png" >/dev/null
  # Record what the device reported, not what we asked for.
  echo "  $VARIANT-$name.png  appearance=$gotA  content_size=$gotS" >> "$CONDITIONS_SHOTS"
  echo "   screenshots/$VARIANT-$name.png  (appearance: $gotA, text: $gotS)"
}

CONDITIONS_SHOTS="$(mktemp)"
trap 'rm -rf "$WORK" "$CONDITIONS_SHOTS"' EXIT

xcrun simctl uninstall "$UDID" "$BUNDLE_ID" >/dev/null 2>&1 || true
xcrun simctl install "$UDID" "$APP" >/dev/null

shot light light medium
shot dark dark medium
shot xxxl light accessibility-extra-extra-extra-large

# Record the exact conditions. Per-shot appearance and text size are whatever the device reported
# when queried, not what was requested, so this file cannot claim a setting that was never applied.
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
shots (settings as reported by the device after being set):
$(cat "$CONDITIONS_SHOTS")
COND
echo "   screenshots/$VARIANT-conditions.txt"
