// Neon Harbor — build entrypoint (Node 22+, standard library only, no network).
//
//   MAKEFUN_OUTPUT_DIR=out node main.ts
//
// Copies game/ and screenshots/ (the two directories beside this file) into the output
// directory, then runs make.fun's buildDossier over the copy and writes <out>/dossier.json.
// cp() streams file bytes between the directories, so nothing is ever held whole in memory.
import { cp, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// The bounty's gate caps, passed exactly as the scorer passes them, so this build fails
// wherever the scorer's own build would fail (text bytes, screenshot count and size, tree size).
const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
};

const root = dirname(fileURLToPath(import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR || 'out';

await mkdir(outDir, { recursive: true });
for (const dir of ['game', 'screenshots']) {
  await cp(join(root, dir), join(outDir, dir), { recursive: true });
}

const dossier = buildDossier(outDir, CAPS); // canonical JSON bytes
await writeFile(join(outDir, 'dossier.json'), dossier);
console.log(`neon-harbor: ${outDir}/game + ${outDir}/screenshots + ${outDir}/dossier.json (${dossier.length} bytes)`);
