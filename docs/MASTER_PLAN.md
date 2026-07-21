# MASTER PLAN — tout ce qui est FIGÉ et attend l'implémentation

> **Plan persisté (CLAUDE.md §5).** Demandé par le responsable le
> 2026-07-21 : l'inventaire TOTAL de ce qui a été validé et attend
> d'être codé, plus ce qui reste au stade de discussion. Sources de
> vérité : `JOURNAL.md` (décisions datées), `docs/BACKLOG.md` (statuts
> détaillés), `docs/POP_V2_PLAN.md` (population v2). Ce fichier est
> l'index d'exécution — tenu à jour à chaque chunk.

## Programme W — Flotte, sondes v3, accessoires, Crusader (VALIDÉ EN BLOC 2026-07-21)

Ordre proposé par dépendances. Chaque chunk : spec DG consolidée dans
le même commit, tests §15, captures §16, docs.

- [x] **W1 — Réservoir multi-carburant des sondes — LIVRÉ (2026-07-21)** (slot actif lazy + bascule à sec + pré-brûlage ordonné + scoop préserve-slots + API fuel-order + cercles=total ; intégration ships 8/8) : stocks séparés
  par type dans le jsonb `fuel`, ordre de consommation configurable PAR
  SONDE (UI patron auto-trade), drains/évaluations consommant type par
  type dans l'ordre. Fondation de W3. → JOURNAL 2026-07-21
- [x] **W2 — Moteurs typés à l'usinage — LIVRÉ (2026-07-21)** :
  `engine_type` FIGÉ au build (migration 028, backfill du type courant),
  défaut étoile natale, chantier outillé recipe `engine_<type>` (patron
  industrie, retool 24 h, instantané toute-Industrialist),
  refuel/transferts/vol contraints au moteur, plein de naissance typé
  moteur, UI outillage+retool+quille, DG §8.3 consolidé (matrice
  hors-diagonale [TUNE]-dormante → programme D). engines.test 5/5,
  E2E engines.spec vert, captures eng-01..03. → JOURNAL 2026-07-21
- [x] **W3 — Sondes L3 : ancrage & transfert — LIVRÉ (2026-07-21)** :
  migration 029 (probe_level 3 + colonnes transfert), gate pad L3,
  surcoût empilé [TUNE], ancrage openspace strict (receveur idle ou
  échoué-au-vide), type = moteur receveur (W2), 20 u/h-jeu, règlement
  au bord + annulation pro-rata, sonde→sonde interdit, saturation 1
  (hook accessoire W6), moveShip verrouillé, attaque-0 dérivé (P5).
  anchor-transfer.test 5/5, E2E anchor.spec vert, captures anc-01..03,
  DG §8.1 consolidé v3. → JOURNAL 2026-07-21
- [x] **W4 — Vue de bord des sondes L2/L3 — LIVRÉ (2026-07-21)** :
  scope 260 pc continu (y compris transit interpolé en SQL), halo UI à
  la sélection, intel par paliers inchangé (scan riche → R4).
  onboard-sight.test 4/4, E2E vert, capture obs-01. → JOURNAL 2026-07-21
- [ ] **W5 — Champs climatiques stellaires + bouclier morphique** :
  (a) une étoile diffuse son climat en openspace, rayon **0,5 ×
  R_nova** [TUNE] (S 20 / M 32 / L 50 pc), champ VISUALISÉ au clic sur
  l'étoile, traversée sans le bon bouclier = dégâts pendant la
  traversée (extension de wear.ts) ; (b) le bouclier climatique N'EST
  PLUS un accessoire : coque MORPHIQUE, adaptation = RETOOLING sur
  place en TEMPS SEUL [TUNE] (fitShield actuel à convertir).
  → JOURNAL 2026-07-21
- [ ] **W6 — Pipeline ACCESSOIRES & upgrades-items** : (a) arbre ADN
  des accessoires (découverte) ; (b) fabrication = items NON-FONGIBLES
  occupant la balance d'items des warehouses (50/niveau — dormante
  depuis le chunk AD, réveillée ici) ; achetables/acheminables par
  cargo ; (c) installation : vaisseau LANDED → WAREHOUSED → menu des
  accessoires disponibles → coût ressources + TEMPS d'immobilisation →
  deck → décollage ; (d) les UPGRADES (moteur/armure/OBS/armes
  L2/L3) deviennent des items : un engine L3 en stock s'installe
  DIRECTEMENT (plus de « montée » L2→L3) ; (e) PAS de rnd de slots —
  slots = ceux de la coque (canon). Premier item : « système de
  ravitaillement avancé » (2 ancrages). → JOURNAL 2026-07-21
- [ ] **W7 — Usinage partiel (usines L3)** : fabrication (véhicules,
  accessoires, BÂTIMENTS) débitée par paliers de 5 % (20 étapes) au
  lieu du paiement à la commande, dès qu'UNE usine L3 (n'importe
  laquelle) existe sur la planète ; arrêt « starved », reprise auto ;
  concurrence : un palier par usine en cours, ordre d'insertion BDD.
  → JOURNAL 2026-07-21
- [ ] **W8 — Le CRUSADER, petite planète volante** (le plus gros —
  dépend de W6/W7 et de pop v2) : ne se pose JAMAIS (GB à amender —
  intention première draft ; migration : les Crusaders à quai/entrepôt
  FORCÉS en hovering, effet immédiat) ; infra FIXE non
  modifiable (residential L3, usines L3 avec usinage partiel d'office,
  3 spaceports L3 — les vaisseaux y DOCKENT, 3 warehouses L3, ADN
  COMPLET, fabrique tout, PAS de markets) ; stocks fongibles =
  équivalent planète S (800 T [TUNE]), acheminés par cargos ; **fiche
  pop v2 COMPLÈTE à bord** (pyramide, natalité, chômage vs emplois
  fixes, efficience, mortalité, horloges — oxygène AU STOCK, cap 2 000
  [TUNE]) ; à la FABRICATION il naît en hovering et **25 % de la
  population de la planète source migre à bord** (proportions d'âges,
  staff source décrémenté) ; **flotte-suiveuse** : les vaisseaux en
  orbite consomment « comme au sol » sur SES ressources et SUIVENT ses
  déplacements (conso hovering). → JOURNAL 2026-07-21

## Programme R — Restes figés d'avant les sondes L3

- [ ] **R1 — Fold final de la main de cartes (chunk AO)** : contrat
  précisé au BACKLOG l.90 (tranche nommée 64 px au repos, cible ≥44 px,
  dépliage au survol/focus/sélection, reduced-motion) + tests
  géométriques + captures 2 viewports.
- [ ] **R2 — Application des caps `maxInstances`** (politique
  d'instances VALIDÉE — table single/multiple au BACKLOG l.92) ; le
  Codex contextuel est déjà livré (V3).
- [ ] **R3 — Sprites de stock du HUD** : mêmes stubs que le ledger
  stats, TAILLE RÉDUITE adaptée à la densité (PlanetView).
- [ ] **R4 — Pop v2, restes** : gating fonctionnel des non-industries
  par staffing [TUNE-v1] ; E2E visuel du spawn ; cas « univers
  saturé » ; scan riche des sondes (ADN/gisements, intel
  scientifique) ; intel des VAISSEAUX L1/L2/L3 (chunk flotte).
- [ ] **R5 — Stabiliser census** : ×2 flaky au balayage (totaux
  GLOBAUX/lazy — passent souvent, chantier responsable) : isoler par
  fenêtre/univers dédié. (Erratum W2 : hover n'était PAS
  ordonno-dépendant — régression W1 seed-dépendante, corrigée.)
- [ ] **R6 — Captures §16 en attente de port 8080** : V1 halo/cercles,
  V2 UI sondes, V3 chapitre Codex, zoom galaxie, key BuildingPanel.
- [ ] **R7 — Quirk cap sondes** [TUNE-v1 à trancher] : le cap 5/j/pad
  compte les sondes VIVANTES nées aujourd'hui (une destruction
  rembourse un slot) — garder ou passer à un compteur de production
  strict ?

## Programme D — Encore au stade de DISCUSSION (rien à coder sans décision)

Issus de GB §27 (P0.4) et des sessions récentes :

- [ ] Liste complète des permissions d'atterrissage (self/friends/
  neighbours — cas de grief) — **notera que W2 (moteurs) et l'échelle
  de docks confirmée réduisent le périmètre**.
- [ ] Table des effets de VOYAGE par type de carburant (au-delà de la
  matrice 1.0) — débloquée par W2, à chiffrer [TUNE].
- [ ] Trous noirs : puits pur vs comportements d'étoile.
- [ ] Supernova vs mondes possédés/achetés — décision de mitigation.
- [ ] Leviers anti-stagnation au-delà de l'épuisement.
- [ ] Cas limites de decay routes/stargates.
- [ ] Planètes artificielles : sous-items ouverts (caps pop/qualité,
  coût de déplacement).
- [ ] docs/MVP.md — la tranche verticale « one planet, solo ».
- [ ] Attaquabilité effective des sondes & attaque-0 pendant transfert
  → développés avec le COMBAT (P5).

## Réponses finales du 2026-07-21 (référence rapide)

1. Crusader : oxygène au stock, cap pop 2 000 [TUNE].
2. Naissance Crusader : hovering direct + migration de 25 % de la
   population source (proportions d'âges, staff décrémenté).
3. Usinage partiel : n'importe quelle usine L3.
4. Champ climatique stellaire : 0,5 × R_nova [TUNE] (R_nova = 40×∛mult
   → S 40 / M 63,5 / L 100,8 pc).
5. Combat M atterrit ; échelle docks confirmée (L1=S, L2=+M, L3=+L) ;
   seul le Crusader ne se pose jamais.
