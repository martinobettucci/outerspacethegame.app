#!/usr/bin/env bash
# ATG — arrêt propre des services de développement (CLAUDE.md §14).
set -euo pipefail
cd "$(dirname "$0")/.."

docker compose -f docker-compose.dev.yml down
echo "[stopDev] Base arrêtée. Les processus API/worker/client lancés par runDev"
echo "[stopDev] s'arrêtent avec le Ctrl-C de leur terminal."
