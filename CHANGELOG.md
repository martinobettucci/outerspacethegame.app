# CHANGELOG

## [Non publié]

### Implémentation P1 (démarrée 2026-07-12 sur GO du responsable)

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
