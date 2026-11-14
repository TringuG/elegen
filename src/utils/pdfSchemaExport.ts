import {
  SwitchboardProject,
  SchemaDisplayMode,
  SchemaOrientation,
} from '../types/electrical';
import {
  calculateCircuitParameters,
  generateBom,
  getEffectiveUpstreamBreaker,
  getEffectiveInternalDevice,
  getEffectiveManufacturingInfo,
  calculateDinRailAllocation,
} from './electricalEngine';

export interface PdfExportOptions {
  paperFormat?: 'A4' | 'A3' | 'LARGE';
  orientation?: SchemaOrientation;
  displayMode?: SchemaDisplayMode;
  includeBom?: boolean;
  includeTechnicalReport?: boolean;
  svgElement?: SVGSVGElement | null;
}

/**
 * Converts a base64 data URL (image/jpeg) into raw Uint8Array bytes.
 */
function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1] || '';
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Builds a valid multi-page PDF 1.4 binary Blob from an array of JPEG pages.
 */
function buildPdfFromJpegPages(
  pages: Array<{
    jpegBytes: Uint8Array;
    pixelWidth: number;
    pixelHeight: number;
    ptWidth: number;
    ptHeight: number;
  }>
): Blob {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  let offset = 0;

  const pushText = (str: string) => {
    const bytes = encoder.encode(str);
    chunks.push(bytes);
    offset += bytes.length;
  };

  const pushBytes = (bytes: Uint8Array) => {
    chunks.push(bytes);
    offset += bytes.length;
  };

  const totalObjects = 2 + pages.length * 3;
  const offsets: number[] = new Array(totalObjects + 1).fill(0);

  // PDF Header (with binary comment per PDF spec)
  pushText('%PDF-1.4\n%\xFF\xFF\xFF\xFF\n');

  // Object 1: Catalog
  offsets[1] = offset;
  pushText('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

  // Object 2: Pages
  const kidsRefs = pages.map((_, idx) => `${3 + idx * 3} 0 R`).join(' ');
  offsets[2] = offset;
  pushText(`2 0 obj\n<< /Type /Pages /Kids [ ${kidsRefs} ] /Count ${pages.length} >>\nendobj\n`);

  // Page objects
  pages.forEach((page, idx) => {
    const pageObjId = 3 + idx * 3;
    const contentObjId = 4 + idx * 3;
    const imageObjId = 5 + idx * 3;

    const ptW = page.ptWidth.toFixed(2);
    const ptH = page.ptHeight.toFixed(2);

    // Page dictionary
    offsets[pageObjId] = offset;
    pushText(
      `${pageObjId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [ 0 0 ${ptW} ${ptH} ] /Resources << /XObject << /Im0 ${imageObjId} 0 R >> >> /Contents ${contentObjId} 0 R >>\nendobj\n`
    );

    // Content stream drawing the image across the full page
    const streamContent = `q\n${ptW} 0 0 ${ptH} 0 0 cm\n/Im0 Do\nQ\n`;
    const streamBytes = encoder.encode(streamContent);
    offsets[contentObjId] = offset;
    pushText(`${contentObjId} 0 obj\n<< /Length ${streamBytes.length} >>\nstream\n`);
    pushBytes(streamBytes);
    pushText('\nendstream\nendobj\n');

    // JPEG XObject stream
    offsets[imageObjId] = offset;
    pushText(
      `${imageObjId} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${page.pixelWidth} /Height ${page.pixelHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpegBytes.length} >>\nstream\n`
    );
    pushBytes(page.jpegBytes);
    pushText('\nendstream\nendobj\n');
  });

  // Cross-reference table
  const xrefOffset = offset;
  pushText(`xref\n0 ${totalObjects + 1}\n`);
  pushText('0000000000 65535 f \n');
  for (let i = 1; i <= totalObjects; i++) {
    const padded = String(offsets[i]).padStart(10, '0');
    pushText(`${padded} 00000 n \n`);
  }

  // Trailer
  pushText(
    `trailer\n<< /Size ${totalObjects + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  );

  return new Blob(chunks as BlobPart[], { type: 'application/pdf' });
}

/**
 * Loads an SVG element into an HTMLImageElement with explicit numeric dimensions
 * so it can be drawn onto a high-resolution 2D canvas without any external UI controls.
 */
async function renderSvgElementToImage(
  svgEl: SVGSVGElement
): Promise<{ img: HTMLImageElement; width: number; height: number }> {
  const clone = svgEl.cloneNode(true) as SVGSVGElement;

  const viewBoxAttr = clone.getAttribute('viewBox');
  let vbWidth = 960;
  let vbHeight = 1350;
  if (viewBoxAttr) {
    const parts = viewBoxAttr
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
      vbWidth = parts[2];
      vbHeight = parts[3];
    }
  }

  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(vbWidth));
  clone.setAttribute('height', String(vbHeight));
  clone.style.width = `${vbWidth}px`;
  clone.style.height = `${vbHeight}px`;

  const serializer = new XMLSerializer();
  const svgString = serializer.serializeToString(clone);
  const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ img, width: vbWidth, height: vbHeight });
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };
    img.src = url;
  });
}

/**
 * Helper to truncate text to fit within a maximum pixel width on a 2D canvas.
 */
function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let truncated = text;
  while (truncated.length > 1 && ctx.measureText(truncated + '…').width > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  return truncated + '…';
}

/**
 * Wraps text across up to `maxLines` lines fitting `maxWidth` on a 2D canvas.
 */
function wrapCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines = 2
): string[] {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
    } else {
      if (current) {
        lines.push(current);
        current = word;
      } else {
        lines.push(fitText(ctx, word, maxWidth));
        current = '';
      }
      if (lines.length >= maxLines) break;
    }
  }
  if (current && lines.length < maxLines) {
    lines.push(fitText(ctx, current, maxWidth));
  } else if (current && lines.length === maxLines) {
    lines[maxLines - 1] = fitText(ctx, lines[maxLines - 1] + ' ' + current, maxWidth);
  }
  return lines.length > 0 ? lines : [fitText(ctx, text, maxWidth)];
}

/**
 * Finds clean horizontal white-band slice intervals on a rendered schematic canvas
 * so tall multi-row portrait diagrams paginate cleanly between rows without cutting text or boxes.
 */
function computeCleanSchematicSlices(
  offCanvas: HTMLCanvasElement,
  maxSliceH: number
): Array<{ sy: number; sh: number }> {
  const totalH = offCanvas.height;
  const totalW = offCanvas.width;
  if (totalH <= maxSliceH) {
    return [{ sy: 0, sh: totalH }];
  }

  const offCtx = offCanvas.getContext('2d');
  if (!offCtx) {
    const fallback: Array<{ sy: number; sh: number }> = [];
    for (let y = 0; y < totalH; y += maxSliceH) {
      fallback.push({ sy: y, sh: Math.min(maxSliceH, totalH - y) });
    }
    return fallback;
  }

  const scanXStart = Math.round(totalW * 0.12);
  const scanXEnd = Math.round(totalW * 0.95);
  const imageData = offCtx.getImageData(0, 0, totalW, totalH).data;

  const isRowWhite = (y: number): boolean => {
    const rowOffset = y * totalW * 4;
    for (let x = scanXStart; x < scanXEnd; x += 4) {
      const idx = rowOffset + x * 4;
      if (imageData[idx] < 248 || imageData[idx + 1] < 248 || imageData[idx + 2] < 248) {
        return false;
      }
    }
    return true;
  };

  const slices: Array<{ sy: number; sh: number }> = [];
  let sy = 0;

  while (sy < totalH) {
    const remaining = totalH - sy;
    if (remaining <= maxSliceH) {
      slices.push({ sy, sh: remaining });
      break;
    }

    const idealEnd = sy + maxSliceH;
    const minCutY = sy + Math.round(maxSliceH * 0.42);
    let bestCutY = idealEnd;

    let bandHeight = 0;
    for (let y = idealEnd - 4; y >= minCutY; y--) {
      if (isRowWhite(y)) {
        bandHeight++;
        if (bandHeight >= 14) {
          bestCutY = y + Math.floor(bandHeight / 2);
          break;
        }
      } else {
        bandHeight = 0;
      }
    }

    const sh = Math.max(200, bestCutY - sy);
    slices.push({ sy, sh });
    sy += sh;
  }

  return slices;
}

export interface BreakerScheduleRow {
  label: string;
  name: string;
  breakerSpec: string;
  rcdSpec: string;
  phase: string;
  cableSpec: string;
  powerText: string;
  currentText: string;
  dropText: string;
  zsText: string;
  dropAndZsText: string;
}

/**
 * Collects all breaker rows (FA1..FAn + standalone RCBOs) for the schematic legend table.
 */
export function buildBreakerScheduleRows(project: SwitchboardProject): BreakerScheduleRow[] {
  const calcs = calculateCircuitParameters(project);
  const rows: BreakerScheduleRow[] = [];

  calcs.forEach((c) => {
    const circ = project.circuits.find((x) => x.id === c.circuitId);
    const rcd = project.rcds.find((r) => r.id === circ?.rcdId);
    rows.push({
      label: c.label,
      name: c.name,
      breakerSpec: `${c.poles} ${c.breakerChar}${c.breakerCurrentIn} A (${circ?.model || ''})`,
      rcdSpec: rcd
        ? `${rcd.label} (${rcd.ratedCurrent}A / ${rcd.sensitivity}mA, Typ ${rcd.type})`
        : 'Bez RCD (priamo)',
      phase: c.phase,
      cableSpec: `${c.cableText} (${c.lengthM} m)`,
      powerText: `${c.powerKw.toFixed(2)} kW`,
      currentText: `${c.designCurrentIb} A / ${c.currentCarryingCapacityIz} A`,
      dropText: `${c.voltageDropPercent}%`,
      zsText: `${c.loopImpedanceZsOhm} Ω`,
      dropAndZsText: `${c.voltageDropPercent}% / ${c.loopImpedanceZsOhm} Ω`,
    });
  });

  // Also include standalone RCBOs (kombinované ističochrániče bez podradených FA okruhov)
  project.rcds
    .filter((r) => r.deviceKind === 'RCBO' && !project.circuits.some((c) => c.rcdId === r.id))
    .forEach((rcbo) => {
      const pKw = rcbo.powerKw ?? 0.6;
      const ib = ((pKw * 1000) / 230).toFixed(2);
      rows.push({
        label: rcbo.label,
        name: rcbo.circuitName || rcbo.notes || 'Samostatný okruh RCBO',
        breakerSpec: `RCBO ${rcbo.poles} ${rcbo.characteristic || 'B'}${rcbo.ratedCurrent} A (${rcbo.model})`,
        rcdSpec: `Integrovaný RCBO ${rcbo.sensitivity}mA (Typ ${rcbo.type})`,
        phase: rcbo.phase || (rcbo.poles === '4P' ? 'L1,L2,L3' : 'L1'),
        cableSpec: `${rcbo.cableType || 'CYKY-J 3x2,5 mm²'} (${rcbo.cableLengthM || 15} m)`,
        powerText: `${pKw.toFixed(2)} kW`,
        currentText: `${ib} A / 24 A`,
        dropText: '0.35%',
        zsText: '0.52 Ω',
        dropAndZsText: `0.35% / 0.52 Ω`,
      });
    });

  return rows;
}

/**
 * Draws the shared outer STN EN ISO 5457 frame, top header, and bottom STN ISO 7200 stamp
 * onto a Portrait A4 sheet (1800 x 2545 px).
 */
function drawPortraitA4Chrome(
  ctx: CanvasRenderingContext2D,
  project: SwitchboardProject,
  pageW: number,
  pageH: number,
  margin: number,
  subtitleTag: string,
  formatLabel: string
): { contentW: number; bodyTopY: number; bodyAvailH: number } {
  const contentW = pageW - margin * 2;
  const headerH = 152;
  const footerStampH = 118;

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, pageW, pageH);

  // Outer engineering border (STN EN ISO 5457)
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 3.5;
  ctx.strokeRect(margin - 16, margin - 16, contentW + 32, pageH - (margin - 16) * 2);

  const upstream = getEffectiveUpstreamBreaker(project);
  const internalDev = getEffectiveInternalDevice(project);
  const din = calculateDinRailAllocation(project);

  // 1. TOP HEADER
  const curY = margin;
  ctx.fillStyle = '#F8FAFC';
  ctx.fillRect(margin, curY, contentW, headerH);
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 2.5;
  ctx.strokeRect(margin, curY, contentW, headerH);

  const metaBoxW = 430;
  const metaBoxX = margin + contentW - metaBoxW;
  const leftTextW = contentW - metaBoxW - 36;

  ctx.fillStyle = '#0052CC';
  ctx.font = 'bold 21px "JetBrains Mono", monospace';
  ctx.fillText(fitText(ctx, subtitleTag, leftTextW), margin + 22, curY + 34);

  ctx.fillStyle = '#000000';
  ctx.font = 'bold 33px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(fitText(ctx, project.name, leftTextW), margin + 22, curY + 76);

  const upstreamSummary = upstream.enabled
    ? `${upstream.designation}: ${upstream.poles} ${upstream.characteristic}${upstream.ratedCurrent}A`
    : `${upstream.designation}: Nezahrnutý`;
  const internalSummary = internalDev.enabled
    ? `${internalDev.designation}: ${internalDev.deviceType} ${internalDev.poles} ${internalDev.ratedCurrent}A`
    : 'Bez hl. prvku';

  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 19px "JetBrains Mono", monospace';
  ctx.fillText(
    fitText(
      ctx,
      `${upstreamSummary} | ${internalSummary} | ${project.supplySystem.toUpperCase()} (${project.voltage}, ${project.networkSystem})`,
      leftTextW
    ),
    margin + 22,
    curY + 109
  );
  ctx.fillStyle = '#1E293B';
  ctx.font = '600 18px "JetBrains Mono", monospace';
  ctx.fillText(
    fitText(ctx, `Prívod: ${project.supplyCable} | Krytie: ${project.ipRating}`, leftTextW),
    margin + 22,
    curY + 136
  );

  // Right metadata box
  ctx.beginPath();
  ctx.moveTo(metaBoxX, curY);
  ctx.lineTo(metaBoxX, curY + headerH);
  ctx.stroke();

  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 19px "JetBrains Mono", monospace';
  ctx.fillText(fitText(ctx, `Projekt: ${project.projectNumber}`, metaBoxW - 32), metaBoxX + 18, curY + 42);
  ctx.fillText(`Dátum: ${project.projectDate}`, metaBoxX + 18, curY + 76);
  ctx.fillText(
    `DIN: ${din.totalUsedModules} / ${din.totalCapacityModules} M (${project.ipRating})`,
    metaBoxX + 18,
    curY + 110
  );
  ctx.fillStyle = '#0052CC';
  ctx.fillText(formatLabel, metaBoxX + 18, curY + 140);

  // 2. BOTTOM STN ISO 7200 TITLE BLOCK STAMP
  const stampY = pageH - margin - footerStampH;
  ctx.fillStyle = '#F8FAFC';
  ctx.fillRect(margin, stampY, contentW, footerStampH);
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 2.5;
  ctx.strokeRect(margin, stampY, contentW, footerStampH);

  const col1W = 540;
  const col2W = 640;
  const col3W = contentW - col1W - col2W;

  ctx.beginPath();
  ctx.moveTo(margin + col1W, stampY);
  ctx.lineTo(margin + col1W, stampY + footerStampH);
  ctx.moveTo(margin + col1W + col2W, stampY);
  ctx.lineTo(margin + col1W + col2W, stampY + footerStampH);
  ctx.stroke();

  ctx.fillStyle = '#334155';
  ctx.font = 'bold 16px "JetBrains Mono", monospace';
  ctx.fillText('ZODPOVEDNÝ PROJEKTANT:', margin + 18, stampY + 29);
  ctx.fillText('NÁZOV VÝKRESU / ROZVÁDZAČA:', margin + col1W + 18, stampY + 29);
  ctx.fillText('VÝKRES / FORMÁT / REVÍZIA:', margin + col1W + col2W + 18, stampY + 29);

  ctx.fillStyle = '#000000';
  ctx.font = 'bold 22px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(fitText(ctx, project.designerName, col1W - 34), margin + 18, stampY + 66);
  ctx.fillText(fitText(ctx, project.name, col2W - 34), margin + col1W + 18, stampY + 66);
  ctx.font = 'bold 21px "JetBrains Mono", monospace';
  ctx.fillText(
    fitText(ctx, `${project.projectNumber} • ${formatLabel}`, col3W - 34),
    margin + col1W + col2W + 18,
    stampY + 66
  );

  ctx.fillStyle = '#1E293B';
  ctx.font = '600 18px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(
    fitText(ctx, `Miesto: ${project.locationCity || 'Bratislava'}`, col1W - 34),
    margin + 18,
    stampY + 99
  );
  ctx.fillText(
    fitText(
      ctx,
      `Sústava: ${project.supplySystem.toUpperCase()} / ${project.voltage} / ${project.networkSystem}`,
      col2W - 34
    ),
    margin + col1W + 18,
    stampY + 99
  );
  ctx.fillText(
    fitText(ctx, `STN 33 2000-6 • ${project.projectDate}`, col3W - 34),
    margin + col1W + col2W + 18,
    stampY + 99
  );

  const bodyTopY = curY + headerH + 20;
  const bodyAvailH = stampY - 20 - bodyTopY;

  return { contentW, bodyTopY, bodyAvailH };
}

/**
 * Renders the clean engineering drawing page(s) (Pure Schematic + Breaker-to-Circuit Schedule Table)
 * onto high-resolution HTML5 Canvas element(s), optimized for A4 Portrait or A3/A4 Landscape printing.
 */
export async function renderCleanSchemaPagesToCanvases(
  project: SwitchboardProject,
  options: PdfExportOptions = {}
): Promise<HTMLCanvasElement[]> {
  const svgEl =
    options.svgElement ||
    (document.querySelector('svg.schema-canvas-svg') as SVGSVGElement | null);

  const orientation: SchemaOrientation =
    options.orientation ??
    (options.paperFormat === 'A3' || options.paperFormat === 'LARGE' ? 'landscape' : 'portrait');
  const paperFormat = options.paperFormat ?? (orientation === 'portrait' ? 'A4' : 'A3');

  const breakerRows = buildBreakerScheduleRows(project);

  // Render SVG schematic if available
  let svgRendered: { img: HTMLImageElement; width: number; height: number } | null = null;
  if (svgEl) {
    try {
      svgRendered = await renderSvgElementToImage(svgEl);
    } catch {
      svgRendered = null;
    }
  }

  // ===========================================================================
  // MODE A: PORTRAIT A4 (NA VÝŠKU) — ČITATEĽNÉ VEĽKÉ PÍSMO NA TLAČIARNI A4
  // ===========================================================================
  if (orientation === 'portrait') {
    const pageW = 1800; // Exact ISO A4 Portrait ratio (1 : 1.414)
    const pageH = 2545;
    const margin = 56;
    const contentW = pageW - margin * 2;
    const canvases: HTMLCanvasElement[] = [];

    // 1. Rasterize SVG at full A4 Portrait content width so zero text shrinks
    if (svgRendered) {
      const targetW = contentW;
      const targetH = Math.max(
        400,
        Math.round((svgRendered.height / svgRendered.width) * targetW)
      );
      const offCanvas = document.createElement('canvas');
      offCanvas.width = targetW;
      offCanvas.height = targetH;
      const offCtx = offCanvas.getContext('2d')!;
      offCtx.fillStyle = '#FFFFFF';
      offCtx.fillRect(0, 0, targetW, targetH);
      offCtx.drawImage(svgRendered.img, 0, 0, targetW, targetH);

      // Probe body height using temporary page geometry
      const headerH = 152;
      const footerStampH = 118;
      const maxSchematicH = pageH - margin - headerH - 20 - 20 - footerStampH - margin;
      const slices = computeCleanSchematicSlices(offCanvas, maxSchematicH);

      slices.forEach((slice, sliceIdx) => {
        const pageCanvas = document.createElement('canvas');
        pageCanvas.width = pageW;
        pageCanvas.height = pageH;
        const pCtx = pageCanvas.getContext('2d')!;

        const subtitle =
          slices.length > 1
            ? `ELEKTRICKÁ SCHÉMA ROZVÁDZAČA (ČASŤ ${sliceIdx + 1}/${slices.length}) • STN EN 61439-3`
            : 'ELEKTRICKÁ SCHÉMA ROZVÁDZAČA • STN EN 61439-3 / STN EN 60617';

        const { bodyTopY } = drawPortraitA4Chrome(
          pCtx,
          project,
          pageW,
          pageH,
          margin,
          subtitle,
          `${paperFormat} NA VÝŠKU`
        );

        pCtx.fillStyle = '#FFFFFF';
        pCtx.fillRect(margin, bodyTopY, contentW, slice.sh);
        pCtx.drawImage(
          offCanvas,
          0,
          slice.sy,
          targetW,
          slice.sh,
          margin,
          bodyTopY,
          contentW,
          slice.sh
        );
        pCtx.strokeStyle = '#000000';
        pCtx.lineWidth = 2.5;
        pCtx.strokeRect(margin, bodyTopY, contentW, slice.sh);

        canvases.push(pageCanvas);
      });
    } else {
      const pageCanvas = document.createElement('canvas');
      pageCanvas.width = pageW;
      pageCanvas.height = pageH;
      const pCtx = pageCanvas.getContext('2d')!;
      const { bodyTopY } = drawPortraitA4Chrome(
        pCtx,
        project,
        pageW,
        pageH,
        margin,
        'ELEKTRICKÁ SCHÉMA ROZVÁDZAČA • STN EN 61439-3 / STN EN 60617',
        `${paperFormat} NA VÝŠKU`
      );
      pCtx.fillStyle = '#000000';
      pCtx.font = 'bold 28px "Plus Jakarta Sans", sans-serif';
      pCtx.fillText('Elektrická schéma zapojenia rozvádzača', margin + 32, bodyTopY + 64);
      canvases.push(pageCanvas);
    }

    // 2. Dedicated A4 Portrait Page(s) for Breaker-to-Circuit Schedule (veľké čitateľné písmo)
    const tableCols = [
      { title: 'Istič', width: 130 },
      { title: 'Okruh / Spotrebič na ističi', width: 495 },
      { title: 'Istič a prúdový chránič (RCD)', width: 345 },
      { title: 'Fáza a napájací kábel', width: 315 },
      { title: 'Príkon / Ib / Iz', width: 215 },
      { title: 'ΔU / Zs', width: contentW - 1500 },
    ];
    const sectionTitleH = 58;
    const tableHeaderH = 54;
    const rowH = 74;

    const sampleAvailH = pageH - margin - 152 - 20 - 20 - 118 - margin;
    const rowsPerPage = Math.max(
      8,
      Math.floor((sampleAvailH - sectionTitleH - tableHeaderH - 12) / rowH)
    );
    const totalTablePages = Math.max(1, Math.ceil(breakerRows.length / rowsPerPage));

    for (let p = 0; p < totalTablePages; p++) {
      const sliceRows = breakerRows.slice(p * rowsPerPage, (p + 1) * rowsPerPage);
      const tCanvas = document.createElement('canvas');
      tCanvas.width = pageW;
      tCanvas.height = pageH;
      const tCtx = tCanvas.getContext('2d')!;

      const { bodyTopY } = drawPortraitA4Chrome(
        tCtx,
        project,
        pageW,
        pageH,
        margin,
        totalTablePages > 1
          ? `ROZPIS ISTIČOV A OKRUHOV (STRANA ${p + 1}/${totalTablePages}) • STN EN 61439-3`
          : 'ROZPIS ISTIČOV A ELEKTRICKÝCH OKRUHOV • STN EN 61439-3',
        `${paperFormat} NA VÝŠKU`
      );

      let curY = bodyTopY;

      // Section Banner
      tCtx.fillStyle = '#0F172A';
      tCtx.fillRect(margin, curY, contentW, sectionTitleH);
      tCtx.fillStyle = '#FFFFFF';
      tCtx.font = 'bold 23px "Plus Jakarta Sans", sans-serif';
      tCtx.fillText(
        totalTablePages > 1
          ? `POPIS K SCHÉME — ROZPIS ISTIČOV A OKRUHOV (${p + 1}/${totalTablePages})`
          : 'POPIS K SCHÉME — ROZPIS ISTIČOV A OKRUHOV (KTORÝ OKRUH JE NA KTOROM ISTIČI)',
        margin + 20,
        curY + 37
      );
      curY += sectionTitleH;

      // Table Header Row
      tCtx.fillStyle = '#E2E8F0';
      tCtx.fillRect(margin, curY, contentW, tableHeaderH);
      tCtx.strokeStyle = '#000000';
      tCtx.lineWidth = 2;
      tCtx.strokeRect(margin, curY, contentW, tableHeaderH);

      let colX = margin;
      tCtx.fillStyle = '#000000';
      tCtx.font = 'bold 20px "Plus Jakarta Sans", sans-serif';
      tableCols.forEach((col, i) => {
        tCtx.fillText(fitText(tCtx, col.title, col.width - 20), colX + 14, curY + 34);
        colX += col.width;
        if (i < tableCols.length - 1) {
          tCtx.beginPath();
          tCtx.moveTo(colX, curY);
          tCtx.lineTo(colX, curY + tableHeaderH);
          tCtx.stroke();
        }
      });
      curY += tableHeaderH;

      const tableStartY = curY;

      sliceRows.forEach((row, rIdx) => {
        tCtx.fillStyle = rIdx % 2 === 0 ? '#FFFFFF' : '#F8FAFC';
        tCtx.fillRect(margin, curY, contentW, rowH);
        tCtx.strokeStyle = '#94A3B8';
        tCtx.lineWidth = 1.5;
        tCtx.strokeRect(margin, curY, contentW, rowH);

        let cx = margin;

        // Col 0: Istič (FA1)
        tCtx.fillStyle = '#0052CC';
        tCtx.font = 'bold 24px "JetBrains Mono", monospace';
        tCtx.fillText(fitText(tCtx, row.label, tableCols[0].width - 20), cx + 14, curY + 45);
        cx += tableCols[0].width;

        // Vertical separator
        tCtx.strokeStyle = '#CBD5E1';
        tCtx.beginPath();
        tCtx.moveTo(cx, curY);
        tCtx.lineTo(cx, curY + rowH);
        tCtx.stroke();

        // Col 1: Okruh / Spotrebič (2 lines)
        tCtx.fillStyle = '#000000';
        tCtx.font = 'bold 22px "Plus Jakarta Sans", sans-serif';
        const nameLines = wrapCanvasText(tCtx, row.name, tableCols[1].width - 24, 2);
        if (nameLines.length === 1) {
          tCtx.fillText(nameLines[0], cx + 14, curY + 44);
        } else {
          tCtx.fillText(nameLines[0], cx + 14, curY + 31);
          tCtx.fillText(nameLines[1], cx + 14, curY + 58);
        }
        cx += tableCols[1].width;
        tCtx.beginPath();
        tCtx.moveTo(cx, curY);
        tCtx.lineTo(cx, curY + rowH);
        tCtx.stroke();

        // Col 2: Istič & RCD
        tCtx.fillStyle = '#000000';
        tCtx.font = 'bold 19px "JetBrains Mono", monospace';
        tCtx.fillText(fitText(tCtx, row.breakerSpec, tableCols[2].width - 22), cx + 12, curY + 30);
        tCtx.fillStyle = '#1E293B';
        tCtx.font = '600 18px "JetBrains Mono", monospace';
        tCtx.fillText(fitText(tCtx, row.rcdSpec, tableCols[2].width - 22), cx + 12, curY + 57);
        cx += tableCols[2].width;
        tCtx.beginPath();
        tCtx.moveTo(cx, curY);
        tCtx.lineTo(cx, curY + rowH);
        tCtx.stroke();

        // Col 3: Fáza & Kábel
        tCtx.fillStyle = '#000000';
        tCtx.font = 'bold 19px "JetBrains Mono", monospace';
        tCtx.fillText(fitText(tCtx, `Fáza: ${row.phase}`, tableCols[3].width - 22), cx + 12, curY + 30);
        tCtx.fillStyle = '#1E293B';
        tCtx.font = '600 18px "JetBrains Mono", monospace';
        tCtx.fillText(fitText(tCtx, row.cableSpec, tableCols[3].width - 22), cx + 12, curY + 57);
        cx += tableCols[3].width;
        tCtx.beginPath();
        tCtx.moveTo(cx, curY);
        tCtx.lineTo(cx, curY + rowH);
        tCtx.stroke();

        // Col 4: Príkon / Ib / Iz
        tCtx.fillStyle = '#000000';
        tCtx.font = 'bold 19px "JetBrains Mono", monospace';
        tCtx.fillText(fitText(tCtx, row.powerText, tableCols[4].width - 22), cx + 12, curY + 30);
        tCtx.fillStyle = '#1E293B';
        tCtx.font = '600 18px "JetBrains Mono", monospace';
        tCtx.fillText(fitText(tCtx, row.currentText, tableCols[4].width - 22), cx + 12, curY + 57);
        cx += tableCols[4].width;
        tCtx.beginPath();
        tCtx.moveTo(cx, curY);
        tCtx.lineTo(cx, curY + rowH);
        tCtx.stroke();

        // Col 5: ΔU / Zs
        tCtx.fillStyle = '#000000';
        tCtx.font = 'bold 19px "JetBrains Mono", monospace';
        tCtx.fillText(fitText(tCtx, `ΔU: ${row.dropText}`, tableCols[5].width - 20), cx + 12, curY + 30);
        tCtx.fillStyle = '#1E293B';
        tCtx.font = '600 18px "JetBrains Mono", monospace';
        tCtx.fillText(fitText(tCtx, `Zs: ${row.zsText}`, tableCols[5].width - 20), cx + 12, curY + 57);

        curY += rowH;
      });

      // Outer border around table
      tCtx.strokeStyle = '#000000';
      tCtx.lineWidth = 2.5;
      tCtx.strokeRect(
        margin,
        tableStartY - tableHeaderH - sectionTitleH,
        contentW,
        sectionTitleH + tableHeaderH + sliceRows.length * rowH
      );

      canvases.push(tCanvas);
    }

    // 3. Optional Bill of Materials (Kusovník) on Portrait A4 Page(s)
    if (options.includeBom) {
      const bom = generateBom(project);
      const bomCols = [
        { title: 'Kód', width: 130 },
        { title: 'Označenie', width: 220 },
        { title: 'Špecifikácia prístroja', width: 575 },
        { title: 'Výrobca a model / Kat. č.', width: 470 },
        { title: 'Mod. / Ks', width: contentW - 1395 },
      ];
      const bomSectionH = 58;
      const bomHeaderH = 54;
      const bomRowH = 72;
      const bomRowsPerPage = Math.max(
        8,
        Math.floor((sampleAvailH - bomSectionH - bomHeaderH - 12) / bomRowH)
      );
      const totalBomPages = Math.max(1, Math.ceil(bom.length / bomRowsPerPage));

      for (let bp = 0; bp < totalBomPages; bp++) {
        const bomSlice = bom.slice(bp * bomRowsPerPage, (bp + 1) * bomRowsPerPage);
        const bCanvas = document.createElement('canvas');
        bCanvas.width = pageW;
        bCanvas.height = pageH;
        const bCtx = bCanvas.getContext('2d')!;

        const { bodyTopY } = drawPortraitA4Chrome(
          bCtx,
          project,
          pageW,
          pageH,
          margin,
          totalBomPages > 1
            ? `VÝKAZ MATERIÁLU — KUSOVNÍK BOM (${bp + 1}/${totalBomPages}) • STN EN 61439-3`
            : 'VÝKAZ MATERIÁLU — KUSOVNÍK PRÍSTROJOV (BOM) • STN EN 61439-3',
          `${paperFormat} NA VÝŠKU`
        );

        let y2 = bodyTopY;
        bCtx.fillStyle = '#0F172A';
        bCtx.fillRect(margin, y2, contentW, bomSectionH);
        bCtx.fillStyle = '#FFFFFF';
        bCtx.font = 'bold 23px "Plus Jakarta Sans", sans-serif';
        bCtx.fillText(
          `PRÍLOHA — VÝKAZ MATERIÁLU (KUSOVNÍK PRÍSTROJOV BOM)`,
          margin + 20,
          y2 + 37
        );
        y2 += bomSectionH;

        bCtx.fillStyle = '#E2E8F0';
        bCtx.fillRect(margin, y2, contentW, bomHeaderH);
        bCtx.strokeStyle = '#000000';
        bCtx.lineWidth = 2;
        bCtx.strokeRect(margin, y2, contentW, bomHeaderH);

        let bx = margin;
        bCtx.fillStyle = '#000000';
        bCtx.font = 'bold 20px "Plus Jakarta Sans", sans-serif';
        bomCols.forEach((col, idx) => {
          bCtx.fillText(fitText(bCtx, col.title, col.width - 20), bx + 14, y2 + 34);
          bx += col.width;
          if (idx < bomCols.length - 1) {
            bCtx.beginPath();
            bCtx.moveTo(bx, y2);
            bCtx.lineTo(bx, y2 + bomHeaderH);
            bCtx.stroke();
          }
        });
        y2 += bomHeaderH;

        const bomStartY = y2;
        bomSlice.forEach((b, rIdx) => {
          bCtx.fillStyle = rIdx % 2 === 0 ? '#FFFFFF' : '#F8FAFC';
          bCtx.fillRect(margin, y2, contentW, bomRowH);
          bCtx.strokeStyle = '#94A3B8';
          bCtx.lineWidth = 1.5;
          bCtx.strokeRect(margin, y2, contentW, bomRowH);

          let cx = margin;
          bCtx.fillStyle = '#0052CC';
          bCtx.font = 'bold 21px "JetBrains Mono", monospace';
          bCtx.fillText(fitText(bCtx, b.code, bomCols[0].width - 20), cx + 14, y2 + 44);
          cx += bomCols[0].width;

          bCtx.fillStyle = '#000000';
          bCtx.font = 'bold 20px "JetBrains Mono", monospace';
          bCtx.fillText(fitText(bCtx, b.designation, bomCols[1].width - 20), cx + 14, y2 + 31);
          bCtx.fillStyle = '#334155';
          bCtx.font = '600 17px "Plus Jakarta Sans", sans-serif';
          bCtx.fillText(fitText(bCtx, b.category, bomCols[1].width - 20), cx + 14, y2 + 56);
          cx += bomCols[1].width;

          bCtx.fillStyle = '#000000';
          bCtx.font = 'bold 20px "Plus Jakarta Sans", sans-serif';
          const descLines = wrapCanvasText(bCtx, b.description, bomCols[2].width - 22, 2);
          if (descLines.length === 1) {
            bCtx.fillText(descLines[0], cx + 14, y2 + 44);
          } else {
            bCtx.fillText(descLines[0], cx + 14, y2 + 31);
            bCtx.fillText(descLines[1], cx + 14, y2 + 57);
          }
          cx += bomCols[2].width;

          bCtx.fillStyle = '#000000';
          bCtx.font = 'bold 19px "JetBrains Mono", monospace';
          bCtx.fillText(
            fitText(bCtx, `${b.manufacturer} ${b.model}`, bomCols[3].width - 22),
            cx + 14,
            y2 + 31
          );
          bCtx.fillStyle = '#334155';
          bCtx.font = '600 18px "JetBrains Mono", monospace';
          bCtx.fillText(fitText(bCtx, b.catalogNumber, bomCols[3].width - 22), cx + 14, y2 + 56);
          cx += bomCols[3].width;

          bCtx.fillStyle = '#000000';
          bCtx.font = 'bold 21px "JetBrains Mono", monospace';
          bCtx.fillText(`${b.quantity} ks`, cx + 14, y2 + 31);
          bCtx.fillStyle = '#334155';
          bCtx.font = '600 18px "JetBrains Mono", monospace';
          bCtx.fillText(b.modules > 0 ? `${b.modules} M` : '-', cx + 14, y2 + 56);

          y2 += bomRowH;
        });

        bCtx.strokeStyle = '#000000';
        bCtx.lineWidth = 2.5;
        bCtx.strokeRect(
          margin,
          bomStartY - bomHeaderH - bomSectionH,
          contentW,
          bomSectionH + bomHeaderH + bomSlice.length * bomRowH
        );

        canvases.push(bCanvas);
      }
    }

    return canvases;
  }

  // ===========================================================================
  // MODE B: LANDSCAPE (NA ŠÍRKU) — A4 / A3 / A2 S VÄČŠÍMI A KONTRASTNEJŠÍMI FONTMI
  // ===========================================================================
  const upstream = getEffectiveUpstreamBreaker(project);
  const internalDev = getEffectiveInternalDevice(project);
  const din = calculateDinRailAllocation(project);

  const pageW = 2400;
  const margin = 56;
  const contentW = pageW - margin * 2;

  const schemaDrawW = contentW;
  const schemaDrawH = svgRendered
    ? Math.round((svgRendered.height / svgRendered.width) * schemaDrawW)
    : 760;

  const headerH = 128;
  const sectionTitleH = 50;
  const tableHeaderH = 48;
  const tableRowH = 46;
  const tableTotalH =
    sectionTitleH + tableHeaderH + Math.max(1, breakerRows.length) * tableRowH + 20;
  const footerStampH = 104;

  // For A4 landscape or large schematics, move the schedule table to Page 2 so nothing shrinks below readable pt
  const combinedH =
    margin + headerH + 24 + schemaDrawH + 28 + tableTotalH + 24 + footerStampH + margin;
  const splitScheduleToSeparatePage = paperFormat === 'A4' || combinedH > 1950;

  const page1H = splitScheduleToSeparatePage
    ? Math.max(1697, margin + headerH + 24 + schemaDrawH + 24 + footerStampH + margin)
    : Math.max(1697, combinedH);

  const canvas1 = document.createElement('canvas');
  canvas1.width = pageW;
  canvas1.height = page1H;
  const ctx = canvas1.getContext('2d')!;

  // White paper background
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, pageW, page1H);

  // Outer engineering border (STN EN ISO 5457)
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 3.5;
  ctx.strokeRect(margin - 16, margin - 16, contentW + 32, page1H - (margin - 16) * 2);

  let curY = margin;

  // 1. TOP DRAWING HEADER
  ctx.fillStyle = '#F8FAFC';
  ctx.fillRect(margin, curY, contentW, headerH);
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 2.5;
  ctx.strokeRect(margin, curY, contentW, headerH);

  ctx.fillStyle = '#0052CC';
  ctx.font = 'bold 20px "JetBrains Mono", monospace';
  ctx.fillText(
    'ELEKTRICKÁ SCHÉMA ROZVÁDZAČA A ROZPIS ISTIČOV • STN EN 61439-3 / STN EN 60617',
    margin + 22,
    curY + 34
  );

  ctx.fillStyle = '#000000';
  ctx.font = 'bold 34px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(fitText(ctx, project.name, contentW - 500), margin + 22, curY + 76);

  const upstreamSummary = upstream.enabled
    ? `Pred elektromerom (${upstream.designation}): ${upstream.poles} ${upstream.characteristic}${upstream.ratedCurrent} A (${upstream.placement})`
    : `Pred elektromerom (${upstream.designation}): Nezahrnutý`;
  const internalSummary = internalDev.enabled
    ? `V rozvádzači (${internalDev.designation}): ${internalDev.deviceType} (${internalDev.poles} ${internalDev.hasOvercurrentProtection && internalDev.characteristic ? internalDev.characteristic : ''}${internalDev.ratedCurrent} A)`
    : 'V rozvádzači: Bez hl. prvku';

  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 19px "JetBrains Mono", monospace';
  ctx.fillText(
    fitText(
      ctx,
      `${upstreamSummary}   |   ${internalSummary}   |   Sústava: ${project.supplySystem.toUpperCase()} (${project.voltage}, ${project.networkSystem})   |   Prívod: ${project.supplyCable}`,
      contentW - 490
    ),
    margin + 22,
    curY + 110
  );

  // Right-side metadata box inside top header
  const metaBoxX = margin + contentW - 440;
  ctx.beginPath();
  ctx.moveTo(metaBoxX, curY);
  ctx.lineTo(metaBoxX, curY + headerH);
  ctx.stroke();

  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 18px "JetBrains Mono", monospace';
  ctx.fillText(`Číslo projektu: ${project.projectNumber}`, metaBoxX + 20, curY + 40);
  ctx.fillText(`Dátum: ${project.projectDate}`, metaBoxX + 20, curY + 72);
  ctx.fillText(
    `Kapacita: ${din.totalUsedModules} / ${din.totalCapacityModules} M (${project.ipRating})`,
    metaBoxX + 20,
    curY + 104
  );

  curY += headerH + 24;

  // 2. PURE ELECTRICAL SCHEMATIC
  if (svgRendered) {
    ctx.save();
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(margin, curY, schemaDrawW, schemaDrawH);
    ctx.drawImage(svgRendered.img, margin, curY, schemaDrawW, schemaDrawH);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(margin, curY, schemaDrawW, schemaDrawH);
    ctx.restore();
  } else {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(margin, curY, schemaDrawW, schemaDrawH);
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 26px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('Elektrická schéma zapojenia rozvádzača', margin + 40, curY + 60);
  }

  curY += schemaDrawH + 28;

  const drawLandscapeBreakerTable = (
    targetCtx: CanvasRenderingContext2D,
    startY: number,
    rowsSubset: BreakerScheduleRow[]
  ) => {
    let ty = startY;
    targetCtx.fillStyle = '#0F172A';
    targetCtx.fillRect(margin, ty, contentW, sectionTitleH);
    targetCtx.fillStyle = '#FFFFFF';
    targetCtx.font = 'bold 22px "Plus Jakarta Sans", sans-serif';
    targetCtx.fillText(
      'POPIS K SCHÉME — ROZPIS ISTIČOV A ELEKTRICKÝCH OKRUHOV (KTORÝ OKRUH JE NA KTOROM ISTIČI)',
      margin + 18,
      ty + 33
    );
    ty += sectionTitleH;

    const cols = [
      { title: 'Istič', width: 105 },
      { title: 'Ktorý okruh / spotrebič je na ističi', width: 515 },
      { title: 'Typ a hodnota ističa', width: 340 },
      { title: 'Prúdový chránič (RCD)', width: 335 },
      { title: 'Fáza', width: 125 },
      { title: 'Kábel a dĺžka', width: 325 },
      { title: 'Príkon P', width: 135 },
      { title: 'Prúd Ib / Iz', width: 190 },
      { title: 'ΔU / Slučka Zs', width: contentW - 2070 },
    ];

    targetCtx.fillStyle = '#E2E8F0';
    targetCtx.fillRect(margin, ty, contentW, tableHeaderH);
    targetCtx.strokeStyle = '#000000';
    targetCtx.lineWidth = 2;
    targetCtx.strokeRect(margin, ty, contentW, tableHeaderH);

    let colX = margin;
    targetCtx.fillStyle = '#000000';
    targetCtx.font = 'bold 19px "Plus Jakarta Sans", sans-serif';
    cols.forEach((col, i) => {
      targetCtx.fillText(col.title, colX + 12, ty + 31);
      colX += col.width;
      if (i < cols.length - 1) {
        targetCtx.beginPath();
        targetCtx.moveTo(colX, ty);
        targetCtx.lineTo(colX, ty + tableHeaderH);
        targetCtx.stroke();
      }
    });
    ty += tableHeaderH;

    rowsSubset.forEach((row, rIdx) => {
      targetCtx.fillStyle = rIdx % 2 === 0 ? '#FFFFFF' : '#F8FAFC';
      targetCtx.fillRect(margin, ty, contentW, tableRowH);
      targetCtx.strokeStyle = '#94A3B8';
      targetCtx.lineWidth = 1.2;
      targetCtx.strokeRect(margin, ty, contentW, tableRowH);

      let cellX = margin;
      const cells = [
        { text: row.label, bold: true, color: '#0052CC', mono: true },
        { text: row.name, bold: true, color: '#000000', mono: false },
        { text: row.breakerSpec, bold: true, color: '#000000', mono: true },
        { text: row.rcdSpec, bold: true, color: '#0F172A', mono: true },
        { text: row.phase, bold: true, color: '#000000', mono: true },
        { text: row.cableSpec, bold: true, color: '#000000', mono: true },
        { text: row.powerText, bold: true, color: '#000000', mono: true },
        { text: row.currentText, bold: true, color: '#0F172A', mono: true },
        { text: row.dropAndZsText, bold: true, color: '#000000', mono: true },
      ];

      cells.forEach((cell, cIdx) => {
        const w = cols[cIdx].width;
        targetCtx.fillStyle = cell.color;
        targetCtx.font = `${cell.bold ? 'bold' : '600'} 18px ${
          cell.mono ? '"JetBrains Mono", monospace' : '"Plus Jakarta Sans", sans-serif'
        }`;
        targetCtx.fillText(fitText(targetCtx, cell.text, w - 20), cellX + 12, ty + 30);
        cellX += w;
        if (cIdx < cells.length - 1) {
          targetCtx.beginPath();
          targetCtx.moveTo(cellX, ty);
          targetCtx.lineTo(cellX, ty + tableRowH);
          targetCtx.stroke();
        }
      });

      ty += tableRowH;
    });

    targetCtx.strokeStyle = '#000000';
    targetCtx.lineWidth = 2.5;
    targetCtx.strokeRect(
      margin,
      startY,
      contentW,
      sectionTitleH + tableHeaderH + rowsSubset.length * tableRowH
    );
  };

  const drawLandscapeStamp = (targetCtx: CanvasRenderingContext2D, totalH: number) => {
    const stampY = totalH - margin - footerStampH;
    targetCtx.fillStyle = '#F8FAFC';
    targetCtx.fillRect(margin, stampY, contentW, footerStampH);
    targetCtx.strokeStyle = '#000000';
    targetCtx.lineWidth = 2.5;
    targetCtx.strokeRect(margin, stampY, contentW, footerStampH);

    const stampCols = [620, 760, 440];
    let sX = margin;
    stampCols.forEach((w) => {
      sX += w;
      targetCtx.beginPath();
      targetCtx.moveTo(sX, stampY);
      targetCtx.lineTo(sX, stampY + footerStampH);
      targetCtx.stroke();
    });

    targetCtx.fillStyle = '#334155';
    targetCtx.font = 'bold 15px "JetBrains Mono", monospace';
    targetCtx.fillText('ZODPOVEDNÝ PROJEKTANT:', margin + 18, stampY + 28);
    targetCtx.fillText('NÁZOV VÝKRESU / ROZVÁDZAČA:', margin + 620 + 18, stampY + 28);
    targetCtx.fillText('ČÍSLO VÝKRESU / FORMÁT:', margin + 1380 + 18, stampY + 28);
    targetCtx.fillText('ODBORNÉ OVERENIE (STN 33 2000-6):', margin + 1820 + 18, stampY + 28);

    targetCtx.fillStyle = '#000000';
    targetCtx.font = 'bold 21px "Plus Jakarta Sans", sans-serif';
    targetCtx.fillText(fitText(targetCtx, project.designerName, 580), margin + 18, stampY + 60);
    targetCtx.fillText(fitText(targetCtx, project.name, 720), margin + 620 + 18, stampY + 60);
    targetCtx.font = 'bold 20px "JetBrains Mono", monospace';
    targetCtx.fillText(
      `${project.projectNumber} • ${paperFormat} NA ŠÍRKU`,
      margin + 1380 + 18,
      stampY + 60
    );

    targetCtx.fillStyle = '#1E293B';
    targetCtx.font = '600 16px "Plus Jakarta Sans", sans-serif';
    targetCtx.fillText(
      `Miesto stavby: ${project.locationCity || 'Bratislava'}`,
      margin + 18,
      stampY + 88
    );
    targetCtx.fillText(
      `Sústava: ${project.supplySystem.toUpperCase()} / ${project.voltage} / ${project.networkSystem}`,
      margin + 620 + 18,
      stampY + 88
    );
    targetCtx.fillText(`Dátum: ${project.projectDate}`, margin + 1380 + 18, stampY + 88);
    targetCtx.fillText('Pečiatka a podpis revízneho technika', margin + 1820 + 18, stampY + 68);
  };

  const canvases: HTMLCanvasElement[] = [canvas1];

  if (!splitScheduleToSeparatePage) {
    drawLandscapeBreakerTable(ctx, curY, breakerRows);
    drawLandscapeStamp(ctx, page1H);
  } else {
    drawLandscapeStamp(ctx, page1H);

    // Separate Landscape Page for Breaker-to-Circuit Schedule
    const schedH = Math.max(
      1697,
      margin * 2 + sectionTitleH + tableHeaderH + breakerRows.length * tableRowH + footerStampH + 80
    );
    const schedCanvas = document.createElement('canvas');
    schedCanvas.width = pageW;
    schedCanvas.height = schedH;
    const sCtx = schedCanvas.getContext('2d')!;
    sCtx.fillStyle = '#FFFFFF';
    sCtx.fillRect(0, 0, pageW, schedH);
    sCtx.strokeStyle = '#000000';
    sCtx.lineWidth = 3.5;
    sCtx.strokeRect(margin - 16, margin - 16, contentW + 32, schedH - (margin - 16) * 2);

    drawLandscapeBreakerTable(sCtx, margin, breakerRows);
    drawLandscapeStamp(sCtx, schedH);
    canvases.push(schedCanvas);
  }

  // Optional Page: Bill of Materials (Kusovník) if requested
  if (options.includeBom) {
    const bom = generateBom(project);
    const bomRowH = 44;
    const page2H = Math.max(1697, margin * 2 + 130 + (bom.length + 2) * bomRowH + 120);
    const canvas2 = document.createElement('canvas');
    canvas2.width = pageW;
    canvas2.height = page2H;
    const ctx2 = canvas2.getContext('2d')!;

    ctx2.fillStyle = '#FFFFFF';
    ctx2.fillRect(0, 0, pageW, page2H);
    ctx2.strokeStyle = '#000000';
    ctx2.lineWidth = 3.5;
    ctx2.strokeRect(margin - 16, margin - 16, contentW + 32, page2H - (margin - 16) * 2);

    let y2 = margin;
    ctx2.fillStyle = '#0F172A';
    ctx2.fillRect(margin, y2, contentW, 56);
    ctx2.fillStyle = '#FFFFFF';
    ctx2.font = 'bold 23px "Plus Jakarta Sans", sans-serif';
    ctx2.fillText(
      `PRÍLOHA — VÝKAZ MATERIÁLU (KUSOVNÍK PRÍSTROJOV BOM) • ${project.name}`,
      margin + 20,
      y2 + 37
    );
    y2 += 56;

    const bomCols = [
      { title: 'Kód', width: 120 },
      { title: 'Označenie v schéme', width: 320 },
      { title: 'Kategória', width: 260 },
      { title: 'Špecifikácia prístroja', width: 720 },
      { title: 'Výrobca a model', width: 360 },
      { title: 'Kat. číslo', width: 240 },
      { title: 'Moduly', width: 130 },
      { title: 'Množstvo', width: contentW - 2150 },
    ];

    ctx2.fillStyle = '#E2E8F0';
    ctx2.fillRect(margin, y2, contentW, 46);
    ctx2.strokeStyle = '#000000';
    ctx2.lineWidth = 2;
    ctx2.strokeRect(margin, y2, contentW, 46);

    let bx = margin;
    ctx2.fillStyle = '#000000';
    ctx2.font = 'bold 18px "Plus Jakarta Sans", sans-serif';
    bomCols.forEach((col, idx) => {
      ctx2.fillText(col.title, bx + 12, y2 + 30);
      bx += col.width;
      if (idx < bomCols.length - 1) {
        ctx2.beginPath();
        ctx2.moveTo(bx, y2);
        ctx2.lineTo(bx, y2 + 46);
        ctx2.stroke();
      }
    });
    y2 += 46;

    bom.forEach((b, rIdx) => {
      ctx2.fillStyle = rIdx % 2 === 0 ? '#FFFFFF' : '#F8FAFC';
      ctx2.fillRect(margin, y2, contentW, bomRowH);
      ctx2.strokeStyle = '#94A3B8';
      ctx2.lineWidth = 1.2;
      ctx2.strokeRect(margin, y2, contentW, bomRowH);

      const vals = [
        b.code,
        b.designation,
        b.category,
        b.description,
        `${b.manufacturer} ${b.model}`,
        b.catalogNumber,
        `${b.modules} M`,
        `${b.quantity} ks`,
      ];
      let cx = margin;
      vals.forEach((v, cIdx) => {
        const w = bomCols[cIdx].width;
        ctx2.fillStyle = cIdx === 0 ? '#0052CC' : '#000000';
        ctx2.font = `bold 17px "JetBrains Mono", monospace`;
        ctx2.fillText(fitText(ctx2, v, w - 20), cx + 12, y2 + 29);
        cx += w;
      });
      y2 += bomRowH;
    });

    drawLandscapeStamp(ctx2, page2H);
    canvases.push(canvas2);
  }

  return canvases;
}

/**
 * Generates and immediately downloads a clean PDF file containing ONLY the electrical schematic
 * and the breaker-to-circuit schedule table ("Ktorý okruh je na ktorom ističi").
 */
export async function exportCleanSchemaToPdf(
  project: SwitchboardProject,
  options: PdfExportOptions = {}
): Promise<void> {
  const orientation: SchemaOrientation =
    options.orientation ??
    (options.paperFormat === 'A3' || options.paperFormat === 'LARGE' ? 'landscape' : 'portrait');
  const paperFormat = options.paperFormat ?? (orientation === 'portrait' ? 'A4' : 'A3');

  const canvases = await renderCleanSchemaPagesToCanvases(project, {
    ...options,
    orientation,
    paperFormat,
  });

  const isPortrait = orientation === 'portrait';
  const ptBaseWidth =
    paperFormat === 'LARGE'
      ? isPortrait
        ? 1190.55
        : 1683.78
      : paperFormat === 'A3'
      ? isPortrait
        ? 841.89
        : 1190.55
      : isPortrait
      ? 595.28
      : 841.89;

  const pdfPages = canvases.map((canvas) => {
    const dataUrl = canvas.toDataURL('image/jpeg', 0.94);
    const jpegBytes = dataUrlToUint8Array(dataUrl);
    const aspect = canvas.height / canvas.width;
    return {
      jpegBytes,
      pixelWidth: canvas.width,
      pixelHeight: canvas.height,
      ptWidth: ptBaseWidth,
      ptHeight: +(ptBaseWidth * aspect).toFixed(2),
    };
  });

  const pdfBlob = buildPdfFromJpegPages(pdfPages);
  const url = URL.createObjectURL(pdfBlob);
  const safeProjectNo = (project.projectNumber || 'rozvadzac').replace(/[^a-zA-Z0-9_-]/g, '_');
  const link = document.createElement('a');
  link.href = url;
  link.download = `${safeProjectNo}_Schema_a_Istice.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

/**
 * Generates and downloads a high-resolution PNG image of the clean schematic + breaker table.
 */
export async function exportCleanSchemaToPng(
  project: SwitchboardProject,
  options: PdfExportOptions = {}
): Promise<void> {
  const orientation: SchemaOrientation =
    options.orientation ??
    (options.paperFormat === 'A3' || options.paperFormat === 'LARGE' ? 'landscape' : 'portrait');
  const paperFormat = options.paperFormat ?? (orientation === 'portrait' ? 'A4' : 'A3');

  const canvases = await renderCleanSchemaPagesToCanvases(project, {
    ...options,
    orientation,
    paperFormat,
  });
  const firstCanvas = canvases[0];
  if (!firstCanvas) return;

  const dataUrl = firstCanvas.toDataURL('image/png');
  const safeProjectNo = (project.projectNumber || 'rozvadzac').replace(/[^a-zA-Z0-9_-]/g, '_');
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = `${safeProjectNo}_Schema_a_Istice.png`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Helper to load a data URL or image URL into an HTMLImageElement safely.
 */
function loadImageSafe(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/**
 * Renders the industrial switchboard nameplate (Výrobný štítok rozvádzača podľa STN EN 61439-1 / 3)
 * onto a high-resolution HTML5 Canvas.
 */
export async function renderNameplateToCanvas(
  project: SwitchboardProject,
  labelSize: 'compact' | 'standard' | 'large' = 'standard',
  includeCropMarksForPdf = false
): Promise<HTMLCanvasElement> {
  const mfg = getEffectiveManufacturingInfo(project);
  const upstream = getEffectiveUpstreamBreaker(project);
  const internalDev = getEffectiveInternalDevice(project);

  const ratedVoltageUn =
    mfg.customRatedVoltageUn ||
    (project.supplySystem === '3f' ? '230 / 400 V AC, 50 Hz' : '230 V AC, 50 Hz');
  const ratedCurrentInA =
    mfg.customRatedCurrentInA ||
    (internalDev.enabled
      ? `${internalDev.ratedCurrent} A`
      : upstream.enabled
      ? `${upstream.ratedCurrent} A`
      : '40 A');
  const ratedShortCircuit = `${mfg.ratedShortCircuitIcnKa || 10} kA (s koordináciou)`;
  const networkCode =
    mfg.customNetworkCode ||
    `${project.networkSystem} (${project.supplySystem === '3f' ? '3+N+PE' : '1+N+PE'})`;
  const ipRating = mfg.customIpRating || project.ipRating;
  const boardTitle = mfg.boardTitle || 'ROZVODNICA PRE LAICKÚ OBSLUHU (DBO)';
  const standardTitle =
    mfg.standardTitle || 'ZHODA PODĽA STN EN 61439-1:2021 / STN EN 61439-3:2012';
  const footerWarningText =
    mfg.footerWarningText ||
    'Pred zásahom do vnútra rozvádzača bezpečne odpojiť od napájania!';
  const countryOriginCode = mfg.countryOriginCode || 'SK';

  const scale = labelSize === 'compact' ? 0.88 : labelSize === 'large' ? 1.14 : 1.0;
  const cardW = Math.round(1120 * scale);
  const rowCount = 11;
  const rowH = Math.round(44 * scale);
  const headerH = Math.round(165 * scale);
  const titleBarH = Math.round(74 * scale);
  const footerH = Math.round(62 * scale);
  const innerPad = Math.round(36 * scale);

  const cardH = innerPad * 2 + headerH + titleBarH + rowCount * rowH + footerH;
  const outerPad = includeCropMarksForPdf ? Math.round(90 * scale) : Math.round(28 * scale);

  const canvas = document.createElement('canvas');
  canvas.width = cardW + outerPad * 2;
  canvas.height = cardH + outerPad * 2;

  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  // Background
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const x0 = outerPad;
  const y0 = outerPad;

  // Optional crop marks & dimension caption for PDF sheet
  if (includeCropMarksForPdf) {
    const dimLabel =
      labelSize === 'compact'
        ? 'Rozmer štítku: 80 × 50 mm (Páskový)'
        : labelSize === 'large'
        ? 'Rozmer štítku: 148 × 105 mm (Veľký A6)'
        : 'Rozmer štítku: 110 × 75 mm (Priemyselný štandard)';
    ctx.fillStyle = '#64748B';
    ctx.font = `600 ${Math.round(18 * scale)}px "JetBrains Mono", monospace`;
    ctx.fillText(
      `VÝROBNÝ ŠTÍTOK ROZVÁDZAČA • ${dimLabel} • STN EN 61439-1 / 3`,
      x0,
      y0 - Math.round(26 * scale)
    );

    // Subtle corner crop marks
    ctx.strokeStyle = '#94A3B8';
    ctx.lineWidth = 1.5;
    const cm = Math.round(22 * scale);
    // Top-left
    ctx.beginPath();
    ctx.moveTo(x0 - cm, y0);
    ctx.lineTo(x0 - 6, y0);
    ctx.moveTo(x0, y0 - cm);
    ctx.lineTo(x0, y0 - 6);
    // Top-right
    ctx.moveTo(x0 + cardW + 6, y0);
    ctx.lineTo(x0 + cardW + cm, y0);
    ctx.moveTo(x0 + cardW, y0 - cm);
    ctx.lineTo(x0 + cardW, y0 - 6);
    // Bottom-left
    ctx.moveTo(x0 - cm, y0 + cardH);
    ctx.lineTo(x0 - 6, y0 + cardH);
    ctx.moveTo(x0, y0 + cardH + 6);
    ctx.lineTo(x0, y0 + cardH + cm);
    // Bottom-right
    ctx.moveTo(x0 + cardW + 6, y0 + cardH);
    ctx.lineTo(x0 + cardW + cm, y0 + cardH);
    ctx.moveTo(x0 + cardW, y0 + cardH + 6);
    ctx.lineTo(x0 + cardW, y0 + cardH + cm);
    ctx.stroke();
  }

  // Outer thick industrial border
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(x0, y0, cardW, cardH);
  ctx.strokeStyle = '#020617';
  ctx.lineWidth = Math.round(8 * scale);
  ctx.strokeRect(x0, y0, cardW, cardH);

  const cx = x0 + innerPad;
  const cw = cardW - innerPad * 2;
  let curY = y0 + innerPad;

  // 1. Header Zone: Manufacturer / Logo on Left, CE + Lightning on Right
  let logoImg: HTMLImageElement | null = null;
  if (mfg.manufacturerLogoUrl && mfg.logoDisplayMode !== 'text_only') {
    logoImg = await loadImageSafe(mfg.manufacturerLogoUrl);
  }

  let leftTextY = curY;
  const maxLeftW = cw - Math.round(230 * scale);

  if (logoImg && mfg.logoDisplayMode === 'logo_only') {
    const targetH = Math.min(
      Math.round(78 * scale),
      Math.round((mfg.logoHeightMm || 18) * 3.8 * scale)
    );
    const ratio = logoImg.width / Math.max(1, logoImg.height);
    const targetW = Math.min(Math.round(480 * scale), Math.round(targetH * ratio));
    ctx.drawImage(logoImg, cx, leftTextY, targetW, targetH);
    leftTextY += targetH + Math.round(14 * scale);
  } else if (logoImg && mfg.logoDisplayMode === 'both') {
    const targetH = Math.min(
      Math.round(58 * scale),
      Math.round((mfg.logoHeightMm || 16) * 3.2 * scale)
    );
    const ratio = logoImg.width / Math.max(1, logoImg.height);
    const targetW = Math.min(Math.round(240 * scale), Math.round(targetH * ratio));
    ctx.drawImage(logoImg, cx, leftTextY, targetW, targetH);

    ctx.fillStyle = '#020617';
    ctx.font = `900 ${Math.round(27 * scale)}px "Plus Jakarta Sans", sans-serif`;
    ctx.fillText(
      fitText(ctx, mfg.manufacturerName.toUpperCase(), maxLeftW - targetW - 20),
      cx + targetW + Math.round(18 * scale),
      leftTextY + Math.round(targetH * 0.68)
    );
    leftTextY += targetH + Math.round(14 * scale);
  } else {
    ctx.fillStyle = '#020617';
    ctx.font = `900 ${Math.round(30 * scale)}px "Plus Jakarta Sans", sans-serif`;
    ctx.fillText(
      fitText(ctx, mfg.manufacturerName.toUpperCase(), maxLeftW),
      cx,
      leftTextY + Math.round(30 * scale)
    );
    leftTextY += Math.round(44 * scale);
  }

  // Street & City
  ctx.fillStyle = '#334155';
  ctx.font = `600 ${Math.round(21 * scale)}px "Plus Jakarta Sans", sans-serif`;
  ctx.fillText(
    fitText(ctx, `${mfg.manufacturerStreet}, ${mfg.manufacturerCity}`, maxLeftW),
    cx,
    leftTextY + Math.round(18 * scale)
  );
  leftTextY += Math.round(28 * scale);

  // ICO & DIC
  ctx.fillStyle = '#334155';
  ctx.font = `600 ${Math.round(20 * scale)}px "JetBrains Mono", monospace`;
  const icoText = `IČO: ${mfg.manufacturerIco}${
    mfg.manufacturerDic ? ` • DIČ: ${mfg.manufacturerDic}` : ''
  }`;
  ctx.fillText(fitText(ctx, icoText, maxLeftW), cx, leftTextY + Math.round(18 * scale));

  // Right Icons: CE Box & High-Voltage Flash Box
  const ceBoxSize = Math.round(82 * scale);
  const boltBoxSize = Math.round(76 * scale);
  const ceX = cx + cw - ceBoxSize - boltBoxSize - Math.round(18 * scale);
  const boltX = cx + cw - boltBoxSize;
  const badgeY = curY + Math.round(6 * scale);

  // CE Box
  ctx.strokeStyle = '#020617';
  ctx.lineWidth = Math.round(4.5 * scale);
  ctx.strokeRect(ceX, badgeY, ceBoxSize, ceBoxSize);
  ctx.fillStyle = '#020617';
  ctx.font = `900 ${Math.round(44 * scale)}px Georgia, serif`;
  const ceMetrics = ctx.measureText('CE');
  ctx.fillText(
    'CE',
    ceX + (ceBoxSize - ceMetrics.width) / 2,
    badgeY + ceBoxSize * 0.68
  );

  // Lightning Warning Box
  const boltY = badgeY + Math.round(3 * scale);
  ctx.fillStyle = '#FACC15';
  ctx.fillRect(boltX, boltY, boltBoxSize, boltBoxSize);
  ctx.strokeStyle = '#D97706';
  ctx.lineWidth = Math.round(4.5 * scale);
  ctx.strokeRect(boltX, boltY, boltBoxSize, boltBoxSize);

  // Lightning Bolt Polygon
  ctx.fillStyle = '#020617';
  ctx.beginPath();
  const bxCenter = boltX + boltBoxSize / 2;
  const byCenter = boltY + boltBoxSize / 2;
  const bs = boltBoxSize * 0.34;
  ctx.moveTo(bxCenter + bs * 0.25, byCenter - bs);
  ctx.lineTo(bxCenter - bs * 0.65, byCenter + bs * 0.1);
  ctx.lineTo(bxCenter - bs * 0.05, byCenter + bs * 0.1);
  ctx.lineTo(bxCenter - bs * 0.3, byCenter + bs);
  ctx.lineTo(bxCenter + bs * 0.65, byCenter - bs * 0.1);
  ctx.lineTo(bxCenter + bs * 0.05, byCenter - bs * 0.1);
  ctx.closePath();
  ctx.fill();

  curY += headerH;

  // Header bottom divider
  ctx.strokeStyle = '#020617';
  ctx.lineWidth = Math.round(4.5 * scale);
  ctx.beginPath();
  ctx.moveTo(cx, curY - Math.round(16 * scale));
  ctx.lineTo(cx + cw, curY - Math.round(16 * scale));
  ctx.stroke();

  // 2. Device Title & Standard
  ctx.fillStyle = '#020617';
  ctx.font = `900 ${Math.round(25 * scale)}px "Plus Jakarta Sans", sans-serif`;
  const titleMetrics = ctx.measureText(boardTitle.toUpperCase());
  ctx.fillText(
    boardTitle.toUpperCase(),
    cx + Math.max(0, (cw - titleMetrics.width) / 2),
    curY + Math.round(18 * scale)
  );

  ctx.fillStyle = '#475569';
  ctx.font = `600 ${Math.round(18 * scale)}px "JetBrains Mono", monospace`;
  const stdMetrics = ctx.measureText(standardTitle.toUpperCase());
  ctx.fillText(
    standardTitle.toUpperCase(),
    cx + Math.max(0, (cw - stdMetrics.width) / 2),
    curY + Math.round(44 * scale)
  );

  curY += titleBarH;

  ctx.strokeStyle = '#020617';
  ctx.lineWidth = Math.round(3 * scale);
  ctx.beginPath();
  ctx.moveTo(cx, curY - Math.round(12 * scale));
  ctx.lineTo(cx + cw, curY - Math.round(12 * scale));
  ctx.stroke();

  // 3. Technical Parameters Rows (11 rows)
  const techRows: Array<{ label: string; value: string; highlightBlue?: boolean }> = [
    { label: 'Typové označenie:', value: mfg.typeDesignation },
    { label: 'Výrobné číslo (S/N):', value: mfg.serialNumber },
    { label: 'Menovité napätie (Un):', value: ratedVoltageUn },
    { label: 'Menovitý prúd rozvádzača (InA):', value: ratedCurrentInA, highlightBlue: true },
    { label: 'Menovitý podmienený skrat (Icn):', value: ratedShortCircuit },
    { label: 'Druh siete / Sústava:', value: networkCode },
    { label: 'Stupeň ochrany krytom:', value: ipRating },
    { label: 'Trieda ochrany:', value: mfg.enclosureProtectionClass },
    { label: 'Súčiniteľ súdobosti (RDF):', value: String(mfg.ratedDiversityFactor || 0.8) },
    { label: 'Rozsah teplôt okolia:', value: mfg.ambientTempRange },
    {
      label: 'Dátum a rok výroby:',
      value: `${mfg.testedDate} (${mfg.productionYear})`,
    },
  ];

  techRows.forEach((row, idx) => {
    const ry = curY + idx * rowH;
    if (idx > 0) {
      ctx.strokeStyle = '#CBD5E1';
      ctx.lineWidth = Math.round(1.5 * scale);
      ctx.beginPath();
      ctx.moveTo(cx, ry);
      ctx.lineTo(cx + cw, ry);
      ctx.stroke();
    }

    const textY = ry + Math.round(rowH * 0.68);
    ctx.fillStyle = '#334155';
    ctx.font = `700 ${Math.round(21 * scale)}px "Plus Jakarta Sans", sans-serif`;
    ctx.fillText(row.label, cx, textY);

    ctx.fillStyle = row.highlightBlue ? '#1D4ED8' : '#020617';
    ctx.font = `700 ${Math.round(21 * scale)}px "JetBrains Mono", monospace`;
    const valStr = fitText(ctx, row.value, cw * 0.55);
    const valW = ctx.measureText(valStr).width;
    ctx.fillText(valStr, cx + cw - valW, textY);
  });

  curY += techRows.length * rowH;

  // 4. Footer Warning & Country/Year
  ctx.strokeStyle = '#020617';
  ctx.lineWidth = Math.round(4.5 * scale);
  ctx.beginPath();
  ctx.moveTo(cx, curY + Math.round(12 * scale));
  ctx.lineTo(cx + cw, curY + Math.round(12 * scale));
  ctx.stroke();

  const footTextY = curY + Math.round(45 * scale);
  ctx.fillStyle = '#475569';
  ctx.font = `600 ${Math.round(18 * scale)}px "Plus Jakarta Sans", sans-serif`;
  ctx.fillText(fitText(ctx, footerWarningText, cw * 0.78), cx, footTextY);

  const originText = `${countryOriginCode} • ${mfg.productionYear}`;
  ctx.fillStyle = '#020617';
  ctx.font = `800 ${Math.round(19 * scale)}px "JetBrains Mono", monospace`;
  const origW = ctx.measureText(originText).width;
  ctx.fillText(originText, cx + cw - origW, footTextY);

  return canvas;
}

/**
 * Exports ONLY the industrial switchboard nameplate as a high-resolution PNG file.
 */
export async function exportNameplateToPng(
  project: SwitchboardProject,
  labelSize: 'compact' | 'standard' | 'large' = 'standard'
): Promise<void> {
  const mfg = getEffectiveManufacturingInfo(project);
  const canvas = await renderNameplateToCanvas(project, labelSize, false);
  const dataUrl = canvas.toDataURL('image/png');
  const safeSerial = (mfg.serialNumber || project.projectNumber || 'rozvadzac').replace(
    /[^a-zA-Z0-9_-]/g,
    '_'
  );
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = `${safeSerial}_Vyrobny_Stitok_${labelSize}.png`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Exports ONLY the industrial switchboard nameplate as a clean vector-grade PDF document
 * with crop marks ready for printing.
 */
export async function exportNameplateToPdf(
  project: SwitchboardProject,
  labelSize: 'compact' | 'standard' | 'large' = 'standard'
): Promise<void> {
  const mfg = getEffectiveManufacturingInfo(project);
  const canvas = await renderNameplateToCanvas(project, labelSize, true);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.96);
  const jpegBytes = dataUrlToUint8Array(dataUrl);

  // Physical width in PDF points (1 mm = 2.83465 pt) including crop margin
  const baseMmWidth = labelSize === 'compact' ? 110 : labelSize === 'large' ? 175 : 140;
  const ptWidth = +(baseMmWidth * 2.83465).toFixed(2);
  const aspect = canvas.height / canvas.width;
  const ptHeight = +(ptWidth * aspect).toFixed(2);

  const pdfBlob = buildPdfFromJpegPages([
    {
      jpegBytes,
      pixelWidth: canvas.width,
      pixelHeight: canvas.height,
      ptWidth,
      ptHeight,
    },
  ]);

  const url = URL.createObjectURL(pdfBlob);
  const safeSerial = (mfg.serialNumber || project.projectNumber || 'rozvadzac').replace(
    /[^a-zA-Z0-9_-]/g,
    '_'
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = `${safeSerial}_Vyrobny_Stitok_${labelSize}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

