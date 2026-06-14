import { describe, it, expect } from 'vitest';
import { normalize } from './model';
import { MAX_CYCLES } from './util';
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

  it('clamps absurd period/hscale so cycles never explodes (OOM guard)', () => {
    const m = normalize({ signal: [{ name: 'a', wave: '==', period: 1e9 }] });
    expect(Number.isFinite(m.cycles)).toBe(true);
    expect(m.cycles).toBeLessThanOrEqual(MAX_CYCLES);
    expect(m.rows[0].period).toBeLessThanOrEqual(256);
    const m2 = normalize({ signal: [{ name: 'a', wave: '01' }], config: { hscale: 1e308 } });
    expect(m2.hscale).toBe(100);
  });

  it('caps total cycles at MAX_CYCLES with a warning', () => {
    const m = normalize({ signal: [{ name: 'a', wave: '0'.repeat(100), period: 256 }] });
    expect(m.cycles).toBe(MAX_CYCLES); // 100 * 256 = 25600 -> capped
    expect(m.warnings.some((w) => /clamped/i.test(w.message))).toBe(true);
  });

  it('clamps negative phase to 0 with a warning', () => {
    const m = normalize({ signal: [{ name: 'a', wave: '01', phase: -5 }] });
    expect(m.rows[0].phase).toBe(0);
    expect(m.warnings.some((w) => /phase/i.test(w.message))).toBe(true);
  });

  it('ignores non-object signal entries instead of crashing', () => {
    const m = normalize({ signal: [1, null, 'x', { name: 'ok', wave: '0' }] as never });
    expect(m.rows.map((r) => r.name)).toEqual(['ok']);
    expect(m.warnings.length).toBeGreaterThanOrEqual(3);
  });

  it('truncates an oversized wave string', () => {
    const huge = '0'.repeat(MAX_CYCLES + 500);
    const m = normalize({ signal: [{ name: 'a', wave: huge }] });
    expect(m.rows[0].bricks.length).toBe(MAX_CYCLES);
    expect(m.warnings.some((w) => /truncated/i.test(w.message))).toBe(true);
  });
});
