import { describe, it, expect } from 'vitest';
import { applyCommand } from './commands';
import { parseSource } from './parse';

const EMPTY = `{ signal: [] }`;

function signalsOf(source: string) {
  const r = parseSource(source);
  return r.doc?.signal ?? [];
}

describe('applyCommand', () => {
  it('ignores blank input', () => {
    expect(applyCommand(EMPTY, '   ')).toEqual({});
  });

  it('returns help text', () => {
    const r = applyCommand(EMPTY, 'help');
    expect(r.message).toContain('commands:');
  });

  it('adds a clock with a default cycle count', () => {
    const r = applyCommand(EMPTY, 'add clock CLK');
    expect(r.error).toBeUndefined();
    const sig = signalsOf(r.source!)[0] as { name: string; wave: string };
    expect(sig.name).toBe('CLK');
    expect(sig.wave).toMatch(/^p+$/);
  });

  it('adds a bus with labels and a requested cycle count', () => {
    const r = applyCommand(EMPTY, 'add bus DATA cycles=3');
    const sig = signalsOf(r.source!)[0] as { wave: string; data: string[] };
    expect(sig.wave).toBe('x===x');
    expect(sig.data).toEqual(['D0', 'D1', 'D2']);
  });

  it('adds a signal with an explicit wave', () => {
    const r = applyCommand(EMPTY, 'add signal EN wave=01.0');
    const sig = signalsOf(r.source!)[0] as { name: string; wave: string };
    expect(sig).toMatchObject({ name: 'EN', wave: '01.0' });
  });

  it('errors when add has no name', () => {
    expect(applyCommand(EMPTY, 'add clock').error).toBeDefined();
  });

  it('falls back to the default cycle count for a non-numeric cycles=', () => {
    const r = applyCommand(EMPTY, 'add clock CLK cycles=abc');
    const sig = signalsOf(r.source!)[0] as { wave: string };
    expect(sig.wave).toBe('pppp'); // default 4, not '' from NaN
  });

  it('sets hscale and head text', () => {
    const r1 = applyCommand(EMPTY, 'set hscale=2');
    expect(parseSource(r1.source!).doc?.config?.hscale).toBe(2);
    const r2 = applyCommand(EMPTY, 'set head="My Figure"');
    expect(parseSource(r2.source!).doc?.head?.text).toBe('My Figure');
  });

  it('rejects an invalid hscale', () => {
    expect(applyCommand(EMPTY, 'set hscale=-1').error).toBeDefined();
  });

  it('loads an example by id', () => {
    const r = applyCommand(EMPTY, 'example bus');
    expect(r.source).toContain('bus');
    expect(r.message).toContain('bus');
  });

  it('rejects an unknown example', () => {
    expect(applyCommand(EMPTY, 'example nope').error).toBeDefined();
  });

  it('produces an export request', () => {
    const r = applyCommand(EMPTY, 'export png scale=3');
    expect(r.exportRequest).toEqual({ format: 'png', scale: 3 });
  });

  it('refuses to mutate when the source is broken', () => {
    const r = applyCommand('{ broken', 'add clock CLK');
    expect(r.error).toContain('Fix the source');
  });

  it('reports unknown commands', () => {
    expect(applyCommand(EMPTY, 'frobnicate').error).toContain('Unknown command');
  });
});
