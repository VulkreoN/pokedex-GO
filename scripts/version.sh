#!/usr/bin/env bash
# The app's version, "major.minor.patch": major.minor from the VERSION file (raised by hand: a new minor for a
# batch of features, a new major when we decide so), patch = changes shipped since that file last changed
# (the CI's own "release:" commits not counted). If VERSION already pins major.minor.patch, use it as-is.
set -euo pipefail
cd "$(dirname "$0")/.."
base=$(tr -d '[:space:]' < VERSION)
if [[ "$base" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "$base"
  exit 0
fi
since=$(git log -1 --format=%H -- VERSION)
patch=$(git rev-list --count --invert-grep --grep='^release: ' "$since..HEAD")
echo "$base.$patch"
