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

/** A typed relation/measurement between two anchors (node name or `signal@time`). */
export interface Relation {
  type?: 'arrow' | 'setup' | 'hold' | 'delay' | 'ruler';
  from: string;
  to: string;
  label?: string;
}

export interface WaveDoc {
  signal: Lane[];
  config?: Config;
  head?: HeadFoot;
  foot?: HeadFoot;
  edge?: string[];
  relations?: Relation[];
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
  relations: Relation[];
  /** Signal name -> row index (first occurrence), for `name@time` anchors. */
  names: Record<string, number>;
  head?: HeadFoot;
  foot?: HeadFoot;
  warnings: WaveWarning[];
}

function toDataArray(d: string | string[] | undefined): string[] {
  if (d == null) return [];
  if (Array.isArray(d)) return d.map(String);
  return d.split(/\s+/).filter((s) => s.length > 0);
}

interface FlatLane {
  spec: SignalSpec;
  depth: number;
}

/**
 * The single canonical lane traversal: depth-first, each object is a row, arrays
 * are groups (an optional leading string is the label). Both `normalize` and
 * `signalSpecAt` use this so row indices always agree (no drift between rendering
 * and editing).
 */
function flattenLanes(
  lanes: Lane[],
  warnings?: WaveWarning[],
): { flats: FlatLane[]; groups: NormGroup[] } {
  const flats: FlatLane[] = [];
  const groups: NormGroup[] = [];
  const walk = (items: unknown[], depth: number): void => {
    for (const item of items) {
      if (Array.isArray(item)) {
        let rest: unknown[] = item;
        let label = '';
        if (item.length > 0 && typeof item[0] === 'string') {
          label = item[0];
          rest = item.slice(1);
        }
        const firstRow = flats.length;
        walk(rest, depth + 1);
        const lastRow = flats.length - 1;
        if (label && lastRow >= firstRow) groups.push({ label, firstRow, lastRow, depth });
      } else if (item !== null && typeof item === 'object') {
        flats.push({ spec: item as SignalSpec, depth });
      } else {
        // Anything that is not a group (array) or a signal (object) is malformed;
        // group labels are sliced off above, so any string here is also stray.
        warnings?.push({ message: `Ignored invalid signal entry: ${JSON.stringify(item)}.` });
      }
    }
  };
  walk(lanes, 0);
  return { flats, groups };
}

/** The row-th signal in document order, or null. Mirrors `normalize`'s rows. */
export function signalSpecAt(lanes: Lane[], row: number): SignalSpec | null {
  return flattenLanes(lanes).flats[row]?.spec ?? null;
}

/** All signal specs in document (row) order. */
export function signalSpecs(lanes: Lane[]): SignalSpec[] {
  return flattenLanes(lanes).flats.map((f) => f.spec);
}

/** Flatten a WaveDoc into an explicit, layout-ready model. */
export function normalize(doc: WaveDoc): NormModel {
  const warnings: WaveWarning[] = [];
  const { flats, groups } = flattenLanes(doc.signal ?? [], warnings);
  const rows: NormSignal[] = [];
  const nodes: Record<string, NodeAnchor> = {};
  const names: Record<string, number> = {};

  flats.forEach(({ spec, depth }, rowIndex) => {
    const name = spec.name ?? '';
    if (name && !(name in names)) names[name] = rowIndex;
    const isSpacer = spec.wave == null || spec.wave === '';
    let waveStr = isSpacer ? '' : String(spec.wave);
    if (waveStr.length > MAX_CYCLES) {
      warnings.push({ message: `Wave for "${name}" truncated to ${MAX_CYCLES} cycles.` });
      waveStr = waveStr.slice(0, MAX_CYCLES);
    }
    const period =
      typeof spec.period === 'number' && Number.isFinite(spec.period) && spec.period > 0
        ? Math.min(Math.floor(spec.period), 256)
        : 1;
    let phase = typeof spec.phase === 'number' && Number.isFinite(spec.phase) ? spec.phase : 0;
    if (phase < 0) {
      warnings.push({ message: `Negative phase on "${name}" clamped to 0.` });
      phase = 0;
    }
    phase = Math.min(phase, MAX_CYCLES);
    rows.push({
      name,
      bricks: isSpacer ? [] : resolveWave(waveStr, toDataArray(spec.data), warnings),
      period,
      phase,
      depth,
      isSpacer,
    });

    // Node anchors are stored as BRICK columns. resolveWave collapses spaces, so
    // align the node string to the wave and count non-space wave chars.
    if (typeof spec.node === 'string') {
      let brickCol = 0;
      for (let i = 0; i < spec.node.length; i++) {
        const nc = spec.node[i];
        if (nc && nc !== '.' && nc !== ' ' && !(nc in nodes)) {
          nodes[nc] = { row: rowIndex, char: brickCol };
        }
        if (waveStr[i] !== undefined && waveStr[i] !== ' ') brickCol++;
      }
    }
  });

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
    relations: Array.isArray(doc.relations) ? doc.relations : [],
    names,
    head: doc.head,
    foot: doc.foot,
    warnings,
  };
}
