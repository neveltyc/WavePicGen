/**
 * Model-level direct edits used by canvas interactions. Pure (no DOM): given the
 * source text and a (row, brick) target, return new source. Going through the
 * document model keeps GUI edits, text and commands on one source of truth.
 */
import { parseSource, serializeDoc } from './parse';
import type { Lane, SignalSpec } from './model';

/** States that a click cycles through, in order. */
export const CLICK_STATES = ['0', '1', 'x', 'z'] as const;

/** Find the row-th signal in document order (matching normalize's traversal). */
function nthSignal(lanes: Lane[], target: number): SignalSpec | null {
  let idx = -1;
  let found: SignalSpec | null = null;
  const walk = (items: Array<string | Lane>): void => {
    for (const item of items) {
      if (found) return;
      if (Array.isArray(item)) walk(item);
      else if (item && typeof item === 'object') {
        idx++;
        if (idx === target) found = item;
      }
      // group-label strings and malformed primitives are skipped (no row)
    }
  };
  walk(lanes);
  return found;
}

/**
 * Cycle the state of one brick (0 -> 1 -> x -> z -> 0). `brick` is the index
 * among the wave's significant characters. Returns new source, or null when the
 * target is not an editable signal brick.
 */
export function cycleBrick(source: string, row: number, brick: number): string | null {
  const { doc } = parseSource(source);
  if (!doc) return null;
  const spec = nthSignal(doc.signal, row);
  if (!spec || typeof spec.wave !== 'string' || spec.wave === '') return null;

  const wave = spec.wave;
  let count = -1;
  let pos = -1;
  for (let i = 0; i < wave.length; i++) {
    if (wave[i] !== ' ') {
      count++;
      if (count === brick) {
        pos = i;
        break;
      }
    }
  }
  if (pos < 0) return null;

  const cur = wave[pos]!;
  const i = (CLICK_STATES as readonly string[]).indexOf(cur);
  const next = i >= 0 ? CLICK_STATES[(i + 1) % CLICK_STATES.length] : '0';
  spec.wave = wave.slice(0, pos) + next + wave.slice(pos + 1);
  return serializeDoc(doc);
}
