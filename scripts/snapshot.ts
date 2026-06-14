/**
 * Dev/verification helper (not shipped): render every built-in example to SVG
 * and PNG so the output can be eyeballed and used for visual regression.
 *   npx tsx scripts/snapshot.ts [outDir]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { render } from '../src/core/index';
import { examples } from '../src/core/examples';

const outDir = resolve(process.argv[2] ?? 'tmp/snapshots');
mkdirSync(outDir, { recursive: true });

for (const ex of examples) {
  const r = render(ex.source);
  const svgPath = resolve(outDir, `${ex.id}.svg`);
  const pngPath = resolve(outDir, `${ex.id}.png`);
  writeFileSync(svgPath, r.svg, 'utf8');

  const resvg = new Resvg(r.svg, { fitTo: { mode: 'zoom', value: 2 }, background: 'white' });
  writeFileSync(pngPath, resvg.render().asPng());

  const status = r.error ? `ERROR: ${r.error}` : `${r.width}x${r.height}`;
  console.log(`${ex.id.padEnd(10)} ${status.padEnd(16)} warnings=${r.warnings.length}`);
}
console.log(`\nWrote ${examples.length} SVG+PNG pairs to ${outDir}`);
