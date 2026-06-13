/**
 * SVG serializer: turns a layout `Shape[]` scene graph into a standalone SVG
 * string. Styles are embedded as a `<style>` block so the SVG renders identically
 * on disk and when rasterized to PNG/JPEG. Pure: no DOM.
 */
import type { LayoutResult, Shape } from './layout';
import type { Theme } from './theme';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function nf(x: number): string {
  return Number.isInteger(x) ? String(x) : x.toFixed(2);
}

function attr(name: string, value: string | undefined): string {
  return value ? ` ${name}="${value}"` : '';
}

function shapeToSvg(sh: Shape): string {
  switch (sh.t) {
    case 'rect':
      return `<rect x="${nf(sh.x)}" y="${nf(sh.y)}" width="${nf(sh.w)}" height="${nf(sh.h)}"${
        sh.rx ? ` rx="${nf(sh.rx)}"` : ''
      }${attr('class', sh.cls)}${attr('fill', sh.fill)}/>`;
    case 'line':
      return `<line x1="${nf(sh.x1)}" y1="${nf(sh.y1)}" x2="${nf(sh.x2)}" y2="${nf(sh.y2)}"${attr('class', sh.cls)}/>`;
    case 'poly': {
      const pts = sh.pts.map(([x, y]) => `${nf(x)},${nf(y)}`).join(' ');
      const tag = sh.closed ? 'polygon' : 'polyline';
      return `<${tag} points="${pts}"${attr('class', sh.cls)}${attr('fill', sh.fill)}/>`;
    }
    case 'path':
      return `<path d="${sh.d}"${attr('class', sh.cls)}${attr('fill', sh.fill)}/>`;
    case 'text': {
      const transform = sh.rotate ? ` transform="rotate(${sh.rotate} ${nf(sh.x)} ${nf(sh.y)})"` : '';
      return `<text x="${nf(sh.x)}" y="${nf(sh.y)}"${attr('text-anchor', sh.anchor)}${attr('class', sh.cls)}${transform}>${esc(sh.s)}</text>`;
    }
  }
}

function styleBlock(t: Theme): string {
  return `
    text{font-family:${t.fontFamily};dominant-baseline:alphabetic;}
    .bg{fill:${t.background};stroke:none;}
    .sig{fill:none;stroke:${t.stroke};stroke-width:1.4;stroke-linejoin:round;stroke-linecap:round;}
    .box{stroke:${t.stroke};stroke-width:1.4;stroke-linejoin:round;}
    .arrow{fill:${t.stroke};stroke:none;}
    .weak{fill:${t.tickColor};stroke:none;}
    .grid{stroke:${t.gridColor};stroke-width:1;}
    .name{fill:${t.stroke};font-size:${t.nameFontSize}px;}
    .data{fill:${t.stroke};font-size:${t.dataFontSize}px;font-family:${t.monoFamily};}
    .tick{fill:${t.tickColor};font-size:${t.tickFontSize}px;}
    .head{fill:${t.stroke};font-size:${t.headFontSize}px;font-weight:600;}
    .foot{fill:${t.tickColor};font-size:${t.tickFontSize}px;}
    .grp{fill:none;stroke:${t.groupColor};stroke-width:1.2;}
    .grp-label{fill:${t.tickColor};font-size:${t.nameFontSize}px;}
    .gapbg{fill:${t.background};stroke:none;}
    .gap{stroke:${t.stroke};stroke-width:1.2;}`;
}

function defsBlock(t: Theme): string {
  return `<defs><pattern id="wpg-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="${t.hatchColor}" stroke-width="1.2"/></pattern></defs>`;
}

/** Serialize a layout result into a complete, standalone SVG document string. */
export function toSvg(layout: LayoutResult): string {
  const { width, height, shapes, theme } = layout;
  const body = shapes.map(shapeToSvg).join('');
  // Note: the font-family (which itself contains quotes) is set only in the
  // <style> block, never as an attribute, to keep the markup valid.
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
    `viewBox="0 0 ${width} ${height}">` +
    defsBlock(theme) +
    `<style>${styleBlock(theme)}</style>` +
    body +
    `</svg>`
  );
}
