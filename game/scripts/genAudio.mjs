#!/usr/bin/env node
/**
 * @spec Implements docs/BACKLOG.md §P0.3-audio “A — Audio layer”; docs/AUDIO_PLAN.md
 * §2–§3 (generation via fal `fal-ai/stable-audio`, post-process, dual-codec file
 * contract); docs/ASSET_PIPELINE.md §9. Same secret discipline as
 * genSoil.mjs / genUiTextures.mjs (image pipeline), different generator.
 * Only the compressed ogg/mp3 the game loads are kept; raw WAVs are transient
 * (owner decision 2026-07-24) — regenerate via fal, no committed archive.
 *
 * Generates the whole audio layer: 3 BGM beds + 29 per-building ambience loops
 * + 15 per-unit selection stingers. The id↔building/unit/context mapping is the
 * shared manifest (@atg/shared/audio.ts); THIS script owns generation-time
 * prompts + durations only.
 *
 * Usage:
 *   FAL_KEY read from repo-root .env (never committed).
 *   node game/scripts/genAudio.mjs                 # all missing clips
 *   node game/scripts/genAudio.mjs --family bgm    # bgm | ambience | select
 *   node game/scripts/genAudio.mjs --only mine     # a single clip id
 *   node game/scripts/genAudio.mjs --force         # regenerate even if present
 *   node game/scripts/genAudio.mjs --concurrency 4
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MODEL = 'fal-ai/stable-audio';

function falKey() {
  if (process.env.FAL_KEY) return process.env.FAL_KEY;
  const env = readFileSync(join(root, '.env'), 'utf8');
  const m = env.match(/^FAL_KEY=(.+)$/m);
  if (!m) throw new Error('FAL_KEY introuvable (.env racine)');
  return m[1].trim().replace(/^["']|["']$/g, '');
}
const KEY = falKey();

/** Common tail for diegetic industrial ambience loops. */
const A =
  'seamless looping industrial ambient sound, diegetic machinery room tone, ' +
  'steady and continuous, NO music, no melody, no beat drop, sci-fi space colony';
/** Common tail for short selection confirm stingers. */
const S = 'very short sci-fi UI selection confirm sound effect, single hit, dry, clean, no music';

const BGM = {
  menu:
    'Atmospheric ambient space music, slow evolving warm synth pads, distant cosmic drone, ' +
    'deep sub bass, sparse shimmering bells, hopeful and mysterious, NO drums, cinematic, ' +
    'seamless loopable main-menu theme for a sci-fi strategy game',
  galaxy:
    'Ambient space-exploration music, wide evolving pads, slow gentle arpeggio, soft pulse, ' +
    'sense of vast distance between stars, subtle low percussion, seamless loopable background score',
  planet:
    'Ambient industrial colony music, warm low drones with a faint mechanical rhythmic pulse, ' +
    'distant machinery texture under soft pads, calm management mood, low energy, seamless loopable',
};

const AMBIENCE = {
  mine: `${A}: deep rock drilling, ore crusher rumble, conveyor belts, pneumatic hammers`,
  smelter: `${A}: roaring blast furnace, molten metal hiss, heavy forge, radiant heat`,
  refinery: `${A}: chemical refinery hum, bubbling vats, hissing pipes, pressure valves`,
  crystal_extractor: `${A}: resonant crystal harvesting, high harmonic hum, energy extraction, glassy tones`,
  fuelcell_plant: `${A}: electrical fuel-cell plant, humming transformers, energy crackle, coolant flow`,
  farm: `${A}: hydroponic greenhouse hum, water misters, ventilation fans, bio-dome`,
  waterworks: `${A}: water pumps, flowing and dripping water, filtration hum, pipes`,
  spaceport: `${A}: spaceport tarmac, distant idling ship engines, cargo loaders, air-traffic hum`,
  shipyard: `${A}: orbital shipyard construction, welding arcs, metal clanging, cranes, riveting`,
  workshop: `${A}: mechanical workshop, hand tools, lathes, assembly, tinkering machinery`,
  warehouse: `${A}: warehouse logistics, forklifts, crates moving, low storage hum, faint beeps`,
  depot: `${A}: quiet storage depot, occasional cargo shuffle, low steady hum, loading`,
  telescope: `${A}: observatory dome, servo motors turning a dish, quiet electronic beeps`,
  obs_station: `${A}: sensor station, radar sweeps, electronic scanning beeps, data hum`,
  probe_pad: `${A}: probe launch pad, servo arms, fuel loading hiss, low countdown beeps`,
  market: `${A}: busy trade market hall, low crowd murmur, transaction beeps, commerce bustle`,
  commerce_district: `${A}: commercial district, crowd murmur, elevators, shop machinery, registers`,
  casino: `${A}: casino floor, slot-machine chimes, chips, murmur, upbeat electronic jingles`,
  residential: `${A}: residential dome, muffled community hum, ventilation, distant calm voices`,
  clinic: `${A}: medical clinic, soft monitor beeps, ventilators, sterile quiet hum`,
  lab: `${A}: science laboratory, bubbling experiments, electronic instruments, centrifuge, beeps`,
  research_center: `${A}: advanced research center, humming computers, data servers, processing tones`,
  military_district: `${A}: military base, distant drill marching, equipment clanks, alert hum, barracks`,
  weapon_foundry: `${A}: weapons foundry, heavy stamping presses, metal forging, sparks, machinery`,
  diplomatic_district: `${A}: diplomatic hall, calm formal tone, soft footsteps, muffled negotiation murmur`,
  faction_hq: `${A}: command headquarters, radio chatter, control-room beeps, keyboard clicks`,
  stargate_yard: `${A}: massive stargate construction yard, deep energy hum, portal charge, heavy machinery`,
  terraformer: `${A}: planetary terraformer, atmospheric processors, huge turbines, wind, deep bass rumble`,
  artificial_planet_yard: `${A}: colossal orbital megastructure construction, gravitic machinery, epic deep resonant hum`,
};

const SELECTION = {
  turret_light: `${S}: light turret servo whir and click`,
  turret_heavy: `${S}: heavy turret servo, deep mechanical clunk`,
  cannon: `${S}: artillery cannon, heavy metallic clank, deep tone`,
  tank_ground: `${S}: battle tank engine rev, treads clank, military blip`,
  tank_antiair: `${S}: anti-air unit, radar lock beep, servo rotate`,
  tank_combined: `${S}: heavy combined tank, engine growl, targeting beep`,
  combat_s: `${S}: small fighter, quick jet whoosh, agile chirp`,
  combat_m: `${S}: medium warship, engine hum, weapons-ready tone`,
  combat_l: `${S}: capital warship, deep powerful engine, ominous tone`,
  cargo_s: `${S}: small cargo shuttle, light engine beep`,
  cargo_m: `${S}: medium freighter, cargo engine hum`,
  cargo_l: `${S}: large hauler, deep heavy engine tone`,
  civil_s: `${S}: small civilian ship, gentle soft chime`,
  civil_m: `${S}: medium civilian liner, calm pleasant tone`,
  civil_l: `${S}: large colony ship, warm deep confirm hum`,
};

/** family config: request length, loop crossfade seconds, channels, ffmpeg trim. */
const FAMILIES = {
  bgm: { dir: 'bgm', prompts: BGM, seconds: 47, loop: 1.5, channels: 2, trim: null },
  ambience: { dir: 'ambience', prompts: AMBIENCE, seconds: 12, loop: 0.75, channels: 1, trim: null },
  select: { dir: 'select', prompts: SELECTION, seconds: 5, loop: 0, channels: 1, trim: 1.6 },
};

const MANIFEST = [];
for (const [family, cfg] of Object.entries(FAMILIES)) {
  for (const [id, prompt] of Object.entries(cfg.prompts)) {
    MANIFEST.push({ id, family, prompt, ...cfg });
  }
}

// ---- CLI args ----
const argv = process.argv.slice(2);
const arg = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : null);
const onlyFamily = arg('--family');
const onlyId = arg('--only');
const force = argv.includes('--force');
const concurrency = Math.max(1, Number(arg('--concurrency') || 4));

const outBase = join(root, 'game/packages/client/public/audio');
const tmpBase = join(root, 'game/scripts/.audio-tmp');
for (const d of [outBase, tmpBase]) mkdirSync(d, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function falGenerate(prompt, seconds) {
  const submit = await fetch(`https://queue.fal.run/${MODEL}`, {
    method: 'POST',
    headers: { Authorization: `Key ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, seconds_total: seconds }),
  });
  if (!submit.ok) throw new Error(`submit HTTP ${submit.status}: ${(await submit.text()).slice(0, 200)}`);
  const { status_url, response_url } = await submit.json();
  for (let i = 0; i < 90; i++) {
    await sleep(4000);
    const st = await (await fetch(status_url, { headers: { Authorization: `Key ${KEY}` } })).json();
    if (st.status === 'COMPLETED') break;
    if (st.status === 'FAILED' || st.status === 'ERROR') throw new Error(`fal ${st.status}`);
    if (i === 89) throw new Error('fal timeout');
  }
  const result = await (await fetch(response_url, { headers: { Authorization: `Key ${KEY}` } })).json();
  const url = result.audio_file?.url;
  if (!url) throw new Error('no audio_file.url in result');
  const wav = Buffer.from(await (await fetch(url)).arrayBuffer());
  return wav;
}

function ff(args) {
  execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args]);
}

/** Post-process a raw wav → seamless loop (if loop>0) or trimmed one-shot → ogg+mp3. */
function process1(item, rawWav) {
  const { id, dir, loop, channels, trim } = item;
  const srcWav = join(tmpBase, `${id}.src.wav`);
  const workWav = join(tmpBase, `${id}.work.wav`);
  writeFileSync(srcWav, rawWav);

  // probe duration
  const dur = Number(
    execFileSync('ffprobe', [
      '-v', 'error', '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1', srcWav,
    ]).toString().trim(),
  );

  const chArgs = ['-ac', String(channels)];
  if (loop > 0 && dur > loop * 2 + 0.5) {
    // Seamless loop of length (dur - loop): crossfade the tail over the head.
    const D = dur;
    const x = loop;
    const filter =
      `[0:a]atrim=start=0:end=${x},afade=t=in:d=${x},asetpts=N/SR/TB[fin];` +
      `[0:a]atrim=start=${x}:end=${D - x},asetpts=N/SR/TB[mid];` +
      `[0:a]atrim=start=${D - x}:end=${D},afade=t=out:d=${x},asetpts=N/SR/TB[fout];` +
      `[fout][fin]amix=inputs=2:normalize=0[xf];` +
      `[xf][mid]concat=n=2:v=0:a=1[lp];` +
      `[lp]loudnorm=I=-18:TP=-1.5:LRA=11[out]`;
    ff(['-i', srcWav, '-filter_complex', filter, '-map', '[out]', ...chArgs, workWav]);
  } else {
    // One-shot: optional trim + tiny fades + normalize.
    const end = trim ? Math.min(trim, dur) : dur;
    const fo = Math.min(0.08, end / 4);
    const af = `atrim=0:${end},afade=t=in:d=0.01,afade=t=out:st=${end - fo}:d=${fo},loudnorm=I=-16:TP=-1.5:LRA=11`;
    ff(['-i', srcWav, '-af', af, ...chArgs, workWav]);
  }

  // dual-codec encode — ONLY the compressed assets the game loads are kept.
  // Raw WAVs are transient (owner decision 2026-07-24): regenerate via fal.
  const outDir = join(outBase, dir);
  mkdirSync(outDir, { recursive: true });
  ff(['-i', workWav, '-ar', '44100', '-c:a', 'libvorbis', '-qscale:a', '5', join(outDir, `${id}.ogg`)]);
  ff(['-i', workWav, '-ar', '44100', '-c:a', 'libmp3lame', '-qscale:a', '4', join(outDir, `${id}.mp3`)]);

  rmSync(srcWav, { force: true });
  rmSync(workWav, { force: true });
}

function isDone(item) {
  const outDir = join(outBase, item.dir);
  return existsSync(join(outDir, `${item.id}.ogg`)) && existsSync(join(outDir, `${item.id}.mp3`));
}

async function run() {
  let jobs = MANIFEST;
  if (onlyFamily) jobs = jobs.filter((j) => j.family === onlyFamily);
  if (onlyId) jobs = jobs.filter((j) => j.id === onlyId);
  if (!force) jobs = jobs.filter((j) => !isDone(j));

  console.log(`genAudio: ${jobs.length} clip(s) to generate (concurrency ${concurrency}).`);
  const results = { ok: [], fail: [] };
  let idx = 0;
  async function worker(w) {
    while (idx < jobs.length) {
      const item = jobs[idx++];
      try {
        process.stdout.write(`  [w${w}] ${item.family}/${item.id} … `);
        const wav = await falGenerate(item.prompt, item.seconds);
        process1(item, wav);
        results.ok.push(item.id);
        console.log('done');
      } catch (e) {
        results.fail.push({ id: item.id, err: String(e.message || e) });
        console.log(`FAIL (${e.message || e})`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, (_, w) => worker(w + 1)));

  console.log(`\nDONE. ok=${results.ok.length} fail=${results.fail.length}`);
  if (results.fail.length) {
    console.log('FAILED:', JSON.stringify(results.fail, null, 2));
    process.exitCode = 1;
  }
}

run();
