/**
 * Wave-string resolver.
 *
 * A WaveJSON `wave` string describes a signal one character ("brick") per cycle.
 * This module turns that compact, hand-editable string into an explicit list of
 * per-cycle states that the layout engine can consume. It is pure (no DOM, no IO).
 *
 * Supported characters (a practical superset of the common WaveDrom set):
 *   p P n N  clock (capital = active-edge arrow; p/P positive, n/N negative)
 *   0 1      logic low / high
 *   x        undefined (hatched)
 *   z        high-impedance (mid level)
 *   u d      weak pull-up / pull-down (rendered like 1 / 0)
 *   = 2..9   data/bus value (consumes the next entry of `data`; digit = palette)
 *   .        extend the previous brick (no transition)
 *   |        gap / time-compression mark over the current position
 */

export type BrickKind =
  | { type: 'clock'; polarity: 'pos' | 'neg'; arrow: boolean }
  | { type: 'level'; level: '0' | '1' | 'x' | 'z' | 'u' | 'd' }
  | { type: 'data'; color: number; label?: string }
  | { type: 'empty' };

export interface Brick {
  kind: BrickKind;
  /** Same state as the previous cycle: no transition is drawn at its left edge. */
  cont: boolean;
  /** Draw a gap / time-break mark at this cycle. */
  gap: boolean;
}

export interface WaveWarning {
  message: string;
}

const CLOCK: Record<string, BrickKind> = {
  p: { type: 'clock', polarity: 'pos', arrow: false },
  P: { type: 'clock', polarity: 'pos', arrow: true },
  n: { type: 'clock', polarity: 'neg', arrow: false },
  N: { type: 'clock', polarity: 'neg', arrow: true },
};

const LEVEL: Record<string, BrickKind> = {
  '0': { type: 'level', level: '0' },
  '1': { type: 'level', level: '1' },
  x: { type: 'level', level: 'x' },
  z: { type: 'level', level: 'z' },
  u: { type: 'level', level: 'u' },
  d: { type: 'level', level: 'd' },
};

/** Resolve a wave string + its data labels into explicit per-cycle bricks. */
export function resolveWave(
  wave: string,
  data: string[] = [],
  warnings?: WaveWarning[],
): Brick[] {
  const bricks: Brick[] = [];
  let prev: BrickKind | null = null;
  let dataIndex = 0;

  for (const ch of wave) {
    if (ch === ' ') continue; // tolerate spacing in the source

    if (ch === '.') {
      bricks.push({ kind: prev ?? { type: 'empty' }, cont: true, gap: false });
      continue;
    }
    if (ch === '|') {
      bricks.push({ kind: prev ?? { type: 'empty' }, cont: true, gap: true });
      continue;
    }

    let kind: BrickKind;
    if (CLOCK[ch]) {
      kind = CLOCK[ch];
    } else if (LEVEL[ch]) {
      kind = LEVEL[ch];
    } else if (ch === '=') {
      kind = { type: 'data', color: 0, label: data[dataIndex++] };
    } else if (ch >= '2' && ch <= '9') {
      kind = { type: 'data', color: Number(ch), label: data[dataIndex++] };
    } else {
      warnings?.push({ message: `Unknown wave char '${ch}', rendered as 'x'.` });
      kind = { type: 'level', level: 'x' };
    }

    bricks.push({ kind, cont: false, gap: false });
    prev = kind;
  }

  return bricks;
}

/** True when a brick is drawn as a full-height box (data value or undefined). */
export function isBoxKind(k: BrickKind): boolean {
  return k.type === 'data' || (k.type === 'level' && k.level === 'x');
}
