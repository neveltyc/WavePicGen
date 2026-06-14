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
import { parseEdge } from './edges';
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

export interface LayoutResult {
  width: number;
  height: number;
  shapes: Shape[];
  theme: Theme;
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
  if (model.edges.length > 0) {
    const nodePoint = (a: NodeAnchor): Point => {
      const row = model.rows[a.row];
      return [
        x0 + (row.phase + a.char * row.period) * cw,
        topY + a.row * rowH + t.waveHeight / 2,
      ];
    };
    for (const spec of model.edges) {
      const e = parseEdge(spec);
      if (!e) continue;
      const a = model.nodes[e.from];
      const b = model.nodes[e.to];
      if (!a || !b) continue;
      drawEdge(shapes, nodePoint(a), nodePoint(b), e, t);
    }
  }

  // ---- footer ----
  if (model.foot?.text) {
    shapes.push({ t: 'text', x: x0, y: height - t.marginBottom + t.headFontSize / 2, s: model.foot.text, cls: 'foot', anchor: 'start' });
  }

  return { width, height, shapes, theme: t };
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
    const w = e.label.length * (t.dataFontSize * 0.62) + 6;
    const h = t.dataFontSize + 4;
    shapes.push({ t: 'rect', x: lx - w / 2, y: ly - h + 3, w, h, rx: 3, cls: 'edge-label-bg' });
    shapes.push({ t: 'text', x: lx, y: ly, s: e.label, cls: 'edge-label', anchor: 'middle' });
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
