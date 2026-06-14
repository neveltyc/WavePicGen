import { describe, it, expect } from 'vitest';
import { cycleBrick } from './edit';
import { parseSource } from './parse';

function waveOf(source: string, row = 0): string {
  const doc = parseSource(source).doc!;
  // walk to the row-th signal (flat order), mirroring the editor's mapping
  const flat: Array<{ wave?: string }> = [];
  const walk = (items: unknown[]): void => {
    for (const it of items) {
      if (Array.isArray(it)) walk(it);
      else if (it && typeof it === 'object') flat.push(it as { wave?: string });
    }
  };
  walk(doc.signal as unknown[]);
  return flat[row]?.wave ?? '';
}

describe('cycleBrick', () => {
  const SRC = `{ signal: [ { name: 'a', wave: '0000' } ] }`;

  it('cycles 0 -> 1 -> x -> z -> 0', () => {
    let s = cycleBrick(SRC, 0, 1)!;
    expect(waveOf(s)).toBe('0100');
    s = cycleBrick(s, 0, 1)!;
    expect(waveOf(s)).toBe('0x00');
    s = cycleBrick(s, 0, 1)!;
    expect(waveOf(s)).toBe('0z00');
    s = cycleBrick(s, 0, 1)!;
    expect(waveOf(s)).toBe('0000');
  });

  it('turns a non-level brick (clock/data/.) into 0 first', () => {
    expect(waveOf(cycleBrick(`{ signal: [ { name: 'a', wave: 'pppp' } ] }`, 0, 2)!)).toBe('pp0p');
    expect(waveOf(cycleBrick(`{ signal: [ { name: 'a', wave: '1...' } ] }`, 0, 2)!)).toBe('1.0.');
  });

  it('targets the right signal inside nested groups', () => {
    const src = `{ signal: [ { name: 'clk', wave: '00' }, ['g', { name: 'x', wave: '00' }, ['h', { name: 'y', wave: '00' }] ] ] }`;
    expect(waveOf(cycleBrick(src, 2, 0)!, 2)).toBe('10'); // row 2 == 'y'
    expect(waveOf(cycleBrick(src, 0, 0)!, 0)).toBe('10'); // row 0 == 'clk'
  });

  it('returns null for spacers, out-of-range rows/bricks, and bad source', () => {
    expect(cycleBrick(`{ signal: [ {} ] }`, 0, 0)).toBeNull();
    expect(cycleBrick(SRC, 5, 0)).toBeNull();
    expect(cycleBrick(SRC, 0, 99)).toBeNull();
    expect(cycleBrick('{ broken', 0, 0)).toBeNull();
  });
});
