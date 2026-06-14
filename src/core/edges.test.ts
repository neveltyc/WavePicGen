import { describe, it, expect } from 'vitest';
import { parseEdge, parseAnchor } from './edges';

describe('parseEdge', () => {
  it('parses a straight edge with an end arrow and label', () => {
    expect(parseEdge('a->b tCO')).toEqual({
      from: 'a',
      to: 'b',
      style: 'straight',
      arrowStart: false,
      arrowEnd: true,
      label: 'tCO',
    });
  });

  it('parses a spline edge', () => {
    const e = parseEdge('a~>b')!;
    expect(e.style).toBe('spline');
    expect(e.arrowEnd).toBe(true);
    expect(e.label).toBe('');
  });

  it('parses a bidirectional edge', () => {
    const e = parseEdge('x<->y span')!;
    expect(e).toMatchObject({ from: 'x', to: 'y', arrowStart: true, arrowEnd: true, label: 'span' });
  });

  it('parses an orthogonal edge', () => {
    expect(parseEdge('a-|b')!.style).toBe('ortho');
    expect(parseEdge('a-|>b')!.style).toBe('ortho');
  });

  it('keeps multi-word labels intact', () => {
    expect(parseEdge('a~>b hold time')!.label).toBe('hold time');
  });

  it('returns null for empty or too-short specs', () => {
    expect(parseEdge('')).toBeNull();
    expect(parseEdge('   ')).toBeNull();
    expect(parseEdge('a')).toBeNull();
  });
});

describe('parseAnchor', () => {
  it('parses a bare node name', () => {
    expect(parseAnchor('a')).toEqual({ kind: 'node', node: 'a' });
  });

  it('parses signal@time including fractional time', () => {
    expect(parseAnchor('CLK@2')).toEqual({ kind: 'time', signal: 'CLK', time: 2 });
    expect(parseAnchor('data@2.75')).toEqual({ kind: 'time', signal: 'data', time: 2.75 });
  });

  it('rejects malformed time anchors', () => {
    expect(parseAnchor('CLK@')).toBeNull();
    expect(parseAnchor('@2')).toBeNull();
    expect(parseAnchor('CLK@-1')).toBeNull();
    expect(parseAnchor('CLK@abc')).toBeNull();
  });
});
