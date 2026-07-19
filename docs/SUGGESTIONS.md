# SUGGESTIONS — journal des propositions de l'agent

> Demandé par le responsable (2026-07-18) : consigner ici les suggestions
> émises en fin de chunk (« prochain candidat ») et les améliorations
> repérées en cours de route, avec leur état. Ce fichier est MAINTENU à
> chaque itération de la boucle autonome ; le backlog
> ([docs/BACKLOG.md](BACKLOG.md)) reste la source de vérité des tâches.

Statuts : `proposé` · `retenu (chunk X)` · `livré (chunk X)` · `décliné`.

## Prochains chunks proposés (fin de chunk)

| Date | Suggestion | État |
|---|---|---|
| 2026-07-17 | Canal manuel / warehouse public (GB §9, DG §6) | livré (chunk T) |
| 2026-07-18 | Pools AMM du marché L2 (GB §9/§13, DG §11.1–11.2) | livré (chunk U) |
| 2026-07-18 | Routage cells-étoile + double-fee + nudge triade (GB §13, DG §11.2) | livré (chunk V) |
| 2026-07-18 | Survival-out des horloges de mort (équipages en base, strip → derelict, salvage claims — GB §6, DG §8.8/§10.3) avec le lifecycle NPC (liaison/libération warehouse) | livré (chunk AB — salvage claims restent, items P4) |
| 2026-07-19 | Avitaillement UI de survie + chemin stock-planète du survol possédé (restes chunk AB) | livré (chunk AE — auto-trade bounds 3× census restent, P4 politiques de marché) |
| 2026-07-19 | Étoiles & récolte (harvest) — prochaine grosse brique P1 du backlog (GB §22, DG §2.1/§8.8) | livré (chunk AF — restent : dégâts d_safe avec l'usure de coque, junk, attribution L3) |
| 2026-07-19 | Usure de coque & climate shields (ligne 107 — débloque les dégâts d_safe de la récolte et le poison-harvest) | livré (chunk AG — restent : poison-harvest dormant, réparation d'atelier, destruction 0 HP en P5) |
| 2026-07-19 | Réparation d'atelier (« repair 5 %/h ×1/2/4 » — effet workshop déjà écrit dans le catalogue) : rendre l'usure réversible à quai | proposé |
| 2026-07-19 | Texturation UI (panneaux/cartes/rail/voile) via gpt-image-2 | livré (chunk AA) |
| 2026-07-19 | Textures de sol générées (OPENAI_KEY fournie par le responsable dans .env local) intégrées à la dalle organique du chunk X | livré (chunk Z — genSoil.mjs, 4 climats §16) |
| 2026-07-18 | Preuve E2E du rattrapage hors-ligne (log off / return, zéro dérive — GB §15, DG §1) — backlog ligne « Offline catch-up correctness E2E » | livré (chunk AC) |
| 2026-07-18 | Retool 24 h des industries + montée de niveau depot (restes chunk E/stockage) | livré (chunk Y — retool + overfill §3.3b ; niveaux de dépôt déjà couverts par le levelUp générique) |
| 2026-07-18 | Warehouse : balances véhicules/items S/M/L, tampon libre, blocage d'usine (GB §9, DG §6) — prérequis des enchères P4 | livré (chunk AD — véhicules ; items/blocage d'usine dormants sans usines d'unités, parking allié P4) |
| 2026-07-18 | Gouvernance v1 : masques par intersection déjà actifs → écran preview OBLIGATOIRE, gouverneur temporaire du vaisseau personnel, règle demi-efficacité (GB §11/§21, DG §4.1) | proposé |

## Améliorations & dettes repérées en route

| Date | Observation / suggestion | État |
|---|---|---|
| 2026-07-17 | L'univers dev partagé grossit à chaque run E2E (~300 comptes) : la charge du tick worker à ×7200 augmente linéairement — prévoir un reset périodique documenté OU un univers E2E dédié | proposé |
| 2026-07-17 | Notices mixtes EN/FR : l'UI (i18n EN) affiche les messages d'erreur serveur (FR) verbatim — centraliser des codes d'erreur traduits côté client | proposé |
| 2026-07-17 | Affichage distant de la disponibilité des docks pour un visiteur (aujourd'hui : refus au moment de l'atterrissage) — candidat intel/scan | proposé (au backlog, item docks « Restent ») |
| 2026-07-17 | Montée de niveau du seul spaceport = fenêtre bootstrap (port inactif : visiteurs refusés, propriétaire sans limite) — arbitrage possible : geler l'ancien niveau pendant le chantier | proposé |
| 2026-07-18 | Notification de hail hors de l'écran Comms (badge rail) — backlog chunk I « Restent » | proposé |
| 2026-07-18 | CI (unit + intégration + E2E + captures) — item backlog non commencé, forte valeur maintenant que la suite est stable (21 specs) | proposé |
| 2026-07-18 | Compose staging/prod (backlog « reste ») — à faire avec le premier déploiement réel | proposé |
| 2026-07-19 | Retard d'affichage des badges « Active works » après l'éveil d'un chantier/retool (poll UI 4 s, plusieurs éléments FINALIZING persistants) — rafraîchir à la volée sur événement ou raccourcir le poll | proposé |
| 2026-07-18 | Le roll de TAILLE du starter fait varier la franchise de stockage (800/1000/1200) : les E2E sur-dotés doivent poser un depot — envisager un pickEmailByDna filtrant aussi la taille (exposer rollStarterPlanet au helper) | proposé |
