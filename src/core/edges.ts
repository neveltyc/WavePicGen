/**
 * Edge (relation) syntax parsing — the WaveDrom-compatible `edge`/`node` model
 * that turns waveforms into timing *specifications*: causal arrows and
 * setup/hold/delay annotations between named points. Pure, no DOM.
 *
 * An edge string is `<from><shape><to> <label>`, e.g.
 *   "a~>b tSU"   spline with end arrow, label "tSU"
 *   "a->b"       straight with end arrow
 *   "a<->b"      straight, arrows both ends
 *   "a-|>b"      orthogonal (elbow) with end arrow
 * `from`/`to` are single node characters defined in a signal's `node` string.
 */

export type EdgeStyle = 'straight' | 'spline' | 'ortho';

export interface ParsedEdge {
  from: string;
  to: string;
  style: EdgeStyle;
  arrowStart: boolean;
  arrowEnd: boolean;
  label: string;
}

/** A relation anchor: a node character, or `signalName@time` (time in cycles). */
export type ParsedAnchor =
  | { kind: 'node'; node: string }
  | { kind: 'time'; signal: string; time: number };

export function parseAnchor(spec: string): ParsedAnchor | null {
  const at = spec.indexOf('@');
  if (at >= 0) {
    const signal = spec.slice(0, at).trim();
    const timeStr = spec.slice(at + 1).trim();
    const time = Number(timeStr);
    if (!signal || timeStr === '' || !Number.isFinite(time) || time < 0) return null;
    return { kind: 'time', signal, time };
  }
  const node = spec.trim();
  return node ? { kind: 'node', node } : null;
}

/** Parse one edge string; returns null when it has no valid connection. */
export function parseEdge(spec: string): ParsedEdge | null {
  const trimmed = spec.trim();
  if (!trimmed) return null;

  const ws = trimmed.search(/\s/);
  const conn = ws === -1 ? trimmed : trimmed.slice(0, ws);
  const label = ws === -1 ? '' : trimmed.slice(ws + 1).trim();
  if (conn.length < 2) return null;

  const from = conn[0]!;
  const to = conn[conn.length - 1]!;
  const shape = conn.slice(1, -1);

  const style: EdgeStyle = shape.includes('~')
    ? 'spline'
    : shape.includes('|')
      ? 'ortho'
      : 'straight';

  return {
    from,
    to,
    style,
    arrowStart: shape.includes('<'),
    arrowEnd: shape.includes('>'),
    label,
  };
}
