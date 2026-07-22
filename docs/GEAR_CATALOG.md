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

## Statuts : ✔ implémenté · ⏳ validé à implémenter · 💬 proposé (en discussion)

## 1. Accessoires PASSIFS

| Accessoire | Slot | Gate (fabrication) | Effet std / enhanced | Statut |
|---|---|---|---|---|
| metamorphic_hull | accessory | workshop | permet la morphose climatique (W5) ; d'office sur toute coque, démontable | ✔ |
| advanced_refueling_system | accessory | workshop | 2 sondes tanker ancrées (au lieu d'1) | ✔ |
| harvest_rig | accessory | workshop | récolte stellaire (gradient ≤ 8 pc) | ✔ |
| junk_collector | accessory | workshop | scoop de junk 30 T/j | ✔ |
| claim_rig | accessory | workshop | réclamation d'épaves (2 h de proximité) | ✔ |
| heat_recycler | fuel | refinery | drain de survol −15 % / −25 % | ⏳ W9d |
| cryo_larder | accessory | lab | capacité de provisions +50 % / +100 % | ⏳ W9d |
| docking_clamps | accessory | spaceport | séjour à quai étranger ×2 / ×3 | ⏳ W9d |
| signal_mirror | obs | telescope | scan vaisseau 20 → 60 / 100 pc | ⏳ W9d |
| survey_suite | obs | research_center | +1 palier d'intel en survol (cap L2 / L3) | ⏳ W9d |
| ballast_shielding | armor | military_district | dégâts de junk −50 % / −75 % | ⏳ W9d |
| flare_dampers | armor | obs_station | usure champ/flare −50 % / −75 % (CUMULABLE avec la morphose) | ⏳ W9d |
| trim_vanes | engine | shipyard | pénalité de charge ÷2 / ÷4 | ⏳ W9d |
| berth_module | cargo | residential | pax +25 % / +50 % | ⏳ W9d |
| course_optimizer | engine | research_center | burn de trajet −10 % / −15 % | ⏳ W9d |
| cargo_netting | cargo | warehouse | +1 / +2 conteneurs | ⏳ W9d |
| mooring_winch | accessory | warehouse | redéploiement d'entrepôt ÷2 / ÷3 | ⏳ W9d |
| bilge_purifier | accessory | waterworks | drain de survie équipage −25 % / −50 % | ⏳ W9d |
| stargate_caller | accessory | stargate_yard | péage de gate étranger −25 % / −50 % | ⏳ W9d |
| salvage_grapnel | accessory | workshop | réclamation 2 h → 1 h / 0,5 h | ⏳ W9d |
| haggler_matrix | accessory | commerce_district | prix du négoce inné −10 % / −15 % | ⏳ W9d |
| ore_hopper | cargo | smelter | scoop de junk +50 % / +100 % | ⏳ W9d |
| solar_sails | fuel | fuelcell_plant | survol GRATUIT à ≤ 8 / ≤ 15 pc d'une étoile | ⏳ W9d |
| escape_thrusters | engine | military_district | alarme d'auto-fuite à 40 % / 50 % | ⏳ W9d |

## 2. Accessoires ACTIFS CONTINUS (mobiles, brûlent du carburant)

| Accessoire | Slot | Gate | Conversion (à 100 %) std / enh | Statut |
|---|---|---|---|---|
| electrolyzer | accessory | workshop | eau → O2+H (1:1:1), 20 / 30 T/h, 1 u fuel/h | ✔ |
| electrolyzer_l2 | accessory | workshop | idem + INVERSE (O2+H → eau) | ✔ |
| vivarium | accessory | workshop | 0,5 O2 → 1 nourriture, 5 / 7,5 T/h, 1 u fuel/h | ✔ |
| cell_cracker | fuel | fuelcell_plant | fuel_cells → carburant moteur (mobile — la soute-réservoir) [ratio TUNE < décompresseur] | ⏳ W9e |
| arc_furnace | accessory | smelter | junk → steel_l, brûle du fuel | ⏳ W9e |
| med_synth | accessory | lab | eau+phosphor → med_1, brûle du fuel | ⏳ W9e |
| ram_scoop | fuel | refinery | EN TRANSIT dans un champ stellaire : récolte le fuel du type ∝ runPct CONTRE usure ×2 / ×1,5 | ⏳ W9e |
| gravity_sling | engine | shipyard | départ ≤ 8 pc d'une étoile : vitesse ×(1+runPct/2) contre dégâts ∝ runPct | ⏳ W9e |
| fab_bay | accessory | workshop | auto-réparation 1 %/h × runPct au steel de SOUTE + fuel (voie de réparation du Crusader — W9g) | ⏳ W9e |

## 3. Accessoires ACTIFS BATCH (immobiles, zéro carburant, efficaces)

| Accessoire | Slot | Gate | Procédé (arrêt + temps figé) std / enh | Statut |
|---|---|---|---|---|
| cell_decompressor | accessory | fuelcell_plant | 1 fuel_cell → 24 h / 16 h → +50 fuel moteur (au réservoir) | ✔ |
| cryo_stasis_pod | accessory | lab | 12 h de mise en route → horloge de survie GELÉE 7 j (vaisseau inerte) | 💬 |
| jump_primer | engine | shipyard | 1 j de charge → prochain trajet vitesse ×1,5 (périme sous 3 j) | 💬 |
| deep_scan_pulse | obs | research_center | 12 h → un instantané d'intel L3 d'un corps sous scan | 💬 |
| hull_patch_kit | accessory | workshop | 12 h → +25 % des HP max, sans atelier ni steel | 💬 |
| kedge_winch | accessory | spaceport | 1 j → treuille la coque de 5 pc SANS carburant | 💬 |
| electrolysis_vat | accessory | workshop | contrepartie batch de l'électrolyse (rendement +10 %) | 💬 |
| hydroponic_run | accessory | farm | contrepartie batch du vivarium | 💬 |
| smelting_run | accessory | smelter | contrepartie batch de l'arc_furnace | 💬 |
| apothecary_still | accessory | lab | contrepartie batch du med_synth | 💬 |

## 4. UPGRADES (rappel — pas des accessoires, mêmes familles de slots)

engine/armor/fuel/obs/weapon × L2/L3 — shipyard (weapon_foundry pour
les armes) ; obs/weapon DORMANTS jusqu'au combat (P5).

## 5. PARQUÉS (motifs au JOURNAL 2026-07-22)

probe_cradle (chantier propre), beacon_transponder (politiques P4),
gyro_stabilizers (usure d'atterrissage non implémentée),
fermentation_vats (pas de péremption).
