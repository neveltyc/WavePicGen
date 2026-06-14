/**
 * Browser-only export helpers: SVG download + deterministic raster (PNG/JPEG)
 * via an offscreen canvas. The SVG produced by the engine is self-contained
 * (embedded styles), so rasterization is faithful and works for CJK text too.
 */
import type { ExportFormat } from '../core';

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadSvg(svg: string, filename = 'wave.svg'): void {
  triggerDownload(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), filename);
}

export function downloadText(text: string, filename: string, mime = 'text/plain'): void {
  triggerDownload(new Blob([text], { type: `${mime};charset=utf-8` }), filename);
}

/** Rasterize an SVG string to a PNG/JPEG Blob at an integer device scale. */
export function rasterize(
  svg: string,
  width: number,
  height: number,
  format: 'png' | 'jpeg',
  scale = 2,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas 2D context unavailable'));
        return;
      }
      if (format === 'jpeg') {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.drawImage(img, 0, 0);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Canvas export failed'))),
        format === 'jpeg' ? 'image/jpeg' : 'image/png',
        format === 'jpeg' ? 0.95 : undefined,
      );
    };
    img.onerror = () => reject(new Error('Failed to load SVG for rasterization'));
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });
}

/**
 * Vector PDF via the browser's own print engine on the self-contained SVG.
 * This gives faithful styling and correct fonts (including CJK) without a
 * fragile SVG->PDF library; the user picks "Save as PDF" in the print dialog.
 */
export function exportPdf(svg: string, width: number, height: number): void {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  Object.assign(iframe.style, {
    position: 'fixed',
    right: '0',
    bottom: '0',
    width: '0',
    height: '0',
    border: '0',
  });
  document.body.appendChild(iframe);
  const doc = iframe.contentWindow?.document;
  if (!doc) {
    iframe.remove();
    throw new Error('Could not open a print context for PDF export');
  }
  // @page size in inches (CSS px / 96) so the PDF page matches the diagram
  // instead of snapping to Letter/A4.
  const wIn = (width / 96).toFixed(3);
  const hIn = (height / 96).toFixed(3);
  doc.open();
  doc.write(
    `<!doctype html><html><head><meta charset="utf-8">` +
      `<style>@page{size:${wIn}in ${hIn}in;margin:0;}html,body{margin:0;padding:0;}svg{display:block;}</style>` +
      `</head><body>${svg}</body></html>`,
  );
  doc.close();
  const win = iframe.contentWindow;
  // A document written via document.write may never fire 'load', so trigger
  // print on a short timer rather than relying on the load event.
  setTimeout(() => {
    win?.focus();
    win?.print();
    setTimeout(() => iframe.remove(), 1000);
  }, 100);
}

/** High-level export entry used by the toolbar and the `export` command. */
export async function exportDiagram(
  svg: string,
  width: number,
  height: number,
  format: ExportFormat,
  scale = 2,
): Promise<void> {
  if (format === 'svg') {
    downloadSvg(svg);
    return;
  }
  if (format === 'pdf') {
    exportPdf(svg, width, height);
    return;
  }
  if (format === 'tikz') return; // tikz is generated from source by the caller
  const blob = await rasterize(svg, width, height, format, scale);
  triggerDownload(blob, `wave.${format === 'jpeg' ? 'jpg' : 'png'}`);
}
