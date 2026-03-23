#!/usr/bin/env bash

set -euo pipefail

DB_PATH="${1:-sesc-bot.db}"
REPO="${GITHUB_REPOSITORY:-thierryrene/sesc-alertas}"
TAG="${SCHEDULER_STATE_TAG:-scheduler-state}"

if [[ ! -f "$DB_PATH" ]]; then
  echo "Database file not found: $DB_PATH" >&2
  exit 1
fi

python3 -c "import sqlite3; conn = sqlite3.connect('$DB_PATH'); result = conn.execute('PRAGMA integrity_check;').fetchone(); conn.close(); raise SystemExit(0 if result and result[0] == 'ok' else 1)"

if ! command -v gh >/dev/null 2>&1; then
  echo "GitHub CLI (gh) is required." >&2
  exit 1
fi

gh auth status >/dev/null 2>&1

if ! gh release view "$TAG" --repo "$REPO" >/dev/null 2>&1; then
  gh release create "$TAG" \
    --repo "$REPO" \
    --title "Scheduler State" \
    --notes "Latest manually uploaded scheduler database."
fi

gh release upload "$TAG" "$DB_PATH#sesc-bot.db" --repo "$REPO" --clobber

echo "Uploaded $DB_PATH to release asset sesc-bot.db on $REPO:$TAG"
echo "Next step: run the 'Promote Scheduler DB' workflow on GitHub Actions."
