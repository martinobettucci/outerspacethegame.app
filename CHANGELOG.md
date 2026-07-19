# CHANGELOG

## [Non publié]

### Player Codex — plan persisté (P2.codex, avant tout code — CLAUDE.md §5)

- **Spec du manuel joueur in-game (`docs/MANUAL_PLAN.md`)** : décision du
  responsable actée (2026-07-20) de doter le jeu d'un Codex accessible depuis
  chaque écran, distinct du canon développeur (aucune référence interne),
  **spoiler-free** (on explique les *systèmes*, jamais le contenu à découvrir),
  *reference before strategy* (guides de stratégie différés tant que
  l'équilibrage bouge). Contrainte architecturale centrale : **anti-dérive** —
  le Codex ne possède aucun chiffre, toutes les valeurs sont rendues en direct
  depuis les constantes `@atg/shared` que la simulation elle-même utilise
  (`TRACE_MINING_T_PER_DAY`, `EFFICIENCY_*`, `UNEMP_*`, épochs `popv2`…), textes
  clés i18n `t.codex.*`, courbes tracées depuis les vraies fonctions partagées ;
  un test unitaire liera chaque valeur documentée à sa constante vivante.
  Première tranche validée : coquille de livraison + 3 mécaniques
  (gisements/minage de trace, population v2, efficacité/emploi). Documents
  impactés committés avant code : MANUAL_PLAN.md, BACKLOG (§P2.codex + garde-fou
  DoD permanent), DAT (composant Codex), DESIGN_SYSTEM (§5). Défaut d'intégrité
  documentaire relevé au passage et logué : le fichier de canon s'appelle
  `GAME_BOOK.md` alors que CLAUDE.md/JOURNAL/commits citent `GAMEBOOK.md`.

### Implémentation P1 (démarrée 2026-07-12 sur GO du responsable)

- **Population v2 — clinique, ledger démographique et alarmes de survie
  (chunk BC — DG §3.2-v2 h/i, GB §10)** : la clinique devient le 29e
  bâtiment (carte, nœud T2 politics-free, coûts [TUNE-v1], stubs complets
  L1–L3 base/hot/cold) et réduit l'indice de maladie de 10/20/35 %. La page
  stats est désormais alimentée par un calcul serveur unique partagé avec le
  tick démographique : pyramide C/A/S, part consommatrice inactive, emploi,
  chômage, Ē, maladie brute/effective, facteurs de natalité, flux NETS signés
  par ressource et emplois/optimum/u/E de chaque bâtiment. Les stocks de
  survie exposent une projection stable/à-sec/compte à rebours avec date de
  perte totale ; l'oxygène hostile annonce sa mort instantanée longtemps à
  l'avance. Le générateur d'assets couvre maintenant 597 entrées ×3, y
  compris la ressource `junk` auparavant absente de son manifeste.
- **Population v2 — emploi universel & le chômage tue (chunk BB — DG
  §3.2-v2 e/f/g, Round 9)** : TOUS les bâtiments emploient (table
  BASE_JOBS exhaustive, 29 types) sur un optimum qui DÉRIVE
  avec la population — jobsOptimal = base × [1/2,4/5] ×
  clamp(√(P/2000), 1, 2) : négligence = érosion (« point qui shifte »).
  **E_planet est SUPPRIMÉ** (planetMultiplier = G ; planetEfficiency
  des vues = Ē staff-pondéré) ; la main-d'œuvre assignable = les ACTIFS
  (fin du 60 % × pop). Starter à 350 habitants (pyramide stationnaire —
  naître SOUS sa capacité d'emploi, Round 9). Mortalité de chômage :
  tolérance 7 %, grâce 3 j consécutifs (migration 023), inerte pendant
  la grâce de colonie 14 j ; puis morts γ(τ−7 %)×P frappant toute la
  pyramide ET décrémentant le staff de chaque bâtiment (vagues,
  momentum). Embarquer des settlers prélève des actifs. Interp annoncée
  [TUNE-v1] : la FONCTION des bâtiments non-industriels reste binaire
  (active/inactive) — le gating fonctionnel par staffing viendra.
  Instrumentation §15 : /test/grant-population (mûrir un monde).
- **Population v2 — cœur démographique (chunk BA — DG §3.2-v2, GB §10
  v2, Round 9 / guide v0.10)** : la population devient TROIS ÂGES
  (enfants —20 j→ actifs —60 j→ seniors —~30 j→ †, pyramide stationnaire
  18,2/54,5/27,3), matérialisés par le pop_daily v2 (la croissance
  logistique v1 est RETIRÉE). Natalité UNIQUEMENT via residential actif
  (0,12/0,18/0,24 par actif/j [TUNE]) × M_growth = (0,5 + 0,5·Ē) ×
  M_life — les flux de vie sont LOCAUX : vivre d'imports ne nourrit
  jamais la croissance (canon). Rations pondérées (enfants/seniors
  ×0,6) ; OXYGÈNE respiré au stock sur climats hostiles seulement
  (temperate = ambiant), 0,6 T/1000/j [TUNE], provision de 20 T ajoutée
  au kit colonial. Horloges de mort planétaires : famille à sec + besoin
  non servi ⇒ échéance FIXE (eau 3 j, vivres 10 j — morts linéaires
  quotidiennes puis mort TOTALE à l'échéance par pop_clock, levée si le
  stock revient) ; oxygène = mort INSTANTANÉE (vérifiée au bord de stock
  exact ET au quotidien). Maladie v2 : parabole de sur-cap (1,2·o²,
  morts 0,25·o²·P [TUNE]) avec crochet clinique (bâtiment au chunk BC).
  Compteurs morts/exodés par catégorie persistés (intel au chunk BD).
  Migration 022 (pyramide + backfill, horloges, compteurs). RESTENT
  (annoncé) : emploi universel + popScale + suppression E_planet +
  starter 350 + mortalité de chômage (chunk BB — dépendance d'ordre),
  clinique/UI (BC), embarquement par catégorie + extinction-perte de
  propriété + intel (BD).
- **Anti-softlock du démarrage (chunk AN — GB §19 « starter knowledge »,
  décision responsable du 2026-07-19 après playtest)** : l'ouverture
  « télescope d'abord » pouvait consommer la dotation AVANT l'unlock de
  la mine — zéro revenu, remboursement de démolition insuffisant :
  impasse définitive. Trois leviers cumulés : (1) le starter naît avec
  les QUATRE savoirs T0 jamais-masqués déjà débloqués (telescope,
  probe_pad, depot, mine — la pose reste payante ; colony_program reste
  un unlock payant) ; (2) dotation relevée `{ore 100, carbon 44,
  silicon 28, hydrogen 24, oxygen 20, food 32, water 32}` [TUNE] avec
  contrainte de plafond DOCUMENTÉE ET TESTÉE : roll max ×1.3 + 150 u de
  fuel ≤ frein de stockage 0.7 × 800 T − 40 T (jamais pré-freiné —
  « new colonies start healthy ») ; (3) onboarding : bandeau « First
  steps » sur le starter tant qu'aucune mine n'est posée, description du
  programme colonial (objectif de milieu de partie), tooltip d'effets
  sur chaque carte de la main. Canon amendé : GAME_BOOK §19 (starter
  knowledge), DESIGN_GUIDE §2.2 (valeurs + plafond). Aucune migration.
- **Auto-trade du survol étranger (chunk AM)** : le canon « if food <
  20, buy 200 food best effort » est jouable. Jusqu'à 3 règles par coque
  ({ressource, seuil, quantité} [TUNE-v1]) ; en survol d'un monde
  d'AUTRUI, quand le réservoir de destination (tank pour le carburant du
  type embarqué, provisions pour les familles food/water, soute sinon)
  passe sous le seuil, la coque rachète au PREMIER slot fixe actif dont
  le monde VEND la ressource — contrepartie payée depuis la SOUTE,
  encaissée au stock du monde, borne de prix ≤ 3 T par tonne reçue
  [TUNE-v1 interp du « 3× census median » — la médiane de prix census
  n'existe pas encore], caps physiques respectés, trade journalisé
  (slot −3). Déclenchement PARESSEUX : auto_trade_check posé au
  whenReaches du seuil le plus proche (check immédiat si déjà dessous),
  armé aux vraies entrées en survol (arrivée, undock, relocate §15).
  Migration 021. UI : section « Auto-trade (foreign hover) » repliable
  du panneau vaisseau (3 lignes règle + Apply).
- **Consentement 50/50 des stargates (chunk AL)** : le flux canon
  inter-joueurs (« the price is split between the two owners — both
  consent »). Une PROPOSITION s'épingle depuis un monde à yard ACTIF
  vers le monde d'AUTRUI (rien n'est débité à la proposition — patron
  des offres manuelles, TTL 48 h réelles [TUNE-v1], balayage paresseux) ;
  seul le propriétaire CIBLE répond ; ACCEPTER re-vérifie tout, paie LES
  DEUX moitiés (125 cells + 200 steelH + 50 cristal chacun, chacune sur
  SON monde, cristal résolu par SON climat) et lance le chantier
  (propriétaire d'écriture = proposeur). Les DEUX propriétaires
  d'endpoints sont EXEMPTS de péage (co-payeurs [interp]). Migration
  020. UI : « Propose to a foreign world » dans la section Stargates
  (mondes étrangers visibles), inbox « Gate proposals » sur le monde
  cible (Accept & pay half / Decline).
- **Stargates v1 (chunk AK)** : le raccourci SÛR du réseau (GB §6).
  Chantier au stargate_yard ACTIF (coût 250 cells + 400 steelH + 100
  cristal du climat [TUNE], 48 h de jeu [TUNE-v1], 1 chantier concurrent
  par niveau, paire unique) — v1 : les DEUX endpoints appartiennent au
  bâtisseur (le partage 50/50 avec consentement inter-joueurs, canon,
  arrive avec son flux dédié — annoncé). Traversée INSTANTANÉE, zéro
  carburant : péage « hard gate » depuis la SOUTE pour les
  non-propriétaires (encaissé au stock du monde d'entrée [interp]),
  capacité 1 vaisseau/tick/direction [TUNE], sortie DISPERSÉE U(0–15) pc
  par hash seedé (shipId, tick — déterministe, anti-camping). Le gate
  MEURT avec l'un ou l'autre endpoint (cascade + purge à l'annihilation
  par supernova). Le vaisseau personnel ne traverse que vers SES mondes
  (GB §21). Migration 019. UI : section Stargates du panneau yard
  (build, liste, péage), bouton bleu « Traverse gate » sur le panneau
  vaisseau, gates visibles sous scope (/galaxy).
- **Claim rig & salvage (chunk AJ)** : les épaves du survival-out
  (owner NULL, « no honor » — GB §6) sont désormais RÉCLAMABLES. Le
  claim rig (atelier L2, 25 steelL + 5 gold [TUNE]) permet, immobile à
  ≤ 1 pc [TUNE-v1] d'une épave sans propriétaire, de lancer une
  réclamation de 2 h de jeu [TUNE] — l'événement salvage_claimed
  RE-VÉRIFIE tout à l'échéance (partir ou dériver annule ; une épave
  déjà réclamée est refusée) puis transfère : l'épave devient une coque
  IDLE possédée, sans équipage (la re-crewer exige un quai — remorquage
  et transfert d'équipage en proximité : P4, annoncé). Les épaves sont
  visibles au radar « Wrecks » (/galaxy, mêmes scopes de vision).
  Migration 018.
- **Champs de junk (chunk AI)** : larguer du fret dans le vide (survol/
  idle/échoué, 5 fois par jour réel et par coque [TUNE]) dépose un champ
  de junk dans une CELLULE de 0,5 pc — un champ max par cellule, les
  apports fusionnent, décroissance exponentielle 10 %/jour évaluée à la
  lecture. INTERDIT à moins de 50 pc de tout starter (anti-grief canon) ;
  à ≤ 5 pc d'un trou noir le fret disparaît sans trace (puits canon).
  S'attarder dans une cellule à junk use la coque (15 HP/j par 30 T
  [TUNE-v1 interp], aucun bouclier n'atténue — la traversée de transit
  arrive avec l'interception P5). Les épaves de supernova deviennent du
  junk (carcasse 10/20/40 T [TUNE-v1] + fret répandu). Collecte : junk
  collector d'atelier L2 (15 steelL + 5 silicon [TUNE]), UN scoop de
  30 T par 24 h-jeu [TUNE-v1, discrétisation annoncée du 30 T/day] dans
  la limite des conteneurs — le junk est une RESSOURCE (nouveau tier
  « salvage », 31e entrée du catalogue) destinée au recycleur.
  Migration 017. UI : formulaire Dump, ligne de champ + hasard, boutons
  collecteur/Collect ; champs visibles sous scope dans /galaxy.
- **Réparation d'atelier (chunk AH)** : à quai de SON monde à workshop
  ACTIF, une coque endommagée regagne 5 % de ses HP max par heure ×
  mult(1/2/4 selon le niveau — le MEILLEUR atelier sert [TUNE-v1]),
  l'acier étant facturé au stock planétaire proportionnellement (0,1 T
  de steelL par HP rendu [TUNE-v1], tout-ou-rien famille — acier à sec
  ⇒ la réparation s'arrête au recompute, patron fuel/survie). Le bord
  hull_repaired coupe l'acier au plein. L'usure et la réparation se
  COMPENSENT (net) sur les mondes hostiles. Mondes d'autrui : aucun
  service (politique whom-to-serve — P4). UI : ligne verte « under
  repair — the workshop bills steel per HP » sous la jauge de coque.
- **Usure de coque & boucliers (chunk AG)** : opérer sans le bouclier
  apparié en environnement hostile coûte 5 % des HP max/jour [TUNE] par
  source (cumul additif) — monde chaud/froid sous la coque, zone ≤ 5 pc
  d'un trou noir ou d'une étoile en flare (radio) — plus les dégâts de
  proximité du harvest rig (d < d_safe, D_max×((5−d)/5)², aucun bouclier
  ne les atténue [TUNE-v1]). Un PÉAGE canon, jamais une mort : plancher
  1 HP ; tempéré jamais ; bâtiments jamais ; transit/entrepôt/colonies
  exempts [TUNE-v1]. HP de coque PARESSEUX (migration 016, motif fuel),
  rebase en piggyback de tous les points d'état (les spreads périmés de
  six call sites ont été corrigés au passage). Trois boucliers d'atelier
  (workshop L2, 15 steelL + 5 cristal apparié [TUNE], radio → nox
  [interp]). UI : jauge de coque + ligne d'usure ambrée + boutons de
  montage. Poison-harvest : dormant (aucune récolte de gisement poison
  n'existe encore, annoncé).
- **Récolte stellaire & Starfall (chunk AF)** : le harvest rig
  (accessoire d'atelier, 20 steelL + 5 crystal + 5 gold [TUNE]) se monte
  à quai ; une coque IMMOBILE à ≤ 8 pc d'une étoile du même type de
  carburant récolte au gradient canon R_max × (1 − d/d_max)² (120 u/j,
  d_max 8 pc [TUNE]), net de l'entretien idle — deux ledgers paresseux
  (réservoir ↑, stock CACHÉ de l'étoile ↓, jamais exposé). Réservoir
  plein → le gréement se replie (bord harvest_full) ; départ = arrêt
  automatique. FLARE ≤ 5 % du stock initial : la seule jauge de
  l'univers, chip danger visible sous scope. SUPERNOVA à stock nul :
  annihilation STRICTE dans R_nova (coques détruites avec équipages
  host-fate ; mondes réduits en cendre — annihilated, jamais
  recolonisables ; le starter généré À R_nova exactement reste SAUF,
  canon), classe L → trou noir, S/M → plus rien. Migration 015.
  Restent (annoncés) : dégâts de coque sous d_safe (chunk usure/climate
  shields), junk d'épaves (chunk salvage), attribution télescope L3.
- **Avitaillement de survie & survol nourri par le monde (chunk AE)** :
  en survol de SON monde, le stock planétaire nourrit l'équipage (canon
  GB §7) — familles food (food_1→3) et water consommées APRÈS la survie
  de la population, tout-ou-rien par famille, l'horloge de la coque
  restant exempte tant que le monde SERT ; monde à sec → bascule
  automatique, les provisions de bord paient (patron fuel, décision au
  recompute planétaire). Nouveau `POST /ships/:id/provision`
  (avitaillement sur SES mondes — à quai, en survol ou échoué) qui
  remplit food et water à la capacité de coque (survivalCrewDays × 0.01
  × équipage) depuis le stock ; bouton Provision dans le panneau
  vaisseau. **Deux régressions latentes corrigées** : le recompute
  planétaire et l'arrivée de transit rebasaient la survie avec une ligne
  `ships` partielle et écrasaient les provisions à zéro (verrouillé par
  deux tests de régression).
- **Entrepôt de véhicules (chunk AD)** : balances S/M/L SÉPARÉES par
  monde possédé — tampon au sol 2 M + 2 S (jamais de L), chaque warehouse
  ACTIF ajoutant 6 S/4 M/2 L × multiplicateur de niveau (L1 ×1, L2 ×2,
  L3 ×3). Entreposer (à quai sur SON monde ; personnel/sonde exclus)
  coûte zéro entretien — drains carburant ET survie désarmés — et LIBÈRE
  l'équipage : seul point de sortie du lien permanent (GB §12), le
  ré-embarquement restant possible AU warehouse. Redéploiement en
  1/3/6 h par taille [TUNE] ÷ échelle via l'événement `ship_retrieved`,
  dock libre exigé au lancement, un seul redéploiement à la fois. Vues :
  `retrievesAt` (flotte), `vehicles {capacity, stored}` (planète) ; UI
  panneau vaisseau (boutons Warehouse/Retrieve, minuteur) et balances
  affichées sur le bâtiment warehouse. Balances d'items (50/niveau) et
  blocage d'usine : dormants sans usines d'unités (annoncé) ; parking
  allié P4.
- **Preuve E2E du rattrapage hors-ligne (chunk AC)** :
  offline-catchup.spec.ts — le Souverain lance un spaceport en chantier
  et une quille de Cargo S, une mine extrait à taux réel ; DÉCONNEXION,
  120 s d'absence réelle (≈ 10 j-jeu d'événements) ; au retour : le
  spaceport est ACTIF, le vaisseau est NÉ à quai (worker, échelle
  ×7200), et le stock lazy vaut témoin + taux × Δt_réel à ±0,05 T près
  (zéro dérive — l'exactitude 1e-9 est prouvée en intégration
  colony-loop ; ici la preuve UTILISATEUR de bout en bout, GB §15/DG
  §1). Captures off-01/02 observées. Items backlog « sim core » et
  « Offline catch-up correctness E2E » soldés.
- **Horloges de survie & derelict (chunk AB)** : migration 014
  (`owner_id` nullable, réservoir de survie PARESSEUX
  survival_rate/as_of, `flee_armed` défaut vrai). Drain 0,01 T/j de food
  ET water PAR membre d'équipage [TUNE] partout où l'équipage vit à bord
  (survol étranger/sauvage, idle, TRANSIT — l'horloge de mort du vol —,
  échoué) ; exempt : à quai/entrepôt (l'hôte nourrit [TUNE-v1]), survol
  de SON monde (le chemin stock-planète comme le fuel reste à brancher
  [TUNE-v1 annoncé]), colonizing, derelict, probe/personal ; l'horloge
  ne S'ARME que si des provisions existent [TUNE-v1 annoncé — l'Arche
  porte ses vivres en soute ; le hauler de spawn (2/2) vit la boucle].
  Rebase de survie en PIGGYBACK de chaque rebase de drain + départ en
  transit + changement d'équipage. Alarme à 25 % de la capacité de coque
  (survivalCrewDays × 0,01 × équipage [TUNE-v1 interp]) : politique
  auto-flee-home ARMÉE par défaut (anti-extorsion DG §3.5), désarmable —
  la coque prend la route du monde possédé le plus proche À PORTÉE du
  réservoir (handler factory timeScale). survival_out : équipage MORT
  (host-fate canon), coque DERELICT dépouillée (owner NULL — disparue de
  la flotte, épave salvageable ; claims avec les items P4, hijack P5).
  UI : bouton « Assign pilot » étendu aux coques cargo/combat
  (complétude — il n'existait que sur les civils), section « Crew
  survival » (jauge, taux, politique, bascule). Instrumentation §15 :
  POST /test/ship-survival. Tests : 3 blocs unit shared + 7 intégration
  (statuts/exemptions, bords planifiés, §10, flee armé/désarmé à portée
  déterministe, out idempotent) + E2E survival.spec.ts (jauge → drain
  sauvage → bascule → expiration → épave disparue), captures sv-01…03
  observées. Une régression réelle attrapée par les tests : les coques
  équipées SANS provisions mouraient au départ — d'où la garde.
- **Texturation de l'UI (chunk AA, demande du responsable)** :
  `game/scripts/genUiTextures.mjs` — quatre fonds tuilables TRÈS bas
  contraste générés par gpt-image-2 (ui-panel tissage carbone, ui-card
  plaques rivetées, ui-shell strates stellaires, ui-veil nébuleuse),
  archives PNG pleines dans docs/design/prototypes, assets webp 512²
  (2–24 Ko). Intégrés en couche INTERMÉDIAIRE des fonds existants
  (gradients par-dessus, alphas abaissés 0.97→~0.9) sur : panneaux de
  commande et cartes du deck (planet-panels), panneau galaxie,
  inspecteur et plaque planète (scenes), rail (shell), voile modal.
  Ce n'est PAS un remplacement d'art de jeu — texturation de chrome
  uniquement ; lisibilité §22 vérifiée à la vision (sonde jetable,
  3 captures : modale+deck, vue planète, panneau galaxie).
- **Textures de sol générées par climat (chunk Z, demande du
  responsable)** : `game/scripts/genSoil.mjs` — pipeline reproductible
  OpenAI Images (gpt-image-2, clé `OPENAI_KEY` du .env local, JAMAIS
  commitée) → 4 sols 1024² (temperate mousse sombre, hot terre craquelée
  braise, cold permafrost veiné, poison boue chartreuse), archives PNG
  pleines dans docs/design/prototypes (convention CLAUDE.md), assets
  servis en webp 768² (~130–180 Ko, ffmpeg). La vue planète pose la
  texture en TilingSprite MASQUÉE par le contour organique du chunk X,
  sous le mouchetis/rim (accents conservés) ; texture absente → repli
  procédural intact. §16 : sonde jetable sur la vraie stack, captures
  des 4 climats observées (climat forcé en base dev entre les prises).
- **Retool 24 h & overfill-on-delivery (chunk Y)** : migration 013
  (statut de bâtiment `retooling`). Rééquipage d'une industrie (DG §5.1
  « re-targeting = 24 h retool » [TUNE]) : la nouvelle recette est
  écrite immédiatement mais la production S'ARRÊTE (le rebase ne compte
  que les industries actives) jusqu'à `retool_complete` ; gouvernance
  TOUTE Industrialist (DG §4.1) = retool INSTANTANÉ, ≤ 1 switch par
  fenêtre de 24 h (au-delà : retool standard [TUNE-v1 interp] ; fenêtre
  dans buildings.config) ; les réductions de durée du monde-forge
  (−25/40/50 %) attendent la spécialisation (annoncé) ; validation de
  recette RÉUTILISÉE (max-1-extracteur/gisement avec auto-exclusion).
  **Alignement canon §3.3b** : « swaps/deliveries may overfill
  (physics) ; only production halts at cap » — les SIX refus de cap
  historiques sont levés (décharge de fret, taux fixe, hospitalité
  innée, swap AMM, route AMM, acceptation manuelle) : la livraison
  atterrit TOUJOURS, le frein/halt de production absorbe le trop-plein
  (les deux tests qui verrouillaient l'ancien comportement strict ont
  été retournés en preuves d'overfill). UI : bouton Retool (industries
  actives) rouvrant le sélecteur de recette, badge/minuteur
  « Retooling · recette », notices instantané vs pause. Tests : 5
  intégration retool (minuté avec production coupée puis éveil,
  instantané + fenêtre occupée/libérée, §10 directs, gisement pris) +
  2 tests amendés overfill + E2E retool.spec.ts (instantané puis 24 h
  minutées à ×7200), captures ret-01…03 observées.
- **Routage cells-étoile, double-fee & nudge triade (chunk V)** :
  composition pure partagée `ammRouteQuote` (la sortie de la jambe 1
  nourrit la jambe 2, chaque jambe prélève les frais de SON pool — le
  « double fee » canon est démontré en test contre un pool direct
  équivalent). Serveur : POST /planets/:id/amm-route = MEILLEURE
  EXÉCUTION give→get sur les pools de LA planète — candidats directs
  (frais simples) ET routes à deux jambes via un intermédiaire commun,
  seules les routes EXÉCUTABLES concourent (whitelist par jambe,
  propriétaire exempt ; limites quotidienne/absolue de chaque slot),
  départage déterministe, règlement ATOMIQUE (l'intermédiaire ne touche
  jamais la soute, journal `trades` par jambe, commissions maison par
  jambe au stock, delta net §3.3b) ; une route peut traverser deux
  bâtiments de marché du même monde [interp annoncée : la place de
  marché est planétaire] ; verrous marchés (id croissant) → corps →
  vaisseau. Nudge triade (DG §11.2) : `planetDetail.triadNudge` — monde
  à marché ACTIF sans AUCUNE paire FOOD (fixe ou AMM) dans la portée
  TÉLESCOPE du propriétaire (CTE de scope réutilisée ; la vision des
  coques n'entre pas — canon « telescope range » ; l'hospitalité innée
  n'est pas une paire [interp]). UI : formulaire « Route swap (best
  execution) » du vaisseau à quai (notice avec intermédiaire et « 2×
  frais »), hint triade dans le panneau marché. docs/SUGGESTIONS.md créé
  (demande du responsable : journal des propositions de l'agent).
  Tests : 2 blocs unit shared + 7 intégration (quote composée exacte,
  journal ×2, intermédiaire jamais en soute, direct-meilleur gagne,
  éligibilité par jambe, §10, nudge propre/étranger-visible/hors-portée/
  null) + E2E route.spec.ts (nudge visible → route via cells → paire
  food/cells éteint le nudge), 3 captures observées, 21/21 E2E ; les
  specs AMM/route posent désormais un depot (le roll de TAILLE du
  starter fait varier la franchise de stockage — flake diagnostiqué).
- **Pools AMM du marché L2 (chunk U)** : AUCUNE migration (les pools
  vivent dans `buildings.config.slots`, motif 004). Maths pures
  partagées : produit constant x·y = k, spot = ry/rx, frais sur la jambe
  d'ENTRÉE — 25 bp LP accumulés DANS la réserve (k croît, la valeur
  revient au retrait) + 25 bp maison au stock planétaire [TUNE round
  4a] ; marché L3 → jambe LP 20 bp (canon) ; le RATIO du dépôt initial
  EST le prix (« seeding is a pricing decision »). Serveur : seed
  (marché L2+ ACTIF, propriétaire, slot libre, jambes déduites
  PHYSIQUEMENT du stock, gate mercantile porté par le level-up),
  liquidité v1 PROPRIÉTAIRE (add proportionnel préservant le prix ;
  remove pct — 100 % vide et LIBÈRE le slot, les slots portent des
  TROUS null) — les LP visiteurs, liens de conquête et retrait garanti
  arrivent avec les shares P4 (annoncé) ; échange bidirectionnel à quai
  (jambe au choix, whitelist propriétaire-exempt, limites
  quotidienne/absolue contre le journal `trades`, conteneurs DG §7,
  stockage en delta net §3.3b) ; le slot AMM se protège (re-seed et
  taux-fixe refusés) et executeTrade refuse les slots AMM. Les réserves
  COMPTENT au cap de stockage (DG §3.3b ligne 172 : pooledT injecté dans
  computeRates, storageUsedT, contrôles de cap) et au census (« stocks +
  cargo + pools + escrow » : compartiment `ammPoolT` dédié dans
  aggregateCensus, meta.sources +'amm_pools'). Le spot n'est JAMAIS un
  oracle (pods = census, inchangé). UI : section « AMM pool (L2+) » du
  panneau marché (seed avec PRIX INDUIT affiché avant l'engagement,
  ligne de pool réserves/spot/frais, add/remove), carte « AMM x ⇄ y »
  du vaisseau à quai (jambe au choix, Swap, notice avec spot après).
  Tests : 5 blocs unit shared (k exact sans frais, croissance de k par
  la jambe LP, dérive du spot, L3, gardes) + 9 intégration (physicalité
  du seed, stockage inchangé au seed, quote partagée = règlement à
  1e-9 près, jambe inverse, whitelist/limites, liquidité, census
  neutre + compartiment) + E2E amm.spec.ts (Mercantile réel : L2 par
  level-up gouverné, seed 60/30 → spot 0.5, swap 3 T → spot 0.4537,
  retrait 100 % → stock restitué), 4 captures observées, 20/20 E2E.
- **Sol de terrain par climat + slots discrets (chunk X — demande du
  responsable)** : la vue planète pose désormais les tuiles sur une DALLE
  DE TERRAIN organique par climat (référence : prototype 02-iso-colony)
  — contour perturbé par bruit STABLE par planète (chaque monde a sa
  silhouette), rim/épaisseur sombres, mouchetis procédural en trois
  teintes de la rampe climatique (tempéré vert forêt, hot ocre-rouille,
  cold bleu-acier, poison vert acide) ; l'aura et l'ombre s'adaptent à
  l'étendue de la grille. Les slots de tuiles deviennent FANTÔMES
  (alpha 0.2, coutures fines) : révélés au survol (alpha 1 + teinte),
  PULSÉS quand une carte est armée (les tuiles libres restent lisibles
  pendant la pose ; statique si prefers-reduced-motion), quasi effacés
  sous un bâtiment (le sprite possède la scène) ; les falaises par tuile
  disparaissent (la dalle porte le relief). Le losange interactif
  148×74 est INCHANGÉ (contrats pointeur et E2E). LIMITE signalée :
  aucun canal fal.ai dans cette session (hôtes bloqués par le proxy,
  aucune clé FAL_KEY/OPEN_AI_KEY provisionnée) — rendu PROCÉDURAL v1,
  les textures générées remplaceront ce rendu quand une clé sera
  disponible (JOURNAL). Vérifié : game-flow 12/12 (pose et panneaux par
  clic de tuile intacts) + docks/gouvernance/colonisation/manuel 4/4 ;
  §16 : 4 climats observés (sonde jetable sur la vraie stack, comptes
  réels re-teintés en base de dev).
- **Gouvernance v1 (chunk W)** : AUCUNE migration (les liaisons `npcs`
  suffisent). Module partagé pur : exigences par taille S 0 / M 1 / L 3
  (canon GB §11, caps d'installation identiques), G = 1.0 pleinement
  gouverné, 0.5 sous l'exigence (canon pour les grands, généralisé aux
  moyens [TUNE-v1 interp]), +2 % × tier de rareté (échelle 1-based du
  chunk R) du gouverneur INSTALLÉ le plus faible [TUNE]. Le vaisseau
  personnel parqué compte comme UN gouverneur temporaire (GB §21 —
  satisfait l'exigence, masque déjà en place, ne porte ni ne dilue le
  bonus [TUNE-v1 interp]) : un starter moyen tourne à plein tant que le
  Sovereign anchor reste à quai, et tombe à ×0.5 s'il décolle. G injecté
  dans le SNAPSHOT de production (planetMultiplier = E × G — les débits
  de TOUTES les industries suivent, testé exactement ×0.5). Installation
  PERMANENTE (grade gouverneur = rareté ≥ rare, PNJ possédé non hébergé,
  §10 directs testés ; AUCUN chemin de retrait n'existe, par conception)
  ; préview CANON-OBLIGATOIRE (archétypes, masque résultant, nœuds
  PERDUS, G — lecture seule, candidats validés comme à l'installation) ;
  interp chunk N AMENDÉE : le pilote fondateur d'une colonie ne prend un
  siège permanent que s'il est de grade gouverneur — sinon il survit NON
  hébergé (un common squatterait à jamais le siège unique d'un monde
  moyen). UI : section Gouvernance (badge sièges + G coloré, rangées de
  gouverneurs, avertissement demi-efficacité, install avec préview puis
  confirmation TYPÉE du nom de la planète — patron de permanence du
  design system). Instrumentation §15 : POST /test/grant-npc (les rolls
  de pods sont seedés par playerId — non précomputables en E2E).
  Tests : 5 blocs unit shared + 8 intégration (G sur débits réels,
  parqué/décollé, caps, grade, §10, préview sans mutation, grand monde
  3 sièges + bonus min-tier) + E2E governance.spec.ts (starter moyen
  trouvé par l'API, ×1 → ×0.5 visible, préview, bouton inerte sans le
  nom exact, permanence sans le vaisseau), 4 captures observées —
  gov-04 montre l'hospitalité mercantile (chunk L) s'activer à
  l'installation du merchant. Suites : shared 113, serveur 32 + 157,
  E2E 20/20.
- **Canal manuel (chunk T)** : migration 012 (`manual_offers` — l'offre
  épingle le vaisseau à quai de l'acheteur). Visibilité du warehouse
  public/privé (`buildings.config`, défaut PRIVÉ [TUNE-v1] — jamais de
  fuite accidentelle ; réglée par la vraie commande, §10 direct testé) ;
  browse du stock browsable À QUAI uniquement (canon « commerce dock » —
  le survol ne suffit pas, contrairement à l'hospitalité innée) sur un
  monde à ≥ 1 warehouse ACTIF public : montants seuls, jamais les taux
  (intel opérationnel) ; v1 annoncé : l'« item » = ressource fongible du
  pool planétaire (inventaires PAR entrepôt, véhicules et objets avec
  les enchères P4), alliés en orbite = factions P4, contre-offre =
  décliner + nouvelle offre. Offres « à n'importe quel prix » en bundle
  explicite (je prends X de A, je paie Y de B, give > 0 [TUNE-v1
  interp]) avec limites round 7 : 1 OUVERTE par (acheteur, monde,
  ressource), 20 créations/24 h/compte, expiration 48 h RÉELLES [TUNE]
  (balayage paresseux, aucun événement) ; retrait par l'acheteur.
  Résolution par le PROPRIÉTAIRE : décliner, ou accepter avec règlement
  PHYSIQUE — vaisseau épinglé encore à quai, paiement en soute, place
  conteneurs, stock suffisant, stockage en delta NET (§3.3b : l'overfill
  toléré tant que l'échange n'aggrave pas) ; journal trades slot −2 ;
  verrous offre → corps → vaisseau. Instrumentation §15 :
  POST /test/relocate-ship (poches de spawn disjointes — le vol
  inter-poches n'est pas déterministe v1 ; l'atterrissage reste le VRAI
  chemin docks). UI : select de visibilité (panneau warehouse), section
  « Public warehouse » du panneau vaisseau à quai (stock défilable,
  formulaire d'offre, retrait), boîte « Manual offers » du monde vendeur
  (Accept/Decline). Tests : 4 blocs unit shared + 15 intégration + E2E
  manual.spec.ts à DEUX comptes (public → browse → offre → refus doublon
  VISIBLE → acceptation → fret à bord — l'éviction de dock du chunk S a
  été neutralisée par le réglage dwell 720 h : les systèmes
  interagissent comme conçu), 5 captures observées, 19/19 E2E.
- **Docks de spaceport (chunk S)** : migration 011 (`ships.docked_at` —
  horodatage du dernier atterrissage, garde d'éviction + affichage).
  Module partagé pur : comptes CUMULATIFS par niveau (L1 = 2 S ; L2 =
  +2 M ; L3 = +2 L [TUNE]), une coque ≤ son dock, faisabilité GLOUTONNE
  par débordement (S→M→L) ; exemptions canon : personnel, sonde,
  Combat-S ; docks réservés « pour soi » (0–2 [TUNE], défaut 0)
  soustraits du pool VISITEURS plus petits d'abord [TUNE-v1 interp,
  JOURNAL]. Serveur : `landShip` verrouille CORPS avant vaisseau (les
  atterrissages d'un même monde se sérialisent), applique politique puis
  capacité à TOUS (propriétaire compris) dès qu'un spaceport actif
  existe — exception bootstrap [TUNE-v1] : SON monde SANS spaceport
  accueille toujours (le starter naît sans bâtiment) ; refus distincts
  « aucun dock ≥ taille » vs « docks saturés » ; Combat-S se pose
  PARTOUT (politique et sauvage ignorées [interp annoncée — le
  sanctuaire/siège arbitrera en P5]) ; TOUT visiteur d'un monde possédé
  reçoit une éviction de séjour `dock_eviction` (dwell 1–720 h, défaut
  24 h [TUNE], le plus généreux des ports actifs prévaut) — handler
  idempotent gardé par `docked_at` (un re-atterrissage périme l'ancienne
  éviction), renvoi au survol réservoir armé ; les coques nées à quai
  (chantier) peuvent SURCHARGER les docks (annoncé : les docks bornent
  l'atterrissage, pas la production). Réglages spaceport `dwellHours` /
  `reservedForSelf` (PATCH settings, bornes serveur, spaceport
  uniquement, propriétaire uniquement — refus directs §10 testés) ;
  `planetDetail.docks` agrégé (total/occupées par taille/visiteurs/
  réservés/dwell). UI : panneau spaceport — ligne d'usage des docks,
  champs séjour + réservation, notice de refus visible. Tests : 10 unit
  shared + 12 intégration (capacité, structurel vs saturé, exemptions,
  réservations, éviction + péremption, sauvage/Combat-S, bornes §10)
  + E2E docks.spec.ts (usage → réglages → overfill chantier → refus
  saturé VISIBLE → L2 → débordement S en dock M), 5 captures observées.
- **Réparation E2E post-synchronisation (session 36)** : la refonte UI
  (étiquettes-boutons « Inspect X », index de contacts) avait cassé 6
  specs sur 17 — nouvel helper `galaxyLabel`, sélection vaisseaux/
  destinations par l'index de contacts (chemin clavier canonique — les
  clics-sprite au pixel près restent couverts par mouvement/hover),
  comptes FIXES (market, chantier) : la tuile du bâtiment historique se
  lit désormais par l'API au lieu d'un pixel codé en dur, census :
  grant sur GOLD (aucun consommateur continu — l'ore d'un +500 se noyait
  dans les usines de l'univers dev à ×7200), 2 workers Playwright max
  (contention CPU). Suite finale : **18/18**.
- **Pods de recrutement (chunk R)** : migration 010 (journal
  `pod_openings` — cap quotidien ET impact de prix). Module partagé pur :
  `price_r = max(5, B × (S_r/S̄)^0.7)` (B = 40 [TUNE]), S̄ = moyenne
  trimée pondérée par l'offre sur les offres NON NULLES [TUNE interp,
  JOURNAL] ; tables canon rareté 62/24/10/3.4/0.6, rôles uniformes (6),
  peuples 60/30/10 ; rolls individuels À L'OUVERTURE : baseline +4 %/tier
  × U(0.5, 1.5) sur la stat archétype-pertinente (catalogue EXHAUSTIF par
  rôle — seule `settler_risk_reduction` a déjà son consommateur, les 5
  autres clefs attendent leurs chunks [TUNE-GAP]) ; RNG SEEDÉ au moment
  de génération (seed = universe:pod:joueur:index d'achat, sérialisé par
  le verrou de la ligne joueur — reproductible, testé à l'identique).
  Serveur : barème dérivé du DERNIER census MOINS les tonnes payées
  depuis le snapshot (« purchases count into supply immediately ») ;
  ouverture payée PHYSIQUEMENT depuis le stock d'un monde possédé
  (co-location, rebase des taux) ; refus : compte < 45 jours (canon,
  403), cap 10/jour (409), monde d'autrui, stock insuffisant, aucun
  census. PNJ créé lié au compte 60 jours (`account_bound_until` —
  l'héritage strictest-bind au transfert d'hôte arrive avec les
  enchères/NFT P4, annoncé). Instrumentation §15 : POST /test/age-account
  (le compte COURANT seulement — la règle des 45 jours se démontre sans
  attendre 45 jours). UI : onglet Recruitment de l'écran Market (barème
  dans le sélecteur, monde payeur, bouton accent « Open pod », carte de
  révélation rôle/rareté colorée/peuple/stat, roster complet avec
  liaisons) ; GET /pods/prices + POST /pods/open (401 anonymes testés).
  8 unit partagés + 6 intégration (prix exact après impact, cap,
  déterminisme du roll, refus directs §10) + E2E ×2 (refus « trop
  jeune » VISIBLE puis ouverture après vieillissement), suites
  94/32/122/17 vertes, captures pod-01/02 observées (l'impact de prix
  est visible à l'écran : 115,64 → 115,29 T après l'achat).
- **Correctif : re-clamp de la récurrence census au boot du worker** : un
  worker à AUTRE échelle de temps (runDev à TIME_SCALE=1 sur la base de
  dev partagée) peut réclamer un `census_run` et replanifier le suivant à
  +6 h réelles — la chaîne unique est alors gelée pour les workers
  rapides (E2E à 7200). Chaque worker ramène désormais au boot tout
  census pendant au-delà de SON intervalle (UPDATE idempotent,
  auto-guérison dans les deux sens). Observé après le test from-scratch.
- **Correctif « from scratch » (signalement du responsable, testé Node
  22 ET 24)** : sur un clone frais, `runDev`/`resetDb`/tout lancement
  manuel échouaient en `ERR_MODULE_NOT_FOUND` — les exports de
  `@atg/shared` pointent sur `dist/`, jamais construit avant `tsx`. Le
  défaut était masqué sur les machines où un build avait déjà eu lieu
  (et donc attribué à Node 24 — reproduit à l'identique sous Node 22).
  `runDev.sh` et `resetDb.sh` construisent désormais `@atg/shared`
  d'abord ; README : prérequis (Node ≥ 22 vérifié sur 22 et 24, pnpm,
  Docker) + note pour les lancements manuels. Vérifié de bout en bout
  sur clone frais sous Node 24.18 : runDev complet (build, DB,
  migrations, seed, API /health, inscription HTTP, client 200) et
  suites 86/32/116 vertes.
- **Intel télescope par paliers 0–4 (chunk Q)** : module partagé PUR
  (`intel.ts` — intelTierFromSources, projection par LISTE BLANCHE
  stricte par palier, estimation de population à 2 chiffres [TUNE-GAP]) ;
  barème planétaire [TUNE-GAP proposé] : 0 = le corps n'existe pas pour
  l'observateur (404, jamais d'oracle d'existence) ; 1 « silhouette »
  (ciel de base/scan vaisseau/télescope L1) ; 2 « développement »
  (tuiles, population estimée, spaceport ouvert/fermé, paires de marché,
  offres innées — keepFloor jamais publié) ; 3 « stratégique »
  (bâtiments clef/niveau/statut, défenses, PRÉSENCE des gisements sans
  tonnage — DG §11.3) ; 4 « deep sight » (qualité, gisements détaillés,
  ADN tech — le seed ne sort JAMAIS) via +1 scientifique (gouvernance du
  monde source, plafonné +1 — DG §4.1) ou sonde à portée [TUNE-GAP].
  Indice = MEILLEUR télescope couvrant (couverture = scope additif).
  FUITE CANON CORRIGÉE : /galaxy ne publie plus la qualité des mondes
  non possédés. GET /bodies/:id/intel (session requise) ;
  GET /planets/:id INCHANGÉ : owner-only même à palier 4 (le détail
  opérationnel n'est pas de l'intel). UI : panneau du corps étranger par
  paliers (badge Intel L{n}/Deep sight, blocs Development/Strategic/
  Deep sight, rangées cadenas Lucide « ce qui manque ») + bouton Level
  up dans le panneau Infrastructure (les télescopes L2/L3 étaient
  inatteignables à l'écran — gap réel corrigé). 11 unit partagés (listes
  blanches EXACTES par palier) + 8 intégration (montée L1→L4, +1
  gouverneur scientifique, sonde, refus directs §10, fuite fermée) + E2E
  échelle complète sur un monde sauvage de SA poche (le vérificateur de
  spec avait signalé la garantie voisin 150–240 pc comme non ancrée sur
  l'observateur — parcours re-conçu déterministe), suites 86/32/116/16
  vertes, captures int-01..04 observées.
- **Census global de l'offre (chunk P)** : migration 009
  (`census_snapshots` + amorçage idempotent du premier `census_run`) ;
  événement RÉCURRENT auto-replanifié dans la file events (aucun cron —
  patron pop_daily : dédoublonnage puis re-INSERT), cadence
  CENSUS_PER_DAY (défaut 4×/jour [TUNE], GB §13 « admin-configurable »,
  divisée par TIME_SCALE ; le worker ré-amorce la chaîne au boot,
  idempotent) ; agrégation PURE et honnête des DEUX sources existantes —
  stocks planétaires (évalués lazy à l'instant du snapshot, min 0) +
  soutes (tous statuts) ; gisements EXCLUS (non extraits ≠ offre) ;
  pools AMM et escrow d'enchères rejoindront la somme avec leurs chunks
  (manque ENREGISTRÉ dans meta.sources de chaque snapshot) ; un census
  mesure l'état COURANT (nowMs, pas dueAt — pas de rattrapage de
  snapshots du passé après une panne). Publication (DG §11.5) : totaux
  GLOBAUX par ressource UNIQUEMENT — GET /census/latest (session
  requise, 401 anonyme) ne renvoie JAMAIS de ventilation
  planète/entrepôt/source (assertion négative testée sur le JSON
  sérialisé). UI : bouton Market du rail ACTIVÉ → écran Market, onglet
  Census (bandeau horodatage + cadence, phrase canon « Global totals
  only », table sémantique EXHAUSTIVE des 31 ressources groupées par
  tier, zéros affichés, états chargement/erreur/vide) ; Trading/Auctions
  désactivés AVEC la raison. Correctif d'infrastructure E2E : le
  teardown du worker tue désormais son GROUPE de processus (detached) —
  les workers zombies des runs passés réclamaient les événements avec de
  VIEUX intervalles (6 h au lieu de 3 s). 5 unit + 3 intégration
  (agrégat lazy exact, récurrence dédoublonnée, exactement-une-fois,
  401/aucune ventilation) + E2E complet, suites 75/32/108/15 vertes,
  capture cen-01 observée.
- **Drains de loitering, échouage & ravitaillement (chunk O)** : migration
  008 — le réservoir devient une quantité PARESSEUSE
  (`fuel_rate_u_per_day` + `fuel_as_of`, montant dans `ships.fuel`) ;
  hovering ET idle consomment 0.2/0.4/0.8 u/j (S/M/L [TUNE], GB §7
  « both consume ») ; exemptions canon : personal (GB §21), probe,
  docked/warehoused/colonizing/stranded/derelict. Survol de SON monde :
  le stock planétaire paie (« resupply round-trips » — besoin injecté
  dans computeRates après la survie de la population, tout-ou-rien par
  ressource [TUNE-v1]) ; monde à sec, monde d'autrui, sauvage ou vide :
  le réservoir paie, bord `ship_fuel_out` (purge + replanification,
  patron stock_edge) → statut `stranded`, réservoir figé à 0, aucun
  départ. Récupération : POST /ships/:id/refuel (monde POSSÉDÉ sous la
  coque — à quai, en survol ou échoué ; cap réservoir) et
  /ships/:id/transfer-fuel (entre VOS coques, ≤ 1 pc [TUNE-GAP], même
  type [TUNE-v1], instantané [TUNE-v1], verrous par id croissant).
  L'auto-chargement au départ passe au PLEIN réservoir [TUNE-v1 — charger
  le trajet exact échouerait la coque au premier survol] et rebase le
  monde quitté (correctif : le rebase manquait après l'auto-chargement).
  Découverte d'architecture consignée : TIME_SCALE n'accélère QUE les
  événements — la dérive lazy court en jours réels (l'E2E échoue la coque
  par l'instrumentation /test/ship-fuel, 1e-6 u → bord en ~0,4 s). UI :
  jauge de réservoir + taux, chip danger « Stranded — out of fuel »,
  boutons Refuel et Transfer fuel (cible + unités). Correctif de test au
  passage : `IN (...)` sans ORDER BY dans ships.test.ts (ordre de heap
  non garanti). 15 unit shared + 12 intégration (refus directs §10) +
  E2E strand→sauvetage→plein ×2, suites complètes vertes (75/27/105/14),
  captures hov-01..04 observées.
- **Colonisation v1 : la deuxième planète (chunk N)** : migration 007
  (`ships.settlers/settlers_origin_body_id/colony_kit`, statut
  `colonizing`, table `settler_routes` — accumulateur fractionnaire par
  route). Fitting colonie (Civil M/L, programme `colony_program`
  déverrouillé + workshop L2 actif ; coût = fitting + terraform core +
  PROVISIONS 30 nourriture + 30 eau [TUNE interp — le stock d'amorçage ne
  tient pas dans les 2 conteneurs d'un Civil M, JOURNAL]) ; embarquement
  de settlers (spaceport actif requis, caps pax 200/800/3000, garde 60 %
  de workforce restante, une seule origine par cargaison) ; péage de
  trajet DÉTERMINISTE (base 5 % − réductions des pilotes liés,
  accumulateur par route « no free sub-20 cohorts », quantifié 1e-9
  contre la poussière IEEE) ; colonisation (survol d'un monde sauvage
  non-poison, ≥ 200 settlers, anti-course, événement 72 h) ;
  établissement : propriété, population = settlers livrés, coque
  convertie en depot L1 + spaceport L1 (tuiles 0/1), provisions +
  carburant déchargés, PNJ liés au monde, « the ship is spent » ; grâce
  de colonie 14 j (badge UI + API — l'enforcement arrive avec la
  conquête). Équipage : assignation d'un pilote PNJ (permanente, GB §12).
  Au passage : le réservoir d'une coque neuve naît TYPÉ sur l'étoile
  natale (l'auto-chargement partait sur `cold` à tort) ; le rail apprend
  la nouvelle colonie quand la coque « colonizing » disparaît
  (refreshMe). UI : section Settlers du panneau vaisseau (embark/
  disembark, kit, pilote, Colonize, compte à rebours), section Programs
  (vue planète), badge de grâce. 7 unit + 9 intégration (péage exact,
  établissement complet, refus directs) + E2E parcours complet ×2
  (péage vérifié à l'unité près via le roll réel du pilote), captures
  col-01..05 observées.
- **Chantier naval (chunk M)** : construction de coques (GB §14, DG §381)
  — L1 construit S+M, L2 = M en masse (−25 %), L3 construit L (gate
  serveur) ; coût payé au lancement, événement ship_built → le vaisseau
  naît À QUAI, réservoirs et soute vides ; propriété à l'achèvement = le
  propriétaire ACTUEL du monde (une conquête capture les chantiers) ;
  temps S/M/L = 12/24/72 h [TUNE-GAP proposé] ; MIN_CREW différé (annoncé,
  lifecycle NPC) ; UI : section « lay a keel » + file d'attente dans le
  panneau du chantier. Instrumentation §15 : endpoint /test/grant activé
  par ATG_TEST_ENDPOINTS=1 (E2E uniquement, jamais en production).
  3 unit + 6 intégration + E2E ×2 chemins, captures 36–38 observées.
- **Hospitalité du monde marchand (chunk L)** : migration 006
  (`bodies.config` + journal `trades` sans bâtiment) ; sous gouvernance
  TOUTE mercantile (re-vérifiée à chaque achat), survie + carburant se
  vendent SANS bâtiment de marché — périmètre exhaustif (eau, oxygène,
  3 nourritures, 3 carburants), plancher keep-for-self jamais entamé,
  hospitalité accessible EN SURVOL (pas de droit d'atterrissage requis
  [TUNE-v1 interp]) ; seed : le voisin mercantile publie son offre via la
  vraie commande (contrat §8). UI : section Hospitality (vue planète) +
  achat dans le panneau vaisseau sur place. 3 unit + 7 intégration + E2E,
  captures 33–35 observées.
- **Marché L1 à taux fixe (chunk K)** : migration `trades` (journal des
  échanges) ; slots = niveau du marché (canon GB §9, vérifié serveur),
  slot directionnel — le marché ACHÈTE `give` et paie en `get` au taux
  posté (le taux est le prix, aucun frais séparé en taux fixe [TUNE-v1]),
  re-tarification ≤ 1/min (DG §11.1), limites quotidienne/absolue
  vérifiées contre le journal, whitelist (propriétaire exempt),
  consultation des offres à quai seulement ; physicalité complète : soute
  à quai ↔ stock planétaire, cap de stockage et conteneurs vérifiés des
  deux côtés, rebase après échange ; UI : formulaire « Trade slot » dans
  le panneau du marché, offres + échange dans le panneau vaisseau à quai.
  Correctif de déterminisme au passage : ordre TOTAL de la flotte
  (personal/cargo/civil/combat puis created_at, id) — created_at seul
  flippait l'éventail des marqueurs après un UPDATE de ligne. 6 unit +
  12 intégration + E2E boucle complète, captures 30–32 observées.
- **Atterrissage & fret (chunk J)** : migration `ships.hover_body_id` +
  `buildings.config` ; le survol garde le corps sous la coque et atterrir
  devient un acte EXPLICITE (GB §9) — mondes possédés toujours accueillants
  [TUNE-v1], monde étranger = spaceport actif avec politique `everyone`
  (v1 self|everyone, réglée par la commande de réglages du bâtiment,
  friends/neighbours avec les factions), monde sauvage et sondes refusés ;
  fret à quai sur monde possédé : 1 conteneur = 1 T d'un fongible, tonnes
  partielles monopolisent leur conteneur (DG §7 exact), stock vérifié,
  cap de stockage refusé explicitement, rebase des bords de frein après
  transfert ; UI : soute du vaisseau (manifeste + conteneurs), boutons
  Land/Undock, formulaire load/unload, politique d'atterrissage dans le
  panneau spaceport. AUCUNE limite de docks en v1 (annoncé — comptes par
  niveau au backlog). 7 unit + 9 intégration + E2E boucle complète,
  captures 26–29 observées.
- **La Silence se brise : ping, ping-back & canaux (chunk I)** : migration
  `pings`/`channels`/`messages` (canal canonique par couple : paire triée +
  contrainte SQL unique) ; sendPing (cible = monde POSSÉDÉ visible dans le
  ciel de l'émetteur — vérifié serveur via visibleBodies, quota 20/j
  [TUNE], 1 hail en attente par couple), pingBack (seul le destinataire ;
  ouvre ou retrouve LE canal), messages 1↔1 avec membership vérifiée
  (refus d'un tiers testés par requêtes directes) ; écran Comms (hails
  entrants avec Ping back accent, canaux, chat pollé 3 s, formulaire),
  bouton Ping sur un monde étranger de la carte galaxie ; l'infrastructure
  sans tuile (télescope, probe pad) se construit désormais via l'UI
  (construction directe, panneau « Infrastructure » dans la vue planète —
  le flux tuile la rejetait) ; correctif de déterminisme du test market L2
  (l'ADN du starter roulait market absent/plafonné dans ~20 % des univers
  → seed pur dédié, patron « Capworld »). 5 unit + 5 intégration + E2E
  bi-navigateur (télescope → ping → ping-back → échange), captures 19–25
  observées.
- **Vol libre & sondes (chunk H)** : migration missions (segment, statut
  idle), moveShip (position interpolée pure, pré-brûlage v1 documenté,
  auto-chargement du réservoir sur monde possédé, personnel = mondes
  possédés seulement — refus canon testé), sondes (pad actif, cap 5/j/pad,
  vision 60 pc à l'arrivée : la sonde LÈVE LA SILENCE, testé sur le starter
  du voisin), vision = union planètes+télescopes+sondes+vaisseaux ; UI
  carte : marqueurs de flotte en éventail, lignes de transit pointillées,
  envoi au clic (ETA + fuel), lancement de sonde. 45 intégration + 7 E2E.

- **Renderer : animations + passe de lumière v1 (chunk G)** : sprites GIF
  animés (pixi.js/gif, cache d'ArrayBuffer, une source par sprite — la
  cascade destroy ne corrompt plus les reconstructions) ; extraction des
  sources émissives des light maps (binning ≤ 3), halos ADDITIFS qui
  débordent sur tuiles et sprites voisins (propagation ASSET_PIPELINE §3),
  filtre WebGL de relief bump (normale par gradient, 4 sources locales +
  ambiante + lumière clé) ; correctif de précision GLSL (highp) trouvé en
  interceptant le link WebGL. Décision P0.4 renderer VALIDÉE → [x].
- **Niveaux, démolition & page stats (chunk F)** : montée de niveau en
  place (coût du palier, plafond de profondeur de l'ADN du seed, politique
  de niveau par intersection — market L2 refusé à un industrialiste,
  production coupée pendant le chantier, re-staffing requis à L2) ;
  démolition avec remboursement 50 % crédité au lancement (confirmation en
  deux temps), tuile et gisement libérés à l'issue — un extracteur en
  démolition ne réserve plus son gisement (décision documentée) ; page
  stats planète canon §10 (chaque unité : u, E, débit, facteur limitant +
  lignes planète/stockage). 39 tests d'intégration, 6 E2E, captures
  observées.
- **Boucle colonie vivante (chunk E)** : cœur de production pur et
  déterministe (extraction ×E×runPct×frein, recettes, point fixe de
  partage des intrants à sec, minage de trace exempt, consommation de
  survie par familles) ; rebase aux événements de bord (stock_edge aux
  seuils 0.7/0.85/1.0 du frein, deposit_dry DÉFINITIF, pop_daily
  quotidien : H, maladie, croissance logistique) ; recette obligatoire à
  la pose (canon « une industrie mint une chose »), max 1 extracteur par
  gisement, workforce ≤ 60 % pop, réglages workforce/cadence par bâtiment ;
  UI : choix de recette, débits +/− par ressource, date de tarissement
  projetée, panneau bâtiment (facteur limitant, courbe, réglages) ;
  rattrapage hors-ligne prouvé (zéro dérive). TIME_SCALE documenté
  (instrumentation dev/test).
- **Tranche verticale jouable (chunk D)** : API de jeu (register/login/
  logout avec sessions httpOnly hachées, /me, /galaxy avec brouillard par
  scope, /planets/:id lazy-évalué réservé au propriétaire, unlock/build
  transactionnels avec coûts, masque de gouvernance, tuiles, événement de
  chantier) ; client complet (écran d'éveil, HUD groovy-dark, carte galaxie
  three.js pan/zoom + sprites + brouillard, vue planète isométrique PixiJS
  + overlays climat + chantiers, main EXHAUSTIVE des 28 cartes avec chips
  de coûts et raisons de blocage, courbe d'efficacité signature) ;
  correction « départ sain » (pop initiale = 0,6 × popCap, le 1 200 du
  guide = cas small-F) ; autorisations vérifiées par requêtes directes.
- **Génération d'univers + spawn starter (chunk C)** : rolls déterministes
  DG §2.1 (planète, starter, étoile avec stock caché + R_nova, gisements,
  noms), poche de Fermi DG §2.2 avec toutes ses garanties (étoile S à
  40 pc, 2 planètes sauvages ≤ 60 pc, voisin 150–240 pc, starter tempéré
  D–F ≥ 10 tuiles, gisements garantis, stock ×U(1.0–1.3), 150 u de fuel
  assorti, pop 1 200, vaisseau personnel + Cargo-S, pilote commun avec roll
  individuel, bind compte 45 j) ; inscription registerPlayer (scrypt natif,
  transaction unique) ; seed de dev = vrai flux applicatif, 2 comptes démo,
  idempotent ; base de test dédiée atg_test (plus de contamination du seed).
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
- Corpus de conception complet : `GAME_BOOK.md` (canon des règles),
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
