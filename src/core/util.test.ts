import { describe, it, expect } from 'vitest';
import { nf, escapeXml, clampInt, MAX_CYCLES } from './util';

describe('nf', () => {
  it('formats integers without decimals and rounds floats to 2dp', () => {
    expect(nf(10)).toBe('10');
    expect(nf(1.23456)).toBe('1.23');
  });

  it('collapses non-finite values to "0" (defensive against bad input)', () => {
    expect(nf(Infinity)).toBe('0');
    expect(nf(-Infinity)).toBe('0');
    expect(nf(NaN)).toBe('0');
  });
});

describe('escapeXml', () => {
  it('escapes the five markup-significant characters', () => {
    expect(escapeXml(`<a b="c">&`)).toBe('&lt;a b=&quot;c&quot;&gt;&amp;');
  });
});

describe('clampInt', () => {
  it('clamps into range and rounds', () => {
    expect(clampInt('3', 1, 256, 4)).toBe(3);
    expect(clampInt(1000, 1, 256, 4)).toBe(256);
    expect(clampInt(0, 1, 256, 4)).toBe(1);
    expect(clampInt(2.6, 1, 256, 4)).toBe(3);
  });

  it('falls back to default for non-finite / non-numeric input', () => {
    expect(clampInt('abc', 1, 256, 4)).toBe(4);
    expect(clampInt(undefined, 1, 256, 4)).toBe(4);
    expect(clampInt(NaN, 1, 256, 4)).toBe(4);
  });
});

describe('MAX_CYCLES', () => {
  it('is a sane positive cap', () => {
    expect(MAX_CYCLES).toBeGreaterThan(0);
    expect(Number.isInteger(MAX_CYCLES)).toBe(true);
  });
});
