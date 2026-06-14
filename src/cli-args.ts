/** Pure CLI argument parsing — kept separate from cli.ts so it is unit-testable
 *  without triggering the CLI's top-level execution. */

export type CliFormat = 'svg' | 'png' | 'tikz';

export interface CliOptions {
  input?: string;
  out?: string;
  format?: CliFormat;
  scale: number;
  help: boolean;
}

export const USAGE = `WavePicGen — digital timing diagram renderer

Usage:
  wavepicgen <input>            render <input> (WaveJSON/JSON5) as SVG to stdout
  wavepicgen <input> -o out.png write PNG (format inferred from extension)
  wavepicgen - -o out.svg       read source from stdin

Options:
  -o, --out <file>     output file (extension picks the format)
  -f, --format <fmt>   svg | png | tikz (default: from -o extension, else svg)
  -s, --scale <n>      raster scale for png (default: 2)
  -h, --help           show this help
`;

export function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = { scale: 2, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') {
      opts.help = true;
    } else if (a === '-o' || a === '--out') {
      const v = argv[++i];
      if (v === undefined) throw new Error('missing value for -o/--out');
      opts.out = v;
    } else if (a === '-f' || a === '--format') {
      const f = argv[++i];
      if (f === 'svg' || f === 'png' || f === 'tikz') opts.format = f;
      else throw new Error(`unknown format "${f}" (use svg, png or tikz)`);
    } else if (a === '-s' || a === '--scale') {
      const n = Number(argv[++i]);
      if (!Number.isFinite(n) || n <= 0) throw new Error('--scale must be a positive number');
      opts.scale = n;
    } else if (a === '-') {
      opts.input = '-';
    } else if (a && !a.startsWith('-') && opts.input === undefined) {
      opts.input = a;
    } else {
      throw new Error(`unexpected argument "${a}"`);
    }
  }
  return opts;
}

/** Resolve the output format from explicit flag, output extension, or default. */
export function formatFor(opts: CliOptions): CliFormat {
  if (opts.format) return opts.format;
  if (opts.out && /\.png$/i.test(opts.out)) return 'png';
  if (opts.out && /\.tex$/i.test(opts.out)) return 'tikz';
  return 'svg';
}
