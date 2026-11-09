import { SwitchboardProject, SchemaDisplayMode } from '../types/electrical';
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

