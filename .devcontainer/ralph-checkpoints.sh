#!/bin/bash
set -euo pipefail

# Ralph Loop Checkpoints
# Usage: bash .devcontainer/ralph-checkpoints.sh <phase|all>

PHASE="${1:-help}"
FAILED=0

run_base_checks() {
  echo "── Base checks ──"

  echo "[1/3] npm test (root)..."
  npm test --if-present || { echo "FAIL: root npm test"; FAILED=1; }

  echo "[2/3] npm test (admin-panel)..."
  cd admin-panel && npm test || { echo "FAIL: admin-panel npm test"; FAILED=1; }

  echo "[3/3] npm run build (admin-panel)..."
  npm run build || { echo "FAIL: admin-panel build"; FAILED=1; }
  cd ..
}

run_phase5_extra() {
  echo "── Phase 5 extra: verify config.telegram.* removal ──"

  # Check that no source files (excluding config.js itself and tests) reference config.telegram.*
  REFS=$(grep -rn 'config\.telegram\.' lib/ jobs/ scripts/ --include='*.js' --include='*.ts' \
    | grep -v 'config\.js' \
    | grep -v '__tests__' \
    | grep -v 'node_modules' \
    | grep -v '\.test\.' || true)

  if [ -n "$REFS" ]; then
    echo "WARNING: Found config.telegram.* references that should use bot_pool:"
    echo "$REFS"
    echo "(This is a warning, not a failure — review manually)"
  else
    echo "OK: No config.telegram.* references found outside config.js"
  fi
}

case "$PHASE" in
  phase1|phase2|phase3|phase4)
    echo "=== Ralph Checkpoint: $PHASE ==="
    run_base_checks
    ;;
  phase5)
    echo "=== Ralph Checkpoint: phase5 ==="
    run_base_checks
    run_phase5_extra
    ;;
  all)
    echo "=== Ralph Checkpoint: ALL PHASES ==="
    run_base_checks
    run_phase5_extra
    ;;
  help|*)
    echo "Usage: bash .devcontainer/ralph-checkpoints.sh <phase>"
    echo ""
    echo "Phases:"
    echo "  phase1   Base checks (npm test + build)"
    echo "  phase2   Base checks"
    echo "  phase3   Base checks"
    echo "  phase4   Base checks"
    echo "  phase5   Base checks + verify config.telegram.* removal"
    echo "  all      All phases"
    exit 0
    ;;
esac

if [ "$FAILED" -eq 1 ]; then
  echo ""
  echo "CHECKPOINT FAILED"
  exit 1
else
  echo ""
  echo "CHECKPOINT PASSED"
  exit 0
fi
