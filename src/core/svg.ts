/**
 * SVG serializer: turns a layout `Shape[]` scene graph into a standalone SVG
 * string. Styles are embedded as a `<style>` block so the SVG renders identically
 * on disk and when rasterized to PNG/JPEG. Pure: no DOM.
 */
import type { LayoutResult, Shape } from './layout';
import type { Theme } from './theme';
import { escapeXml, nf } from './util';

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
      return `<text x="${nf(sh.x)}" y="${nf(sh.y)}"${attr('text-anchor', sh.anchor)}${attr('class', sh.cls)}${transform}>${escapeXml(sh.s)}</text>`;
    }
  }
}

// All selectors are scoped under `.wpg-root` (the class on the <svg> root) so the
// embedded <style> cannot leak into the host document when the SVG is inlined.
function styleBlock(t: Theme): string {
  const s = '.wpg-root';
  return `
    ${s} text{font-family:${t.fontFamily};dominant-baseline:alphabetic;}
    ${s} .bg{fill:${t.background};stroke:none;}
    ${s} .sig{fill:none;stroke:${t.stroke};stroke-width:1.4;stroke-linejoin:round;stroke-linecap:round;}
    ${s} .box{stroke:${t.stroke};stroke-width:1.4;stroke-linejoin:round;}
    ${s} .arrow{fill:${t.stroke};stroke:none;}
    ${s} .weak{fill:${t.tickColor};stroke:none;}
    ${s} .grid{stroke:${t.gridColor};stroke-width:1;}
    ${s} .name{fill:${t.stroke};font-size:${t.nameFontSize}px;}
    ${s} .data{fill:${t.stroke};font-size:${t.dataFontSize}px;font-family:${t.monoFamily};}
    ${s} .tick{fill:${t.tickColor};font-size:${t.tickFontSize}px;}
    ${s} .head{fill:${t.stroke};font-size:${t.headFontSize}px;font-weight:600;}
    ${s} .foot{fill:${t.tickColor};font-size:${t.tickFontSize}px;}
    ${s} .grp{fill:none;stroke:${t.groupColor};stroke-width:1.2;}
    ${s} .grp-label{fill:${t.tickColor};font-size:${t.nameFontSize}px;}
    ${s} .gapbg{fill:${t.background};stroke:none;}
    ${s} .gap{stroke:${t.stroke};stroke-width:1.2;}`;
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
    `<svg xmlns="http://www.w3.org/2000/svg" class="wpg-root" width="${width}" height="${height}" ` +
    `viewBox="0 0 ${width} ${height}">` +
    defsBlock(theme) +
    `<style>${styleBlock(theme)}</style>` +
    body +
    `</svg>`
  );
}
