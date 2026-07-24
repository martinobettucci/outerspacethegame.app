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

# Instance dev : horloge de jeu ACCÉLÉRÉE (DG §1 « TIME_SCALE », JOURNAL
# 2026-07-24). En développement, les actions doivent se régler en secondes au
# lieu de plusieurs heures de jeu, sinon on ne peut pas tester. TIME_SCALE
# (game-secondes par seconde réelle) accélère TOUTE la simulation de façon
# cohérente — minuteries d'action, économie continue (evalLazy) ET cadence
# quotidienne (population, horloges de mort). TICK_MS cadence le worker pour
# qu'il matérialise les échéances sous ~1 s (aligné sur l'horloge client).
# Défaut dev : 3600 (1 s réelle = 1 h-jeu ; jour de jeu = 24 s). Surchargeable
# depuis l'environnement du shell — ex. `TIME_SCALE=1 pnpm runDev` pour la
# vitesse canonique de production. La prod garde TIME_SCALE=1 (jamais runDev).
# NB : après un changement d'échelle sur une base déjà simulée, `pnpm resetDb`
# repart d'un état propre (les horodatages réels antérieurs précèdent le
# changement).
export TIME_SCALE="${TIME_SCALE:-3600}"
export TICK_MS="${TICK_MS:-1000}"
echo "[runDev] Horloge dev : TIME_SCALE=${TIME_SCALE} (1 s réelle = ${TIME_SCALE} s-jeu), worker TICK_MS=${TICK_MS} ms."

echo "[runDev] Lancement API + worker + client (Ctrl-C pour tout arrêter)…"
trap 'kill 0' INT TERM
pnpm --filter @atg/server dev:api &
pnpm --filter @atg/server dev:worker &
pnpm --filter @atg/client dev &
wait
