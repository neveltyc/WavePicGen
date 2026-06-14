import { describe, it, expect } from 'vitest';
import { parseEdge } from './edges';

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
