#!/usr/bin/env bash
# @spec All declarations and algorithms in this file implement: docs/BACKLOG.md §P1 “Monorepo/app scaffolding”; docs/DAT.md §6/§10; README.md §Install & run — game.
# ATG — arrêt propre des services de développement (CLAUDE.md §14).
set -euo pipefail
cd "$(dirname "$0")/.."

docker compose -f docker-compose.dev.yml down
echo "[stopDev] Base arrêtée. Les processus API/worker/client lancés par runDev"
echo "[stopDev] s'arrêtent avec le Ctrl-C de leur terminal."
