import { describe, it, expect } from 'vitest';
import { render } from './render';
import { examples } from './examples';

describe('render', () => {
  it('renders valid source to an SVG document', () => {
    const r = render(`{ signal: [ { name: 'a', wave: '01' } ] }`);
    expect(r.error).toBeUndefined();
    expect(r.svg.startsWith('<svg')).toBe(true);
    expect(r.svg).toContain('</svg>');
    expect(r.width).toBeGreaterThan(0);
    expect(r.height).toBeGreaterThan(0);
  });

  it('embeds a style block and the hatch pattern def', () => {
    const r = render(`{ signal: [ { name: 'a', wave: 'x' } ] }`);
    expect(r.svg).toContain('<style>');
    expect(r.svg).toContain('wpg-hatch');
  });

  it('escapes text content (no raw injection)', () => {
    const r = render(`{ signal: [ { name: '<b>&', wave: '0' } ] }`);
    expect(r.svg).toContain('&lt;b&gt;&amp;');
    expect(r.svg).not.toContain('<b>&,');
  });

  it('returns an error card (never throws) on bad source', () => {
    const r = render('{ not valid');
    expect(r.error).toBeDefined();
    expect(r.svg).toContain('Cannot render');
  });

  it('surfaces warnings for unknown wave characters', () => {
    const r = render(`{ signal: [ { name: 'a', wave: 'Q' } ] }`);
    expect(r.warnings.length).toBeGreaterThan(0);
    expect(r.warnings[0]).toContain('Q');
  });

  it('renders every built-in example without error', () => {
    for (const ex of examples) {
      const r = render(ex.source);
      expect(r.error, `example ${ex.id}`).toBeUndefined();
      expect(r.svg.startsWith('<svg')).toBe(true);
    }
  });

  it('is deterministic (same input -> identical SVG)', () => {
    const src = examples[0]!.source;
    expect(render(src).svg).toBe(render(src).svg);
  });

  it('produces valid markup: no quoted font-family in element attributes', () => {
    // Regression: font-family contains quotes, so it must live in <style>, not attrs.
    const r = render(examples[0]!.source);
    expect(r.svg).toMatch(/<svg[^>]*viewBox=/);
    expect(r.svg).not.toMatch(/<svg[^>]*font-family=/);
    expect(r.svg).not.toMatch(/font-family="[^"]*"[^>]*"/);
  });

  it('scopes all CSS under .wpg-root so the inlined <style> cannot leak', () => {
    const r = render(examples[0]!.source);
    expect(r.svg).toContain('class="wpg-root"');
    // every rule is prefixed; no bare element/class selector escapes into the page
    expect(r.svg).not.toMatch(/(^|[{}])\s*text\s*\{/);
    expect(r.svg).not.toMatch(/[{};]\s*\.(sig|box|name|data|head)\s*\{/);
  });

  it('never emits Infinity/NaN for absurd numeric input', () => {
    const r = render(`{ signal: [ { name: 'a', wave: '01' } ], config: { hscale: 1e308 } }`);
    expect(r.svg).not.toContain('Infinity');
    expect(r.svg).not.toContain('NaN');
    expect(Number.isFinite(r.width)).toBe(true);
    expect(Number.isFinite(r.height)).toBe(true);
  });

  it('does not crash or hang on a pathologically large period', () => {
    const r = render(`{ signal: [ { name: 'a', wave: '==', data: ['A','B'], period: 1000000 } ] }`);
    expect(r.error).toBeUndefined();
    expect(Number.isFinite(r.width)).toBe(true);
  });

  it('surfaces a warning when bus data labels are missing', () => {
    const r = render(`{ signal: [ { name: 'a', wave: '=.=.=.', data: ['only'] } ] }`);
    expect(r.warnings.some((w) => /data label/i.test(w))).toBe(true);
  });
});
