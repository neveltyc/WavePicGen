/** Public surface of the WavePicGen rendering engine (framework-agnostic, no DOM). */
export { render } from './render';
export type { RenderResult } from './render';
export { parseSource, serializeDoc } from './parse';
export type { ParseError, ParseResult } from './parse';
export { normalize, signalSpecAt } from './model';
export type {
  WaveDoc,
  SignalSpec,
  Lane,
  LaneArray,
  Config,
  HeadFoot,
  NormModel,
  NormSignal,
  NormGroup,
  NodeAnchor,
  Relation,
} from './model';
export { resolveWave, isBoxKind } from './bricks';
export type { Brick, BrickKind, WaveWarning } from './bricks';
export { parseEdge, parseAnchor } from './edges';
export type { ParsedEdge, EdgeStyle, ParsedAnchor } from './edges';
export { layout, hitTest } from './layout';
export type { LayoutResult, Shape, Point, HitMap } from './layout';
export { cycleBrick, dragPaint, insertCycles, deleteCycles, CLICK_STATES } from './edit';
export { signalSpecs } from './model';
export { toSvg } from './svg';
export { toTikz, renderTikz } from './tikz';
export { defaultTheme } from './theme';
export type { Theme } from './theme';
export { applyCommand, commandHelp } from './commands';
export type { CommandResult, ExportFormat } from './commands';
export { examples, defaultSource } from './examples';
export type { Example } from './examples';
