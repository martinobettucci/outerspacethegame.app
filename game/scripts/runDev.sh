#!/usr/bin/env bash
# @spec All declarations and algorithms in this file implement: docs/BACKLOG.md §P1 “Monorepo/app scaffolding”; docs/DAT.md §6/§10; README.md §Install & run — game.
# ATG — lancement de l'environnement de développement complet (CLAUDE.md §3/§14) :
# base Postgres (conteneur), migrations, seed, API, tick worker, client Vite.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "[runDev] Build du paquet partagé (@atg/shared → dist/)…"
# Indispensable sur un clone FRAIS : les exports de @atg/shared pointent
# sur dist/ — sans build préalable, seed/API/worker/client échouent en
# ERR_MODULE_NOT_FOUND (quel que soit Node ; observé « from scratch »).
pnpm --filter @atg/shared build

echo "[runDev] Démarrage de la base (docker compose)…"
docker compose -f docker-compose.dev.yml up -d db --wait

echo "[runDev] Migrations…"
pnpm --filter @atg/server migrate

echo "[runDev] Seed (idempotent)…"
pnpm --filter @atg/server seed

echo "[runDev] Lancement API + worker + client (Ctrl-C pour tout arrêter)…"
trap 'kill 0' INT TERM
pnpm --filter @atg/server dev:api &
pnpm --filter @atg/server dev:worker &
pnpm --filter @atg/client dev &
wait
