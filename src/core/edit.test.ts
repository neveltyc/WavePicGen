import { describe, it, expect } from 'vitest';
import { cycleBrick, dragPaint, insertCycles, deleteCycles } from './edit';
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

describe('dragPaint', () => {
  it('paints the anchor level across a forward range', () => {
    expect(waveOf(dragPaint(`{ signal: [ { name: 'a', wave: '0100' } ] }`, 0, 1, 3)!)).toBe('0111');
  });

  it('paints across a backward range too', () => {
    expect(waveOf(dragPaint(`{ signal: [ { name: 'a', wave: '0010' } ] }`, 0, 2, 0)!)).toBe('1110');
  });

  it('resolves a "." anchor back to its run level', () => {
    expect(waveOf(dragPaint(`{ signal: [ { name: 'a', wave: '1...' } ] }`, 0, 2, 3)!)).toBe('1.11');
  });

  it('clamps the range to the wave length', () => {
    expect(waveOf(dragPaint(`{ signal: [ { name: 'a', wave: '0100' } ] }`, 0, 1, 99)!)).toBe('0111');
  });

  it('refuses non-level anchors (clock/bus)', () => {
    expect(dragPaint(`{ signal: [ { name: 'a', wave: 'pppp' } ] }`, 0, 1, 3)).toBeNull();
    expect(dragPaint(`{ signal: [ { name: 'a', wave: '=.=.', data: ['A','B'] } ] }`, 0, 0, 2)).toBeNull();
  });

  it('returns null for bad source / out-of-range anchor', () => {
    expect(dragPaint('{ broken', 0, 0, 1)).toBeNull();
    expect(dragPaint(`{ signal: [ { name: 'a', wave: '01' } ] }`, 0, 9, 0)).toBeNull();
  });
});

describe('insertCycles / deleteCycles', () => {
  const TWO = `{ signal: [ { name: 'a', wave: '01' }, { name: 'b', wave: '10' } ] }`;

  it('inserts an aligned held column across every signal', () => {
    const s = insertCycles(TWO, 1, 1)!;
    expect(waveOf(s, 0)).toBe('0.1');
    expect(waveOf(s, 1)).toBe('1.0');
  });

  it('inserts multiple cycles and appends at the end', () => {
    expect(waveOf(insertCycles(TWO, 1, 2)!, 0)).toBe('0..1');
    expect(waveOf(insertCycles(TWO, 2, 1)!, 0)).toBe('01.');
  });

  it('deletes a column across every signal (inverse of insert)', () => {
    const s = deleteCycles(`{ signal: [ { name: 'a', wave: '0.1' }, { name: 'b', wave: '1.0' } ] }`, 1, 1)!;
    expect(waveOf(s, 0)).toBe('01');
    expect(waveOf(s, 1)).toBe('10');
  });

  it('skips spacer rows but still edits real signals', () => {
    const s = insertCycles(`{ signal: [ {}, { name: 'b', wave: '01' } ] }`, 1, 1)!;
    expect(waveOf(s, 1)).toBe('0.1');
  });

  it('is a no-op past the end for delete and validates args', () => {
    expect(waveOf(deleteCycles(TWO, 9, 1)!, 0)).toBe('01');
    expect(insertCycles(TWO, -1, 1)).toBeNull();
    expect(insertCycles('{ broken', 0, 1)).toBeNull();
  });
});
