/**
 * Document model — the single source of truth.
 *
 * `WaveDoc` is the on-disk / in-editor shape (WaveJSON-compatible, so existing
 * WaveDrom diagrams import directly). `normalize()` turns it into a flat, explicit
 * `NormModel` that the layout engine consumes. Pure: no DOM, no IO.
 */
import { resolveWave } from './bricks';
import type { Brick, WaveWarning } from './bricks';
import { MAX_CYCLES } from './util';

export interface SignalSpec {
  name?: string;
  wave?: string;
  data?: string | string[];
  /** Each brick spans `period` base-cycles (default 1). */
  period?: number;
  /** Shift the signal by `phase` cycles (may be fractional → a taste of sub-cycle). */
  phase?: number;
  node?: string;
}

/** A lane is either a single signal or a (possibly nested) group array. */
export type Lane = SignalSpec | LaneArray;
export interface LaneArray extends Array<string | Lane> {}

export interface Config {
  hscale?: number;
  skin?: string;
}

export interface HeadFoot {
  text?: string;
  /** When a number, render cycle ticks starting from this value. */
  tick?: number;
}

export interface WaveDoc {
  signal: Lane[];
  config?: Config;
  head?: HeadFoot;
  foot?: HeadFoot;
  edge?: string[];
}

export interface NormSignal {
  name: string;
  bricks: Brick[];
  period: number;
  phase: number;
  depth: number;
  isSpacer: boolean;
}

export interface NormGroup {
  label: string;
  firstRow: number;
  lastRow: number;
  depth: number;
}

/** A named anchor point (from a signal's `node` string) for drawing edges. */
export interface NodeAnchor {
  row: number;
  char: number;
}

export interface NormModel {
  rows: NormSignal[];
  groups: NormGroup[];
  cycles: number;
  hscale: number;
  nodes: Record<string, NodeAnchor>;
  edges: string[];
  head?: HeadFoot;
  foot?: HeadFoot;
  warnings: WaveWarning[];
}

function toDataArray(d: string | string[] | undefined): string[] {
  if (d == null) return [];
  if (Array.isArray(d)) return d.map(String);
  return d.split(/\s+/).filter((s) => s.length > 0);
}

function isLaneArray(x: Lane): x is LaneArray {
  return Array.isArray(x);
}

/** Flatten a WaveDoc into an explicit, layout-ready model. */
export function normalize(doc: WaveDoc): NormModel {
  const rows: NormSignal[] = [];
  const groups: NormGroup[] = [];
  const nodes: Record<string, NodeAnchor> = {};
  const warnings: WaveWarning[] = [];

  const walk = (items: Lane[], depth: number): void => {
    for (const item of items) {
      if (isLaneArray(item)) {
        let label = '';
        let rest: Array<string | Lane> = item;
        if (item.length > 0 && typeof item[0] === 'string') {
          label = item[0];
          rest = item.slice(1);
        }
        const firstRow = rows.length;
        const children = rest.filter((x): x is Lane => typeof x !== 'string');
        walk(children, depth + 1);
        const lastRow = rows.length - 1;
        if (label && lastRow >= firstRow) {
          groups.push({ label, firstRow, lastRow, depth });
        }
      } else {
        // Runtime guard: malformed JSON can put primitives/null in `signal`.
        const raw = item as unknown;
        if (raw === null || typeof raw !== 'object') {
          warnings.push({ message: `Ignored non-object signal entry: ${JSON.stringify(raw)}.` });
          continue;
        }
        const name = item.name ?? '';
        const isSpacer = item.wave == null || item.wave === '';
        let waveStr = isSpacer ? '' : String(item.wave);
        if (waveStr.length > MAX_CYCLES) {
          warnings.push({ message: `Wave for "${name}" truncated to ${MAX_CYCLES} cycles.` });
          waveStr = waveStr.slice(0, MAX_CYCLES);
        }
        const period =
          typeof item.period === 'number' && Number.isFinite(item.period) && item.period > 0
            ? Math.min(Math.floor(item.period), 256)
            : 1;
        let phase = typeof item.phase === 'number' && Number.isFinite(item.phase) ? item.phase : 0;
        if (phase < 0) {
          warnings.push({ message: `Negative phase on "${name}" clamped to 0.` });
          phase = 0;
        }
        phase = Math.min(phase, MAX_CYCLES);
        const rowIndex = rows.length;
        rows.push({
          name,
          bricks: isSpacer ? [] : resolveWave(waveStr, toDataArray(item.data), warnings),
          period,
          phase,
          depth,
          isSpacer,
        });
        if (typeof item.node === 'string') {
          for (let i = 0; i < item.node.length; i++) {
            const ch = item.node[i];
            if (ch && ch !== '.' && ch !== ' ' && !(ch in nodes)) {
              nodes[ch] = { row: rowIndex, char: i };
            }
          }
        }
      }
    }
  };

  walk(doc.signal ?? [], 0);

  const rawHscale = doc.config?.hscale;
  const hscale =
    typeof rawHscale === 'number' && Number.isFinite(rawHscale) && rawHscale > 0
      ? Math.min(rawHscale, 100)
      : 1;

  let cycles = 0;
  for (const r of rows) {
    cycles = Math.max(cycles, Math.ceil(r.bricks.length * r.period + r.phase));
  }
  if (cycles > MAX_CYCLES) {
    warnings.push({ message: `Diagram clamped to ${MAX_CYCLES} cycles.` });
    cycles = MAX_CYCLES;
  }

  return {
    rows,
    groups,
    cycles,
    hscale,
    nodes,
    edges: Array.isArray(doc.edge) ? doc.edge : [],
    head: doc.head,
    foot: doc.foot,
    warnings,
  };
}
