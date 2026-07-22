# GEAR_CATALOG — le catalogue COMPLET des accessoires

> Document faisant foi (CLAUDE.md §5), miroir de `game/packages/shared/src/items.ts`
> et `conversions.ts`. Taxonomie définitive (responsable 2026-07-22) :
> **PASSIF** (avantage permanent) · **CONTINU** (mobile, modulable 5 %,
> brûle du carburant, starvation → 0 %) · **BATCH** (intrants à
> l'activation, arrêt + immobilisation, temps figé, zéro carburant,
> plus efficace). Tout accessoire occupe UN slot de SA famille ;
> upgrades et accessoires PARTAGENT la capacité de famille (W9c).
> Grade **enhanced** : fabriqué sur bâtiment hôte L3, figé à la
> fabrication (continu ×1,5 débit ; batch ÷1,5 temps ; passif effet
> supérieur). L'installation n'exige AUCUNE techno. Chiffres [TUNE]
> jusqu'au tour d'équilibrage W9f.

## Statuts : ✔ implémenté (catalogue COMPLET livré, 2026-07-22 — chiffres [TUNE] jusqu'au tour d'équilibrage W9f)

## 1. Accessoires PASSIFS

| Accessoire | Slot | Gate (fabrication) | Effet std / enhanced | Statut |
|---|---|---|---|---|
| metamorphic_hull | accessory | workshop | permet la morphose climatique (W5) ; d'office sur toute coque, démontable | ✔ |
| advanced_refueling_system | accessory | workshop | 2 sondes tanker ancrées (au lieu d'1) | ✔ |
| harvest_rig | accessory | workshop | récolte stellaire (gradient ≤ 8 pc) | ✔ |
| junk_collector | accessory | workshop | scoop de junk 30 T/j | ✔ |
| claim_rig | accessory | workshop | réclamation d'épaves (2 h de proximité) | ✔ |
| heat_recycler | fuel | refinery | drain de survol −15 % / −25 % | ✔ |
| cryo_larder | accessory | lab | capacité de provisions +50 % / +100 % | ✔ |
| docking_clamps | accessory | spaceport | séjour à quai étranger ×2 / ×3 | ✔ |
| signal_mirror | obs | telescope | scan vaisseau 20 → 60 / 100 pc | ✔ |
| survey_suite | obs | research_center | +1 palier d'intel en survol (cap L2 / L3) | ✔ |
| ballast_shielding | armor | military_district | dégâts de junk −50 % / −75 % | ✔ |
| flare_dampers | armor | obs_station | usure champ/flare −50 % / −75 % (CUMULABLE avec la morphose) | ✔ |
| trim_vanes | engine | shipyard | pénalité de charge ÷2 / ÷4 | ✔ |
| berth_module | cargo | residential | pax +25 % / +50 % | ✔ |
| course_optimizer | engine | research_center | burn de trajet −10 % / −15 % | ✔ |
| cargo_netting | cargo | warehouse | +1 / +2 conteneurs | ✔ |
| mooring_winch | accessory | warehouse | redéploiement d'entrepôt ÷2 / ÷3 | ✔ |
| bilge_purifier | accessory | waterworks | drain de survie équipage −25 % / −50 % | ✔ |
| stargate_caller | accessory | stargate_yard | péage de gate étranger −25 % / −50 % | ✔ |
| salvage_grapnel | accessory | workshop | réclamation 2 h → 1 h / 0,5 h | ✔ |
| haggler_matrix | accessory | commerce_district | prix du négoce inné −10 % / −15 % | ✔ |
| ore_hopper | cargo | smelter | scoop de junk +50 % / +100 % | ✔ |
| solar_sails | fuel | fuelcell_plant | survol GRATUIT à ≤ 8 / ≤ 15 pc d'une étoile | ✔ |
| escape_thrusters | engine | military_district | alarme d'auto-fuite à 40 % / 50 % | ✔ |

## 2. Accessoires ACTIFS CONTINUS (mobiles, brûlent du carburant)

| Accessoire | Slot | Gate | Conversion (à 100 %) std / enh | Statut |
|---|---|---|---|---|
| electrolyzer | accessory | workshop | eau → O2+H (1:1:1), 20 / 30 T/h, 1 u fuel/h | ✔ |
| electrolyzer_l2 | accessory | workshop | idem + INVERSE (O2+H → eau) | ✔ |
| vivarium | accessory | workshop | 0,5 O2 → 1 nourriture, 5 / 7,5 T/h, 1 u fuel/h | ✔ |
| cell_cracker | fuel | fuelcell_plant | 0,1 cell/h à 100 % → 40 u moteur/cell (< 50 du batch), 0,5 u fuel/h | ✔ |
| arc_furnace | accessory | smelter | 2 junk → 1 steel_l, 5 réf/h à 100 %, 1 u fuel/h | ✔ |
| med_synth | accessory | lab | 1 eau + 0,5 phosphore → 1 med_1, 2 réf/h à 100 %, 1 u fuel/h | ✔ |
| ram_scoop | fuel | refinery | STANCE — traversée d'un champ du TYPE MOTEUR : +0,5 u/pc × runPct au réservoir CONTRE usure 0,5 HP/pc ×2 / ×1,5 (réglée au départ) | ✔ |
| gravity_sling | engine | shipyard | STANCE — départ ≤ 8 pc d'une étoile : vitesse ×(1+runPct/200 %) contre 10 HP × runPct (enhanced ÷2) | ✔ |
| fab_bay | accessory | workshop | auto-réparation 1 %/h × runPct, 0,5 T steel_l/% de SOUTE + 1 u fuel/h (voie du Crusader — W9g) ; bord de plein → 0 % | ✔ |

## 3. Accessoires ACTIFS BATCH (immobiles, zéro carburant, efficaces)

| Accessoire | Slot | Gate | Procédé (arrêt + temps figé) std / enh | Statut |
|---|---|---|---|---|
| cell_decompressor | accessory | fuelcell_plant | 1 fuel_cell → 24 h / 16 h → +50 fuel moteur (au réservoir) | ✔ |
| cryo_stasis_pod | accessory | lab | stase 7 j — survie ET vieillissement GELÉS, coque immobile ; réveil à la demande en 10 min ; L2 (enhanced) : AUTOPILOTE — durée choisie (≤ 100 j), voyage en stase, irréveillable | ✔ |
| jump_primer | engine | shipyard | charge LIBRE (1 h–10 j, gratuite, à l'arrêt) → boost vitesse ×1,5 pendant 3 × la charge (enhanced : ×4,5) | ✔ |
| deep_scan_pulse | obs | research_center | 12 h → instantané d'intel L3 PERSISTÉ du corps sous scan le plus proche (plancher, figé à l'activation) | ✔ |
| hull_patch_kit | accessory | workshop | 1 T steel_l → 12 h → +25 % des HP MAX (borné au plein) | ✔ |
| kedge_winch | accessory | spaceport | 1 j → 5 pc SANS carburant vers une cible ; MODE BOOST (< 1 u restant) : tout brûlé, 10 pc | ✔ |
| electrolysis_vat | accessory | workshop | 20 eau → 22 O2 + 22 H, 12 h (rendement +10 %) | ✔ |
| hydroponic_run | accessory | farm | 10 O2 → 22 food_1, 12 h (+10 %) | ✔ |
| smelting_run | accessory | smelter | 20 junk → 11 steel_l, 12 h (+10 %) | ✔ |
| apothecary_still | accessory | lab | 10 eau + 5 phosphore → 11 med_1, 12 h (+10 %) | ✔ |

## 4. UPGRADES (rappel — pas des accessoires, mêmes familles de slots)

engine/armor/fuel/obs/weapon × L2/L3 — shipyard (weapon_foundry pour
les armes) ; obs/weapon DORMANTS jusqu'au combat (P5).

## 5. PARQUÉS (motifs au JOURNAL 2026-07-22)

probe_cradle (chantier propre), beacon_transponder (politiques P4),
gyro_stabilizers (usure d'atterrissage non implémentée),
fermentation_vats (pas de péremption).
