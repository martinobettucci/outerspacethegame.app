#!/usr/bin/env bash
# ATG — lancement de l'environnement de développement complet (CLAUDE.md §3/§14) :
# base Postgres (conteneur), migrations, seed, API, tick worker, client Vite.
set -euo pipefail
cd "$(dirname "$0")/.."

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
