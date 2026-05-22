#!/usr/bin/env bash
# dev.sh — Launch backend (Laravel) + frontend (Next.js) for local development.
# Usage:  ./scripts/dev.sh

set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "[ArmoryDB] Starting Laravel backend on http://127.0.0.1:8000 …"
( cd "$ROOT/backend" && php artisan serve --host=127.0.0.1 --port=8000 ) &
BACK_PID=$!

sleep 2

echo "[ArmoryDB] Starting Next.js frontend on http://localhost:3000 …"
( cd "$ROOT/frontend" && npm run dev ) &
FRONT_PID=$!

trap "kill $BACK_PID $FRONT_PID 2>/dev/null" EXIT
echo "Login at http://localhost:3000 with  admin / Admin@10RCDG!2025"
wait
