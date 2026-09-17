#!/usr/bin/env bash
# Create the RN app the variants are built against, pinned.
#
# The first version of this harness assumed an app already existed at /tmp/RNVerify and gave
# instructions (`cd ios && pod install`) for an ios/ directory that was never committed. An audit
# pointed out the obvious consequence: from a clean checkout there was nothing to build, so the
# harness documented a procedure rather than enabling one.
#
# This script creates that app. Everything it pins lives next to it:
#   package.json   the exact JS dependency versions
#   Podfile.lock   the exact pod versions, copied in and enforced with --deployment
#
# The RN template itself is NOT vendored — it is ~40 files of Xcode project that would dominate the
# diff of a documentation repository. It is fetched by version instead, which is a real dependency
# on npm being reachable. Stated plainly rather than hidden.
#
# Usage: ./bootstrap.sh [target-dir]        (default: ./app, gitignored)

set -euo pipefail
cd "$(dirname "$0")"

TARGET="${1:-$PWD/app}"
RN_VERSION=$(node -p "require('./package.json').dependencies['react-native']")
CLI_VERSION=$(node -p "require('./package.json').devDependencies['@react-native-community/cli']")
NAME="RNVerify"

echo "react-native $RN_VERSION via @react-native-community/cli $CLI_VERSION"
echo "target: $TARGET"

if [[ -e "$TARGET" ]]; then
  echo "error: $TARGET already exists. Remove it or pass another path." >&2
  exit 1
fi

parent=$(dirname "$TARGET")
mkdir -p "$parent"

# --skip-install: the template's own resolution would float the versions this harness pins.
npx --yes "@react-native-community/cli@$CLI_VERSION" init "$NAME" \
  --directory "$TARGET" --version "$RN_VERSION" --skip-install --skip-git-init

# Our pinned dependency set replaces the template's, so a rerun months later resolves identically.
cp package.json "$TARGET/package.json"
cp package-lock.json "$TARGET/package-lock.json"
# npm ci installs exactly the lockfile and fails if package.json disagrees with it. `npm install`
# would resolve afresh, which is how "pinned" quietly stops being true.
( cd "$TARGET" && npm ci --no-audit --no-fund )

# The pods are pinned too. --deployment makes CocoaPods fail rather than silently re-resolve when
# the lockfile does not match the Podfile, which is what "pinned" has to mean to be worth anything.
cp Podfile.lock "$TARGET/ios/Podfile.lock"
( cd "$TARGET/ios" && bundle install >/dev/null 2>&1 || true
  pod install --deployment || {
    echo
    echo "pod install --deployment failed. The committed Podfile.lock does not match the template's"
    echo "Podfile for react-native $RN_VERSION. Re-pin with: (cd $TARGET/ios && pod install) and"
    echo "copy the resulting Podfile.lock back here." >&2
    exit 1
  } )

installed=$(node -p "require('$TARGET/node_modules/react-native/package.json').version")
[[ "$installed" == "$RN_VERSION" ]] || {
  echo "error: installed react-native $installed, expected $RN_VERSION" >&2
  exit 1
}

echo
echo "ready: $TARGET (react-native $installed)"
echo "next:  ./run-variants.sh"
