import { describe, it, expect } from 'vitest';
import { resolveWave, isBoxKind } from './bricks';
import type { WaveWarning } from './bricks';

describe('resolveWave', () => {
  it('resolves clocks with and without arrows', () => {
    const b = resolveWave('pPnN');
    expect(b.map((x) => x.kind.type)).toEqual(['clock', 'clock', 'clock', 'clock']);
    expect(b[0].kind).toMatchObject({ polarity: 'pos', arrow: false });
    expect(b[1].kind).toMatchObject({ polarity: 'pos', arrow: true });
    expect(b[2].kind).toMatchObject({ polarity: 'neg', arrow: false });
    expect(b[3].kind).toMatchObject({ polarity: 'neg', arrow: true });
  });

  it('extends previous brick with "." and marks it as continuation', () => {
    const b = resolveWave('1...');
    expect(b).toHaveLength(4);
    expect(b[0].cont).toBe(false);
    expect(b.slice(1).every((x) => x.cont)).toBe(true);
    expect(b.every((x) => x.kind.type === 'level')).toBe(true);
  });

  it('maps data tokens to the data array in order', () => {
    const b = resolveWave('=.=.', ['A', 'B']);
    const data = b.filter((x) => x.kind.type === 'data' && !x.cont);
    expect(data).toHaveLength(2);
    expect((data[0].kind as { label?: string }).label).toBe('A');
    expect((data[1].kind as { label?: string }).label).toBe('B');
  });

  it('does not consume data labels for continuation bricks', () => {
    const b = resolveWave('=..=', ['first', 'second']);
    const firstNew = b[0].kind as { label?: string };
    const lastNew = b[3].kind as { label?: string };
    expect(firstNew.label).toBe('first');
    expect(lastNew.label).toBe('second');
  });

  it('assigns palette colour from digit tokens', () => {
    const b = resolveWave('23', ['x', 'y']);
    expect((b[0].kind as { color: number }).color).toBe(2);
    expect((b[1].kind as { color: number }).color).toBe(3);
  });

  it('marks gaps with "|" while keeping the previous state', () => {
    const b = resolveWave('1|0');
    expect(b[1].gap).toBe(true);
    expect(b[1].cont).toBe(true);
    expect(b[1].kind).toEqual(b[0].kind);
  });

  it('warns on unknown characters and falls back to x', () => {
    const warnings: WaveWarning[] = [];
    const b = resolveWave('1Q', [], warnings);
    expect(b[1].kind).toEqual({ type: 'level', level: 'x' });
    expect(warnings).toHaveLength(1);
    expect(warnings[0].message).toContain('Q');
  });

  it('treats a leading "." as empty (no previous state)', () => {
    const b = resolveWave('.');
    expect(b[0].kind.type).toBe('empty');
  });
});

describe('isBoxKind', () => {
  it('classifies data and undefined as boxes', () => {
    expect(isBoxKind({ type: 'data', color: 0 })).toBe(true);
    expect(isBoxKind({ type: 'level', level: 'x' })).toBe(true);
    expect(isBoxKind({ type: 'level', level: '1' })).toBe(false);
    expect(isBoxKind({ type: 'clock', polarity: 'pos', arrow: false })).toBe(false);
  });
});
