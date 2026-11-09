import { SwitchboardProject, SchemaDisplayMode } from '../types/electrical';
import {
  calculateCircuitParameters,
  generateBom,
  getEffectiveUpstreamBreaker,
  getEffectiveInternalDevice,
  calculateDinRailAllocation,
} from './electricalEngine';

export interface PdfExportOptions {
  paperFormat?: 'A4' | 'A3' | 'LARGE';
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
  let vbWidth = 1260;
  let vbHeight = 940;
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

export interface BreakerScheduleRow {
  label: string;
  name: string;
  breakerSpec: string;
  rcdSpec: string;
  phase: string;
  cableSpec: string;
  powerText: string;
  currentText: string;
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
        dropAndZsText: `0.35% / 0.52 Ω`,
      });
    });

  return rows;
}

/**
 * Renders the clean engineering drawing page(s) (Pure Schematic + Breaker-to-Circuit Schedule Table)
 * onto high-resolution HTML5 Canvas element(s).
 */
export async function renderCleanSchemaPagesToCanvases(
  project: SwitchboardProject,
  options: PdfExportOptions = {}
): Promise<HTMLCanvasElement[]> {
  const svgEl =
    options.svgElement ||
    (document.querySelector('svg.schema-canvas-svg') as SVGSVGElement | null);

  const upstream = getEffectiveUpstreamBreaker(project);
  const internalDev = getEffectiveInternalDevice(project);
  const din = calculateDinRailAllocation(project);
  const breakerRows = buildBreakerScheduleRows(project);

  // High-resolution engineering sheet width (2400 px for crisp text and vector-like lines)
  const pageW = 2400;
  const margin = 56;
  const contentW = pageW - margin * 2;

  // Render SVG schematic if available
  let svgRendered: { img: HTMLImageElement; width: number; height: number } | null = null;
  if (svgEl) {
    try {
      svgRendered = await renderSvgElementToImage(svgEl);
    } catch {
      svgRendered = null;
    }
  }

  const schemaDrawW = contentW;
  const schemaDrawH = svgRendered
    ? Math.round((svgRendered.height / svgRendered.width) * schemaDrawW)
    : 760;

  const headerH = 118;
  const sectionTitleH = 44;
  const tableHeaderH = 42;
  const tableRowH = 36;
  const tableTotalH = sectionTitleH + tableHeaderH + Math.max(1, breakerRows.length) * tableRowH + 20;
  const footerStampH = 92;

  const page1H = Math.max(
    1680,
    margin + headerH + 22 + schemaDrawH + 28 + tableTotalH + 24 + footerStampH + margin
  );

  const canvas1 = document.createElement('canvas');
  canvas1.width = pageW;
  canvas1.height = page1H;
  const ctx = canvas1.getContext('2d')!;

  // White paper background
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, pageW, page1H);

  // Outer engineering border (STN EN ISO 5457)
  ctx.strokeStyle = '#0F172A';
  ctx.lineWidth = 3;
  ctx.strokeRect(margin - 16, margin - 16, contentW + 32, page1H - (margin - 16) * 2);

  let curY = margin;

  // 1. TOP DRAWING HEADER
  ctx.fillStyle = '#F8FAFC';
  ctx.fillRect(margin, curY, contentW, headerH);
  ctx.strokeStyle = '#0F172A';
  ctx.lineWidth = 2;
  ctx.strokeRect(margin, curY, contentW, headerH);

  ctx.fillStyle = '#0066FF';
  ctx.font = 'bold 18px "JetBrains Mono", monospace';
  ctx.fillText(
    'ELEKTRICKÁ SCHÉMA ROZVÁDZAČA A ROZPIS ISTIČOV • STN EN 61439-3 / STN EN 60617',
    margin + 22,
    curY + 32
  );

  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 30px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(fitText(ctx, project.name, contentW - 480), margin + 22, curY + 70);

  const upstreamSummary = upstream.enabled
    ? `Pred elektromerom (${upstream.designation}): ${upstream.poles} ${upstream.characteristic}${upstream.ratedCurrent} A (${upstream.placement})`
    : `Pred elektromerom (${upstream.designation}): Nezahrnutý`;
  const internalSummary = internalDev.enabled
    ? `V rozvádzači (${internalDev.designation}): ${internalDev.deviceType} (${internalDev.poles} ${internalDev.hasOvercurrentProtection && internalDev.characteristic ? internalDev.characteristic : ''}${internalDev.ratedCurrent} A)`
    : 'V rozvádzači: Bez hl. prvku';

  ctx.fillStyle = '#334155';
  ctx.font = '600 17px "JetBrains Mono", monospace';
  ctx.fillText(
    `${upstreamSummary}   |   ${internalSummary}   |   Sústava: ${project.supplySystem.toUpperCase()} (${project.voltage}, ${project.networkSystem})   |   Prívod: ${project.supplyCable}`,
    margin + 22,
    curY + 100
  );

  // Right-side metadata box inside top header
  const metaBoxX = margin + contentW - 410;
  ctx.beginPath();
  ctx.moveTo(metaBoxX, curY);
  ctx.lineTo(metaBoxX, curY + headerH);
  ctx.stroke();

  ctx.fillStyle = '#475569';
  ctx.font = '600 16px "JetBrains Mono", monospace';
  ctx.fillText(`Číslo projektu: ${project.projectNumber}`, metaBoxX + 20, curY + 38);
  ctx.fillText(`Dátum: ${project.projectDate}`, metaBoxX + 20, curY + 66);
  ctx.fillText(
    `Kapacita skrine: ${din.totalUsedModules} / ${din.totalCapacityModules} M (${project.ipRating})`,
    metaBoxX + 20,
    curY + 94
  );

  curY += headerH + 22;

  // 2. PURE ELECTRICAL SCHEMATIC (NO TOOLBARS, NO BUTTONS, WHITE BACKGROUND)
  if (svgRendered) {
    ctx.save();
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(margin, curY, schemaDrawW, schemaDrawH);
    ctx.drawImage(svgRendered.img, margin, curY, schemaDrawW, schemaDrawH);
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 2;
    ctx.strokeRect(margin, curY, schemaDrawW, schemaDrawH);
    ctx.restore();
  } else {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(margin, curY, schemaDrawW, schemaDrawH);
    ctx.fillStyle = '#0F172A';
    ctx.font = 'bold 24px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('Elektrická schéma zapojenia rozvádzača', margin + 40, curY + 60);
  }

  curY += schemaDrawH + 28;

  // 3. BREAKER-TO-CIRCUIT SCHEDULE TABLE (KTORÝ OKRUH JE NA KTOROM ISTIČI)
  ctx.fillStyle = '#0F172A';
  ctx.fillRect(margin, curY, contentW, sectionTitleH);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 19px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(
    'POPIS K SCHÉME — ROZPIS ISTIČOV A ELEKTRICKÝCH OKRUHOV (KTORÝ OKRUH JE NA KTOROM ISTIČI)',
    margin + 18,
    curY + 29
  );
  curY += sectionTitleH;

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

  // Table Header Row
  ctx.fillStyle = '#E2E8F0';
  ctx.fillRect(margin, curY, contentW, tableHeaderH);
  ctx.strokeStyle = '#0F172A';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(margin, curY, contentW, tableHeaderH);

  let colX = margin;
  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 16px "Plus Jakarta Sans", sans-serif';
  cols.forEach((col, i) => {
    ctx.fillText(col.title, colX + 12, curY + 27);
    colX += col.width;
    if (i < cols.length - 1) {
      ctx.beginPath();
      ctx.moveTo(colX, curY);
      ctx.lineTo(colX, curY + tableHeaderH);
      ctx.stroke();
    }
  });
  curY += tableHeaderH;

  // Table Data Rows
  breakerRows.forEach((row, rIdx) => {
    ctx.fillStyle = rIdx % 2 === 0 ? '#FFFFFF' : '#F8FAFC';
    ctx.fillRect(margin, curY, contentW, tableRowH);
    ctx.strokeStyle = '#CBD5E1';
    ctx.lineWidth = 1;
    ctx.strokeRect(margin, curY, contentW, tableRowH);

    let cellX = margin;
    const cells = [
      { text: row.label, bold: true, color: '#0066FF', mono: true },
      { text: row.name, bold: true, color: '#0F172A', mono: false },
      { text: row.breakerSpec, bold: true, color: '#0F172A', mono: true },
      { text: row.rcdSpec, bold: false, color: '#334155', mono: true },
      { text: row.phase, bold: true, color: '#0F172A', mono: true },
      { text: row.cableSpec, bold: false, color: '#0F172A', mono: true },
      { text: row.powerText, bold: true, color: '#0F172A', mono: true },
      { text: row.currentText, bold: false, color: '#334155', mono: true },
      { text: row.dropAndZsText, bold: true, color: '#0F172A', mono: true },
    ];

    cells.forEach((cell, cIdx) => {
      const w = cols[cIdx].width;
      ctx.fillStyle = cell.color;
      ctx.font = `${cell.bold ? 'bold' : '500'} 15px ${
        cell.mono ? '"JetBrains Mono", monospace' : '"Plus Jakarta Sans", sans-serif'
      }`;
      ctx.fillText(fitText(ctx, cell.text, w - 20), cellX + 12, curY + 24);
      cellX += w;
      if (cIdx < cells.length - 1) {
        ctx.beginPath();
        ctx.moveTo(cellX, curY);
        ctx.lineTo(cellX, curY + tableRowH);
        ctx.stroke();
      }
    });

    curY += tableRowH;
  });

  // Outer border around the breaker table
  ctx.strokeStyle = '#0F172A';
  ctx.lineWidth = 2;
  ctx.strokeRect(
    margin,
    curY - breakerRows.length * tableRowH - tableHeaderH - sectionTitleH,
    contentW,
    sectionTitleH + tableHeaderH + breakerRows.length * tableRowH
  );

  // 4. BOTTOM STN ISO 7200 TITLE BLOCK STAMP
  const stampY = page1H - margin - footerStampH;
  ctx.fillStyle = '#F8FAFC';
  ctx.fillRect(margin, stampY, contentW, footerStampH);
  ctx.strokeStyle = '#0F172A';
  ctx.lineWidth = 2;
  ctx.strokeRect(margin, stampY, contentW, footerStampH);

  const stampCols = [620, 760, 440];
  let sX = margin;
  stampCols.forEach((w) => {
    sX += w;
    ctx.beginPath();
    ctx.moveTo(sX, stampY);
    ctx.lineTo(sX, stampY + footerStampH);
    ctx.stroke();
  });

  ctx.fillStyle = '#64748B';
  ctx.font = 'bold 13px "JetBrains Mono", monospace';
  ctx.fillText('ZODPOVEDNÝ PROJEKTANT:', margin + 18, stampY + 26);
  ctx.fillText('NÁZOV VÝKRESU / ROZVÁDZAČA:', margin + 620 + 18, stampY + 26);
  ctx.fillText('ČÍSLO VÝKRESU / FORMÁT:', margin + 1380 + 18, stampY + 26);
  ctx.fillText('ODBORNÉ OVERENIE (STN 33 2000-6):', margin + 1820 + 18, stampY + 26);

  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 18px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(fitText(ctx, project.designerName, 580), margin + 18, stampY + 54);
  ctx.fillText(fitText(ctx, project.name, 720), margin + 620 + 18, stampY + 54);
  ctx.font = 'bold 18px "JetBrains Mono", monospace';
  ctx.fillText(
    `${project.projectNumber} • ${options.paperFormat || 'A3'}`,
    margin + 1380 + 18,
    stampY + 54
  );

  ctx.fillStyle = '#475569';
  ctx.font = '500 14px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(
    `Miesto stavby: ${project.locationCity || 'Bratislava'}`,
    margin + 18,
    stampY + 78
  );
  ctx.fillText(
    `Sústava: ${project.supplySystem.toUpperCase()} / ${project.voltage} / ${project.networkSystem}`,
    margin + 620 + 18,
    stampY + 78
  );
  ctx.fillText(`Dátum: ${project.projectDate}`, margin + 1380 + 18, stampY + 78);
  ctx.fillText('Pečiatka a podpis revízneho technika', margin + 1820 + 18, stampY + 62);

  const canvases: HTMLCanvasElement[] = [canvas1];

  // Optional Page 2: Bill of Materials (Kusovník) if requested
  if (options.includeBom) {
    const bom = generateBom(project);
    const bomRowH = 38;
    const page2H = Math.max(1200, margin * 2 + 120 + (bom.length + 2) * bomRowH + 80);
    const canvas2 = document.createElement('canvas');
    canvas2.width = pageW;
    canvas2.height = page2H;
    const ctx2 = canvas2.getContext('2d')!;

    ctx2.fillStyle = '#FFFFFF';
    ctx2.fillRect(0, 0, pageW, page2H);
    ctx2.strokeStyle = '#0F172A';
    ctx2.lineWidth = 3;
    ctx2.strokeRect(margin - 16, margin - 16, contentW + 32, page2H - (margin - 16) * 2);

    let y2 = margin;
    ctx2.fillStyle = '#0F172A';
    ctx2.fillRect(margin, y2, contentW, 54);
    ctx2.fillStyle = '#FFFFFF';
    ctx2.font = 'bold 22px "Plus Jakarta Sans", sans-serif';
    ctx2.fillText(
      `PRÍLOHA — VÝKAZ MATERIÁLU (KUSOVNÍK PRÍSTROJOV BOM) • ${project.name}`,
      margin + 20,
      y2 + 35
    );
    y2 += 54;

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
    ctx2.fillRect(margin, y2, contentW, 42);
    ctx2.strokeStyle = '#0F172A';
    ctx2.lineWidth = 1.5;
    ctx2.strokeRect(margin, y2, contentW, 42);

    let bx = margin;
    ctx2.fillStyle = '#0F172A';
    ctx2.font = 'bold 16px "Plus Jakarta Sans", sans-serif';
    bomCols.forEach((col, idx) => {
      ctx2.fillText(col.title, bx + 12, y2 + 27);
      bx += col.width;
      if (idx < bomCols.length - 1) {
        ctx2.beginPath();
        ctx2.moveTo(bx, y2);
        ctx2.lineTo(bx, y2 + 42);
        ctx2.stroke();
      }
    });
    y2 += 42;

    bom.forEach((b, rIdx) => {
      ctx2.fillStyle = rIdx % 2 === 0 ? '#FFFFFF' : '#F8FAFC';
      ctx2.fillRect(margin, y2, contentW, bomRowH);
      ctx2.strokeStyle = '#CBD5E1';
      ctx2.lineWidth = 1;
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
        ctx2.fillStyle = cIdx === 0 ? '#0066FF' : '#0F172A';
        ctx2.font = `${cIdx < 2 || cIdx === 7 ? 'bold' : '500'} 15px "JetBrains Mono", monospace`;
        ctx2.fillText(fitText(ctx2, v, w - 20), cx + 12, y2 + 25);
        cx += w;
      });
      y2 += bomRowH;
    });

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
  const canvases = await renderCleanSchemaPagesToCanvases(project, options);

  const ptBaseWidth =
    options.paperFormat === 'A4' ? 841.89 : options.paperFormat === 'LARGE' ? 1683.78 : 1190.55;

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
  const canvases = await renderCleanSchemaPagesToCanvases(project, options);
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
