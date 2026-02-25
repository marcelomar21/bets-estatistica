#!/usr/bin/env bash
# lint-no-singleton-config.sh
#
# CI lint step (Task 5.6 / AC 5.5): Verifies that deprecated singleton
# config.telegram.adminGroupId / config.telegram.publicGroupId references
# have been removed from bot/ and lib/ directories.
#
# Usage:
#   bash scripts/lint-no-singleton-config.sh          # exits non-zero if matches found
#   bash scripts/lint-no-singleton-config.sh --warn    # prints warnings but exits 0

set -euo pipefail

WARN_ONLY=false
if [[ "${1:-}" == "--warn" ]]; then
  WARN_ONLY=true
fi

PATTERN='config\.telegram\.(adminGroupId|publicGroupId|botToken)'
DIRS="bot/ lib/"

# Exclude test files — they may reference config for mocking
EXCLUDE="--exclude-dir=__tests__ --exclude-dir=tests --exclude=*.test.js --exclude=*.spec.js"

matches=$(grep -rn -E "$PATTERN" $DIRS $EXCLUDE 2>/dev/null || true)

if [[ -z "$matches" ]]; then
  echo "✅ No singleton config.telegram.* references found. Clean!"
  exit 0
fi

count=$(echo "$matches" | wc -l | tr -d ' ')
echo "⚠️  Found $count singleton config.telegram.* reference(s):"
echo ""
echo "$matches"
echo ""

if [[ "$WARN_ONLY" == true ]]; then
  echo "ℹ️  Running in --warn mode. These should be removed after unified deploy validation."
  exit 0
else
  echo "❌ Lint failed. Remove these references (Task 5.6) after unified deploy is validated."
  exit 1
fi
