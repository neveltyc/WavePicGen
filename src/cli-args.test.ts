import { describe, it, expect } from 'vitest';
import { parseArgs, formatFor } from './cli-args';

describe('parseArgs', () => {
  it('takes the first positional as input', () => {
    expect(parseArgs(['fig.json5']).input).toBe('fig.json5');
  });

  it('reads -o/--out, -f/--format and -s/--scale', () => {
    const o = parseArgs(['fig.json5', '-o', 'out.png', '-f', 'png', '-s', '3']);
    expect(o).toMatchObject({ input: 'fig.json5', out: 'out.png', format: 'png', scale: 3 });
  });

  it('supports "-" for stdin', () => {
    expect(parseArgs(['-', '-o', 'x.svg']).input).toBe('-');
  });

  it('flags help', () => {
    expect(parseArgs(['--help']).help).toBe(true);
  });

  it('rejects an invalid format and a non-positive scale', () => {
    expect(() => parseArgs(['f', '-f', 'gif'])).toThrow(/format/);
    expect(() => parseArgs(['f', '-s', '0'])).toThrow(/scale/);
    expect(() => parseArgs(['f', '-s', 'abc'])).toThrow(/scale/);
  });
});

describe('formatFor', () => {
  it('prefers the explicit --format', () => {
    expect(formatFor({ format: 'png', scale: 2, help: false })).toBe('png');
  });

  it('infers png from the output extension', () => {
    expect(formatFor({ out: 'a.PNG', scale: 2, help: false })).toBe('png');
  });

  it('defaults to svg', () => {
    expect(formatFor({ scale: 2, help: false })).toBe('svg');
    expect(formatFor({ out: 'a.svg', scale: 2, help: false })).toBe('svg');
  });
});
