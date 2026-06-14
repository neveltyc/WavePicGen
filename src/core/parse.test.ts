import { describe, it, expect } from 'vitest';
import { parseSource, serializeDoc } from './parse';

describe('parseSource', () => {
  it('parses strict JSON', () => {
    const r = parseSource('{"signal":[{"name":"a","wave":"01"}]}');
    expect(r.error).toBeUndefined();
    expect(r.doc?.signal).toHaveLength(1);
  });

  it('parses JSON5 with comments, unquoted keys and trailing commas', () => {
    const r = parseSource(`{
      // a comment
      signal: [ { name: 'a', wave: '01', }, ],
    }`);
    expect(r.error).toBeUndefined();
    expect(r.doc?.signal[0]).toMatchObject({ name: 'a', wave: '01' });
  });

  it('reports an error for a missing signal array', () => {
    const r = parseSource('{ "config": {} }');
    expect(r.doc).toBeUndefined();
    expect(r.error?.message).toContain('signal');
  });

  it('rejects non-object top-level values', () => {
    expect(parseSource('[1,2,3]').error).toBeDefined();
    expect(parseSource('42').error).toBeDefined();
  });

  it('returns line info on syntax errors', () => {
    const r = parseSource('{ signal: [ }');
    expect(r.error).toBeDefined();
    expect(typeof r.error?.message).toBe('string');
  });

  it('round-trips a document through serialize/parse', () => {
    const src = serializeDoc({ signal: [{ name: 'a', wave: '01' }], config: { hscale: 2 } });
    const r = parseSource(src);
    expect(r.doc).toMatchObject({ signal: [{ name: 'a', wave: '01' }], config: { hscale: 2 } });
  });
});
