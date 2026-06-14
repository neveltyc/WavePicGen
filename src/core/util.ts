/** Shared, side-effect-free helpers used across the engine (no DOM, no IO). */

/** Hard cap on rendered cycles, protecting against pathological inputs. */
export const MAX_CYCLES = 4096;

/**
 * Format a number for SVG output. Non-finite values collapse to "0" so a bad
 * input (huge/NaN hscale, period, phase) can never emit invalid markup like
 * width="Infinity".
 */
export function nf(x: number): string {
  if (!Number.isFinite(x)) return '0';
  return Number.isInteger(x) ? String(x) : x.toFixed(2);
}

/** Escape text for safe inclusion in XML/SVG text content or attribute values. */
export function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Parse to a finite integer clamped to [min, max], falling back to dflt. */
export function clampInt(v: unknown, min: number, max: number, dflt: number): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(max, Math.max(min, Math.round(n)));
}
