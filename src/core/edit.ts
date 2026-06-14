/**
 * Model-level direct edits used by canvas interactions. Pure (no DOM): given the
 * source text and a target, return new source. Going through the document model
 * keeps GUI edits, text and commands on one source of truth.
 */
import { parseSource, serializeDoc } from './parse';
import { signalSpecAt, signalSpecs } from './model';

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

/**
 * Insert `count` held cycles at brick column `at` across every signal (an
 * aligned time column = "add delay"). Each signal holds its prior value via '.'.
 */
export function insertCycles(source: string, at: number, count = 1): string | null {
  if (!Number.isFinite(at) || at < 0 || count < 1) return null;
  const { doc } = parseSource(source);
  if (!doc) return null;
  for (const spec of signalSpecs(doc.signal)) {
    if (typeof spec.wave !== 'string' || spec.wave === '') continue;
    const pos = significantPositions(spec.wave);
    const charIdx = at < pos.length ? pos[at]! : spec.wave.length;
    spec.wave = spec.wave.slice(0, charIdx) + '.'.repeat(count) + spec.wave.slice(charIdx);
  }
  return serializeDoc(doc);
}

/** Delete `count` cycles starting at brick column `at` across every signal. */
export function deleteCycles(source: string, at: number, count = 1): string | null {
  if (!Number.isFinite(at) || at < 0 || count < 1) return null;
  const { doc } = parseSource(source);
  if (!doc) return null;
  for (const spec of signalSpecs(doc.signal)) {
    if (typeof spec.wave !== 'string' || spec.wave === '') continue;
    const pos = significantPositions(spec.wave);
    if (at >= pos.length) continue;
    const start = pos[at]!;
    const endBrick = Math.min(at + count, pos.length);
    const end = endBrick < pos.length ? pos[endBrick]! : spec.wave.length;
    spec.wave = spec.wave.slice(0, start) + spec.wave.slice(end);
  }
  return serializeDoc(doc);
}
