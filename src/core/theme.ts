/**
 * Rendering theme: all visual constants for the *diagram* (not the app chrome).
 * Defaults aim at a clean, print-friendly "manual quality" look (white background,
 * dark strokes), so exported SVG/PNG drop straight into a datasheet or paper.
 */
export interface Theme {
  /** Width of one base time-cycle, in px (before hscale). */
  cycleWidth: number;
  /** Vertical span of a signal wave, in px. */
  waveHeight: number;
  /** Vertical gap between two signal lanes, in px. */
  laneGap: number;
  /** Slope width used for edges / bus open-close, in px. */
  slew: number;
  marginTop: number;
  marginBottom: number;
  /** Gap between the name column and the wave area, in px. */
  gutter: number;
  /** Left padding inside the name column, in px. */
  namePadLeft: number;
  /** Horizontal indent per group nesting level, in px. */
  groupIndent: number;
  /** Horizontal space reserved per group depth for brackets, in px. */
  groupGap: number;

  fontFamily: string;
  monoFamily: string;
  nameFontSize: number;
  dataFontSize: number;
  tickFontSize: number;
  headFontSize: number;
  /** Approximate glyph advance, used to size the name column. */
  charWidth: number;

  /** Stroke / fill colours. */
  stroke: string;
  background: string;
  gridColor: string;
  hatchColor: string;
  tickColor: string;
  groupColor: string;
  /** Colour for edges / relation arrows and their labels. */
  edgeColor: string;

  /** Fill palette for data/bus values, keyed by wave digit (0 = '='). */
  dataPalette: Record<number, string>;
}

export const defaultTheme: Theme = {
  cycleWidth: 48,
  waveHeight: 26,
  laneGap: 14,
  slew: 4,
  marginTop: 14,
  marginBottom: 16,
  gutter: 14,
  namePadLeft: 8,
  groupIndent: 14,
  groupGap: 16,

  fontFamily:
    '"Helvetica Neue", Helvetica, Arial, "PingFang SC", "Microsoft YaHei", sans-serif',
  monoFamily:
    '"SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace',
  nameFontSize: 13,
  dataFontSize: 12,
  tickFontSize: 11,
  headFontSize: 14,
  charWidth: 7.6,

  stroke: '#1b1f24',
  background: '#ffffff',
  gridColor: '#e6e9ef',
  hatchColor: '#c9ced6',
  tickColor: '#8a93a2',
  groupColor: '#9aa3b2',
  edgeColor: '#2b5fa6',

  dataPalette: {
    0: '#e9eef5',
    2: '#bfe3ff',
    3: '#c8e6c9',
    4: '#ffe0b2',
    5: '#f8bbd0',
    6: '#d8ccf0',
    7: '#fff3b0',
    8: '#b2dfdb',
    9: '#ffccbc',
  },
};
