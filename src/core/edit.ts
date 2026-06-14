/**
 * Model-level direct edits used by canvas interactions. Pure (no DOM): given the
 * source text and a target, return new source. Going through the document model
 * keeps GUI edits, text and commands on one source of truth.
 */
import { parseSource, serializeDoc } from './parse';
import { signalSpecAt } from './model';

/** States that a click cycles through, in order. */
export const CLICK_STATES = ['0', '1', 'x', 'z'] as const;

const LEVEL_CHARS = new Set(['0', '1', 'x', 'z', 'u', 'd']);

/** Indexes of the significant (non-space) characters of a wave string. */
function significantPositions(wave: string): number[] {
  const pos: number[] = [];
  for (let i = 0; i < wave.length; i++) if (wave[i] !== ' ') pos.push(i);
  return pos;
}

/**
 * Cycle the state of one brick (0 -> 1 -> x -> z -> 0). `brick` is the index
 * among the wave's significant characters. Returns new source, or null when the
 * target is not an editable signal brick.
 */
export function cycleBrick(source: string, row: number, brick: number): string | null {
  const { doc } = parseSource(source);
  if (!doc) return null;
  const spec = signalSpecAt(doc.signal, row);
  if (!spec || typeof spec.wave !== 'string' || spec.wave === '') return null;

  const pos = significantPositions(spec.wave);
  if (brick < 0 || brick >= pos.length) return null;
  const at = pos[brick]!;
  const cur = spec.wave[at]!;
  const i = (CLICK_STATES as readonly string[]).indexOf(cur);
  const next = i >= 0 ? CLICK_STATES[(i + 1) % CLICK_STATES.length] : '0';
  spec.wave = spec.wave.slice(0, at) + next + spec.wave.slice(at + 1);
  return serializeDoc(doc);
}

/**
 * Drag-to-edit: paint the anchor brick's level across bricks [anchor..target]
 * (in either direction), which moves a transition / extends a state run. Only
 * level signals (0/1/x/z/u/d) are paintable. Returns new source, or null.
 */
export function dragPaint(
  source: string,
  row: number,
  anchor: number,
  target: number,
): string | null {
  const { doc } = parseSource(source);
  if (!doc) return null;
  const spec = signalSpecAt(doc.signal, row);
  if (!spec || typeof spec.wave !== 'string' || spec.wave === '') return null;

  const pos = significantPositions(spec.wave);
  if (anchor < 0 || anchor >= pos.length) return null;

  // Resolve the anchor's level by walking back over '.' continuations.
  let a = anchor;
  let ch = spec.wave[pos[a]!]!;
  while (ch === '.' && a > 0) {
    a -= 1;
    ch = spec.wave[pos[a]!]!;
  }
  if (!LEVEL_CHARS.has(ch)) return null;

  const lo = Math.max(0, Math.min(anchor, target));
  const hi = Math.min(pos.length - 1, Math.max(anchor, target));
  const chars = spec.wave.split('');
  for (let b = lo; b <= hi; b++) chars[pos[b]!] = ch;
  spec.wave = chars.join('');
  return serializeDoc(doc);
}
