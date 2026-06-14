/**
 * Source editor — a thin wrapper around CodeMirror 6 that the app shell uses
 * instead of a raw textarea. Provides JSON5-ish highlighting, line numbers,
 * undo/redo, tab indent, and inline parse-error diagnostics (via our own
 * parser), themed through the app's CSS variables so it follows light/dark.
 */
import { EditorView, basicSetup } from 'codemirror';
import { EditorState } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import { indentWithTab } from '@codemirror/commands';
import { json } from '@codemirror/lang-json';
import { linter, lintGutter } from '@codemirror/lint';
import type { Diagnostic } from '@codemirror/lint';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { parseSource } from '../core';

// Mid-tone token colours that read on both the light and dark editor themes.
const highlight = HighlightStyle.define([
  { tag: tags.propertyName, color: '#2b80c4' },
  { tag: [tags.string, tags.special(tags.string)], color: '#3a8f4f' },
  { tag: [tags.number, tags.bool, tags.null, tags.keyword], color: '#8250df' },
  { tag: [tags.comment, tags.lineComment, tags.blockComment], color: '#8a93a2', fontStyle: 'italic' },
  { tag: [tags.brace, tags.bracket, tags.punctuation, tags.separator], color: '#7c8595' },
]);

const appTheme = EditorView.theme({
  '&': { height: '100%', backgroundColor: 'var(--panel)', color: 'var(--text)', fontSize: '12.5px' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: 'var(--mono)', lineHeight: '1.55' },
  '.cm-gutters': { backgroundColor: 'var(--panel)', color: 'var(--text-faint)', border: 'none' },
  '.cm-activeLine': { backgroundColor: 'rgba(127,127,127,0.06)' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': { backgroundColor: 'var(--accent-weak)' },
  '.cm-cursor': { borderLeftColor: 'var(--accent)' },
});

/** A linter that surfaces our JSON5 parse errors inline at their line/column. */
function parseLinter(view: EditorView): Diagnostic[] {
  const text = view.state.doc.toString();
  const { error } = parseSource(text);
  if (!error) return [];
  let from = 0;
  let to = Math.min(text.length, 1);
  if (error.line) {
    const line = view.state.doc.line(Math.min(error.line, view.state.doc.lines));
    from = line.from + Math.max(0, (error.column ?? 1) - 1);
    to = line.to;
    if (from >= to) from = Math.max(line.from, to - 1);
  }
  return [{ from, to, severity: 'error', message: error.message }];
}

export interface EditorOptions {
  doc: string;
  onChange: (value: string) => void;
}

export class Editor {
  private view: EditorView;
  /** True while applying a programmatic setValue, to skip the onChange callback. */
  private suppressChange = false;

  constructor(parent: HTMLElement, opts: EditorOptions) {
    this.view = new EditorView({
      parent,
      state: EditorState.create({
        doc: opts.doc,
        extensions: [
          basicSetup,
          keymap.of([indentWithTab]),
          json(),
          syntaxHighlighting(highlight),
          lintGutter(),
          linter(parseLinter),
          appTheme,
          EditorState.tabSize.of(2),
          EditorView.updateListener.of((u) => {
            if (u.docChanged && !this.suppressChange) opts.onChange(u.state.doc.toString());
          }),
        ],
      }),
    });
  }

  getValue(): string {
    return this.view.state.doc.toString();
  }

  setValue(text: string): void {
    if (text === this.getValue()) return;
    this.suppressChange = true;
    this.view.dispatch({
      changes: { from: 0, to: this.view.state.doc.length, insert: text },
    });
    this.suppressChange = false;
  }

  destroy(): void {
    this.view.destroy();
  }
}
