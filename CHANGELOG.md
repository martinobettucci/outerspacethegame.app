# CHANGELOG

## [Non publié]

### Implémentation P1 (démarrée 2026-07-12 sur GO du responsable)

- **Noyau de simulation (chunk B)** : schéma baseline PostgreSQL
  (001_baseline.sql — joueurs/sessions, corps, gisements, stock lazy,
  bâtiments, unlocks, NPC, vaisseaux, file d'événements) + docs/SCHEMA.md +
  PROD_MIGRATIONS.md ; évaluation paresseuse (value, rate, t0) ; file
  d'événements SKIP LOCKED idempotente (concurrence testée) ; worker qui
  traite les échéances ; RNG seedé de génération (SeededStream, flux par
  label).
- **Catalogue de contenu COMPLET dans @atg/shared** (règle de complétude) :
  30 ressources, 28 bâtiments (coûts/niveaux/politiques/effets), 6 unités
  sol + cartes, 9 coques + personnel + sonde, 16 recettes + 9 items dérivés,
  arbre tech 35 nœuds (DAG, masque de seed, masques de gouvernance) ;
  formules E(u)/frein §3.3b/population/maladie ; écarts non chiffrés par le
  guide listés visiblement (TUNE_GAPS / TECH_TUNE_GAPS).
- Vérifié : 34 tests shared + 8 unit / 7 intégration serveur (vraie base).

- Décisions P0.4 tranchées et documentées (JOURNAL session 30, DAT §2) :
  tick worker en **TypeScript (Node 22)** ; renderer isométrique **PixiJS v8**
  (validation micro-prototype de la passe de lumière à venir).
- Scaffolding du monorepo `game/` (pnpm workspaces : `@atg/shared`,
  `@atg/server`, `@atg/client`, `@atg/e2e`) : Fastify (`/health`, `/ready`),
  migrateur SQL transactionnel (`schema_migrations`), squelette du tick
  worker, client React+Vite avec tokens « groovy dark » et états
  chargement/succès/erreur, E2E Playwright avec captures JPEG observées.
- Environnement de dev conteneurisé : `docker-compose.dev.yml` (Postgres 16,
  image surchargeable `ATG_DB_IMAGE`), scripts `runDev`/`stopDev`/`resetDb`,
  variables documentées dans `game/.env.example`.
- Vérifié : builds 3 paquets, tests unitaires 2/2, intégration (vraie base)
  2/2, E2E 2/2, captures observées conformes au design system.

### Préproduction 2026 — refonte de la conception

- Enregistrement de `CLAUDE.md` (conventions de travail + spécificités projet).
- Mise en conformité documentaire : `README.md`, `CHANGELOG.md`, `docs/DAT.md`,
  `docs/BACKLOG.md`, `docs/DESIGN_SYSTEM.md`.
- Corpus de conception complet : `GAMEBOOK.md` (canon des règles),
  `GAME_BIBLE.md` (lore), `DESIGN_GUIDE.md` v0.3 (spécification mécanique
  chiffrée), `BALANCE_LOG.md` (boucle d'équilibrage par simulation, 3 tours,
  55 correctifs), `JOURNAL.md` (journal des décisions).
- Design system FINALISÉ v1 (« groovy dark », identité pixel-sprite) validé
  par 4 prototypes d'interface générés (gpt-image-2) et observés
  visuellement ; prototypes archivés dans `docs/design/prototypes/`.
- Pipeline d'assets spécifié (`docs/ASSET_PIPELINE.md`) : tailles canoniques,
  calques transparents universels, bump/light maps avec propagation lumineuse,
  contrat de nommage/swap ; 255 stubs générés + prop sheet HTML vérifié ;
  itération HTML→gpt-image-2 validée (prototypes 05–06). Desktop/tablette
  uniquement.
- Décisions responsable : unités sol **512×256** (posées comme des bâtiments) ;
  props hors cartes en **GIF animés** avec companions bump/light synchronisés
  (stubs régénérés : 1 602 GIF + 126 PNG) ; **règle de complétude** inscrite
  dans CLAUDE.md ; tour d'équilibrage 4 lancé sur le catalogue complet.
- Tour 7 CLOS (guide v0.8) : topologie de marche viable ; etoile-cellules
  = fait de design ; anti-DoS docks ; rate-limit offres ; census global seul.
- Tour 6 CLOS (guide v0.7) : planchers fongibles derives par simulation
  (franchise S 800/M 1000/L 1200 T, frein unilateral, reserves AMM comptees),
  docks par niveau, regle d'impound, doctrine anti-raid par gate ; M9-M10.
- WAREHOUSE (spec responsable) : entrepot vehicules+items en balances
  separees, parking allie, docks = debit de commerce, equipage liberable en
  warehouse (amendement paragraphe 12), freeze NFT en warehouse uniquement,
  usines bloquees si plein -> GAMEBOOK + DESIGN_GUIDE v0.6 + stub batiment ;
  tour 6 lance (dont etude des planchers fongibles par simulation).
- Tour 5b de CONFIRMATION passé : v0.5.1 (escrow rendu avant pillage,
  verrou de siège = combat actif seul, hors-ligne ≠ garnison) ; tour 5 CLOS.
- Tour 5 TERMINÉ : la clef de voûte « construire ≠ installer » tient ;
  production d'unités spécifiée (military_district), verrou de siège,
  pillage des items, upkeep suiveur → DESIGN_GUIDE v0.5 ; moniteur M8.
- Correction canon du responsable : **construire ≠ installer** (clef de voûte
  de l'économie) — unités sol et objets = items portables produits là où la
  politique le permet, installés n'importe où ; patch « turret_light
  apolitique » annulé ; GAMEBOOK §9 amendé ; tour 5 de vérification lancé.
- Tour d'équilibrage 4 TERMINÉ (économie + militaire du catalogue) : 15
  constats, 15 correctifs → DESIGN_GUIDE v0.4 ; règle boucliers↔climat
  tranchée ; coûts T2+ complets ; moniteurs M6–M7.
- Catalogue de contenu COMPLET : 27 bâtiments avec effets par niveau
  (DESIGN_GUIDE §5.1), 6 types d'unités sol (§10.1), upgrades par coque selon
  les règles de slots ; 576 stubs (×3) couvrant tout + galerie auto-générée ;
  canon « tout peuple, tout rôle » ; tour d'équilibrage 4 planifié (valeurs
  catalogue non simulées, note d'honnêteté au BALANCE_LOG).
- Abandon acté de l'approche « moteur de jeu on-chain » au profit d'une
  architecture PostgreSQL autoritaire avec pont NFT opt-in (documenté, aucun
  code applicatif écrit).

## [Publié]

### Déployé en production, historique (avant 2026)

- Site vitrine Jekyll (whitepaper, pages economics/mechanics) déployé via
  `gh-pages`. Contenu antérieur à la refonte de conception 2026 ; réconciliation
  prévue au backlog (P0).
