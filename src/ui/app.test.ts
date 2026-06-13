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

describe('App (UI smoke)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('boots and renders a diagram into the preview', () => {
    const root = makeRoot();
    new App(root).start();
    const svg = root.querySelector('#preview svg');
    expect(svg).toBeTruthy();
    const editor = root.querySelector('#editor') as HTMLTextAreaElement;
    expect(editor.value).toContain('signal');
    expect(root.querySelector('#statusMsg')?.textContent).toContain('Rendered');
  });

  it('runs a command from the command bar and updates the source + preview', () => {
    const root = makeRoot();
    new App(root).start();
    const editor = root.querySelector('#editor') as HTMLTextAreaElement;
    editor.value = '{ signal: [] }';

    const cmd = root.querySelector('#cmd') as HTMLInputElement;
    enter(cmd, 'add clock CLK cycles=3');

    expect(editor.value).toContain('CLK');
    expect(root.querySelector('#preview svg')).toBeTruthy();
    expect(cmd.value).toBe(''); // input cleared after run
  });

  it('shows an error in the status bar for an unknown command', () => {
    const root = makeRoot();
    new App(root).start();
    const cmd = root.querySelector('#cmd') as HTMLInputElement;
    enter(cmd, 'frobnicate');
    const status = root.querySelector('#statusbar') as HTMLElement;
    expect(status.classList.contains('error')).toBe(true);
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
