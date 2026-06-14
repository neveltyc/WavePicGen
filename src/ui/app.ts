/**
 * Web shell: wires the rendering engine (src/core) to a dual-pane editor + live
 * SVG preview + command bar + export. The shell is intentionally thin — all
 * diagram logic lives in the engine, so this file stays about UI wiring only.
 */
import {
  render,
  renderTikz,
  applyCommand,
  parseSource,
  serializeDoc,
  cycleBrick,
  dragPaint,
  hitTest,
  examples,
  defaultSource,
  type RenderResult,
  type ExportFormat,
} from '../core';
import { exportDiagram, downloadText } from './exporter';
import { Editor } from './editor';

const STORAGE_KEY = 'wavepicgen.source';
const THEME_KEY = 'wavepicgen.theme';
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 6;

const HELP_HTML = `
  <button class="close" data-help-close>✕ Close</button>
  <h2>WavePicGen — quick reference</h2>
  <p>Edit the WaveJSON / JSON5 source on the left; the diagram updates live. Use the command bar for quick edits and exports.</p>
  <p><strong>Tip:</strong> click a signal's cycle to toggle 0 → 1 → x → z; <strong>drag horizontally</strong> to paint a level across cycles (move a transition / add delay).</p>
  <h3>Wave characters</h3>
  <table>
    <tr><td>p P n N</td><td>Clock — p/P positive, n/N negative; capitals add an active-edge arrow.</td></tr>
    <tr><td>0 1</td><td>Logic low / high.</td></tr>
    <tr><td>= 2…9</td><td>Data / bus value (consumes the next <code>data</code> entry; the digit picks a fill colour).</td></tr>
    <tr><td>x</td><td>Undefined (hatched).</td></tr>
    <tr><td>z</td><td>High-impedance (mid line).</td></tr>
    <tr><td>u d</td><td>Weak pull-up / pull-down.</td></tr>
    <tr><td>.</td><td>Extend the previous brick (hold state).</td></tr>
    <tr><td>|</td><td>Gap / time-compression mark.</td></tr>
  </table>
  <h3>Commands</h3>
  <table>
    <tr><td>add clock</td><td><code>add clock CLK cycles=6</code></td></tr>
    <tr><td>add signal</td><td><code>add signal EN wave=01.0</code></td></tr>
    <tr><td>add bus</td><td><code>add bus DATA cycles=3</code></td></tr>
    <tr><td>set</td><td><code>set hscale=2</code> · <code>set head="My Figure"</code></td></tr>
    <tr><td>example</td><td><code>example bus</code> (${examples.map((e) => e.id).join(', ')})</td></tr>
    <tr><td>export</td><td><code>export png scale=3</code> · <code>export svg</code> · <code>export pdf</code> · <code>export tikz</code></td></tr>
    <tr><td>clear</td><td>Remove all signals.</td></tr>
  </table>
  <h3>Document fields</h3>
  <p><code>signal</code> (required), <code>data</code>, <code>period</code>, <code>phase</code>, groups <code>["label", …]</code>, <code>config.hscale</code>, <code>head.text</code>, <code>head.tick</code>, <code>foot.text</code>.</p>
`;

function template(): string {
  const opts = examples.map((e) => `<option value="${e.id}">${e.title}</option>`).join('');
  return `
  <div class="app">
    <header class="topbar">
      <div class="brand">
        <div class="logo">〜</div>
        <div><div class="title">WavePicGen</div><div class="subtitle">数字时序图编辑器 · digital timing diagrams</div></div>
      </div>
      <div class="actions">
        <div class="group"><span class="lbl">Examples</span>
          <select id="examples"><option value="" disabled selected>Load…</option>${opts}</select>
        </div>
        <button id="format" title="Tidy / reformat the source">Format</button>
        <div class="group"><span class="lbl">Export</span>
          <div class="seg">
            <button data-exp="svg" title="Download SVG (vector)">SVG</button>
            <button data-exp="png" title="Download PNG">PNG</button>
            <button data-exp="jpeg" title="Download JPEG">JPEG</button>
            <button data-exp="pdf" title="Print to PDF (vector)">PDF</button>
            <button data-exp="tikz" title="Download tikz-timing (.tex)">TikZ</button>
          </div>
          <select id="scale" title="Raster scale"><option value="1">1×</option><option value="2" selected>2×</option><option value="3">3×</option><option value="4">4×</option></select>
        </div>
        <button id="theme" class="icon-btn" title="Toggle light / dark">◐</button>
        <button id="help" class="icon-btn" title="Help">?</button>
      </div>
    </header>

    <main class="split" id="split">
      <section class="pane editor-pane" id="editorPane">
        <div class="pane-head"><span>Source · WaveJSON / JSON5</span></div>
        <div class="editor-host" id="editorHost"></div>
        <div class="cmdbar">
          <span class="prompt">›</span>
          <input id="cmd" type="text" placeholder="command…  e.g.  add clock CLK   ·   type 'help'" autocomplete="off" />
        </div>
      </section>

      <div class="splitter" id="splitter"></div>

      <section class="pane preview-pane">
        <div class="pane-head">
          <span>Preview</span>
          <div class="zoom">
            <button data-z="out" title="Zoom out">−</button>
            <span class="zlabel" id="zlabel">100%</span>
            <button data-z="in" title="Zoom in">+</button>
            <button data-z="fit" title="Fit width">Fit</button>
            <button data-z="reset" title="Actual size">1:1</button>
          </div>
        </div>
        <div class="preview-scroll" id="previewScroll"><div class="preview-canvas" id="preview"></div></div>
      </section>
    </main>

    <footer class="statusbar" id="statusbar">
      <span class="dot"></span><span class="status-msg" id="statusMsg">Ready</span>
      <span class="spacer"></span>
      <span class="hint">Ctrl/⌘+S = export SVG</span>
    </footer>
  </div>

  <div class="modal-overlay" id="helpModal"><div class="modal">${HELP_HTML}</div></div>
  `;
}

function debounce<F extends (...args: never[]) => void>(fn: F, ms: number): F {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return ((...args: never[]) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  }) as F;
}

export class App {
  private root: HTMLElement;
  private editor!: Editor;
  private editorHost!: HTMLElement;
  private cmd!: HTMLInputElement;
  private preview!: HTMLElement;
  private previewScroll!: HTMLElement;
  private statusbar!: HTMLElement;
  private statusMsg!: HTMLElement;
  private zlabel!: HTMLElement;
  private scaleSel!: HTMLSelectElement;

  private zoom = 1;
  private last: RenderResult | null = null;
  private drag: { row: number; anchor: number; source: string; moved: boolean; result: string | null } | null =
    null;

  constructor(root: HTMLElement) {
    this.root = root;
  }

  start(): void {
    this.root.innerHTML = template();
    this.query();
    this.restoreTheme();
    const saved = localStorage.getItem(STORAGE_KEY) ?? defaultSource;
    const debounced = debounce(() => this.renderNow(), 120);
    this.editor = new Editor(this.editorHost, { doc: saved, onChange: () => debounced() });
    this.wire();
    this.renderNow();
  }

  private query(): void {
    const q = <T extends HTMLElement>(sel: string): T => {
      const el = this.root.querySelector(sel);
      if (!el) throw new Error(`Missing element: ${sel}`);
      return el as T;
    };
    this.editorHost = q('#editorHost');
    this.cmd = q<HTMLInputElement>('#cmd');
    this.preview = q('#preview');
    this.previewScroll = q('#previewScroll');
    this.statusbar = q('#statusbar');
    this.statusMsg = q('#statusMsg');
    this.zlabel = q('#zlabel');
    this.scaleSel = q<HTMLSelectElement>('#scale');
  }

  private wire(): void {
    this.cmd.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.runCommand(this.cmd.value);
        this.cmd.value = '';
      }
    });

    this.root.querySelector('#examples')!.addEventListener('change', (e) => {
      const sel = e.target as HTMLSelectElement;
      const ex = examples.find((x) => x.id === sel.value);
      if (ex) {
        this.setSource(ex.source);
        this.setStatus(`Loaded example "${ex.title}".`, 'ok');
      }
      sel.selectedIndex = 0;
    });

    this.root.querySelector('#format')!.addEventListener('click', () => this.format());
    this.root.querySelector('#theme')!.addEventListener('click', () => this.toggleTheme());
    this.root.querySelector('#help')!.addEventListener('click', () => this.toggleHelp(true));
    this.root.querySelector('[data-help-close]')!.addEventListener('click', () => this.toggleHelp(false));
    this.root.querySelector('#helpModal')!.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).id === 'helpModal') this.toggleHelp(false);
    });

    this.root.querySelectorAll('[data-exp]').forEach((btn) =>
      btn.addEventListener('click', () => this.export(btn.getAttribute('data-exp') as ExportFormat)),
    );
    this.root.querySelectorAll('[data-z]').forEach((btn) =>
      btn.addEventListener('click', () => this.onZoom(btn.getAttribute('data-z')!)),
    );

    this.preview.addEventListener('mousedown', (e) => this.onPreviewMouseDown(e));
    document.addEventListener('mousemove', (e) => this.onPreviewDrag(e));
    document.addEventListener('mouseup', () => this.onPreviewDrop());

    this.setupSplitter();

    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        this.export('svg');
      }
      if (e.key === 'Escape') this.toggleHelp(false);
    });
  }

  private setSource(src: string): void {
    this.editor.setValue(src);
    this.renderNow();
  }

  private renderNow(): void {
    const src = this.editor.getValue();
    localStorage.setItem(STORAGE_KEY, src);
    const result = render(src);
    this.last = result;
    this.preview.innerHTML = result.svg;
    this.applyZoom();

    if (result.error) {
      this.setStatus(result.error, 'error');
    } else if (result.warnings.length) {
      this.setStatus(`Rendered ${result.width}×${result.height} · ${result.warnings[0]}`, 'warn');
    } else {
      this.setStatus(`Rendered ${result.width}×${result.height}px`, 'ok');
    }
  }

  private runCommand(line: string): void {
    if (!line.trim()) return;
    const res = applyCommand(this.editor.getValue(), line);
    if (res.error) {
      this.setStatus(res.error, 'error');
      return;
    }
    if (res.source !== undefined) this.setSource(res.source);
    if (res.exportRequest) {
      void this.export(res.exportRequest.format, res.exportRequest.scale);
    }
    if (res.message) this.setStatus(res.message, 'ok');
  }

  private format(): void {
    // Reformat by round-tripping the document through the parser/serializer.
    const parsed = parseSource(this.editor.getValue());
    if (parsed.error || !parsed.doc) {
      this.setStatus(`Cannot format: ${parsed.error?.message ?? 'parse error'}`, 'error');
      return;
    }
    this.setSource(serializeDoc(parsed.doc));
    this.setStatus('Formatted.', 'ok');
  }

  private async export(format: ExportFormat, scaleOverride?: number): Promise<void> {
    if (format === 'tikz') {
      const { tikz, error } = renderTikz(this.editor.getValue());
      if (error || !tikz) {
        this.setStatus(`Cannot export TikZ: ${error ?? 'no output'}`, 'error');
        return;
      }
      downloadText(tikz, 'wave.tex', 'text/x-tex');
      this.setStatus('Exported tikz-timing (.tex).', 'ok');
      return;
    }
    this.renderNow(); // export exactly what's in the editor, even mid-debounce
    if (!this.last || this.last.error) {
      this.setStatus('Nothing to export — fix the source first.', 'error');
      return;
    }
    const scale = scaleOverride ?? (Number(this.scaleSel.value) || 2);
    try {
      await exportDiagram(this.last.svg, this.last.width, this.last.height, format, scale);
      if (format === 'pdf') this.setStatus('Opened print dialog — choose “Save as PDF”.', 'ok');
      else this.setStatus(`Exported ${format.toUpperCase()}${format === 'svg' ? '' : ` @${scale}×`}.`, 'ok');
    } catch (e) {
      this.setStatus(`Export failed: ${e instanceof Error ? e.message : String(e)}`, 'error');
    }
  }

  private onZoom(action: string): void {
    if (action === 'in') this.zoom = Math.min(ZOOM_MAX, this.zoom * 1.25);
    else if (action === 'out') this.zoom = Math.max(ZOOM_MIN, this.zoom / 1.25);
    else if (action === 'reset') this.zoom = 1;
    else if (action === 'fit' && this.last) {
      const avail = this.previewScroll.clientWidth - 48;
      if (avail > 0) this.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, avail / this.last.width));
    }
    this.applyZoom();
  }

  private applyZoom(): void {
    const svg = this.preview.querySelector('svg');
    if (svg && this.last) {
      svg.style.width = `${this.last.width * this.zoom}px`;
      svg.style.height = `${this.last.height * this.zoom}px`;
    }
    this.zlabel.textContent = `${Math.round(this.zoom * 100)}%`;
  }

  /** Map a mouse event to a (row, brick) on the rendered diagram, or null. */
  private hitAt(e: MouseEvent): { row: number; brick: number } | null {
    const hm = this.last?.hitMap;
    if (!this.last || this.last.error || !hm) return null;
    const svg = this.preview.querySelector('svg');
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const x = (e.clientX - rect.left) * (this.last.width / rect.width);
    const y = (e.clientY - rect.top) * (this.last.height / rect.height);
    return hitTest(hm, x, y);
  }

  private onPreviewMouseDown(e: MouseEvent): void {
    if (e.button !== 0) return;
    const hit = this.hitAt(e);
    if (!hit) return;
    this.drag = { row: hit.row, anchor: hit.brick, source: this.editor.getValue(), moved: false, result: null };
    e.preventDefault();
  }

  /** During a drag, paint the anchor level across swept cycles (live preview). */
  private onPreviewDrag(e: MouseEvent): void {
    const d = this.drag;
    if (!d) return;
    const hit = this.hitAt(e);
    if (!hit || hit.row !== d.row || hit.brick === d.anchor) return;
    const painted = dragPaint(d.source, d.row, d.anchor, hit.brick);
    if (painted) {
      d.moved = true;
      d.result = painted;
      this.renderPreviewOnly(painted);
    }
  }

  /** On release: commit a drag, or fall back to a single-cell toggle on a click. */
  private onPreviewDrop(): void {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    if (d.moved && d.result) {
      this.setSource(d.result);
      this.setStatus('Dragged transition — painted level across cycles.', 'ok');
    } else {
      const next = cycleBrick(d.source, d.row, d.anchor);
      if (next) {
        this.setSource(next);
        this.setStatus(`Toggled cycle ${d.anchor} of signal ${d.row + 1} (0/1/x/z).`, 'ok');
      }
    }
  }

  /** Render a transient source to the preview only (no editor/storage write). */
  private renderPreviewOnly(src: string): void {
    const r = render(src);
    if (r.error) return;
    this.last = r;
    this.preview.innerHTML = r.svg;
    this.applyZoom();
  }

  private setStatus(msg: string, kind: 'ok' | 'warn' | 'error'): void {
    this.statusMsg.textContent = msg;
    this.statusbar.classList.remove('warn', 'error');
    if (kind !== 'ok') this.statusbar.classList.add(kind);
  }

  private toggleHelp(open: boolean): void {
    this.root.querySelector('#helpModal')!.classList.toggle('open', open);
  }

  private restoreTheme(): void {
    const t = localStorage.getItem(THEME_KEY);
    document.documentElement.classList.toggle('light', t === 'light');
  }

  private toggleTheme(): void {
    const light = document.documentElement.classList.toggle('light');
    localStorage.setItem(THEME_KEY, light ? 'light' : 'dark');
  }

  private setupSplitter(): void {
    const splitter = this.root.querySelector('#splitter') as HTMLElement;
    const pane = this.root.querySelector('#editorPane') as HTMLElement;
    const split = this.root.querySelector('#split') as HTMLElement;
    let dragging = false;
    const onMove = (e: MouseEvent): void => {
      if (!dragging) return;
      const rect = split.getBoundingClientRect();
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      pane.style.width = `${Math.max(20, Math.min(80, pct))}%`;
    };
    splitter.addEventListener('mousedown', () => {
      dragging = true;
      splitter.classList.add('active');
      document.body.style.userSelect = 'none';
    });
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', () => {
      dragging = false;
      splitter.classList.remove('active');
      document.body.style.userSelect = '';
    });
  }
}
