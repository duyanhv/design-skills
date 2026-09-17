#!/usr/bin/env bash
# Thin wrapper so callers do not need to know the implementation language.
# See pixel-diff.swift for what the number means and what it does not.
set -euo pipefail
exec swift "$(dirname "$0")/pixel-diff.swift" "$@"
