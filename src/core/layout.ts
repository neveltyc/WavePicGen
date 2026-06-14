/**
 * Layout engine: NormModel -> a flat list of primitive `Shape`s (a pure-data
 * scene graph). This is where the "manual quality" geometry lives: edge slopes,
 * clock pulses, bus hexagons, gaps, grid and group brackets. No DOM, no IO.
 *
 * Keeping the output as plain data (not SVG strings) means it is trivially
 * unit-testable and the SVG serializer (svg.ts) stays a dumb, separate step.
 */
import { isBoxKind } from './bricks';
import type { Brick } from './bricks';
import { parseEdge, parseAnchor } from './edges';
import type { ParsedEdge } from './edges';
import type { NodeAnchor, NormModel, NormSignal } from './model';
import { defaultTheme } from './theme';
import type { Theme } from './theme';
import { nf } from './util';

export type Point = [number, number];

export type Shape =
  | { t: 'rect'; x: number; y: number; w: number; h: number; rx?: number; cls?: string; fill?: string }
  | { t: 'poly'; pts: Point[]; closed?: boolean; cls?: string; fill?: string }
  | { t: 'path'; d: string; cls?: string; fill?: string }
  | { t: 'line'; x1: number; y1: number; x2: number; y2: number; cls?: string }
  | { t: 'text'; x: number; y: number; s: string; cls?: string; anchor?: 'start' | 'middle' | 'end'; rotate?: number };

/** Geometry needed to map a click in the rendered SVG back to a (row, brick). */
export interface HitMap {
  x0: number;
  cw: number;
  topY: number;
  rowH: number;
  waveHeight: number;
  rows: Array<{ period: number; phase: number; bricks: number; isSpacer: boolean }>;
}

export interface LayoutResult {
  width: number;
  height: number;
  shapes: Shape[];
  theme: Theme;
  hitMap: HitMap;
}

/** Map a point in the rendered SVG (user coordinates) back to a (row, brick). */
export function hitTest(hm: HitMap, x: number, y: number): { row: number; brick: number } | null {
  const row = Math.floor((y - hm.topY) / hm.rowH);
  if (row < 0 || row >= hm.rows.length) return null;
  const rowTop = hm.topY + row * hm.rowH;
  if (y < rowTop || y > rowTop + hm.waveHeight) return null;
  const r = hm.rows[row];
  if (r.isSpacer || r.bricks === 0) return null;
  const brick = Math.floor((x - hm.x0 - r.phase * hm.cw) / (hm.cw * r.period));
  if (brick < 0 || brick >= r.bricks) return null;
  return { row, brick };
}

function levelY(level: string, yHi: number, yLo: number, yMid: number): number {
  switch (level) {
    case '1':
    case 'u':
      return yHi;
    case '0':
    case 'd':
      return yLo;
    default:
      return yMid; // z and fallbacks sit on the mid line
  }
}

export function layout(model: NormModel, theme: Theme = defaultTheme): LayoutResult {
  const t = theme;
  const cw = t.cycleWidth * model.hscale;
  const rowH = t.waveHeight + t.laneGap;

  // ---- name column + group gutter sizing ----
  let maxNameW = 0;
  for (const r of model.rows) {
    maxNameW = Math.max(maxNameW, r.depth * t.groupIndent + r.name.length * t.charWidth);
  }
  const hasGroups = model.groups.length > 0;
  const maxGroupDepth = model.groups.reduce((m, g) => Math.max(m, g.depth), -1);
  // Far-left band holds the (rotated) group labels; the bracket band sits to its right.
  const labelBand = hasGroups ? t.nameFontSize + 8 : 0;
  const groupArea = hasGroups ? labelBand + (maxGroupDepth + 1) * t.groupGap : 0;
  const nameColW = Math.max(48, maxNameW + t.namePadLeft);

  const headH = model.head?.text ? t.headFontSize + 8 : 0;
  const tickH = model.head && typeof model.head.tick === 'number' ? t.tickFontSize + 6 : 0;

  const x0 = groupArea + nameColW + t.gutter; // wave area left edge
  const waveW = model.cycles * cw;
  const width = Math.ceil(x0 + waveW + 8);
  const topY = t.marginTop + headH + tickH;
  const bodyH = model.rows.length * rowH - t.laneGap;
  const height = Math.ceil(topY + bodyH + t.marginBottom + (model.foot?.text ? t.headFontSize + 6 : 0));

  const shapes: Shape[] = [];
  shapes.push({ t: 'rect', x: 0, y: 0, w: width, h: height, cls: 'bg' });

  if (model.head?.text) {
    shapes.push({ t: 'text', x: x0, y: t.marginTop + t.headFontSize, s: model.head.text, cls: 'head', anchor: 'start' });
  }

  // ---- vertical grid + cycle ticks ----
  if (model.cycles > 0 && model.rows.length > 0) {
    const gTop = topY - 2;
    const gBot = topY + bodyH + 2;
    for (let c = 0; c <= model.cycles; c++) {
      const gx = x0 + c * cw;
      shapes.push({ t: 'line', x1: gx, y1: gTop, x2: gx, y2: gBot, cls: 'grid' });
    }
    if (model.head && typeof model.head.tick === 'number') {
      const start = model.head.tick;
      for (let c = 0; c < model.cycles; c++) {
        shapes.push({ t: 'text', x: x0 + c * cw + cw / 2, y: topY - 6, s: String(start + c), cls: 'tick', anchor: 'middle' });
      }
    }
  }

  // ---- signal rows ----
  model.rows.forEach((r, i) => {
    const yHi = topY + i * rowH;
    const yLo = yHi + t.waveHeight;
    if (r.name) {
      const nx = groupArea + r.depth * t.groupIndent + t.namePadLeft;
      shapes.push({ t: 'text', x: nx, y: (yHi + yLo) / 2 + t.nameFontSize / 3, s: r.name, cls: 'name', anchor: 'start' });
    }
    if (!r.isSpacer) {
      renderLane(r, shapes, x0 + r.phase * cw, yHi, yLo, cw * r.period, t);
    }
  });

  // ---- group brackets ----
  for (const g of model.groups) {
    const yTop = topY + g.firstRow * rowH - 2;
    const yBot = topY + g.lastRow * rowH + t.waveHeight + 2;
    const bx = labelBand + g.depth * t.groupGap + 6;
    shapes.push({ t: 'path', d: `M ${nf(bx + 5)} ${nf(yTop)} q ${-5} 0 ${-5} 5 L ${nf(bx)} ${nf(yBot - 5)} q 0 5 5 5`, cls: 'grp' });
    if (g.label) {
      shapes.push({ t: 'text', x: bx - 9, y: (yTop + yBot) / 2, s: g.label, cls: 'grp-label', anchor: 'middle', rotate: -90 });
    }
  }

  // ---- edges / relations (drawn on top of the waves) ----
  const nodePoint = (a: NodeAnchor): Point => {
    const row = model.rows[a.row];
    const char = Math.min(a.char, row.bricks.length);
    return [x0 + (row.phase + char * row.period) * cw, topY + a.row * rowH + t.waveHeight / 2];
  };
  const rowMidY = (row: number): number => topY + row * rowH + t.waveHeight / 2;
  const resolveAnchor = (s: string): Point | null => {
    const pa = parseAnchor(s);
    if (!pa) return null;
    if (pa.kind === 'node') {
      const a = model.nodes[pa.node];
      if (!a || model.rows[a.row].isSpacer) return null;
      return nodePoint(a);
    }
    const row = model.names[pa.signal];
    if (row === undefined) return null;
    return [x0 + pa.time * cw, rowMidY(row)];
  };

  for (const spec of model.edges) {
    const e = parseEdge(spec);
    if (!e) continue;
    const p1 = resolveAnchor(e.from);
    const p2 = resolveAnchor(e.to);
    if (p1 && p2) drawEdge(shapes, p1, p2, e, t);
  }

  for (const rel of model.relations) {
    if (!rel || typeof rel.from !== 'string' || typeof rel.to !== 'string') continue;
    const p1 = resolveAnchor(rel.from);
    const p2 = resolveAnchor(rel.to);
    if (!p1 || !p2) continue;
    if (rel.type === 'ruler') {
      drawRuler(shapes, p1, p2, rel.label ?? '', t);
    } else {
      drawEdge(shapes, p1, p2, { from: '', to: '', style: 'spline', arrowStart: false, arrowEnd: true, label: rel.label ?? '' }, t);
    }
  }

  // ---- footer ----
  if (model.foot?.text) {
    shapes.push({ t: 'text', x: x0, y: height - t.marginBottom + t.headFontSize / 2, s: model.foot.text, cls: 'foot', anchor: 'start' });
  }

  const hitMap: HitMap = {
    x0,
    cw,
    topY,
    rowH,
    waveHeight: t.waveHeight,
    rows: model.rows.map((r) => ({
      period: r.period,
      phase: r.phase,
      bricks: r.bricks.length,
      isSpacer: r.isSpacer,
    })),
  };

  return { width, height, shapes, theme: t, hitMap };
}

/** Draw one signal's wave across the cycles. */
function renderLane(r: NormSignal, shapes: Shape[], x0: number, yHi: number, yLo: number, bw: number, t: Theme): void {
  const yMid = (yHi + yLo) / 2;
  const slew = Math.min(t.slew, bw / 2);
  const bricks = r.bricks;
  const n = bricks.length;

  let pts: Point[] = [];
  const flush = (): void => {
    if (pts.length >= 2) shapes.push({ t: 'poly', pts, cls: 'sig' });
    pts = [];
  };
  let prevY: number | null = null;

  let i = 0;
  while (i < n) {
    const b = bricks[i] as Brick;
    const k = b.kind;
    const xS = x0 + i * bw;
    const xE = xS + bw;

    if (k.type === 'empty') {
      flush();
      if (b.gap) addGap(shapes, xS, yHi, yLo);
      prevY = null;
      i++;
      continue;
    }

    if (k.type === 'clock') {
      const base = k.polarity === 'pos' ? yLo : yHi;
      const peak = k.polarity === 'pos' ? yHi : yLo;
      const xMid = xS + bw / 2;
      if (pts.length === 0) pts.push([xS, prevY ?? base]);
      pts.push([xS, peak], [xMid, peak], [xMid, base], [xE, base]);
      prevY = base;
      if (k.arrow) addClockArrow(shapes, xS, yMid, k.polarity === 'pos' ? 'up' : 'down');
      if (b.gap) addGap(shapes, xS, yHi, yLo);
      i++;
      continue;
    }

    if (k.type === 'level' && k.level !== 'x') {
      const yl = levelY(k.level, yHi, yLo, yMid);
      if (pts.length === 0) {
        if (prevY != null && prevY !== yl) {
          pts.push([xS, prevY], [xS + slew, yl]);
        } else {
          pts.push([xS, yl]);
        }
      } else if (!b.cont && prevY != null && prevY !== yl) {
        pts.push([xS + slew, yl]);
      }
      pts.push([xE, yl]);
      prevY = yl;
      if (!b.cont && (k.level === 'u' || k.level === 'd')) {
        // weak: a faint dot at the transition to hint pull strength
        shapes.push({ t: 'rect', x: xS - 1, y: yl - 1, w: 2, h: 2, cls: 'weak' });
      }
      if (b.gap) addGap(shapes, xS, yHi, yLo);
      i++;
      continue;
    }

    // ---- box run (data value or undefined 'x'); merge continuation cells ----
    flush();
    const isX = k.type === 'level'; // remaining level case is 'x'
    const color = k.type === 'data' ? k.color : 0;
    const label = k.type === 'data' ? k.label : undefined;
    let j = i + 1;
    while (j < n) {
      const bj = bricks[j] as Brick;
      if (bj.cont && isBoxKind(bj.kind)) j++;
      else break;
    }
    const rx0 = x0 + i * bw;
    const rx1 = x0 + j * bw;
    drawBox(shapes, rx0, rx1, yHi, yLo, yMid, Math.min(t.slew, (rx1 - rx0) / 2), prevY, isX, color, label, t);
    for (let g = i; g < j; g++) if ((bricks[g] as Brick).gap) addGap(shapes, x0 + g * bw, yHi, yLo);
    prevY = yMid; // a bus exits pinched at the mid line
    i = j;
  }
  flush();
}

function drawBox(
  shapes: Shape[],
  x0: number,
  x1: number,
  yHi: number,
  yLo: number,
  yMid: number,
  slant: number,
  entryY: number | null,
  isX: boolean,
  color: number,
  label: string | undefined,
  t: Theme,
): void {
  const leftY = entryY ?? yMid;
  const pts: Point[] = [
    [x0, leftY],
    [x0 + slant, yHi],
    [x1 - slant, yHi],
    [x1, yMid],
    [x1 - slant, yLo],
    [x0 + slant, yLo],
  ];
  if (isX) {
    shapes.push({ t: 'poly', pts, closed: true, cls: 'box', fill: 'url(#wpg-hatch)' });
  } else {
    shapes.push({ t: 'poly', pts, closed: true, cls: 'box', fill: t.dataPalette[color] ?? t.dataPalette[0] });
    if (label) {
      shapes.push({ t: 'text', x: (x0 + x1) / 2, y: yMid + t.dataFontSize / 3, s: label, cls: 'data', anchor: 'middle' });
    }
  }
}

function addClockArrow(shapes: Shape[], x: number, yMid: number, dir: 'up' | 'down'): void {
  const s = 3.2;
  const pts: Point[] =
    dir === 'up'
      ? [[x - s, yMid + s], [x + s, yMid + s], [x, yMid - s]]
      : [[x - s, yMid - s], [x + s, yMid - s], [x, yMid + s]];
  shapes.push({ t: 'poly', pts, closed: true, cls: 'arrow' });
}

function drawEdge(shapes: Shape[], p1: Point, p2: Point, e: ParsedEdge, t: Theme): void {
  const [x1, y1] = p1;
  const [x2, y2] = p2;
  if (Math.abs(x1 - x2) < 0.5 && Math.abs(y1 - y2) < 0.5) return; // degenerate self-edge
  let d: string;
  let endAngle: number;
  let startAngle: number;

  if (e.style === 'spline') {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const off = Math.min(40, len * 0.3);
    const cx = (x1 + x2) / 2 + (-dy / len) * off;
    const cy = (y1 + y2) / 2 + (dx / len) * off;
    d = `M ${nf(x1)} ${nf(y1)} Q ${nf(cx)} ${nf(cy)} ${nf(x2)} ${nf(y2)}`;
    endAngle = Math.atan2(y2 - cy, x2 - cx);
    startAngle = Math.atan2(y1 - cy, x1 - cx);
  } else if (e.style === 'ortho') {
    d = `M ${nf(x1)} ${nf(y1)} L ${nf(x2)} ${nf(y1)} L ${nf(x2)} ${nf(y2)}`;
    endAngle = y2 >= y1 ? Math.PI / 2 : -Math.PI / 2;
    startAngle = x1 <= x2 ? Math.PI : 0;
  } else {
    d = `M ${nf(x1)} ${nf(y1)} L ${nf(x2)} ${nf(y2)}`;
    endAngle = Math.atan2(y2 - y1, x2 - x1);
    startAngle = Math.atan2(y1 - y2, x1 - x2);
  }

  shapes.push({ t: 'path', d, cls: 'edge' });
  if (e.arrowEnd) shapes.push({ t: 'poly', pts: arrowHead(x2, y2, endAngle), closed: true, cls: 'edge-arrow' });
  if (e.arrowStart) shapes.push({ t: 'poly', pts: arrowHead(x1, y1, startAngle), closed: true, cls: 'edge-arrow' });

  if (e.label) {
    const lx = (x1 + x2) / 2;
    const ly = (y1 + y2) / 2 - 4;
    const w = labelWidth(e.label, t.dataFontSize);
    const h = t.dataFontSize + 4;
    shapes.push({ t: 'rect', x: lx - w / 2, y: ly - h + 3, w, h, rx: 3, cls: 'edge-label-bg' });
    shapes.push({ t: 'text', x: lx, y: ly, s: e.label, cls: 'edge-label', anchor: 'middle' });
  }
}

/** Estimate a label's px width (CJK/wide glyphs ~1em, Latin ~0.6em). */
function labelWidth(label: string, fontSize: number): number {
  let w = 6;
  for (const ch of label) w += (ch.codePointAt(0) ?? 0) > 0x2e7f ? fontSize : fontSize * 0.6;
  return w;
}

/** A measurement/dimension line between two points with end caps and a label. */
function drawRuler(shapes: Shape[], p1: Point, p2: Point, label: string, t: Theme): void {
  const yLine = (p1[1] + p2[1]) / 2;
  const lo = Math.min(p1[0], p2[0]);
  const hi = Math.max(p1[0], p2[0]);
  const cap = 4;
  shapes.push({ t: 'line', x1: lo, y1: yLine, x2: hi, y2: yLine, cls: 'ruler' });
  shapes.push({ t: 'line', x1: lo, y1: yLine - cap, x2: lo, y2: yLine + cap, cls: 'ruler' });
  shapes.push({ t: 'line', x1: hi, y1: yLine - cap, x2: hi, y2: yLine + cap, cls: 'ruler' });
  shapes.push({ t: 'poly', pts: arrowHead(lo, yLine, Math.PI), closed: true, cls: 'ruler-arrow' });
  shapes.push({ t: 'poly', pts: arrowHead(hi, yLine, 0), closed: true, cls: 'ruler-arrow' });
  if (label) {
    const lx = (lo + hi) / 2;
    const ly = yLine - 6;
    const w = labelWidth(label, t.dataFontSize);
    shapes.push({ t: 'rect', x: lx - w / 2, y: ly - t.dataFontSize + 2, w, h: t.dataFontSize + 4, rx: 3, cls: 'edge-label-bg' });
    shapes.push({ t: 'text', x: lx, y: ly, s: label, cls: 'ruler-label', anchor: 'middle' });
  }
}

function arrowHead(px: number, py: number, angle: number): Point[] {
  const len = 7;
  const w = 3.2;
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const bx = px - ux * len;
  const by = py - uy * len;
  const nx = -uy;
  const ny = ux;
  return [
    [px, py],
    [bx + nx * w, by + ny * w],
    [bx - nx * w, by - ny * w],
  ];
}

function addGap(shapes: Shape[], x: number, yHi: number, yLo: number): void {
  const w = 6;
  shapes.push({ t: 'rect', x: x - w / 2, y: yHi - 3, w, h: yLo - yHi + 6, cls: 'gapbg' });
  shapes.push({ t: 'line', x1: x - 4, y1: yLo + 3, x2: x, y2: yHi - 3, cls: 'gap' });
  shapes.push({ t: 'line', x1: x, y1: yLo + 3, x2: x + 4, y2: yHi - 3, cls: 'gap' });
}
