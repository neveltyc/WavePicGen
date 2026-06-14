/**
 * Command interpreter for the in-GUI command bar (and a future CLI).
 *
 * Commands mutate the document model and return new source text, so the visual
 * editor, the text editor and the command bar all drive the *same* model — one
 * source of truth, three views. Export commands return a request the shell runs.
 */
import { parseSource, serializeDoc } from './parse';
import type { Lane, SignalSpec, WaveDoc } from './model';
import { examples } from './examples';
import { insertCycles, deleteCycles } from './edit';
import { clampInt } from './util';

export type ExportFormat = 'svg' | 'png' | 'jpeg' | 'pdf' | 'tikz';

export interface CommandResult {
  /** Updated source (present when the command changed the document). */
  source?: string;
  /** A message to show in the status bar. */
  message?: string;
  /** An error message; when set, nothing changed. */
  error?: string;
  /** An export request for the shell to fulfil (browser-only). */
  exportRequest?: { format: ExportFormat; scale?: number };
}

interface ParsedArgs {
  positional: string[];
  named: Record<string, string>;
}

function stripQuotes(s: string): string {
  if (s.length >= 2 && ((s[0] === '"' && s.endsWith('"')) || (s[0] === "'" && s.endsWith("'")))) {
    return s.slice(1, -1);
  }
  return s;
}

/**
 * Split a command line into tokens, keeping `key="value with spaces"` as one
 * token and unwrapping standalone quoted strings.
 */
function tokenize(input: string): string[] {
  const out: string[] = [];
  const re = /(\S+?=(?:"[^"]*"|'[^']*'|\S*))|"([^"]*)"|'([^']*)'|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input))) {
    if (m[1] != null) out.push(m[1]);
    else if (m[2] != null) out.push(m[2]);
    else if (m[3] != null) out.push(m[3]);
    else if (m[4] != null) out.push(m[4]);
  }
  return out;
}

function parseArgs(tokens: string[]): ParsedArgs {
  const positional: string[] = [];
  const named: Record<string, string> = {};
  for (const tok of tokens) {
    const eq = tok.indexOf('=');
    if (eq > 0) named[tok.slice(0, eq)] = stripQuotes(tok.slice(eq + 1));
    else positional.push(tok);
  }
  return { positional, named };
}

function repeat(ch: string, n: number): string {
  return ch.repeat(Math.max(1, n));
}

const HELP =
  'commands: add clock <NAME> [cycles=N] | add signal <NAME> [wave=..] | ' +
  'add bus <NAME> [cycles=N] | set hscale=<N> | set head="text" | ' +
  'insert at=<N> [count=M] | delay at=<N> [count=M] | delete at=<N> [count=M] | ' +
  'example <id> | clear | export <svg|png|jpeg|pdf|tikz> [scale=N] | help';

/** Apply a single command line against the current source. Never throws. */
export function applyCommand(source: string, line: string): CommandResult {
  const trimmed = line.trim();
  if (!trimmed) return {};

  const tokens = tokenize(trimmed);
  const cmd = (tokens.shift() ?? '').toLowerCase();

  if (cmd === 'help' || cmd === '?') return { message: HELP };

  if (cmd === 'example') {
    const id = tokens[0];
    const ex = examples.find((e) => e.id === id);
    if (!ex) return { error: `Unknown example '${id ?? ''}'. Try: ${examples.map((e) => e.id).join(', ')}` };
    return { source: ex.source, message: `Loaded example '${ex.id}'.` };
  }

  if (cmd === 'clear') {
    return { source: serializeDoc({ signal: [] }), message: 'Cleared.' };
  }

  if (cmd === 'export') {
    const fmt = (tokens[0] ?? 'svg').toLowerCase();
    if (fmt !== 'svg' && fmt !== 'png' && fmt !== 'jpeg' && fmt !== 'pdf' && fmt !== 'tikz') {
      return { error: `Unknown export format '${fmt}'. Use svg, png, jpeg, pdf or tikz.` };
    }
    const { named } = parseArgs(tokens.slice(1));
    const scale = named.scale ? Number(named.scale) : undefined;
    return { exportRequest: { format: fmt, ...(scale && scale > 0 ? { scale } : {}) }, message: `Exporting ${fmt}...` };
  }

  // Commands below mutate the document, so we need a valid current document.
  const parsed = parseSource(source);
  if (parsed.error || !parsed.doc) {
    return { error: `Fix the source first: ${parsed.error?.message ?? 'parse error'}` };
  }
  const doc: WaveDoc = parsed.doc;
  if (!Array.isArray(doc.signal)) doc.signal = [];

  if (cmd === 'set') {
    const { named } = parseArgs(tokens);
    let changed = false;
    if (named.hscale) {
      const v = Number(named.hscale);
      if (!Number.isFinite(v) || v <= 0) return { error: 'hscale must be a positive number.' };
      doc.config = { ...doc.config, hscale: v };
      changed = true;
    }
    if (named.head !== undefined) {
      doc.head = { ...doc.head, text: named.head };
      changed = true;
    }
    if (!changed) return { error: `Nothing to set. ${HELP}` };
    return { source: serializeDoc(doc), message: 'Updated config.' };
  }

  if (cmd === 'add') {
    const kind = (tokens.shift() ?? '').toLowerCase();
    const { positional, named } = parseArgs(tokens);
    const name = positional[0];
    if (!name) return { error: `Missing name. e.g. "add ${kind || 'signal'} CLK"` };
    const cycles = clampInt(named.cycles, 1, 256, 4);

    let sig: SignalSpec;
    if (kind === 'clock') {
      sig = { name, wave: repeat('p', cycles) };
    } else if (kind === 'bus') {
      const labels = Array.from({ length: cycles }, (_, i) => `D${i}`);
      sig = { name, wave: 'x' + repeat('=', cycles) + 'x', data: labels };
    } else if (kind === 'signal' || kind === '') {
      sig = { name, wave: named.wave ?? repeat('0', cycles) };
    } else {
      return { error: `Unknown 'add ${kind}'. Use clock, signal or bus.` };
    }
    (doc.signal as Lane[]).push(sig);
    return { source: serializeDoc(doc), message: `Added ${kind || 'signal'} '${name}'.` };
  }

  if (cmd === 'insert' || cmd === 'delay' || cmd === 'delete') {
    const { named } = parseArgs(tokens);
    const at = Number(named.at);
    if (!Number.isFinite(at) || at < 0) {
      return { error: `usage: ${cmd} at=<cycle> [count=N]` };
    }
    const count = clampInt(named.count, 1, 4096, 1);
    const pos = Math.floor(at);
    const next =
      cmd === 'delete' ? deleteCycles(source, pos, count) : insertCycles(source, pos, count);
    if (!next) return { error: `Could not ${cmd} cycles.` };
    const verb = cmd === 'delete' ? 'Deleted' : 'Inserted';
    return { source: next, message: `${verb} ${count} cycle(s) at ${pos}.` };
  }

  return { error: `Unknown command '${cmd}'. ${HELP}` };
}

export { HELP as commandHelp };
