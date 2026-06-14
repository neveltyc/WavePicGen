import { describe, it, expect } from 'vitest';
import { normalize } from './model';
import { layout, hitTest } from './layout';
import type { Shape } from './layout';
import type { WaveDoc } from './model';

function build(doc: WaveDoc) {
  return layout(normalize(doc));
}

function count(shapes: Shape[], t: Shape['t'], cls?: string): number {
  return shapes.filter((s) => s.t === t && (cls === undefined || s.cls === cls)).length;
}

describe('layout', () => {
  it('produces a positive canvas size and a background rect', () => {
    const r = build({ signal: [{ name: 'a', wave: '01' }] });
    expect(r.width).toBeGreaterThan(0);
    expect(r.height).toBeGreaterThan(0);
    expect(count(r.shapes, 'rect', 'bg')).toBe(1);
  });

  it('emits a signal polyline for level waves', () => {
    const r = build({ signal: [{ name: 'a', wave: '01' }] });
    expect(count(r.shapes, 'poly', 'sig')).toBeGreaterThanOrEqual(1);
  });

  it('emits clock arrows only for capital P/N', () => {
    const withArrow = build({ signal: [{ name: 'a', wave: 'P' }] });
    const noArrow = build({ signal: [{ name: 'a', wave: 'p' }] });
    expect(count(withArrow.shapes, 'poly', 'arrow')).toBe(1);
    expect(count(noArrow.shapes, 'poly', 'arrow')).toBe(0);
  });

  it('renders one merged bus hexagon for a held data value', () => {
    const r = build({ signal: [{ name: 'bus', wave: '=...', data: ['HELD'] }] });
    expect(count(r.shapes, 'poly', 'box')).toBe(1);
    const labels = r.shapes.filter((s) => s.t === 'text' && s.cls === 'data');
    expect(labels).toHaveLength(1);
    expect((labels[0] as { s: string }).s).toBe('HELD');
  });

  it('renders distinct hexagons for changing data values', () => {
    const r = build({ signal: [{ name: 'bus', wave: '=.=.', data: ['A', 'B'] }] });
    expect(count(r.shapes, 'poly', 'box')).toBe(2);
  });

  it('uses the hatch pattern for undefined x', () => {
    const r = build({ signal: [{ name: 'a', wave: 'x' }] });
    const box = r.shapes.find((s) => s.t === 'poly' && s.cls === 'box') as { fill?: string } | undefined;
    expect(box?.fill).toBe('url(#wpg-hatch)');
  });

  it('draws cycle ticks when head.tick is set', () => {
    const r = build({ signal: [{ name: 'a', wave: '0000' }], head: { tick: 0 } });
    expect(count(r.shapes, 'text', 'tick')).toBe(4);
  });

  it('draws a group bracket path and rotated label', () => {
    const r = build({ signal: [['grp', { name: 'a', wave: '0' }, { name: 'b', wave: '1' }]] });
    expect(count(r.shapes, 'path', 'grp')).toBe(1);
    const label = r.shapes.find((s) => s.t === 'text' && s.cls === 'grp-label') as { rotate?: number } | undefined;
    expect(label?.rotate).toBe(-90);
  });

  it('adds gap marks for "|"', () => {
    const r = build({ signal: [{ name: 'a', wave: '0|0' }] });
    expect(count(r.shapes, 'rect', 'gapbg')).toBe(1);
    expect(count(r.shapes, 'line', 'gap')).toBe(2);
  });

  it('honours a gap on the leading brick (regression)', () => {
    const r = build({ signal: [{ name: 'a', wave: '|0' }] });
    expect(count(r.shapes, 'rect', 'gapbg')).toBe(1);
  });

  it('draws the weak-pull dot once per transition, not per held cycle', () => {
    const r = build({ signal: [{ name: 'a', wave: 'u...' }] });
    expect(count(r.shapes, 'rect', 'weak')).toBe(1);
  });

  it('scales wave width with hscale', () => {
    const narrow = build({ signal: [{ name: 'a', wave: '0000' }] });
    const wide = build({ signal: [{ name: 'a', wave: '0000' }], config: { hscale: 2 } });
    expect(wide.width).toBeGreaterThan(narrow.width);
  });

  it('draws an edge path, arrowhead and label between two nodes', () => {
    const r = build({
      signal: [
        { name: 'a', wave: 'pppp', node: '.a..' },
        { name: 'b', wave: '0101', node: '...b' },
      ],
      edge: ['a~>b tCO'],
    });
    expect(count(r.shapes, 'path', 'edge')).toBe(1);
    expect(count(r.shapes, 'poly', 'edge-arrow')).toBe(1);
    const label = r.shapes.find((s) => s.t === 'text' && s.cls === 'edge-label') as { s: string } | undefined;
    expect(label?.s).toBe('tCO');
  });

  it('skips an edge that references an undefined node', () => {
    const r = build({
      signal: [{ name: 'a', wave: 'pppp', node: '.a..' }],
      edge: ['a~>zzz'],
    });
    expect(count(r.shapes, 'path', 'edge')).toBe(0);
  });

  it('emits two arrowheads for a bidirectional edge', () => {
    const r = build({
      signal: [
        { name: 'a', wave: '0123', node: 'a...' },
        { name: 'b', wave: '0123', node: '...b' },
      ],
      edge: ['a<->b'],
    });
    expect(count(r.shapes, 'poly', 'edge-arrow')).toBe(2);
  });

  it('skips edges anchored on a spacer row', () => {
    const r = build({
      signal: [{ name: 'sp', node: 'a' }, { name: 'b', wave: '01', node: '.b' }],
      edge: ['a->b'],
    });
    expect(count(r.shapes, 'path', 'edge')).toBe(0);
  });

  it('draws a ruler relation with caps and arrowheads', () => {
    const r = build({
      signal: [{ name: 'm', wave: '0000' }],
      relations: [{ type: 'ruler', from: 'm@1', to: 'm@3', label: '2 cyc' }],
    });
    expect(count(r.shapes, 'line', 'ruler')).toBe(3); // span + 2 caps
    expect(count(r.shapes, 'poly', 'ruler-arrow')).toBe(2);
    const label = r.shapes.find((s) => s.t === 'text' && s.cls === 'ruler-label') as { s: string } | undefined;
    expect(label?.s).toBe('2 cyc');
  });

  it('draws a typed @time relation as an arrow', () => {
    const r = build({
      signal: [{ name: 'clk', wave: 'pppp' }, { name: 'd', wave: '0101' }],
      relations: [{ type: 'setup', from: 'd@2', to: 'clk@2', label: 'tSU' }],
    });
    expect(count(r.shapes, 'path', 'edge')).toBe(1);
    expect(count(r.shapes, 'poly', 'edge-arrow')).toBe(1);
  });

  it('skips relations referencing an unknown signal name', () => {
    const r = build({
      signal: [{ name: 'clk', wave: 'pppp' }],
      relations: [{ type: 'arrow', from: 'nope@1', to: 'clk@2' }],
    });
    expect(count(r.shapes, 'path', 'edge')).toBe(0);
  });
});

describe('hitTest', () => {
  it('is the exact inverse of brick placement (incl. period/phase)', () => {
    const r = build({
      signal: [{ name: 'a', wave: 'pppp' }, {}, { name: 'b', wave: '00', period: 2, phase: 1 }],
    });
    const hm = r.hitMap;
    for (const [row, brick] of [[0, 0], [0, 3], [2, 0], [2, 1]] as const) {
      const rr = hm.rows[row];
      const x = hm.x0 + (rr.phase + (brick + 0.5) * rr.period) * hm.cw;
      const y = hm.topY + row * hm.rowH + hm.waveHeight / 2;
      expect(hitTest(hm, x, y)).toEqual({ row, brick });
    }
  });

  it('returns null in the gap between lanes and outside the diagram', () => {
    const r = build({ signal: [{ name: 'a', wave: '01' }, { name: 'b', wave: '01' }] });
    const hm = r.hitMap;
    const gapY = hm.topY + hm.waveHeight + (hm.rowH - hm.waveHeight) / 2; // laneGap
    expect(hitTest(hm, hm.x0 + hm.cw / 2, gapY)).toBeNull();
    expect(hitTest(hm, -50, hm.topY)).toBeNull();
    expect(hitTest(hm, hm.x0 + 1e6, hm.topY + 1)).toBeNull();
  });

  it('returns null on spacer rows', () => {
    const r = build({ signal: [{}, { name: 'b', wave: '01' }] });
    const hm = r.hitMap;
    expect(hitTest(hm, hm.x0 + hm.cw / 2, hm.topY + hm.waveHeight / 2)).toBeNull();
  });
});
