import { describe, it, expect } from 'vitest';
import { renderTikz, toTikz } from './tikz';
import { normalize } from './model';

function tikz(source: string): string {
  return renderTikz(source).tikz ?? '';
}

describe('toTikz / renderTikz', () => {
  it('wraps rows in a tikztimingtable with the package note', () => {
    const out = tikz(`{ signal: [ { name: 'a', wave: '01' } ] }`);
    expect(out).toContain('\\begin{tikztimingtable}');
    expect(out).toContain('\\end{tikztimingtable}');
    expect(out).toContain('tikz-timing');
  });

  it('coalesces level runs into width-prefixed chars', () => {
    expect(tikz(`{ signal: [ { name: 'a', wave: '0011' } ] }`)).toContain('a & 2L2H \\\\');
  });

  it('renders clocks as half-unit high/low pairs', () => {
    expect(tikz(`{ signal: [ { name: 'clk', wave: 'pp' } ] }`)).toContain('clk & 0.5H0.5L0.5H0.5L \\\\');
  });

  it('emits data buses with width and label', () => {
    const out = tikz(`{ signal: [ { name: 'd', wave: '=..', data: ['BYTE'] } ] }`);
    expect(out).toContain('d & 3D{BYTE} \\\\');
  });

  it('maps high-Z and undefined to Z and X', () => {
    expect(tikz(`{ signal: [ { name: 'a', wave: 'zx' } ] }`)).toContain('a & ZX \\\\');
  });

  it('escapes LaTeX-special characters in names and labels', () => {
    const out = tikz(`{ signal: [ { name: 'a_b', wave: '=', data: ['x%y'] } ] }`);
    expect(out).toContain('a\\_b &');
    expect(out).toContain('D{x\\%y}');
  });

  it('renders a spacer as an empty row', () => {
    const out = tikz(`{ signal: [ { name: 'a', wave: '0' }, {}, { name: 'b', wave: '1' } ] }`);
    expect(out).toContain('\n  \\\\\n');
  });

  it('reports a parse error instead of throwing', () => {
    expect(renderTikz('{ broken').error).toBeDefined();
    expect(renderTikz('{ broken').tikz).toBeUndefined();
  });

  it('toTikz works directly on a normalized model', () => {
    expect(toTikz(normalize({ signal: [{ name: 'a', wave: '1' }] }))).toContain('a & H \\\\');
  });
});
