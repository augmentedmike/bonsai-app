#!/usr/bin/env bash
# Rebuild and restart bonsai-prod (port 3090)
# Stops first so the server never serves a partially-written .next directory.
set -e

cd "$(dirname "$0")/.."

echo "==> Stopping bonsai-prod..."
pm2 stop bonsai-prod 2>/dev/null || true

echo "==> Building..."
npm run build

echo "==> Starting bonsai-prod..."
pm2 start bonsai-prod

echo "==> Done."
pm2 show bonsai-prod | grep -E "status|uptime|restarts"
