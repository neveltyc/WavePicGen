/**
 * Source parsing: WaveJSON / JSON5 text -> WaveDoc.
 *
 * JSON5 is used so the editable source can have comments, unquoted keys, single
 * quotes and trailing commas — a much friendlier hand-editing experience than
 * strict JSON, while staying fully WaveDrom-compatible.
 */
import JSON5 from 'json5';
import type { WaveDoc } from './model';

export interface ParseError {
  message: string;
  line?: number;
  column?: number;
}

export interface ParseResult {
  doc?: WaveDoc;
  error?: ParseError;
}

export function parseSource(src: string): ParseResult {
  let value: unknown;
  try {
    value = JSON5.parse(src);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const m = /at line (\d+) column (\d+)/.exec(message);
    return {
      error: {
        message,
        ...(m ? { line: Number(m[1]), column: Number(m[2]) } : {}),
      },
    };
  }

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { error: { message: 'Top-level value must be an object like { signal: [...] }.' } };
  }
  if (!Array.isArray((value as { signal?: unknown }).signal)) {
    return { error: { message: 'Document is missing a "signal" array.' } };
  }
  return { doc: value as WaveDoc };
}

/** Serialize a WaveDoc back to readable JSON5-ish text (2-space indent). */
export function serializeDoc(doc: WaveDoc): string {
  return JSON5.stringify(doc, null, 2);
}
