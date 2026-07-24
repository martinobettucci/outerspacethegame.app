/** @spec All declarations and algorithms in this file implement: docs/BACKLOG.md §P0.3 “Icon-first command deck”/§P2.codex; docs/MANUAL_PLAN.md §2–§7; docs/DESIGN_SYSTEM.md §5.1. */
/**
 * Codex prose (English). Centralised here as a dedicated i18n namespace.
 *
 * CONCURRENCY DEVIATION (documented — docs/MANUAL_PLAN.md §2): the shared
 * `i18n/en.ts` is under active edit by a parallel workstream, so Codex text
 * lives in its own module rather than being merged into `t` right now. It is
 * still centralised and translatable; folding `codexEn` into `en.ts` under
 * `t.codex.*` is a mechanical follow-up once that file settles.
 *
 * RULE: no numeric game values in this file. Numbers render at display time
 * from `CODEX_FACTS` (see facts.ts), so prose never drifts from the sim.
 */

export const codexEn = {
  title: 'Codex',
  subtitle: 'Field manual — how the galaxy actually works',
  tagline:
    'Systems, not spoilers. The Codex explains the rules; the map is yours to discover.',
  navHeading: 'Chapters',
  exactRuleToggle: 'Exact rule & formula',
  close: 'Close the Codex',
  open: 'Codex',

  deposits: {
    title: 'Deposits & mining',
    lead: 'Every world is born with a handful of natural deposits — the resources that are genuinely present in its ground. That is why a planet lists far fewer resources than the full catalogue: you only see what it actually holds.',
    finite:
      'Deposits are finite. Every day you mine one, it shrinks. When it is exhausted it is gone for good — and the mine sitting on it then produces nothing, forever. Depletion is permanent; there is no regeneration.',
    trace:
      'The twelve basic materials are a special case: you can always place a mine for any of them on any world, even one with no such deposit. But with no deposit the yield is only a flat trace trickle, unaffected by how well the mine is staffed.',
    trap: 'The trap worth remembering: a rich deposit you exhaust does NOT fall back to the trace trickle — it drops to zero and stays there. The trace rate only ever applies to a basic the world never had a deposit for. "Never had one" pays a trickle forever; "used it up" pays nothing forever.',
    crystals:
      'Climate crystals are stricter than basics. A crystal extractor only works where the world truly has that crystal deposit — no deposit, no extraction. Refined and propulsion goods are never mined at all; they are manufactured in factories from other resources.',
    exactIntro: 'How the numbers work:',
    exactTrace:
      'Trace mining (no deposit) yields a flat rate, ignoring staffing efficiency.',
    exactDeposit:
      'A real deposit yields far more, scaled by the mine’s efficiency and the deposit’s richness, and draws that tonnage down until it is dry.',
    exactDry: 'A depleted deposit is fixed at zero output, permanently.',
    diagramCaption:
      'A deposit drains to zero and stops; the trace floor is a separate, much lower trickle that only applies where no deposit ever existed.',
  },

  population: {
    title: 'Population',
    lead: 'Your people live in three ages — children, actives and seniors — and only actives work. Everyone ages on a fixed schedule: children grow into workers, workers become seniors, seniors eventually die of old age. The pyramid is always visible on the planet stats page.',
    consumers:
      'Children and seniors produce nothing but still consume. Their food, water and hostile-climate oxygen ration is smaller than an active’s, but their medicine burden is higher. Plan every supply family around the whole pyramid, not just the workforce.',
    natality:
      'Births need residential districts and good management. A healthy average efficiency together with a local surplus of water, food and oxygen where it is required fills the cradle; shortages brake it. No residential district means no births at all.',
    lifesupport:
      'On climates hostile to life your people also breathe from your oxygen stockpile. Water and food start fixed death clocks when dry; hostile-climate oxygen is immediate. Medicine is deliberately outside this survival trio.',
    overcap:
      'A world has a comfortable capacity. Push population far beyond it and crowding breeds illness and extra deaths. Growth is the engine of expansion, but a colony crammed past its means pays for it in lives.',
    health:
      'Medicine is optional: running out never starts a death clock and never changes births. While a family stock remains, people burn the full daily need and receive illness mitigation. At exact zero the bonus ends; a full live supply keeps it, a partial live trickle does not. Production beyond the burn remains ordinary stock that you may sell.',
    clinic:
      'Illness is an index that climbs the more you exceed a world’s capacity, and an unmedicated population accumulates that pressure faster. A clinic is a separate defence: each level lowers the illness that actually reaches your citizens. Medical supply controls new pressure; the clinic reduces its lethal effect.',
    extinction:
      'If a colony’s population ever reaches zero, the world goes extinct: it reverts to unclaimed wild space and the governor you installed there is lost. Its buildings, research, stockpiles and deposits all stay in place, though — an extinct world is abandoned, not destroyed, and it can be recolonised later.',
    exactIntro: 'The fixed schedules and rates:',
    exactAges: 'Age spans (children / actives / seniors), in game-days.',
    exactRation: 'Children and seniors each use this share of an active’s survival ration.',
    exactOxygen: 'Hostile-climate oxygen draw, per thousand heads per day.',
    exactMedicine: 'Optional medicine base burn, per thousand weighted heads per day.',
    exactMedicineWeights: 'Medicine weights (children / actives / seniors).',
    exactClocks: 'Death-clock delays once water or food runs out.',
    exactClinic: 'Illness-index reduction by clinic level (L1 / L2 / L3).',
    exactStarter: 'A starter world begins at this population, on the stable pyramid.',
    diagramCaption: 'The stable age pyramid that a steady population settles into.',
  },

  efficiency: {
    title: 'Efficiency & employment',
    lead: 'Every building runs on workers, and its output follows an efficiency curve. Understaff it and it idles; hit the sweet spot and it peaks; pack in too many workers and it chokes. More people is not automatically more output.',
    drift:
      'The sweet spot is a ratio, not a headcount — and that optimum drifts upward as your total population grows. A building that was perfectly tuned can quietly slip out of tune as the colony expands, so staffing is something you revisit, not set once.',
    unemployment:
      'Idle citizens are dangerous. Unemployment beyond a small tolerance, once a short grace period has passed, begins to kill people — so expansion (more buildings, more worlds, or letting people leave) is the rational response to a crowded, under-employed colony.',
    storage:
      'Full storehouses brake production. As a world’s storage fills toward its cap, output throttles down to protect it; once completely full, production stops until you ship, sell or consume the surplus.',
    exactIntro: 'Where the curve sits:',
    exactPeak: 'Output peaks at this fraction of a building’s optimal staffing.',
    exactFloor: 'Even badly-staffed buildings keep at least this efficiency.',
    exactUnemp: 'Unemployment tolerance, and the grace period before deaths begin.',
    exactBrake: 'Storage starts braking production at this share of the cap.',
    diagramCaption:
      'The efficiency curve: the peak is the sweet spot, the right shoulder is the overstaffing choke.',
  },
  buildings: {
    title: 'Buildings',
    lead: 'Every structure belongs to one of two families. SINGLE buildings work alone: a second copy adds nothing (or is simply not allowed) — you grow them by LEVELING. MULTIPLE buildings stack: each copy adds its own output, storage or docks, bounded only by your free tiles and deposits.',
    context:
      'This chapter shows the building types available in THIS world’s tech DNA — as your horizons widen, so does the chapter.',
    partial:
      'Where a level-3 industry runs, big works change rhythm: placements, ship keels, gear and level-ups are no longer paid up front. The yard opens an automatic work order that draws the cost in twenty small instalments as the work advances — an empty storehouse simply pauses the site until supplies return, and tearing a site down only ever refunds what was actually paid in.',
    warehouse:
      'Open a warehouse to see what is physically there. Fabricated items are grouped into engine, armour, fuel, observation, weapon, cargo and accessory bays; stored vehicles keep separate S, M and L vaults. Select an object cell to reveal its legal actions in the dossier beside the grids.',
    noPlanet: 'Open one of your worlds to browse the building types its tech DNA allows.',
    loadError: 'Could not read this world’s tech DNA — try again.',
    single: 'Single',
    multiple: 'Stacks',
    availableHere: 'types available on this world',
  },

  cargo: {
    title: 'Cargo & the hold',
    lead: 'Every hull has a hold, and its size is counted in containers — the boxes you see fill up on the ship panel. A hull with no hold carries nothing; a freighter carries the most. The number beside the boxes, used over total, is your whole capacity at a glance.',
    fungible:
      'Fungible matter is measured in tonnes, and one container holds one tonne of a single resource — but only one resource, and only whole containers. A part-tonne still monopolizes an entire box, and two half-tonnes of different ores never share one: each takes its own. Plan your hauls in whole tonnes, because that is how the hold actually counts.',
    items:
      'Discrete items ride the same hold. A single piece of gear — fitted-grade or raw — occupies one full container, exactly like a tonne of ore. A ship can therefore carry a mix: some boxes full of matter, some holding one item each, up to the same total.',
    capacity:
      'Capacity is a property of the hull. Freighters hold far more than a warship or a scout, and only a cargo hull can widen its hold further — a dedicated capacity upgrade multiplies its containers. Some accessories add a box or two on top. What a hull cannot do is hold more than its containers allow: a full hold simply refuses the next load.',
    weight:
      'A loaded hull pays for what it carries. The fuller the hold, the slower the ship flies and the more fuel it burns to cross the same distance — you feel it on every journey, in the arrival time and the fuel spent. An empty hull is the fastest and the thriftiest; a brimming freighter is neither. Weigh the cargo against the trip.',
    exactIntro: 'The fixed frame of the hold:',
    exactContainer: 'One container',
    exactCeil: 'Part-tonnes and single items',
    exactUpgrade: 'Cargo-capacity upgrade multiplies a freighter’s containers by',
    exactSpeed: 'Speed lost at a completely full hold',
    exactBurn: 'Extra fuel burn at a completely full hold',
  },

  gear: {
    title: 'Ship gear',
    lead: 'Hulls carry gear: accessories you fabricate planet-side, store as items in a warehouse, and bolt onto a warehoused hull. Each piece occupies one slot of its family — and upgrades share those same family slots, so every fitting is an arbitrage between an upgrade and an accessory.',
    fabrication:
      'An accessory is fabricated where its host building stands and works, from that world’s stockpile. Its grade is fixed at fabrication: an ENHANCED piece needs a high-level host building to build — but once it exists it is an ordinary item. Installing gear demands no technology at all; anything you buy, salvage or haul in fits any hull with a free slot of the right family.',
    management:
      'A quick ship selection keeps fuel, hull and their current flows visible. Open the hull for hands-on work: the real ship sprite sits in its empty maintenance cradle, fitted systems occupy their true family slots, cargo occupies visible boxes and the instrument column stays alongside them. Select the object you mean to use, install, remove, activate or unload; its dossier then shows only actions that are legal now.',
    classes:
      'Fitted gear comes in three temperaments, visible on the ship panel. PASSIVE pieces simply work: the moment one is aboard, the numbers it touches — drains, capacities, timers, tolls — shift accordingly, live. CONTINUOUS pieces are throttled flows: set a percentage and they convert cargo at that pace anywhere, even in transit, burning engine fuel to run; if an input runs dry they throttle themselves to zero. BATCH pieces are one-shot procedures: they take their inputs the instant you start, demand a stopped ship for a fixed process time, and burn no fuel at all — the efficient, patient option.',
    warnBatch:
      'A started batch procedure immobilises the hull until its term — and aborting one does not give the inputs back. Commit only what you can afford to lose the moment you press start.',
    freight:
      'Fitted or not, gear also travels as freight. A docked ship can take an item from the local balance into its hold — where it occupies a full container, just like a ton of ore — carry it across the sky, and set it down in another balance. A full balance simply refuses the delivery; nothing is ever melted down in transit.',
    removal:
      'Gear comes off as deliberately as it went on. Uninstalling a piece from a warehoused hull takes time and returns the item to the world’s item balance; disassembling one instead melts it back into a fraction of its fabrication materials. If the local item balance is full, an uninstalled piece is disassembled on the spot.',
    exactIntro: 'The fixed frame around every piece of gear:',
    exactUninstall: 'Uninstalling a fitted accessory (warehoused hull) takes',
    exactRefund: 'Disassembly refunds this share of the fabrication cost',
    exactEnhanced: 'Enhanced grade: host building level required at fabrication',
    exactEnhancedRate: 'Enhanced continuous gear runs faster by',
    exactStep: 'Continuous gear throttles in steps of',
  },

  crusader: {
    title: 'Flying colony',
    lead: 'A Crusader is a colony that never lands. It is born hovering, carries a quarter of its birth-world\'s people aboard, and everything a settled world does — breathing, eating, aging, working, building — it does from its own hold. There is no ground under it and there never will be.',
    breath:
      'Aboard, life runs on the hold. Your people breathe, eat and drink from the ship\'s stock — oxygen straight from storage, with no sky to fall back on. Keep the hold fed by cargo runs, because an empty larder aboard is measured in days and an empty oxygen store is measured in nothing at all.',
    docks:
      'Its flying docks berth your other hulls. A docked ship freezes its tank, and its crew eats from the Crusader\'s stores like ground crew; an escorting ship keeps station and follows every move the Crusader makes. Undock and you are simply back in open space.',
    fabrication:
      'The decks fabricate. Every workshop, yard and lab a world could host is aboard and running — so any piece of gear, at any grade, can be laid down without a single technology unlocked, paid step by step from the hold as an automatic work order. Finished items wait in the hold balance; docked hulls fit them without ever touching a warehouse. Keels are laid the same way, and a new ship wakes up already berthed.',
    noMarkets:
      'What the decks do not have is a marketplace. Nothing aboard is for sale and nothing can be bought; the hold fills the old way — flown in, crate by crate.',
    exactIntro: 'The fixed frame of the flying colony:',
    exactPop: 'Population cap aboard',
    exactStock: 'Fungible hold capacity',
    exactMigration: 'Share of the birth-world\'s people who board at launch',
    exactJobs: 'Fixed jobs aboard (unemployment is measured against this)',
    exactDocks: 'Flying docks (S / M / L berths)',
    exactItems: 'Item balance aboard',
  },
} as const;

export type CodexStrings = typeof codexEn;
