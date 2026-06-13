/**
 * Public render API: source text -> SVG string (+ size + diagnostics).
 * This is the one function the GUI, a future CLI, and tests all call, which is
 * what keeps GUI and batch output pixel-identical.
 */
import { parseSource } from './parse';
import { normalize } from './model';
import { layout } from './layout';
import { toSvg } from './svg';
import { defaultTheme } from './theme';
import type { Theme } from './theme';

export interface RenderResult {
  svg: string;
  width: number;
  height: number;
  /** Hard parse error (rendering fell back to an error card), if any. */
  error?: string;
  /** Non-fatal warnings (e.g. unknown wave chars). */
  warnings: string[];
}

function errorCard(message: string): { svg: string; width: number; height: number } {
  const width = 460;
  const height = 96;
  const safe = message
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  // Generic (quote-free) font names keep the standalone SVG markup valid.
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<rect x="0" y="0" width="${width}" height="${height}" fill="#fff5f5" stroke="#f0b4b4"/>` +
    `<text x="16" y="34" font-family="sans-serif" font-size="14" font-weight="600" fill="#b42318">Cannot render</text>` +
    `<text x="16" y="60" font-family="monospace" font-size="12" fill="#7a2018">${safe.slice(0, 90)}</text>` +
    `</svg>`;
  return { svg, width, height };
}

/** Render WaveJSON/JSON5 source into an SVG document. Never throws. */
export function render(source: string, theme: Theme = defaultTheme): RenderResult {
  const parsed = parseSource(source);
  if (parsed.error || !parsed.doc) {
    const msg = parsed.error
      ? `${parsed.error.message}${parsed.error.line ? ` (line ${parsed.error.line})` : ''}`
      : 'Parse error';
    const card = errorCard(msg);
    return { ...card, error: msg, warnings: [] };
  }

  try {
    const model = normalize(parsed.doc);
    const result = layout(model, theme);
    return {
      svg: toSvg(result),
      width: result.width,
      height: result.height,
      warnings: model.warnings.map((w) => w.message),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const card = errorCard(msg);
    return { ...card, error: msg, warnings: [] };
  }
}
