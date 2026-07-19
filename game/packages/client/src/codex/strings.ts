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
      'Children and seniors produce nothing but still eat, at a smaller ration than a working adult. A colony is therefore always feeding more mouths than it has workers — plan supply around the whole pyramid, not just the workforce.',
    natality:
      'Births need residential districts and good management. A healthy average efficiency together with a local surplus of water, food and oxygen fills the cradle; shortages brake it. No residential district means no births at all.',
    lifesupport:
      'On climates hostile to life your people also breathe from your oxygen stockpile. If any life-support resource runs dry, a death clock starts and people die on a fixed timer until supply returns — hostile-climate oxygen is the harshest, killing quickly.',
    overcap:
      'A world has a comfortable capacity. Push population far beyond it and crowding breeds illness and extra deaths. Growth is the engine of expansion, but a colony crammed past its means pays for it in lives.',
    exactIntro: 'The fixed schedules and rates:',
    exactAges: 'Age spans (children / actives / seniors), in game-days.',
    exactRation: 'Children and seniors each eat this share of an active’s ration.',
    exactOxygen: 'Hostile-climate oxygen draw, per thousand heads per day.',
    exactClocks: 'Death-clock delays once water or food runs out.',
    exactStarter: 'A fresh colony starts at this population, on the stable pyramid.',
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
} as const;

export type CodexStrings = typeof codexEn;
