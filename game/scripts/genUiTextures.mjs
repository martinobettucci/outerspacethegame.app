#!/usr/bin/env node
/** @spec All declarations and algorithms in this file implement: docs/BACKLOG.md §P0.3; docs/ASSET_PIPELINE.md §7; docs/DESIGN_SYSTEM.md §5/§9–§11. */
/**
 * Textures de FOND pour l'UI (panneaux, cartes, rail, voile modal) —
 * demande du responsable : « UI texturing », PAS de l'art de jeu.
 * Même pipeline que genSoil.mjs : OpenAI Images (OPENAI_KEY du .env
 * racine, jamais commitée), archive PNG pleine dans
 * docs/design/prototypes, asset webp 512² (ffmpeg). Contraste TRÈS BAS
 * exigé par l'accessibilité (§22) : la lisibilité du texte prime.
 * Usage : node game/scripts/genUiTextures.mjs [--model gpt-image-2] [--only ui-panel]
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
  'Seamless tileable UI background texture, EXTREMELY subtle and low ' +
  'contrast, near-black dark indigo palette, uniform edge-to-edge, no ' +
  'objects, no text, no logos, no vignette, no lighting hotspots, flat ' +
  'even tone suitable behind small light text';

const TEXTURES = {
  'ui-panel':
    `${STYLE}. Fine brushed carbon-fiber weave with faint blue-steel sheen, micro grain.`,
  'ui-card':
    `${STYLE}. Fine riveted alloy plate with hairline panel seams and micro scratches, barely visible.`,
  'ui-shell':
    `${STYLE}. Soft vertical strata of deep space haze, whisper-faint starfield dust.`,
  'ui-veil':
    `${STYLE}. Whisper-faint nebula wisps and sparse micro-stars over pure darkness.`,
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

for (const [name, prompt] of Object.entries(TEXTURES)) {
  if (only && name !== only) continue;
  process.stdout.write(`${name} (${argModel})… `);
  let png;
  try {
    png = await generate(argModel, prompt);
  } catch (err) {
    if (argModel !== 'gpt-image-1' && String(err).includes('HTTP 4')) {
      process.stdout.write(`échec → repli gpt-image-1… `);
      png = await generate('gpt-image-1', prompt);
    } else {
      throw err;
    }
  }
  const out = join(outDir, `${name}.png`);
  writeFileSync(out, png);
  copyFileSync(out, join(archiveDir, `${name}.png`)); // archive pleine
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', out,
    '-vf', 'scale=512:512', '-quality', '80',
    join(outDir, `${name}.webp`)]);
  rmSync(out);
  console.log('OK');
}
console.log('Terminé.');
