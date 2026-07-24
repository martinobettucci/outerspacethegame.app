/** @spec This simulation implements: BALANCE_LOG.md Round 11 (W9f accessory tuning); docs/GEAR_CATALOG.md. */
/**
 * Round 11 — W9f : économie du catalogue d'accessoires.
 *
 * Contrairement aux rounds python, ce sim importe les CONSTANTES
 * EXPÉDIÉES (`@atg/shared` dist) — aucune duplication, aucun proxy :
 * si un chiffre bouge dans le code, le sim bouge avec.
 *
 * Batteries :
 *  A. Portée d'expédition (cargo_s/l) nue vs cell_cracker vs decompressor.
 *  B. ram_scoop : bilan carburant/usure d'une traversée, valorisé au
 *     coût de réparation atelier (REPAIR_STEEL_T_PER_HP).
 *  C. fab_bay & hull_patch_kit : T d'acier par HP vs réparation au sol.
 *  D. jump_primer : temps net gagné selon la distance (charge incluse).
 *  E. gravity_sling : HP payés par jour gagné.
 *  F. Débit batch vs continu (fonderie) : rendement vs cadence.
 *  G. Passifs d'endurance : heat_recycler / solar_sails en jours de
 *     survol gagnés par réservoir.
 *
 * Usage : node tools/balance/gear_v1_sim.mjs
 * (après `pnpm --filter @atg/shared build`)
 */
import {
  CONVERSIONS,
  GEAR,
  GRAVITY_SLING,
  HULLS,
  RAM_SCOOP,
  REPAIR_STEEL_T_PER_HP,
} from '../../game/packages/shared/dist/index.js';

const out = [];
const log = (s) => { out.push(s); console.log(s); };

log('# Round 11 — W9f gear economics (constants = shipped code)');
log('');

// ---- A. Portée d'expédition -------------------------------------------
log('## A. Expedition range (hold-as-tank)');
for (const key of ['cargo_s', 'cargo_l']) {
  const h = HULLS[key];
  const bare = h.tankU / h.burnUPerPc;
  const cracker = CONVERSIONS.cell_cracker.output.fuel; // u / cell
  const decomp = CONVERSIONS.cell_decompressor.output.fuel;
  const withCracker = (h.tankU + h.containers * cracker) / h.burnUPerPc;
  const withDecomp = (h.tankU + h.containers * decomp) / h.burnUPerPc;
  const crackDays = h.containers / CONVERSIONS.cell_cracker.ratePerHourAt100 / 24;
  const decompStops = h.containers * (CONVERSIONS.cell_decompressor.processHours / 24);
  log(
    `- ${key}: bare ${bare.toFixed(0)} pc | cracker ${withCracker.toFixed(0)} pc ` +
    `(${(withCracker / bare).toFixed(1)}x, ${crackDays.toFixed(1)} j de craquage en route) | ` +
    `decompressor ${withDecomp.toFixed(0)} pc (${decompStops.toFixed(0)} j d'arrêts cumulés)`,
  );
}
log('');

// ---- B. ram_scoop ------------------------------------------------------
log('## B. ram_scoop crossing (per pc in field, runPct 100)');
{
  const fuel = RAM_SCOOP.fuelUPerPcAt100;
  for (const [grade, mult] of [['std', RAM_SCOOP.wearMult], ['enh', RAM_SCOOP.wearMultEnhanced]]) {
    const wearHp = RAM_SCOOP.wearHpPerPc * mult;
    const steelCost = wearHp * REPAIR_STEEL_T_PER_HP;
    const fuelAsCellT = fuel / CONVERSIONS.cell_decompressor.output.fuel; // T de cells équivalentes
    log(
      `- ${grade}: +${fuel} u/pc vs ${wearHp} HP/pc (= ${steelCost.toFixed(3)} T steel/pc au tarif atelier) ; ` +
      `carburant gagné ≈ ${fuelAsCellT.toFixed(3)} T-cell/pc → ratio valeur ${(fuelAsCellT / steelCost).toFixed(2)}`,
    );
  }
  for (const key of ['cargo_s', 'cargo_l']) {
    const h = HULLS[key];
    const cross = 60; // pc de champ (traversée typique d'un champ L)
    const wear = cross * RAM_SCOOP.wearHpPerPc * RAM_SCOOP.wearMult;
    log(
      `- ${key} traversée ${cross} pc: +${(cross * fuel).toFixed(0)} u ` +
      `(burn du segment ${(cross * h.burnUPerPc).toFixed(0)} u) ; usure ${wear.toFixed(0)}/${h.armorHp} HP (${((wear / h.armorHp) * 100).toFixed(0)} %)`,
    );
  }
}
log('');

// ---- C. Réparation : fab_bay & hull_patch_kit vs sol -------------------
log('## C. Repair steel per HP (ground = ' + REPAIR_STEEL_T_PER_HP + ' T/HP)');
for (const key of ['cargo_s', 'cargo_l']) {
  const h = HULLS[key];
  const bay = CONVERSIONS.fab_bay; // input steel_l / % ; output 1 %/h
  const bayPerHp = bay.input.steel_l / (h.armorHp / 100);
  const patch = CONVERSIONS.hull_patch_kit;
  const patchPerHp = patch.input.steel_l / ((patch.output.hp_pct / 100) * h.armorHp);
  log(
    `- ${key}: fab_bay ${bayPerHp.toFixed(3)} T/HP (${(bayPerHp / REPAIR_STEEL_T_PER_HP).toFixed(1)}x sol) | ` +
    `hull_patch_kit ${patchPerHp.toFixed(3)} T/HP (${(patchPerHp / REPAIR_STEEL_T_PER_HP).toFixed(2)}x sol)`,
  );
}
log('');

// ---- D. jump_primer ----------------------------------------------------
log('## D. jump_primer net time saved (cargo_l, charge C → boost 3C ×1.5)');
{
  const h = HULLS.cargo_l;
  const { boostSpeedMult, boostDurationMult } = CONVERSIONS.jump_primer.charge;
  for (const chargeDays of [0.5, 2, 10]) {
    const boostDays = chargeDays * boostDurationMult;
    const boostedPc = boostDays * h.speedPcPerDay * boostSpeedMult;
    for (const D of [100, 300, 1000]) {
      const plain = D / h.speedPcPerDay;
      const inBoost = Math.min(D, boostedPc);
      const withPrimer =
        chargeDays + inBoost / (h.speedPcPerDay * boostSpeedMult) +
        (D - inBoost) / h.speedPcPerDay;
      const saved = plain - withPrimer;
      if (D === 300) {
        log(
          `- charge ${chargeDays} j → boost ${boostDays} j (${boostedPc.toFixed(0)} pc boostés) ; ` +
          `trajet 300 pc : ${plain.toFixed(1)} j nu vs ${withPrimer.toFixed(1)} j amorcé (net ${saved >= 0 ? '+' : ''}${(-saved).toFixed(1)} j de PERTE si négatif → gain ${saved.toFixed(1)} j)`,
        );
      }
    }
  }
}
log('');

// ---- E. gravity_sling --------------------------------------------------
log('## E. gravity_sling (runPct 100 : ×1.5, ' + GRAVITY_SLING.damageHpAt100 + ' HP)');
for (const key of ['cargo_s', 'cargo_l']) {
  const h = HULLS[key];
  const D = 120;
  const saved = D / h.speedPcPerDay - D / (h.speedPcPerDay * 1.5);
  log(
    `- ${key}, trajet ${D} pc : ${saved.toFixed(1)} j gagnés pour ${GRAVITY_SLING.damageHpAt100} HP ` +
    `(${((GRAVITY_SLING.damageHpAt100 / h.armorHp) * 100).toFixed(1)} % de coque ; ${(GRAVITY_SLING.damageHpAt100 * REPAIR_STEEL_T_PER_HP).toFixed(1)} T steel)`,
  );
}
log('');

// ---- F. Fonderie : batch vs continu ------------------------------------
log('## F. Smelting throughput vs yield (12 h window)');
{
  const arc = CONVERSIONS.arc_furnace;
  const run = CONVERSIONS.smelting_run;
  const contSteel = (arc.output.steel_l / 1) * arc.ratePerHourAt100 * 12;
  const contJunk = arc.input.junk * arc.ratePerHourAt100 * 12;
  const contFuel = arc.fuelUPerHourAt100 * 12;
  log(
    `- arc_furnace 12 h @100%: ${contJunk} junk → ${contSteel} steel_l + ${contFuel} u brûlés ` +
    `(rendement ${(contSteel / contJunk).toFixed(2)})`,
  );
  log(
    `- smelting_run 12 h: ${run.input.junk} junk → ${run.output.steel_l} steel_l, 0 u ` +
    `(rendement ${(run.output.steel_l / run.input.junk).toFixed(2)}) — débit ${(contSteel / run.output.steel_l).toFixed(1)}x plus faible`,
  );
}
log('');

// ---- G. Endurance de survol -------------------------------------------
log('## G. Hover endurance (cargo_s tank ' + HULLS.cargo_s.tankU + ' u, drain 0.2 u/j)');
{
  const drain = 0.2; // HOVER_DRAIN_U_PER_DAY (cf. shipDrain [TUNE])
  const base = HULLS.cargo_s.tankU / drain;
  const eco = HULLS.cargo_s.tankU / (drain * 0.85);
  log(
    `- nu : ${base.toFixed(0)} j ; heat_recycler : ${eco.toFixed(0)} j (+${(eco - base).toFixed(0)} j) ; ` +
    `solar_sails ≤ 8 pc d'une étoile : ∞ (drain nul)`,
  );
  log(`- coût heat_recycler : ${JSON.stringify(GEAR.heat_recycler.fabricationCost)}`);
}

export {};
