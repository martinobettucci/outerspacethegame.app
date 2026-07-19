#!/usr/bin/env node
/**
 * Génération des textures de SOL par climat (demande du responsable) via
 * l'API OpenAI Images — la clé vient de .env à la racine du dépôt
 * (OPENAI_KEY, jamais commitée). Sorties :
 *   - game/packages/client/public/generated/soil-<climat>.png  (asset)
 *   - docs/design/prototypes/soil-<climat>.png                 (archive,
 *     convention CLAUDE.md « prototypage visuel »)
 * Usage : node game/scripts/genSoil.mjs [--model gpt-image-2] [--only hot]
 * Reproductible : mêmes prompts, ré-exécution idempotente (écrase).
 */
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function envKey() {
  if (process.env.OPENAI_KEY) return process.env.OPENAI_KEY;
  const env = readFileSync(join(root, '.env'), 'utf8');
  const m = env.match(/^OPENAI_KEY=(.+)$/m);
  if (!m) throw new Error('OPENAI_KEY introuvable (.env racine)');
  return m[1].trim();
}

const STYLE =
  'Top-down seamless tileable videogame ground texture, painterly sci-fi, ' +
  'dark moody palette, subtle organic noise and mineral variation, soft ' +
  'diffuse lighting, no objects, no buildings, no borders, no text, no ' +
  'vignette, uniform edge-to-edge coverage';

const CLIMATES = {
  temperate: `${STYLE}. Deep mossy green alien meadow soil, dark loam with faint emerald undergrowth patches and tiny lichen flecks.`,
  hot: `${STYLE}. Scorched umber and rust cracked desert earth, ember-tinted fissures, dark basalt grit and ochre dust.`,
  cold: `${STYLE}. Frozen slate-blue permafrost, hairline ice veins, powdered frost over dark glacial rock.`,
  poison: `${STYLE}. Toxic acid-green mottled sludge soil, dark olive crust with faint luminous chartreuse pustules and damp sheen.`,
};

const argModel = process.argv.includes('--model')
  ? process.argv[process.argv.indexOf('--model') + 1]
  : 'gpt-image-2';
const only = process.argv.includes('--only')
  ? process.argv[process.argv.indexOf('--only') + 1]
  : null;

const outDir = join(root, 'game/packages/client/public/generated');
const archiveDir = join(root, 'docs/design/prototypes');
mkdirSync(outDir, { recursive: true });
mkdirSync(archiveDir, { recursive: true });

async function generate(model, prompt) {
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${envKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model, prompt, size: '1024x1024', quality: 'medium' }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status} (${model}) : ${text.slice(0, 300)}`);
  }
  const json = await res.json();
  const b64 = json.data?.[0]?.b64_json;
  if (!b64) throw new Error('Réponse sans b64_json');
  return Buffer.from(b64, 'base64');
}

for (const [climate, prompt] of Object.entries(CLIMATES)) {
  if (only && climate !== only) continue;
  process.stdout.write(`sol ${climate} (${argModel})… `);
  let png;
  try {
    png = await generate(argModel, prompt);
  } catch (err) {
    // Repli : le nom de modèle fourni peut ne pas exister sur ce compte.
    if (argModel !== 'gpt-image-1' && String(err).includes('HTTP 4')) {
      process.stdout.write(`échec (${String(err).slice(0, 120)}) → repli gpt-image-1… `);
      png = await generate('gpt-image-1', prompt);
    } else {
      throw err;
    }
  }
  const out = join(outDir, `soil-${climate}.png`);
  writeFileSync(out, png);
  copyFileSync(out, join(archiveDir, `soil-${climate}.png`)); // archive pleine
  // Asset servi : webp 768px (~150 Ko) — dépendance : ffmpeg.
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', out,
    '-vf', 'scale=768:768', '-quality', '82',
    join(outDir, `soil-${climate}.webp`)]);
  rmSync(out);
  console.log(`OK (${Math.round(png.length / 1024)} Ko png → webp 768)`);
}
console.log('Terminé.');
