#!/usr/bin/env bash
# @spec All declarations and algorithms in this file implement: docs/BACKLOG.md §P1 “Monorepo/app scaffolding”; docs/DAT.md §6/§10; README.md §Install & run — game.
# ATG — réinitialisation de la base de développement : volume détruit puis
# recréé, migrations et seed rejoués (base recréable, CLAUDE.md §3/§14).
# Développement uniquement — ne touche jamais un environnement partagé.
set -euo pipefail
cd "$(dirname "$0")/.."

pnpm --filter @atg/shared build
docker compose -f docker-compose.dev.yml down -v
docker compose -f docker-compose.dev.yml up -d db --wait
pnpm --filter @atg/server migrate
pnpm --filter @atg/server seed
echo "[resetDb] Base de développement recréée, migrée et seedée."
