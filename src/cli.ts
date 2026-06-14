/**
 * WavePicGen CLI — headless batch rendering. Reuses the exact same engine as the
 * GUI, so command-line output is pixel-identical. SVG is produced by the engine;
 * PNG is rasterized with resvg.
 *
 *   wavepicgen <input.(json|json5)> [-o out.(svg|png)] [--format svg|png] [--scale N]
 *   cat fig.json5 | wavepicgen - -o fig.png --scale 3
 *   wavepicgen fig.json5            # SVG to stdout
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { render } from './core/index';
import { parseArgs, formatFor, USAGE } from './cli-args';

async function main(): Promise<number> {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help || opts.input === undefined) {
    process.stdout.write(USAGE);
    return opts.help ? 0 : 1;
  }

  const source =
    opts.input === '-' ? readFileSync(0, 'utf8') : readFileSync(opts.input, 'utf8');

  const result = render(source);
  if (result.error) {
    process.stderr.write(`error: ${result.error}\n`);
    return 1;
  }
  for (const w of result.warnings) process.stderr.write(`warning: ${w}\n`);

  const format = formatFor(opts);

  if (format === 'svg') {
    if (opts.out) {
      writeFileSync(opts.out, result.svg, 'utf8');
      process.stderr.write(`wrote ${opts.out} (${result.width}x${result.height})\n`);
    } else {
      process.stdout.write(result.svg);
    }
    return 0;
  }

  // PNG via resvg (imported lazily so SVG-only runs need no native module).
  const { Resvg } = await import('@resvg/resvg-js');
  const resvg = new Resvg(result.svg, {
    fitTo: { mode: 'zoom', value: opts.scale },
    background: 'white',
  });
  const png = resvg.render().asPng();
  const out = opts.out ?? `${basename(opts.input).replace(/\.[^.]+$/, '')}.png`;
  writeFileSync(out, png);
  process.stderr.write(
    `wrote ${out} (${result.width * opts.scale}x${result.height * opts.scale})\n`,
  );
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((e: unknown) => {
    process.stderr.write(`error: ${e instanceof Error ? e.message : String(e)}\n`);
    process.exit(1);
  });
