// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { App } from './app';

function makeRoot(): HTMLElement {
  document.body.innerHTML = '<div id="app"></div>';
  return document.getElementById('app') as HTMLElement;
}

function enter(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
}

/** CodeMirror renders the doc into .cm-content; read it back for assertions. */
function editorText(root: HTMLElement): string {
  return root.querySelector('.cm-content')?.textContent ?? '';
}

describe('App (UI smoke)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('boots and renders a diagram into the preview', () => {
    const root = makeRoot();
    new App(root).start();
    expect(root.querySelector('#preview svg')).toBeTruthy();
    expect(root.querySelector('.cm-editor')).toBeTruthy();
    expect(editorText(root)).toContain('signal');
    expect(root.querySelector('#statusMsg')?.textContent).toContain('Rendered');
  });

  it('runs commands from the command bar and updates the editor + preview', () => {
    const root = makeRoot();
    new App(root).start();
    const cmd = root.querySelector('#cmd') as HTMLInputElement;
    enter(cmd, 'clear');
    enter(cmd, 'add clock CLK cycles=3');
    expect(editorText(root)).toContain('CLK');
    expect(root.querySelector('#preview svg')).toBeTruthy();
    expect(cmd.value).toBe('');
  });

  it('shows an error in the status bar for an unknown command', () => {
    const root = makeRoot();
    new App(root).start();
    const cmd = root.querySelector('#cmd') as HTMLInputElement;
    enter(cmd, 'frobnicate');
    expect((root.querySelector('#statusbar') as HTMLElement).classList.contains('error')).toBe(true);
  });

  it('toggles the help modal open and closed', () => {
    const root = makeRoot();
    new App(root).start();
    const modal = root.querySelector('#helpModal') as HTMLElement;
    expect(modal.classList.contains('open')).toBe(false);
    (root.querySelector('#help') as HTMLButtonElement).click();
    expect(modal.classList.contains('open')).toBe(true);
    (root.querySelector('[data-help-close]') as HTMLButtonElement).click();
    expect(modal.classList.contains('open')).toBe(false);
  });

  it('persists the source to localStorage', () => {
    const root = makeRoot();
    new App(root).start();
    expect(localStorage.getItem('wavepicgen.source')).toContain('signal');
  });
});
