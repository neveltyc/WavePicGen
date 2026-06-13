import { describe, it, expect } from 'vitest';
import { normalize } from './model';
import type { WaveDoc } from './model';

describe('normalize', () => {
  it('flattens a flat signal list', () => {
    const doc: WaveDoc = { signal: [{ name: 'a', wave: '01' }, { name: 'b', wave: '1.' }] };
    const m = normalize(doc);
    expect(m.rows.map((r) => r.name)).toEqual(['a', 'b']);
    expect(m.groups).toHaveLength(0);
    expect(m.cycles).toBe(2);
  });

  it('captures groups with labels and row ranges', () => {
    const doc: WaveDoc = {
      signal: [
        { name: 'clk', wave: 'p.' },
        ['ctrl', { name: 'we', wave: '01' }, { name: 're', wave: '10' }],
      ],
    };
    const m = normalize(doc);
    expect(m.rows.map((r) => r.name)).toEqual(['clk', 'we', 're']);
    expect(m.groups).toHaveLength(1);
    expect(m.groups[0]).toMatchObject({ label: 'ctrl', firstRow: 1, lastRow: 2, depth: 0 });
  });

  it('supports nested groups with increasing depth', () => {
    const doc: WaveDoc = {
      signal: [['outer', { name: 'a', wave: '0' }, ['inner', { name: 'b', wave: '1' }]]],
    };
    const m = normalize(doc);
    expect(m.groups.map((g) => g.label).sort()).toEqual(['inner', 'outer']);
    const inner = m.groups.find((g) => g.label === 'inner')!;
    expect(inner.depth).toBe(1);
    expect(m.rows[1].depth).toBe(2);
  });

  it('treats empty wave / {} as a spacer row', () => {
    const doc: WaveDoc = { signal: [{ name: 'a', wave: '0' }, {}, { name: 'b', wave: '1' }] };
    const m = normalize(doc);
    expect(m.rows).toHaveLength(3);
    expect(m.rows[1].isSpacer).toBe(true);
    expect(m.rows[1].bricks).toHaveLength(0);
  });

  it('accepts data as a whitespace-separated string', () => {
    const doc: WaveDoc = { signal: [{ name: 'bus', wave: '==', data: 'A B' }] };
    const m = normalize(doc);
    const labels = m.rows[0].bricks.map((b) => (b.kind as { label?: string }).label);
    expect(labels).toEqual(['A', 'B']);
  });

  it('honours hscale, period and phase in cycle count', () => {
    const doc: WaveDoc = {
      signal: [{ name: 'a', wave: 'pp', period: 2 }, { name: 'b', wave: '0', phase: 1 }],
      config: { hscale: 3 },
    };
    const m = normalize(doc);
    expect(m.hscale).toBe(3);
    expect(m.rows[0].period).toBe(2);
    expect(m.cycles).toBe(4); // 2 bricks * period 2
  });

  it('defaults invalid hscale/period to 1', () => {
    const doc: WaveDoc = { signal: [{ name: 'a', wave: '0', period: -5 }], config: { hscale: 0 } };
    const m = normalize(doc);
    expect(m.hscale).toBe(1);
    expect(m.rows[0].period).toBe(1);
  });
});
