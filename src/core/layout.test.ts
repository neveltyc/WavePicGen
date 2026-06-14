import { describe, it, expect } from 'vitest';
import { normalize } from './model';
import { layout } from './layout';
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
});
