/**
 * Document model — the single source of truth.
 *
 * `WaveDoc` is the on-disk / in-editor shape (WaveJSON-compatible, so existing
 * WaveDrom diagrams import directly). `normalize()` turns it into a flat, explicit
 * `NormModel` that the layout engine consumes. Pure: no DOM, no IO.
 */
import { resolveWave } from './bricks';
import type { Brick, WaveWarning } from './bricks';

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

export interface NormModel {
  rows: NormSignal[];
  groups: NormGroup[];
  cycles: number;
  hscale: number;
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
        const isSpacer = item.wave == null || item.wave === '';
        rows.push({
          name: item.name ?? '',
          bricks: isSpacer
            ? []
            : resolveWave(item.wave as string, toDataArray(item.data), warnings),
          period: item.period && item.period > 0 ? item.period : 1,
          phase: item.phase ?? 0,
          depth,
          isSpacer,
        });
      }
    }
  };

  walk(doc.signal ?? [], 0);

  const hscale =
    doc.config?.hscale && doc.config.hscale > 0 ? doc.config.hscale : 1;

  let cycles = 0;
  for (const r of rows) {
    cycles = Math.max(
      cycles,
      Math.ceil(r.bricks.length * r.period + Math.max(0, r.phase)),
    );
  }

  return {
    rows,
    groups,
    cycles,
    hscale,
    head: doc.head,
    foot: doc.foot,
    warnings,
  };
}
