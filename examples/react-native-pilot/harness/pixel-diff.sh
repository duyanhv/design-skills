#!/usr/bin/env bash
# Thin wrapper so callers do not need to know the implementation language.
# See pixel-diff.swift for what the numbers mean and what they do not.
#
# Prints "<percent> <differing-pixels> <total-pixels>". The percentage is rounded to two decimals
# and is for reading; the count is exact and is what equality should be decided on.
set -euo pipefail
exec swift "$(dirname "$0")/pixel-diff.swift" "$@"
