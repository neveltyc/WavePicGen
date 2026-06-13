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
  const blob = await rasterize(svg, width, height, format, scale);
  triggerDownload(blob, `wave.${format === 'jpeg' ? 'jpg' : 'png'}`);
}
