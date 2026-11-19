// Neon Harbor — build entrypoint (gta6-01, session 6). Node standard library only.
//
//   MAKEFUN_OUTPUT_DIR=out node main.ts
//
// Copies this repository's game/ and screenshots/ into $MAKEFUN_OUTPUT_DIR
// (directories made on demand, every file streamed through a pipe so no large
// asset is ever held whole in memory) and then writes the make.fun dossier of
// the entry — out/dossier.json, the exact bytes buildDossier returns — through
// the vendored kit. No network, no build step, nothing outside the stdlib.
import { createReadStream, createWriteStream, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { buildDossier } from './vendor/makefun-game.ts';

const root = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '';
if (out === '') {
  console.error('usage: MAKEFUN_OUTPUT_DIR=<output dir> node main.ts');
  process.exit(1);
}

// The bounty gate's caps for gta6-01, as the vendored kit documents them:
// 160 KiB of source text, up to 4 screenshots of 256 KiB each, 993 game
// entries and 48 MiB of game files.
const GATE = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
};

/** Copy a directory tree, streaming each file through a pipe. */
async function copyTree(src: string, dst: string): Promise<void> {
  mkdirSync(dst, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const from = join(src, entry.name);
    const to = join(dst, entry.name);
    if (entry.isDirectory()) await copyTree(from, to);
    else await pipeline(createReadStream(from), createWriteStream(to));
  }
}

await copyTree(join(root, 'game'), join(out, 'game'));
await copyTree(join(root, 'screenshots'), join(out, 'screenshots'));

const dossier = buildDossier(out, GATE); // makefun/dossier/v1, canonical JSON bytes
writeFileSync(join(out, 'dossier.json'), dossier);
console.log(`neon-harbor: game/ + screenshots/ + dossier.json (${dossier.length} bytes) -> ${out}`);
