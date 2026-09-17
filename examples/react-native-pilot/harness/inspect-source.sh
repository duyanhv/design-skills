#!/usr/bin/env bash
# Which renderer reads which text prop, read from the pinned node_modules.
#
# This exists because the pilot originally claimed "no native implementation reads
# maxFontSizeMultiplier", which is too broad: the LEGACY iOS renderer implements it and caps the
# multiplier. What is missing is a FABRIC iOS implementation. An audit caught the overreach, and a
# claim about source should be re-derivable from source, so here it is as a script.
#
# No simulator, no build. Run from this directory after `npm install`.

set -euo pipefail
RN="${1:-node_modules/react-native}"

if [[ ! -f "$RN/package.json" ]]; then
  echo "error: no react-native at $RN. Run: npm install" >&2
  exit 1
fi

VERSION=$(node -p "require('$(cd "$(dirname "$RN")" && pwd)/$(basename "$RN")/package.json').version" 2>/dev/null || echo "?")
echo "react-native $VERSION"
echo

# hits <pattern> <dir...> — file count for an exact-name match
hits() { local pat="$1"; shift; grep -rl --include='*.mm' --include='*.m' --include='*.cpp' \
    --include='*.h' --include='*.js' "$pat" "$@" 2>/dev/null | sort; }

section() { printf '\n== %s\n' "$1"; }

section "maxFontSizeMultiplier"
echo "JS declares it for Text:"
grep -n "maxFontSizeMultiplier" "$RN/Libraries/Text/TextProps.js" | sed 's/^/    /' || echo "    (absent)"
echo
echo "LEGACY iOS renderer (Paper) — RCTTextAttributes.mm applies the cap:"
grep -n "fminf(maxFontSizeMultiplier" "$RN/Libraries/Text/RCTTextAttributes.mm" | sed 's/^/    /' \
  || echo "    (absent)"
echo "    ^ this is a real implementation: fminf() caps the effective multiplier."
echo
echo "LEGACY view manager wires the shadow prop:"
grep -n "RCT_REMAP_SHADOW_PROPERTY(maxFontSizeMultiplier" \
  "$RN/Libraries/Text/BaseText/RCTBaseTextViewManager.mm" | sed 's/^/    /' || echo "    (absent)"
echo
echo "FABRIC (ReactCommon) — files mentioning the exact prop name:"
f=$(hits "maxFontSizeMultiplier" "$RN/ReactCommon" || true)
if [[ -z "$f" ]]; then echo "    NONE"; else echo "$f" | sed 's/^/    /'; fi
echo "    ^ on 0.76.5 these are Android TextInput only. No iOS Text path."
echo
echo "FABRIC iOS paragraph view:"
c=$(grep -c "maxFontSizeMultiplier" \
  "$RN/React/Fabric/Mounting/ComponentViews/Text/RCTParagraphComponentView.mm" 2>/dev/null) || c=0
echo "    RCTParagraphComponentView.mm: $c occurrence(s)"
echo
echo "  CONCLUSION: implemented for legacy iOS Text, absent from the Fabric iOS Text path."
echo "  An app on the New Architecture gets no cap. The prop is accepted and ignored."

section "dynamicTypeRamp (Fabric DOES implement this)"
echo "JS declares it:"
grep -n "dynamicTypeRamp?" "$RN/Libraries/Text/TextProps.js" | sed 's/^/    /' || echo "    (absent)"
echo
echo "Fabric iOS routes it through UIFontMetrics:"
grep -n "UIFontMetrics metricsForTextStyle:RCTUIFontTextStyleForDynamicTypeRamp" \
  "$RN/ReactCommon/react/renderer/textlayoutmanager/platform/ios/react/renderer/textlayoutmanager/RCTAttributedTextUtils.mm" \
  | sed 's/^/    /' || echo "    (absent)"
echo "    ^ UIFontMetrics is the same mechanism SwiftUI's semantic styles use."
echo
echo "  CONCLUSION: style-specific Dynamic Type IS supported on Fabric. Prefer this over"
echo "  disabling scaling. The pilot's first pass missed it entirely."

section "PlatformColor / DynamicColorIOS (semantic colours DO exist)"
echo "Exported from the package root:"
grep -n "get PlatformColor\|get DynamicColorIOS" "$RN/index.js" | sed 's/^/    /' || echo "    (absent)"
echo
n=$(awk '/RCTSemanticColorsMap/,/^}/' "$RN/React/Base/RCTConvert.mm" 2>/dev/null \
     | grep -cE '^\s+@"[a-zA-Z]+(Color|Text)" :' || echo 0)
echo "Native semantic colour names mapped in RCTConvert.mm: $n"
grep -n '@"labelColor" :' "$RN/React/Base/RCTConvert.mm" | sed 's/^/    /' || true
echo
echo "  CONCLUSION: a hand-maintained palette is a CHOICE, not a framework necessity."

section "accessibilityLiveRegion (Android only)"
grep -n "@platform android" -A3 "$RN/Libraries/Components/View/ViewPropTypes.js" \
  | grep -B3 "accessibilityLiveRegion" | sed 's/^/    /' || \
  grep -n "accessibilityLiveRegion" -B6 "$RN/Libraries/Components/View/ViewPropTypes.js" \
  | grep -E "@platform|accessibilityLiveRegion" | sed 's/^/    /'
echo
echo "  CONCLUSION: on iOS use AccessibilityInfo.announceForAccessibility()."
echo "  Recommending accessibilityLiveRegion for an iOS screen recommends a no-op."
