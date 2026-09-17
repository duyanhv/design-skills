#!/usr/bin/env bash
# Build each variant, capture it at a fixed accessibility text size, and diff against the baseline.
#
# One build per variant. Slower than swapping JS over a running Metro, and deliberate: a hot reload
# leaves "did the edit actually reach the app?" open, and that question is exactly what made the
# first pass of this pilot unreliable. The CONTROL variant re-answers it every run anyway.
#
# Usage:  ./run-variants.sh [UDID]
# Output: captures/<variant>.png, results.tsv

set -euo pipefail
cd "$(dirname "$0")"

# Defaults to the app bootstrap.sh creates, beside this script, not to a path in /tmp that
# only existed on the machine that first ran this.
APP_DIR="${RN_APP_DIR:-$PWD/app}"
SCHEME="${RN_SCHEME:-RNVerify}"
# Match the UUID by shape. Taking the last field instead picks up "(Booted)", which then makes
# xcodebuild fall back to "My Mac" and fail every build with a confusing platform error.
DEVICE_NAME="${DEVICE_NAME:-iPhone 17 Pro}"
UDID="${1:-$(xcrun simctl list devices available \
  | grep -F "$DEVICE_NAME (" \
  | grep -oE '[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}' \
  | head -1)}"
SIZE="${TEXT_SIZE:-UICTContentSizeCategoryAccessibilityXXXL}"

[[ -d "$APP_DIR" ]] || {
  echo "error: no app at $APP_DIR. Create it first:" >&2
  echo "         ./bootstrap.sh" >&2
  exit 1
}
[[ "$UDID" =~ ^[0-9A-F]{8}- ]] || {
  echo "error: no simulator UUID for \"$DEVICE_NAME\" (got: \"$UDID\")." >&2
  echo "       available: $(xcrun simctl list devices available | grep -c 'iPhone') iPhone device(s)" >&2
  exit 1
}
echo "device: $DEVICE_NAME ($UDID)"

# Stale captures are removed up front for the same reason a failed build aborts: a leftover PNG
# from an earlier run is indistinguishable from one produced now.
rm -rf captures logs
mkdir -p captures logs
LOGDIR="$PWD/logs"
echo -e "variant\tpixels_differing_vs_A\tnote\tdiffering_px\ttotal_px" > results.tsv

xcrun simctl boot "$UDID" 2>/dev/null || true
xcrun simctl bootstatus "$UDID" -b >/dev/null 2>&1 || true

# The accessibility text size, set through the defaults domain rather than the Settings UI so the
# run is scriptable and the exact category is recorded rather than clicked.
echo "text size: $SIZE"
xcrun simctl spawn "$UDID" defaults write -g UIPreferredContentSizeCategoryName -string "$SIZE"
xcrun simctl spawn "$UDID" defaults write com.apple.UIKit UIPreferredContentSizeCategoryName -string "$SIZE"

# Info.plist holds $(PRODUCT_BUNDLE_IDENTIFIER) unexpanded, so read it from the built app after the
# first build rather than from the source plist.
APP_PATH="$APP_DIR/ios/build/Build/Products/Release-iphonesimulator/$SCHEME.app"
BUNDLE_ID=""

for variant in variants/[A-Z]*.tsx; do
  name=$(basename "$variant" .tsx)
  echo
  echo "=== $name"

  # Each variant becomes App.tsx; _shared.tsx travels with it.
  cp "$variant" "$APP_DIR/App.tsx"
  cp variants/_shared.tsx "$APP_DIR/_shared.tsx"

  ( cd "$APP_DIR/ios" && xcodebuild \
      -workspace "$SCHEME.xcworkspace" -scheme "$SCHEME" \
      -configuration Release -sdk iphonesimulator \
      -derivedDataPath build -destination "id=$UDID" \
      build > "$LOGDIR/$name.log" 2>&1 ) || {
    echo "  BUILD FAILED — last errors:"
    grep -E "error:" "$LOGDIR/$name.log" | head -5 | sed 's/^/    /'
    echo "    full log: $LOGDIR/$name.log"
    # Abort rather than continue. Skipping a variant leaves its PREVIOUS capture on disk, and the
    # diff below would then compare today's baseline against a stale image and report a difference
    # that means nothing. A partial results.tsv that looks complete is worse than no results.
    echo
    echo "aborting: results would mix this run with stale captures" >&2
    exit 1
  }

  if [[ -z "$BUNDLE_ID" ]]; then
    BUNDLE_ID=$(plutil -extract CFBundleIdentifier raw "$APP_PATH/Info.plist")
    echo "  bundle id: $BUNDLE_ID"
  fi
  xcrun simctl uninstall "$UDID" "$BUNDLE_ID" >/dev/null 2>&1 || true
  xcrun simctl install "$UDID" "$APP_PATH"
  xcrun simctl launch "$UDID" "$BUNDLE_ID" >/dev/null
  sleep 6   # let the bundle load and lay out before capturing

  xcrun simctl io "$UDID" screenshot "captures/$name.png" >/dev/null 2>&1
  xcrun simctl terminate "$UDID" "$BUNDLE_ID" >/dev/null 2>&1 || true

  if [[ "$name" == "A-uncapped" ]]; then
    echo -e "$name\t-\tbaseline\t-\t-" >> results.tsv
  else
    read -r pct differing total < <(./pixel-diff.sh captures/A-uncapped.png "captures/$name.png")
    note=""
    # Keyed on the exact count, not on the rounded percentage. A single differing pixel rounds to
    # "0.00", and this line is where the pilot's central claim is made, so it cannot rest on a
    # rounding artefact.
    [[ "$differing" -eq 0 ]] && note="IDENTICAL to baseline: this variant changed nothing"
    echo -e "$name\t$pct%\t$note\t$differing\t$total" >> results.tsv
    echo "  differs from A in $pct% of pixels ($differing of $total) $note"
  fi
done

echo
column -t -s $'\t' results.tsv
