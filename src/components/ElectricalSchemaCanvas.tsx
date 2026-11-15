import React, { useState, useRef } from 'react';
import {
  SwitchboardProject,
  SchemaDisplayMode,
  SchemaOrientation,
  CircuitConfig,
  RcdConfig,
  MainBreakerCurrent,
  BreakerCharacteristic,
  PhaseAllocation,
  InternalMainDeviceType,
  InternalMainDeviceCurrent,
} from '../types/electrical';
import {
  suggestCircuitBreakerModel,
  suggestRcdModel,
  getEffectiveUpstreamBreaker,
  getEffectiveElectricityMeter,
  getEffectiveInternalDevice,
  suggestInternalMainDeviceModel,
  INTERNAL_DEVICE_TYPES,
  INTERNAL_DEVICE_CURRENTS,
} from '../utils/electricalEngine';
import {
  exportCleanSchemaToPdf,
  exportCleanSchemaToPng,
} from '../utils/pdfSchemaExport';
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Download,
  Printer,
  Layers,
  GitCommit,
  Cable,
  Plus,
  Trash2,
  ArrowLeft,
  ArrowRight,
  Sliders,
  Sparkles,
  CheckCircle2,
  MoveHorizontal,
  RectangleVertical,
  RectangleHorizontal,
} from 'lucide-react';

interface Props {
  project: SwitchboardProject;
  displayMode: SchemaDisplayMode;
  onDisplayModeChange: (mode: SchemaDisplayMode) => void;
  orientation?: SchemaOrientation;
  onOrientationChange?: (orientation: SchemaOrientation) => void;
  onProjectChange?: (updated: SwitchboardProject, actionDescription?: string) => void;
  compactMode?: boolean;
}

type SelectedElement =
  | { type: 'main' }
  | { type: 'internal-main' }
  | { type: 'spd' }
  | { type: 'rcd'; id: string }
  | { type: 'circuit'; id: string }
  | null;

function wrapTextLines(text: string, maxCharsPerLine: number, maxLines = 2): string[] {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxCharsPerLine) {
      current = candidate;
    } else {
      if (current) {
        lines.push(current);
        current = word;
      } else {
        lines.push(word.slice(0, maxCharsPerLine - 1) + '…');
        current = '';
      }
      if (lines.length >= maxLines) break;
    }
  }
  if (current && lines.length < maxLines) {
    lines.push(
      current.length > maxCharsPerLine ? current.slice(0, maxCharsPerLine - 1) + '…' : current
    );
  }
  return lines.length > 0 ? lines : [text.slice(0, maxCharsPerLine)];
}

export const ElectricalSchemaCanvas: React.FC<Props> = ({
  project,
  displayMode,
  onDisplayModeChange,
  orientation: controlledOrientation,
  onOrientationChange,
  onProjectChange,
  compactMode = false,
}) => {
  const [internalOrientation, setInternalOrientation] = useState<SchemaOrientation>('portrait');
  const schemaOrientation: SchemaOrientation = controlledOrientation ?? internalOrientation;
  const handleSetOrientation = (next: SchemaOrientation) => {
    setInternalOrientation(next);
    onOrientationChange?.(next);
    setPan({ x: 0, y: 0 });
  };

  const [zoom, setZoom] = useState<number>(compactMode ? 0.85 : 1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDraggingCanvas, setIsDraggingCanvas] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [selectedElement, setSelectedElement] = useState<SelectedElement>(null);
  const [draggedCircuitId, setDraggedCircuitId] = useState<string | null>(null);
  const [autoRouteStatus, setAutoRouteStatus] = useState<string | null>(null);

  const svgRef = useRef<SVGSVGElement | null>(null);

  const { mainBreaker, rcds, circuits } = project;
  const isThreePhase = project.phaseCount === 3 || project.supplySystem === '3f';
  const upstreamBreaker = getEffectiveUpstreamBreaker(project);
  const electricityMeter = getEffectiveElectricityMeter(project);
  const internalDevice = getEffectiveInternalDevice(project);
  const isInternalBreaker =
    internalDevice.deviceType === 'Istič' || internalDevice.hasOvercurrentProtection;

  // Group circuits by RCD
  const rcdGroups = rcds.map((rcd) => ({
    rcd,
    circuits: circuits.filter((c) => c.rcdId === rcd.id),
  }));

  const directCircuits = circuits.filter(
    (c) => c.rcdId === 'NONE' || !rcds.some((r) => r.id === c.rcdId)
  );

  // Calculate horizontal positions for every final column (wider spacing for crisp legible fonts)
  const colSpacing =
    displayMode === 'wiring-diagram' ? 168 : displayMode === 'multi-line' ? 148 : 132;
  const leftMargin = 220;

  interface RenderColumn {
    circuit?: CircuitConfig;
    rcboOnly?: RcdConfig;
    parentRcd?: RcdConfig;
    x: number;
    groupIndex: number;
  }

  const columns: RenderColumn[] = [];
  let currentX = leftMargin;

  rcdGroups.forEach((group, gIdx) => {
    if (group.rcd.deviceKind === 'RCBO' && group.circuits.length === 0) {
      columns.push({
        rcboOnly: group.rcd,
        parentRcd: group.rcd,
        x: currentX,
        groupIndex: gIdx,
      });
      currentX += colSpacing;
    } else if (group.circuits.length === 0) {
      columns.push({
        parentRcd: group.rcd,
        x: currentX,
        groupIndex: gIdx,
      });
      currentX += colSpacing;
    } else {
      group.circuits.forEach((c) => {
        columns.push({
          circuit: c,
          parentRcd: group.rcd,
          x: currentX,
          groupIndex: gIdx,
        });
        currentX += colSpacing;
      });
    }
    currentX += 42;
  });

  directCircuits.forEach((c) => {
    columns.push({
      circuit: c,
      x: currentX,
      groupIndex: -1,
    });
    currentX += colSpacing;
  });

  // Portrait A4 layout geometry:
  // Vertical Main Busbar running TOP-TO-BOTTOM (zhora dole) on the left of the A4 Portrait sheet,
  // with each RCD group, breaker (FAx), cable, and appliance box drawn HORIZONTALLY ACROSS THE WIDTH
  // of the Portrait sheet ("na šírku tej výšky") from left to right.
  const isPortrait = schemaOrientation === 'portrait';

  interface PortraitSpineItem {
    kind: 'rcd-group' | 'rcd-empty' | 'rcbo-standalone' | 'direct-group';
    rcd?: RcdConfig;
    circuits: CircuitConfig[];
    topY: number;
    height: number;
  }

  const portraitSpineStartY = mainBreaker.hasSurgeProtector ? 328 : 288;
  const maxSpineBottomY = 1308;
  const availSpineH = maxSpineBottomY - portraitSpineStartY;

  const numGroupHeaders =
    rcdGroups.filter((g) => g.circuits.length > 0).length +
    (directCircuits.length > 0 ? 1 : 0);
  const numStandalones = rcdGroups.filter((g) => g.circuits.length === 0).length;
  const totalPortraitCircuitCount = Math.max(1, circuits.length + numStandalones);
  const totalGroupsCount = rcdGroups.length + (directCircuits.length > 0 ? 1 : 0);

  const portraitGroupHeaderH = totalPortraitCircuitCount > 9 ? 22 : 25;
  const portraitGroupGap =
    totalPortraitCircuitCount > 11 ? 7 : totalPortraitCircuitCount > 6 ? 11 : 16;

  const fixedOverheadH =
    numGroupHeaders * portraitGroupHeaderH +
    Math.max(0, totalGroupsCount - 1) * portraitGroupGap;

  const idealRowH = Math.floor((availSpineH - fixedOverheadH) / totalPortraitCircuitCount);
  const portraitCircuitRowH = Math.max(46, Math.min(82, idealRowH));

  const portraitSpineItems: PortraitSpineItem[] = [];
  let spineCursorY = portraitSpineStartY;

  rcdGroups.forEach((group) => {
    if (group.rcd.deviceKind === 'RCBO' && group.circuits.length === 0) {
      const h = portraitCircuitRowH + 4;
      portraitSpineItems.push({
        kind: 'rcbo-standalone',
        rcd: group.rcd,
        circuits: [],
        topY: spineCursorY,
        height: h,
      });
      spineCursorY += h + portraitGroupGap;
    } else if (group.circuits.length === 0) {
      const h = Math.min(68, portraitCircuitRowH);
      portraitSpineItems.push({
        kind: 'rcd-empty',
        rcd: group.rcd,
        circuits: [],
        topY: spineCursorY,
        height: h,
      });
      spineCursorY += h + portraitGroupGap;
    } else {
      const h = portraitGroupHeaderH + group.circuits.length * portraitCircuitRowH;
      portraitSpineItems.push({
        kind: 'rcd-group',
        rcd: group.rcd,
        circuits: group.circuits,
        topY: spineCursorY,
        height: h,
      });
      spineCursorY += h + portraitGroupGap;
    }
  });

  if (directCircuits.length > 0) {
    const h = portraitGroupHeaderH + directCircuits.length * portraitCircuitRowH;
    portraitSpineItems.push({
      kind: 'direct-group',
      circuits: directCircuits,
      topY: spineCursorY,
      height: h,
    });
    spineCursorY += h + portraitGroupGap;
  }

  const unscaledSpineH = Math.max(1, spineCursorY - portraitSpineStartY);
  const portraitSpineScale = unscaledSpineH > availSpineH ? availSpineH / unscaledSpineH : 1;

  const landscapeWidth = Math.max(1320, currentX + 140);
  const landscapeHeight = 1220;

  const portraitWidth = 1000;
  const portraitHeight = 1414;

  const canvasWidth = isPortrait ? portraitWidth : landscapeWidth;
  const canvasHeight = isPortrait ? portraitHeight : landscapeHeight;

  // Busbar Y coordinates for Landscape mode
  const busY_L1 = 290;
  const busY_L2 = 308;
  const busY_L3 = 326;
  const busY_N = 346;
  const busY_PE = 366;

  const rcdBoxY = 406;
  const rcdBusY = 540;
  const mcbBoxY = 590;
  const cableStartY = 648;
  const loadBoxY = 790;

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    setIsDraggingCanvas(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDraggingCanvas) return;
    setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };

  const handleMouseUp = () => {
    setIsDraggingCanvas(false);
  };

  const handleExportSvg = () => {
    if (!svgRef.current) return;
    const clone = svgRef.current.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('width', String(canvasWidth));
    clone.setAttribute('height', String(canvasHeight));
    const serializer = new XMLSerializer();
    const source = serializer.serializeToString(clone);
    const svgBlob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
    const svgUrl = URL.createObjectURL(svgBlob);
    const downloadLink = document.createElement('a');
    downloadLink.href = svgUrl;
    const safeProjectNo = (project.projectNumber || 'rozvadzac').replace(/[^a-zA-Z0-9_-]/g, '_');
    downloadLink.download = `${safeProjectNo}_Schema_${displayMode}.svg`;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
    setTimeout(() => URL.revokeObjectURL(svgUrl), 2000);
    setAutoRouteStatus('Čistá vektorová schéma (SVG) bola úspešne stiahnutá.');
    setTimeout(() => setAutoRouteStatus(null), 4000);
  };

  const handleExportPdf = async () => {
    setAutoRouteStatus(
      `Generujem čistý PDF výkres (${isPortrait ? 'A4 na výšku' : 'A3 na šírku'} + rozpis ističov a okruhov)...`
    );
    try {
      await exportCleanSchemaToPdf(project, {
        svgElement: svgRef.current,
        displayMode,
        orientation: schemaOrientation,
        paperFormat: isPortrait ? 'A4' : 'A3',
      });
      setAutoRouteStatus(
        `PDF výkres (${isPortrait ? 'A4 na výšku' : 'A3 na šírku'} • schéma + rozpis ističov) bol úspešne stiahnutý.`
      );
    } catch {
      window.print();
      setAutoRouteStatus('Otvorené okno tlače / PDF.');
    }
    setTimeout(() => setAutoRouteStatus(null), 4500);
  };

  const handleExportPng = async () => {
    setAutoRouteStatus('Generujem čistý PNG výkres (elektrická schéma + rozpis ističov a okruhov)...');
    try {
      await exportCleanSchemaToPng(project, {
        svgElement: svgRef.current,
        displayMode,
        orientation: schemaOrientation,
        paperFormat: isPortrait ? 'A4' : 'A3',
      });
      setAutoRouteStatus(
        'PNG výkres (čisto schéma + popis ktorý okruh je na ktorom ističi) bol úspešne stiahnutý.'
      );
    } catch {
      setAutoRouteStatus(null);
    }
    setTimeout(() => setAutoRouteStatus(null), 4500);
  };

  const handleAutoAlignAndRoute = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    if (onProjectChange) {
      const rcdOrder = new Map<string, number>();
      rcds.forEach((r, idx) => rcdOrder.set(r.id, idx));
      rcdOrder.set('NONE', 999);

      const sorted = [...circuits]
        .sort((a, b) => {
          const gA = rcdOrder.get(a.rcdId) ?? 999;
          const gB = rcdOrder.get(b.rcdId) ?? 999;
          return gA - gB;
        })
        .map((c, idx) => ({
          ...c,
          label: `FA${idx + 1}`,
        }));

      onProjectChange(
        { ...project, circuits: sorted },
        'Automatické zarovnanie schémy a prečíslovanie FA1..FAn'
      );
    }
    setAutoRouteStatus(
      'Vodiče a stĺpce schémy boli automaticky zarovnané a prečíslované podľa STN EN 60617.'
    );
    setTimeout(() => setAutoRouteStatus(null), 3500);
  };

  const handleAddQuickCircuit = () => {
    if (!onProjectChange) return;
    const nextIdx = circuits.length + 1;
    const defaultRcd = rcds.find((r) => r.deviceKind === 'RCCB')?.id ?? 'NONE';
    const mfg = mainBreaker.manufacturer;
    const newCircuit: CircuitConfig = {
      id: `circ-${Date.now()}`,
      label: `FA${nextIdx}`,
      name: `Zásuvkový okruh č. ${nextIdx}`,
      category: 'Zásuvky',
      poles: '1P',
      ratedCurrent: 16,
      characteristic: 'B',
      breakingCapacity: '10 kA',
      rcdId: defaultRcd,
      cable: 'CYKY-J 3x2,5 mm²',
      powerKw: 2.2,
      phase: isThreePhase
        ? (['L1', 'L2', 'L3'][circuits.length % 3] as PhaseAllocation)
        : 'L1',
      cableLengthM: 18,
      installationMethod: 'B1 (v inštalačnej rúre v stene)',
      cosPhi: 0.95,
      manufacturer: mfg,
      model: suggestCircuitBreakerModel(mfg, '1P', 'B', 16),
    };
    onProjectChange(
      { ...project, circuits: [...circuits, newCircuit] },
      `Pridaný okruh ${newCircuit.label} v editore schémy`
    );
    setSelectedElement({ type: 'circuit', id: newCircuit.id });
  };

  const handleAddQuickRcd = () => {
    if (!onProjectChange) return;
    const nextIdx = rcds.length + 1;
    const mfg = mainBreaker.manufacturer;
    const poles = isThreePhase ? '4P' : '2P';
    const newRcd: RcdConfig = {
      id: `rcd-${Date.now()}`,
      label: `FI${nextIdx}`,
      deviceKind: 'RCCB',
      poles,
      ratedCurrent: 40,
      sensitivity: 30,
      type: 'A',
      manufacturer: mfg,
      model: suggestRcdModel(mfg, 'RCCB', poles, 40, 30, 'A'),
      phase: isThreePhase ? 'L1,L2,L3' : 'L1',
      notes: `Skupina č. ${nextIdx}`,
    };
    onProjectChange(
      { ...project, rcds: [...rcds, newRcd] },
      `Pridaný prúdový chránič ${newRcd.label} v editore schémy`
    );
    setSelectedElement({ type: 'rcd', id: newRcd.id });
  };

  const handleMoveCircuit = (circuitId: string, direction: -1 | 1) => {
    if (!onProjectChange) return;
    const index = circuits.findIndex((c) => c.id === circuitId);
    if (index === -1) return;
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= circuits.length) return;

    const updated = [...circuits];
    const [moved] = updated.splice(index, 1);
    updated.splice(targetIndex, 0, moved);
    onProjectChange(
      { ...project, circuits: updated },
      `Presunutý okruh ${moved.label} v schéme`
    );
  };

  const handleDropCircuitOnColumn = (targetCircuitId: string, targetRcdId: string) => {
    if (!onProjectChange || !draggedCircuitId || draggedCircuitId === targetCircuitId) {
      setDraggedCircuitId(null);
      return;
    }
    const sourceIndex = circuits.findIndex((c) => c.id === draggedCircuitId);
    const targetIndex = circuits.findIndex((c) => c.id === targetCircuitId);
    if (sourceIndex === -1 || targetIndex === -1) {
      setDraggedCircuitId(null);
      return;
    }
    const updated = [...circuits];
    const [moved] = updated.splice(sourceIndex, 1);
    moved.rcdId = targetRcdId;
    updated.splice(targetIndex, 0, moved);
    setDraggedCircuitId(null);
    onProjectChange(
      { ...project, circuits: updated },
      `Preusporiadanie okruhu ${moved.label} (Drag & Drop)`
    );
  };

  const handleDeleteSelected = () => {
    if (!onProjectChange || !selectedElement) return;
    if (selectedElement.type === 'circuit') {
      const target = circuits.find((c) => c.id === selectedElement.id);
      onProjectChange(
        { ...project, circuits: circuits.filter((c) => c.id !== selectedElement.id) },
        `Odstránený okruh ${target?.label ?? ''}`
      );
      setSelectedElement(null);
    } else if (selectedElement.type === 'rcd') {
      const target = rcds.find((r) => r.id === selectedElement.id);
      onProjectChange(
        {
          ...project,
          rcds: rcds.filter((r) => r.id !== selectedElement.id),
          circuits: circuits.map((c) =>
            c.rcdId === selectedElement.id ? { ...c, rcdId: 'NONE' } : c
          ),
        },
        `Odstránený prúdový chránič ${target?.label ?? ''}`
      );
      setSelectedElement(null);
    }
  };

  const selectedCircuit =
    selectedElement?.type === 'circuit'
      ? circuits.find((c) => c.id === selectedElement.id) || null
      : null;

  const selectedRcd =
    selectedElement?.type === 'rcd'
      ? rcds.find((r) => r.id === selectedElement.id) || null
      : null;

  return (
    <div className="schema-canvas-root flex flex-col h-full bg-[#0B1120] print:bg-white rounded-xl border border-slate-800 print:border-0 overflow-hidden print:overflow-visible">
      {!compactMode && (
        <style>{`@media print { @page { size: ${
          isPortrait ? 'A4 portrait' : 'A3 landscape'
        }; margin: 7mm; } }`}</style>
      )}
      {/* Top Canvas Toolbar — Hidden in print and in compactMode */}
      {!compactMode && (
        <div className="no-print print:hidden flex items-center justify-between gap-2 px-3 sm:px-4 py-2 bg-[#0F172A] border-b border-slate-800 overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-2 shrink-0">
            {/* 1L / 3L / Wiring Diagram Toggle */}
            <div className="inline-flex rounded-xl bg-[#0B1120] p-1 border border-slate-800 shrink-0">
              <button
                type="button"
                onClick={() => onDisplayModeChange('single-line')}
                className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                  displayMode === 'single-line'
                    ? 'bg-[#0066FF] text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <GitCommit className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline">Jednopólová</span> (1L)
              </button>
              <button
                type="button"
                onClick={() => onDisplayModeChange('multi-line')}
                className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                  displayMode === 'multi-line'
                    ? 'bg-[#0066FF] text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Layers className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline">Viacpólová</span> (3L)
              </button>
              <button
                type="button"
                onClick={() => onDisplayModeChange('wiring-diagram')}
                className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                  displayMode === 'wiring-diagram'
                    ? 'bg-[#0066FF] text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Cable className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden md:inline">Detailné zapojenie</span>
                <span className="md:hidden">Vodiče</span>
              </button>
            </div>

            {/* Orientation Toggle: Portrait (Na výšku A4) vs Landscape (Na šírku A3) */}
            <div className="inline-flex rounded-xl bg-[#0B1120] p-1 border border-slate-800 shrink-0">
              <button
                type="button"
                onClick={() => handleSetOrientation('portrait')}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                  isPortrait
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Rozloženie na výšku pre tlač na formát A4 s veľkým písmom"
              >
                <RectangleVertical className="w-3.5 h-3.5 shrink-0" />
                <span>Na výšku (A4)</span>
              </button>
              <button
                type="button"
                onClick={() => handleSetOrientation('landscape')}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                  !isPortrait
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Široké jednoradové rozloženie na šírku (A3 / A4 na šírku)"
              >
                <RectangleHorizontal className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline">Na šírku</span>
              </button>
            </div>

            {onProjectChange && (
              <div className="flex items-center gap-1.5 pl-1 border-l border-slate-800 shrink-0">
                <button
                  type="button"
                  onClick={handleAddQuickCircuit}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#1E293B] hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  title="Pridať nový vývodový okruh priamo do schémy"
                >
                  <Plus className="w-3.5 h-3.5 text-[#38BDF8] shrink-0" />
                  <span>+ Okruh</span>
                </button>
                <button
                  type="button"
                  onClick={handleAddQuickRcd}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#1E293B] hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  title="Pridať prúdový chránič priamo do schémy"
                >
                  <Plus className="w-3.5 h-3.5 text-[#38BDF8] shrink-0" />
                  <span>+ Chránič</span>
                </button>
                <button
                  type="button"
                  onClick={handleAutoAlignAndRoute}
                  className="hidden md:flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#0066FF]/20 hover:bg-[#0066FF]/30 text-[#38BDF8] border border-[#0066FF]/40 text-xs font-bold transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  title="Automaticky zarovnať stĺpce, prepojiť zbernice a prečíslovať FA1..FAn"
                >
                  <Sparkles className="w-3.5 h-3.5 shrink-0" />
                  <span>Auto-zarovnať</span>
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <div className="flex items-center bg-[#0B1120] rounded-lg border border-slate-800 p-0.5 shrink-0">
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(0.45, +(z - 0.15).toFixed(2)))}
                className="p-1.5 text-slate-400 hover:text-white transition-colors cursor-pointer"
                title="Oddialiť"
              >
                <ZoomOut className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>
              <span className="px-1.5 sm:px-2 text-xs font-mono text-slate-300 tabular-nums">
                {Math.round(zoom * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(2.2, +(z + 0.15).toFixed(2)))}
                className="p-1.5 text-slate-400 hover:text-white transition-colors cursor-pointer"
                title="Priblížiť"
              >
                <ZoomIn className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setZoom(1);
                  setPan({ x: 0, y: 0 });
                }}
                className="p-1.5 text-slate-400 hover:text-white border-l border-slate-800 transition-colors cursor-pointer"
                title="Vycentrovať výkres"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>

            <button
              type="button"
              onClick={handleExportSvg}
              className="flex items-center gap-1 px-2 sm:px-2.5 py-1.5 rounded-lg bg-[#1E293B] hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold transition-colors cursor-pointer whitespace-nowrap shrink-0"
              title="Stiahnuť čisto schému ako vektorový súbor SVG"
            >
              <Download className="w-3.5 h-3.5 text-[#38BDF8]" />
              <span>SVG</span>
            </button>

            <button
              type="button"
              onClick={handleExportPng}
              className="hidden xs:flex items-center gap-1 px-2 sm:px-2.5 py-1.5 rounded-lg bg-[#1E293B] hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold transition-colors cursor-pointer whitespace-nowrap shrink-0"
              title="Stiahnuť čisto schému + rozpis ističov ako obrázok PNG"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              <span>PNG</span>
            </button>

            <button
              type="button"
              onClick={handleExportPdf}
              className="flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 rounded-lg bg-[#0066FF] hover:bg-[#2563EB] text-white text-xs font-bold shadow-sm transition-colors cursor-pointer whitespace-nowrap shrink-0"
              title="Stiahnuť čistý PDF súbor (elektrická schéma + tabuľka ktorý okruh je na ktorom ističi)"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Export PDF (Schéma + Ističe)</span>
              <span className="sm:hidden">PDF</span>
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#1E293B] hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold transition-colors cursor-pointer whitespace-nowrap shrink-0"
              title="Vytlačiť na tlačiarni"
            >
              <Printer className="w-3.5 h-3.5 text-slate-300" />
              <span>Tlač</span>
            </button>
          </div>
        </div>
      )}

      {/* Auto-route feedback banner */}
      {autoRouteStatus && (
        <div className="no-print px-4 py-1.5 bg-emerald-500/15 border-b border-emerald-500/30 flex items-center gap-2 text-xs text-emerald-300">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          <span>{autoRouteStatus}</span>
        </div>
      )}

      {/* Interactive Inspector Bar when a component is clicked on the schematic */}
      {!compactMode && onProjectChange && selectedElement && (
        <div className="no-print px-4 py-2.5 bg-[#0F172A] border-b border-[#0066FF]/50 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-[#38BDF8]" />
            <span className="text-xs font-bold uppercase tracking-wider text-[#38BDF8]">
              Inšpektor prvku v schéme:
            </span>
          </div>

          {selectedElement.type === 'main' && (
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <span className="font-mono font-bold text-amber-400">
                {upstreamBreaker.designation} – Hlavný istič pred elektromerom
              </span>
              <label className="flex items-center gap-1.5 text-slate-300">
                In (A):
                <select
                  value={mainBreaker.ratedCurrent}
                  onChange={(e) =>
                    onProjectChange(
                      {
                        ...project,
                        mainBreaker: {
                          ...mainBreaker,
                          ratedCurrent: Number(e.target.value) as MainBreakerCurrent,
                        },
                      },
                      `Zmena menovitého prúdu ${upstreamBreaker.designation} v schéme`
                    )
                  }
                  className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-white font-mono"
                >
                  {[10, 16, 20, 25, 32, 40, 50, 63].map((amp) => (
                    <option key={amp} value={amp}>
                      {amp} A
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-1.5 text-slate-300">
                Char.:
                <select
                  value={mainBreaker.characteristic}
                  onChange={(e) =>
                    onProjectChange(
                      {
                        ...project,
                        mainBreaker: {
                          ...mainBreaker,
                          characteristic: e.target.value as BreakerCharacteristic,
                        },
                      },
                      `Zmena charakteristiky ${upstreamBreaker.designation} v schéme`
                    )
                  }
                  className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-white font-mono"
                >
                  {['B', 'C', 'D'].map((ch) => (
                    <option key={ch} value={ch}>
                      {ch}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {selectedElement.type === 'internal-main' && (
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <span className="font-mono font-bold text-cyan-400">
                {internalDevice.designation} – Hlavný prvok v rozvádzači
              </span>
              <label className="flex items-center gap-1.5 text-slate-300">
                Typ:
                <select
                  value={internalDevice.deviceType}
                  onChange={(e) => {
                    const nextType = e.target.value as InternalMainDeviceType;
                    const nextIsBreaker = nextType === 'Istič';
                    const nextDesig = nextIsBreaker ? 'QF1' : 'QS1';
                    const updatedInternal = {
                      ...internalDevice,
                      deviceType: nextType,
                      hasOvercurrentProtection: nextIsBreaker,
                      designation: nextDesig,
                      model: suggestInternalMainDeviceModel(
                        internalDevice.manufacturer,
                        nextType,
                        internalDevice.poles,
                        internalDevice.ratedCurrent,
                        internalDevice.characteristic || 'B',
                        nextIsBreaker
                      ),
                    };
                    onProjectChange(
                      {
                        ...project,
                        mainBreaker: {
                          ...mainBreaker,
                          internalDevice: updatedInternal,
                        },
                      },
                      `Zmena hlavného prvku v rozvádzači na ${nextType}`
                    );
                  }}
                  className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-white"
                >
                  {INTERNAL_DEVICE_TYPES.map((dt) => (
                    <option key={dt} value={dt}>
                      {dt}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-1.5 text-slate-300">
                In (A):
                <select
                  value={internalDevice.ratedCurrent}
                  onChange={(e) => {
                    const nextAmp = Number(e.target.value) as InternalMainDeviceCurrent;
                    const updatedInternal = {
                      ...internalDevice,
                      ratedCurrent: nextAmp,
                      model: suggestInternalMainDeviceModel(
                        internalDevice.manufacturer,
                        internalDevice.deviceType,
                        internalDevice.poles,
                        nextAmp,
                        internalDevice.characteristic || 'B',
                        internalDevice.hasOvercurrentProtection
                      ),
                    };
                    onProjectChange(
                      {
                        ...project,
                        mainBreaker: {
                          ...mainBreaker,
                          internalDevice: updatedInternal,
                          internalSwitchCurrent:
                            nextAmp === 40 || nextAmp === 63 || nextAmp === 80 || nextAmp === 100
                              ? nextAmp
                              : mainBreaker.internalSwitchCurrent,
                        },
                      },
                      `Zmena menovitého prúdu ${internalDevice.designation} na ${nextAmp} A`
                    );
                  }}
                  className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-white font-mono"
                >
                  {INTERNAL_DEVICE_CURRENTS.map((amp) => (
                    <option key={amp} value={amp}>
                      {amp} A
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {selectedCircuit && (
            <div className="flex flex-wrap items-center gap-2.5 text-xs">
              <span className="font-mono font-bold text-amber-400">{selectedCircuit.label}</span>
              <input
                type="text"
                value={selectedCircuit.name}
                onChange={(e) =>
                  onProjectChange(
                    {
                      ...project,
                      circuits: circuits.map((c) =>
                        c.id === selectedCircuit.id ? { ...c, name: e.target.value } : c
                      ),
                    },
                    `Úprava názvu okruhu ${selectedCircuit.label}`
                  )
                }
                className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-white w-44"
              />
              <select
                value={selectedCircuit.characteristic}
                onChange={(e) =>
                  onProjectChange(
                    {
                      ...project,
                      circuits: circuits.map((c) =>
                        c.id === selectedCircuit.id
                          ? { ...c, characteristic: e.target.value as BreakerCharacteristic }
                          : c
                      ),
                    },
                    `Zmena charakteristiky ${selectedCircuit.label}`
                  )
                }
                className="bg-slate-950 border border-slate-700 rounded px-1.5 py-1 text-white font-mono"
              >
                {['B', 'C', 'D'].map((ch) => (
                  <option key={ch} value={ch}>
                    Char. {ch}
                  </option>
                ))}
              </select>
              <select
                value={selectedCircuit.ratedCurrent}
                onChange={(e) =>
                  onProjectChange(
                    {
                      ...project,
                      circuits: circuits.map((c) =>
                        c.id === selectedCircuit.id
                          ? {
                              ...c,
                              ratedCurrent: Number(
                                e.target.value
                              ) as CircuitConfig['ratedCurrent'],
                            }
                          : c
                      ),
                    },
                    `Zmena prúdu ${selectedCircuit.label}`
                  )
                }
                className="bg-slate-950 border border-slate-700 rounded px-1.5 py-1 text-white font-mono"
              >
                {[6, 10, 13, 16, 20, 25, 32, 40, 50, 63].map((amp) => (
                  <option key={amp} value={amp}>
                    {amp} A
                  </option>
                ))}
              </select>
              <select
                value={selectedCircuit.phase}
                onChange={(e) =>
                  onProjectChange(
                    {
                      ...project,
                      circuits: circuits.map((c) =>
                        c.id === selectedCircuit.id
                          ? { ...c, phase: e.target.value as PhaseAllocation }
                          : c
                      ),
                    },
                    `Zmena fázy ${selectedCircuit.label}`
                  )
                }
                className="bg-slate-950 border border-slate-700 rounded px-1.5 py-1 text-white font-mono"
              >
                <option value="L1">L1</option>
                {isThreePhase && <option value="L2">L2</option>}
                {isThreePhase && <option value="L3">L3</option>}
                {isThreePhase && <option value="L1,L2,L3">L1,L2,L3</option>}
              </select>
              <select
                value={selectedCircuit.rcdId}
                onChange={(e) =>
                  onProjectChange(
                    {
                      ...project,
                      circuits: circuits.map((c) =>
                        c.id === selectedCircuit.id ? { ...c, rcdId: e.target.value } : c
                      ),
                    },
                    `Priradenie chrániča pre ${selectedCircuit.label}`
                  )
                }
                className="bg-slate-950 border border-slate-700 rounded px-1.5 py-1 text-white font-mono"
              >
                <option value="NONE">Bez FI (priamo)</option>
                {rcds.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label} ({r.notes || r.model})
                  </option>
                ))}
              </select>

              <div className="flex items-center gap-1 border-l border-slate-800 pl-2">
                <button
                  type="button"
                  onClick={() => handleMoveCircuit(selectedCircuit.id, -1)}
                  className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200"
                  title="Posunúť okruh doľava"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleMoveCircuit(selectedCircuit.id, 1)}
                  className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200"
                  title="Posunúť okruh doprava"
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={handleDeleteSelected}
                  className="p-1 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 ml-1"
                  title="Odstrániť okruh"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {selectedRcd && (
            <div className="flex flex-wrap items-center gap-2.5 text-xs">
              <span className="font-mono font-bold text-cyan-400">{selectedRcd.label}</span>
              <input
                type="text"
                value={selectedRcd.notes || ''}
                onChange={(e) =>
                  onProjectChange(
                    {
                      ...project,
                      rcds: rcds.map((r) =>
                        r.id === selectedRcd.id ? { ...r, notes: e.target.value } : r
                      ),
                    },
                    `Zmena popisu skupiny ${selectedRcd.label}`
                  )
                }
                placeholder="Názov skupiny..."
                className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-white w-44"
              />
              <select
                value={selectedRcd.ratedCurrent}
                onChange={(e) =>
                  onProjectChange(
                    {
                      ...project,
                      rcds: rcds.map((r) =>
                        r.id === selectedRcd.id
                          ? {
                              ...r,
                              ratedCurrent: Number(
                                e.target.value
                              ) as RcdConfig['ratedCurrent'],
                            }
                          : r
                      ),
                    },
                    `Zmena prúdu chrániča ${selectedRcd.label}`
                  )
                }
                className="bg-slate-950 border border-slate-700 rounded px-1.5 py-1 text-white font-mono"
              >
                {[25, 40, 63, 80].map((a) => (
                  <option key={a} value={a}>
                    {a} A
                  </option>
                ))}
              </select>
              <select
                value={selectedRcd.type}
                onChange={(e) =>
                  onProjectChange(
                    {
                      ...project,
                      rcds: rcds.map((r) =>
                        r.id === selectedRcd.id
                          ? { ...r, type: e.target.value as RcdConfig['type'] }
                          : r
                      ),
                    },
                    `Zmena typu chrániča ${selectedRcd.label}`
                  )
                }
                className="bg-slate-950 border border-slate-700 rounded px-1.5 py-1 text-white font-mono"
              >
                {['AC', 'A', 'F', 'B'].map((t) => (
                  <option key={t} value={t}>
                    Typ {t}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleDeleteSelected}
                className="p-1 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-300"
                title="Odstrániť chránič"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => setSelectedElement(null)}
            className="text-xs text-slate-400 hover:text-white"
          >
            Zavrieť
          </button>
        </div>
      )}

      {/* Interactive SVG Viewport */}
      <div
        onMouseDown={compactMode ? undefined : handleMouseDown}
        onMouseMove={compactMode ? undefined : handleMouseMove}
        onMouseUp={compactMode ? undefined : handleMouseUp}
        onMouseLeave={compactMode ? undefined : handleMouseUp}
        className={`schema-canvas-viewport relative flex-1 bg-slate-100 print:bg-white ${
          compactMode
            ? 'overflow-visible select-none bg-white'
            : `overflow-auto select-none ${isDraggingCanvas ? 'cursor-grabbing' : 'cursor-grab'}`
        }`}
        style={
          compactMode
            ? undefined
            : {
                backgroundImage:
                  'radial-gradient(circle, rgba(15, 23, 42, 0.12) 1px, transparent 1px)',
                backgroundSize: '20px 20px',
              }
        }
      >
        {!compactMode && (
          <div className="no-print print:hidden sticky top-2 left-3 z-10 inline-flex items-center gap-2 px-2.5 py-1 rounded bg-white/95 border border-slate-300 shadow-sm text-[11px] text-slate-700 pointer-events-none">
            <MoveHorizontal className="w-3.5 h-3.5 text-[#0066FF]" />
            <span>
              Kliknutím na istič/chránič upravíte parametre • Ťahaním (Drag &amp; Drop) dole zmeníte
              poradie stĺpcov
            </span>
          </div>
        )}

        <div
          className={`schema-canvas-transform ${
            compactMode
              ? 'w-full flex items-start justify-center p-0'
              : 'min-w-max min-h-full flex items-start justify-center p-4'
          }`}
          style={
            compactMode
              ? undefined
              : {
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                  transformOrigin: 'top left',
                }
          }
        >
          <svg
            ref={svgRef}
            width={compactMode ? '100%' : canvasWidth}
            height={compactMode ? undefined : canvasHeight}
            viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
            className="schema-canvas-svg bg-white rounded-lg shadow-md border border-slate-300 w-full h-auto"
          >
            {/* Pure White Drawing Sheet Background */}
            <rect
              x={0}
              y={0}
              width={canvasWidth}
              height={canvasHeight}
              fill="#FFFFFF"
            />

            {/* Outer Technical Drawing Frame (STN EN ISO 5457 style - High-Contrast Black CAD) */}
            <rect
              x={12}
              y={12}
              width={canvasWidth - 24}
              height={canvasHeight - 24}
              fill="none"
              stroke="#000000"
              strokeWidth={2.5}
            />
            <rect
              x={18}
              y={18}
              width={canvasWidth - 36}
              height={canvasHeight - 36}
              fill="none"
              stroke="#334155"
              strokeWidth={1.1}
            />

            {/* ================================================================= */}
            {/* PORTRAIT A4 MODE (NA VÝŠKU A4):                                   */}
            {/* ZVISLÁ ZBERNICA ZHORA DOLE + VODOROVNÉ VETVY NA ŠÍRKU TEJ VÝŠKY   */}
            {/* ================================================================= */}
            {isPortrait ? (
              (() => {
                // X-coordinates for Vertical Main Busbar on the left side of the Portrait A4 sheet
                const mainBus1LX = 88;
                const mainBusL1X = 56;
                const mainBusL2X = 68;
                const mainBusL3X = 80;
                const mainBusNX = 92;
                const mainBusPEX = 104;

                // Determine the lowest Y tap on the Vertical Main Busbar
                let lastMainTapY = 330;
                portraitSpineItems.forEach((item) => {
                  if (item.kind === 'rcd-group') {
                    const firstCy =
                      item.topY + portraitGroupHeaderH + portraitCircuitRowH / 2;
                    if (firstCy > lastMainTapY) lastMainTapY = firstCy;
                  } else if (item.kind === 'rcd-empty' || item.kind === 'rcbo-standalone') {
                    const cy = item.topY + item.height / 2;
                    if (cy > lastMainTapY) lastMainTapY = cy;
                  } else if (item.kind === 'direct-group' && item.circuits.length > 0) {
                    const lastCy =
                      item.topY +
                      portraitGroupHeaderH +
                      (item.circuits.length - 1) * portraitCircuitRowH +
                      portraitCircuitRowH / 2;
                    if (lastCy > lastMainTapY) lastMainTapY = lastCy;
                  }
                });
                const mainBusBottomY = Math.max(360, lastMainTapY + 16);

                return (
                  <>
                    {/* Top Header Banner */}
                    <g transform="translate(28, 28)">
                      <text
                        x={0}
                        y={18}
                        fill="#000000"
                        fontSize={17.5}
                        fontWeight="bold"
                        fontFamily="Plus Jakarta Sans, sans-serif"
                      >
                        {project.name.length > 54
                          ? `${project.name.slice(0, 53).toUpperCase()}…`
                          : project.name.toUpperCase()}{' '}
                        —{' '}
                        {displayMode === 'single-line'
                          ? 'JEDNOPÓLOVÁ SCHÉMA ZAPOJENIA (1L)'
                          : displayMode === 'multi-line'
                          ? 'TROJPÓLOVÁ / VIACPÓLOVÁ SCHÉMA (3L)'
                          : 'DETAILNÁ SCHÉMA ZAPOJENIA (L1, L2, L3, N, PE)'}
                      </text>
                      <text
                        x={0}
                        y={39}
                        fill="#0F172A"
                        fontSize={12.5}
                        fontWeight="bold"
                        fontFamily="JetBrains Mono, monospace"
                      >
                        Sústava: {project.networkSystem} | {project.supplySystem.toUpperCase()} (
                        {project.voltage}) | Prívod: {project.supplyCable} | Krytie:{' '}
                        {project.ipRating}
                      </text>
                    </g>

                    {/* Top Vertical Incoming Chain (Zhora dole): Prívod -> QF0 -> Elektromer -> QS1/QF1 */}
                    <g transform={`translate(${mainBus1LX}, 78)`}>
                      {/* Step 1: PRÍVOD */}
                      {displayMode === 'single-line' ? (
                        <>
                          <line x1={0} y1={0} x2={0} y2={24} stroke="#000000" strokeWidth={3} />
                          <line x1={-7} y1={8} x2={7} y2={15} stroke="#000000" strokeWidth={1.8} />
                        </>
                      ) : (
                        <>
                          <line x1={-32} y1={0} x2={-32} y2={24} stroke="#000000" strokeWidth={2.2} />
                          {isThreePhase && (
                            <>
                              <line x1={-20} y1={0} x2={-20} y2={24} stroke="#000000" strokeWidth={2.2} />
                              <line x1={-8} y1={0} x2={-8} y2={24} stroke="#000000" strokeWidth={2.2} />
                            </>
                          )}
                          {project.networkSystem !== 'TN-C' && (
                            <line x1={4} y1={0} x2={4} y2={202} stroke="#0369A1" strokeWidth={2} />
                          )}
                          <line
                            x1={16}
                            y1={0}
                            x2={16}
                            y2={202}
                            stroke="#15803D"
                            strokeWidth={2}
                            strokeDasharray="5 3"
                          />
                        </>
                      )}
                      <text
                        x={44}
                        y={14}
                        fill="#000000"
                        fontSize={12.5}
                        fontFamily="JetBrains Mono, monospace"
                        fontWeight="bold"
                      >
                        PRÍVOD EL. ENERGIE ({project.networkSystem} • {project.voltage})
                      </text>

                      {/* Step 2: QF0 */}
                      <g
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedElement({ type: 'main' });
                        }}
                        className="cursor-pointer"
                      >
                        <rect
                          x={displayMode === 'single-line' ? -30 : -44}
                          y={24}
                          width={displayMode === 'single-line' ? 60 : 72}
                          height={48}
                          rx={4}
                          fill={selectedElement?.type === 'main' ? '#EFF6FF' : '#FFFFFF'}
                          stroke={selectedElement?.type === 'main' ? '#0066FF' : '#000000'}
                          strokeWidth={selectedElement?.type === 'main' ? 3 : 2.2}
                          strokeDasharray="5 2"
                        />
                        {upstreamBreaker.enabled ? (
                          <>
                            {displayMode === 'single-line' || !isThreePhase ? (
                              <>
                                <line
                                  x1={displayMode === 'single-line' ? 0 : -32}
                                  y1={24}
                                  x2={displayMode === 'single-line' ? 0 : -32}
                                  y2={35}
                                  stroke="#000000"
                                  strokeWidth={2.2}
                                />
                                <line
                                  x1={displayMode === 'single-line' ? 0 : -32}
                                  y1={60}
                                  x2={displayMode === 'single-line' ? 0 : -32}
                                  y2={72}
                                  stroke="#000000"
                                  strokeWidth={2.2}
                                />
                                <line
                                  x1={displayMode === 'single-line' ? 0 : -32}
                                  y1={60}
                                  x2={displayMode === 'single-line' ? -10 : -40}
                                  y2={38}
                                  stroke="#000000"
                                  strokeWidth={2.4}
                                />
                                <line
                                  x1={(displayMode === 'single-line' ? 0 : -32) - 4.5}
                                  y1={32}
                                  x2={(displayMode === 'single-line' ? 0 : -32) + 4.5}
                                  y2={38}
                                  stroke="#000000"
                                  strokeWidth={1.8}
                                />
                                <line
                                  x1={(displayMode === 'single-line' ? 0 : -32) - 4.5}
                                  y1={38}
                                  x2={(displayMode === 'single-line' ? 0 : -32) + 4.5}
                                  y2={32}
                                  stroke="#000000"
                                  strokeWidth={1.8}
                                />
                              </>
                            ) : (
                              [-32, -20, -8].map((poleX) => (
                                <g key={`qf0-p-${poleX}`}>
                                  <line x1={poleX} y1={24} x2={poleX} y2={35} stroke="#000000" strokeWidth={1.8} />
                                  <line x1={poleX} y1={60} x2={poleX} y2={72} stroke="#000000" strokeWidth={1.8} />
                                  <line x1={poleX} y1={60} x2={poleX - 6} y2={38} stroke="#000000" strokeWidth={2} />
                                </g>
                              ))
                            )}
                            <text
                              x={44}
                              y={43}
                              fill="#000000"
                              fontSize={13}
                              fontWeight="bold"
                              fontFamily="JetBrains Mono, monospace"
                            >
                              {upstreamBreaker.designation} – HLAVNÝ ISTIČ ({upstreamBreaker.placement.toUpperCase()})
                            </text>
                            <text
                              x={44}
                              y={61}
                              fill="#0F172A"
                              fontSize={12.5}
                              fontFamily="JetBrains Mono, monospace"
                              fontWeight="bold"
                            >
                              {upstreamBreaker.poles} {upstreamBreaker.characteristic}
                              {upstreamBreaker.ratedCurrent}A / {upstreamBreaker.breakingCapacity} ({upstreamBreaker.manufacturer})
                            </text>
                          </>
                        ) : (
                          <>
                            <line x1={0} y1={24} x2={0} y2={72} stroke="#475569" strokeWidth={2} strokeDasharray="4 3" />
                            <text
                              x={44}
                              y={52}
                              fill="#334155"
                              fontSize={12}
                              fontWeight="bold"
                              fontFamily="JetBrains Mono, monospace"
                            >
                              {upstreamBreaker.designation} – Pred elektromerom (vypnutý)
                            </text>
                          </>
                        )}
                      </g>

                      {/* Step 3: ELEKTROMER kWh */}
                      {displayMode === 'single-line' || !isThreePhase ? (
                        <line
                          x1={displayMode === 'single-line' ? 0 : -32}
                          y1={72}
                          x2={displayMode === 'single-line' ? 0 : -32}
                          y2={84}
                          stroke="#000000"
                          strokeWidth={2.4}
                        />
                      ) : (
                        [-32, -20, -8].map((poleX) => (
                          <line key={`em-in-${poleX}`} x1={poleX} y1={72} x2={poleX} y2={84} stroke="#000000" strokeWidth={1.9} />
                        ))
                      )}
                      {electricityMeter.enabled ? (
                        <g>
                          <rect
                            x={displayMode === 'single-line' ? -30 : -44}
                            y={84}
                            width={displayMode === 'single-line' ? 60 : 72}
                            height={38}
                            rx={4}
                            fill="#FFFFFF"
                            stroke="#000000"
                            strokeWidth={2}
                            strokeDasharray="4 2"
                          />
                          <circle
                            cx={displayMode === 'single-line' ? 0 : -16}
                            cy={103}
                            r={13}
                            fill="#F8FAFC"
                            stroke="#000000"
                            strokeWidth={1.6}
                          />
                          <text
                            x={displayMode === 'single-line' ? 0 : -16}
                            y={107}
                            textAnchor="middle"
                            fill="#000000"
                            fontSize={10.5}
                            fontWeight="bold"
                            fontFamily="JetBrains Mono, monospace"
                          >
                            kWh
                          </text>
                          <text
                            x={44}
                            y={99}
                            fill="#000000"
                            fontSize={12.5}
                            fontWeight="bold"
                            fontFamily="JetBrains Mono, monospace"
                          >
                            ELEKTROMER ({electricityMeter.type})
                          </text>
                          <text
                            x={44}
                            y={116}
                            fill="#1E293B"
                            fontSize={11.5}
                            fontWeight="bold"
                            fontFamily="JetBrains Mono, monospace"
                          >
                            {electricityMeter.location} • {electricityMeter.tariff}
                          </text>
                        </g>
                      ) : (
                        <line x1={0} y1={84} x2={0} y2={122} stroke="#000000" strokeWidth={2.4} />
                      )}

                      {/* Step 4: PRÍVOD DO ROZVÁDZAČA */}
                      {displayMode === 'single-line' || !isThreePhase ? (
                        <>
                          <line
                            x1={displayMode === 'single-line' ? 0 : -32}
                            y1={122}
                            x2={displayMode === 'single-line' ? 0 : -32}
                            y2={148}
                            stroke="#000000"
                            strokeWidth={2.8}
                          />
                          <line
                            x1={(displayMode === 'single-line' ? 0 : -32) - 7}
                            y1={131}
                            x2={(displayMode === 'single-line' ? 0 : -32) + 7}
                            y2={137}
                            stroke="#000000"
                            strokeWidth={1.8}
                          />
                        </>
                      ) : (
                        [-32, -20, -8].map((poleX) => (
                          <line key={`em-out-${poleX}`} x1={poleX} y1={122} x2={poleX} y2={148} stroke="#000000" strokeWidth={2} />
                        ))
                      )}
                      <text
                        x={44}
                        y={140}
                        fill="#000000"
                        fontSize={12}
                        fontWeight="bold"
                        fontFamily="JetBrains Mono, monospace"
                      >
                        PRÍVOD DO ROZVÁDZAČA ({project.supplyCable})
                      </text>

                      {/* Step 5: HLAVNÝ VYPÍNAČ / ISTIČ V ROZVÁDZAČI (QS1 / QF1) */}
                      <g
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedElement({ type: 'internal-main' });
                        }}
                        className="cursor-pointer"
                      >
                        <rect
                          x={displayMode === 'single-line' ? -30 : -44}
                          y={148}
                          width={displayMode === 'single-line' ? 60 : 72}
                          height={54}
                          rx={4}
                          fill={selectedElement?.type === 'internal-main' ? '#EFF6FF' : '#FFFFFF'}
                          stroke={selectedElement?.type === 'internal-main' ? '#0066FF' : '#000000'}
                          strokeWidth={selectedElement?.type === 'internal-main' ? 3 : 2.2}
                        />
                        {internalDevice.enabled ? (
                          <>
                            {displayMode === 'single-line' || !isThreePhase ? (
                              <>
                                <line
                                  x1={displayMode === 'single-line' ? 0 : -32}
                                  y1={148}
                                  x2={displayMode === 'single-line' ? 0 : -32}
                                  y2={161}
                                  stroke="#000000"
                                  strokeWidth={2.2}
                                />
                                <line
                                  x1={displayMode === 'single-line' ? 0 : -32}
                                  y1={189}
                                  x2={displayMode === 'single-line' ? 0 : -32}
                                  y2={202}
                                  stroke="#000000"
                                  strokeWidth={2.2}
                                />
                                <line
                                  x1={displayMode === 'single-line' ? 0 : -32}
                                  y1={189}
                                  x2={(displayMode === 'single-line' ? 0 : -32) - 11}
                                  y2={164}
                                  stroke="#000000"
                                  strokeWidth={2.4}
                                />
                                {isInternalBreaker ? (
                                  <>
                                    <line
                                      x1={(displayMode === 'single-line' ? 0 : -32) - 5}
                                      y1={159}
                                      x2={(displayMode === 'single-line' ? 0 : -32) + 5}
                                      y2={165}
                                      stroke="#000000"
                                      strokeWidth={1.8}
                                    />
                                    <line
                                      x1={(displayMode === 'single-line' ? 0 : -32) - 5}
                                      y1={165}
                                      x2={(displayMode === 'single-line' ? 0 : -32) + 5}
                                      y2={159}
                                      stroke="#000000"
                                      strokeWidth={1.8}
                                    />
                                  </>
                                ) : (
                                  <>
                                    <line
                                      x1={(displayMode === 'single-line' ? 0 : -32) - 6}
                                      y1={161}
                                      x2={(displayMode === 'single-line' ? 0 : -32) + 6}
                                      y2={161}
                                      stroke="#000000"
                                      strokeWidth={2.2}
                                    />
                                    <circle
                                      cx={displayMode === 'single-line' ? 0 : -32}
                                      cy={189}
                                      r={2.6}
                                      fill="#000000"
                                    />
                                  </>
                                )}
                              </>
                            ) : (
                              [-32, -20, -8].map((poleX) => (
                                <g key={`qs1-p-${poleX}`}>
                                  <line x1={poleX} y1={148} x2={poleX} y2={161} stroke="#000000" strokeWidth={1.8} />
                                  <line x1={poleX} y1={189} x2={poleX} y2={202} stroke="#000000" strokeWidth={1.8} />
                                  <line x1={poleX} y1={189} x2={poleX - 6} y2={164} stroke="#000000" strokeWidth={2} />
                                </g>
                              ))
                            )}
                            <text
                              x={44}
                              y={166}
                              fill="#000000"
                              fontSize={13}
                              fontWeight="bold"
                              fontFamily="JetBrains Mono, monospace"
                            >
                              {internalDevice.designation} – {internalDevice.deviceType.toUpperCase()} V ROZVÁDZAČI
                            </text>
                            <text
                              x={44}
                              y={184}
                              fill="#0F172A"
                              fontSize={12.5}
                              fontWeight="bold"
                              fontFamily="JetBrains Mono, monospace"
                            >
                              {internalDevice.poles}{' '}
                              {isInternalBreaker
                                ? `${internalDevice.characteristic || 'B'}${internalDevice.ratedCurrent}A (${internalDevice.breakingCapacity || '10 kA'})`
                                : `In = ${internalDevice.ratedCurrent}A (bez nadprúd. ochrany)`}{' '}
                              • {internalDevice.manufacturer}
                            </text>
                            <text
                              x={44}
                              y={200}
                              fill="#334155"
                              fontSize={11.5}
                              fontWeight="bold"
                              fontFamily="Plus Jakarta Sans, sans-serif"
                            >
                              {internalDevice.modules} mod. •{' '}
                              {internalDevice.topologyPosition === 'ZA_SPD_PRED_RCD'
                                ? 'Za SPD, pred chráničmi FI'
                                : 'Na vstupe rozvádzača (pred SPD a FI)'}
                            </text>
                          </>
                        ) : (
                          <>
                            <line x1={0} y1={148} x2={0} y2={202} stroke="#000000" strokeWidth={2.4} />
                            <text
                              x={44}
                              y={178}
                              fill="#334155"
                              fontSize={12}
                              fontWeight="bold"
                              fontFamily="JetBrains Mono, monospace"
                            >
                              Priame napojenie zberníc (bez hl. prvku v rozvádzači)
                            </text>
                          </>
                        )}
                      </g>
                    </g>

                    {/* Right-Top Box: PEN Split Point */}
                    {(project.networkSystem === 'TN-C-S' || displayMode === 'wiring-diagram') && (
                      <g transform="translate(680, 78)">
                        <rect
                          x={0}
                          y={0}
                          width={284}
                          height={66}
                          rx={5}
                          fill="#F0FDF4"
                          stroke="#15803D"
                          strokeWidth={2}
                        />
                        <text
                          x={142}
                          y={21}
                          textAnchor="middle"
                          fill="#15803D"
                          fontSize={12}
                          fontWeight="bold"
                          fontFamily="JetBrains Mono, monospace"
                        >
                          {project.networkSystem === 'TN-C-S'
                            ? 'BOD ROZDELENIA PEN → PE + N'
                            : `UZOL PE / N (${project.networkSystem})`}
                        </text>
                        <text
                          x={142}
                          y={40}
                          textAnchor="middle"
                          fill="#000000"
                          fontSize={12}
                          fontWeight="bold"
                          fontFamily="JetBrains Mono, monospace"
                        >
                          Ochranná svorkovnica PE + N
                        </text>
                        <text
                          x={142}
                          y={57}
                          textAnchor="middle"
                          fill="#0369A1"
                          fontSize={11.5}
                          fontWeight="bold"
                          fontFamily="JetBrains Mono, monospace"
                        >
                          HOP (MET) ≤ 10 Ω
                        </text>
                      </g>
                    )}

                    {/* Right-Top Surge Protector (SPD - FV1) tapping into Vertical Main Busbar at Y = 312 */}
                    {mainBreaker.hasSurgeProtector && (
                      <g
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedElement({ type: 'spd' });
                        }}
                        className="cursor-pointer"
                      >
                        <line
                          x1={displayMode === 'single-line' ? mainBus1LX : mainBusL1X}
                          y1={312}
                          x2={706}
                          y2={312}
                          stroke="#000000"
                          strokeWidth={2.2}
                        />
                        <circle
                          cx={displayMode === 'single-line' ? mainBus1LX : mainBusL1X}
                          cy={312}
                          r={4}
                          fill="#000000"
                        />
                        <line x1={706} y1={244} x2={706} y2={312} stroke="#000000" strokeWidth={2.2} />
                        <g transform="translate(706, 196)">
                          <rect
                            x={-26}
                            y={8}
                            width={52}
                            height={40}
                            rx={4}
                            fill="#FFFFFF"
                            stroke="#000000"
                            strokeWidth={2}
                          />
                          <polygon points="-6,21 6,21 0,34" fill="#000000" />
                          <line x1={-8} y1={34} x2={8} y2={34} stroke="#000000" strokeWidth={1.8} />
                          <text
                            x={34}
                            y={22}
                            fill="#000000"
                            fontSize={12.5}
                            fontWeight="bold"
                            fontFamily="JetBrains Mono, monospace"
                          >
                            FV1 – PREPÄŤOVÁ OCHRANA
                          </text>
                          <text
                            x={34}
                            y={38}
                            fill="#0F172A"
                            fontSize={12}
                            fontWeight="bold"
                            fontFamily="JetBrains Mono, monospace"
                          >
                            {mainBreaker.surgeProtectorType} ({mainBreaker.manufacturer})
                          </text>
                          <line x1={0} y1={8} x2={0} y2={-6} stroke="#15803D" strokeWidth={2} />
                          <line x1={-10} y1={-6} x2={10} y2={-6} stroke="#15803D" strokeWidth={2} />
                          <line x1={-6} y1={-11} x2={6} y2={-11} stroke="#15803D" strokeWidth={2} />
                          <line x1={-3} y1={-16} x2={3} y2={-16} stroke="#15803D" strokeWidth={2} />
                        </g>
                      </g>
                    )}

                    {/* ================================================================= */}
                    {/* VERTICAL MAIN BUSBAR (ZHORA DOLE) ON LEFT OF PORTRAIT A4 SHEET   */}
                    {/* ================================================================= */}
                    {displayMode === 'single-line' ? (
                      <g>
                        <line
                          x1={mainBus1LX}
                          y1={280}
                          x2={mainBus1LX}
                          y2={portraitSpineStartY}
                          stroke="#000000"
                          strokeWidth={3.8}
                        />
                        <circle cx={mainBus1LX} cy={296} r={4.2} fill="#000000" />
                        <text
                          x={24}
                          y={300}
                          fill="#000000"
                          fontSize={12}
                          fontWeight="bold"
                          fontFamily="JetBrains Mono, monospace"
                        >
                          {isThreePhase ? '3L+N+PE' : 'L+N+PE'}
                        </text>
                      </g>
                    ) : (
                      <g>
                        <line
                          x1={mainBusL1X}
                          y1={280}
                          x2={mainBusL1X}
                          y2={portraitSpineStartY}
                          stroke="#000000"
                          strokeWidth={2.4}
                        />
                        {isThreePhase && (
                          <>
                            <line
                              x1={mainBusL2X}
                              y1={280}
                              x2={mainBusL2X}
                              y2={portraitSpineStartY}
                              stroke="#000000"
                              strokeWidth={2.4}
                            />
                            <line
                              x1={mainBusL3X}
                              y1={280}
                              x2={mainBusL3X}
                              y2={portraitSpineStartY}
                              stroke="#000000"
                              strokeWidth={2.4}
                            />
                          </>
                        )}
                        {project.networkSystem !== 'TN-C' && (
                          <line
                            x1={mainBusNX}
                            y1={280}
                            x2={mainBusNX}
                            y2={portraitSpineStartY}
                            stroke="#0369A1"
                            strokeWidth={2.4}
                          />
                        )}
                        <line
                          x1={mainBusPEX}
                          y1={280}
                          x2={mainBusPEX}
                          y2={portraitSpineStartY}
                          stroke="#15803D"
                          strokeWidth={2.4}
                          strokeDasharray="6 3"
                        />
                        <rect
                          x={44}
                          y={275}
                          width={72}
                          height={15}
                          rx={2}
                          fill="#FFFFFF"
                          stroke="#CBD5E1"
                          strokeWidth={0.9}
                        />
                        <text
                          x={mainBusL1X}
                          y={286}
                          textAnchor="middle"
                          fill="#000000"
                          fontSize={9.5}
                          fontWeight="bold"
                          fontFamily="JetBrains Mono, monospace"
                        >
                          L1
                        </text>
                        {isThreePhase && (
                          <>
                            <text
                              x={mainBusL2X}
                              y={286}
                              textAnchor="middle"
                              fill="#000000"
                              fontSize={9.5}
                              fontWeight="bold"
                              fontFamily="JetBrains Mono, monospace"
                            >
                              L2
                            </text>
                            <text
                              x={mainBusL3X}
                              y={286}
                              textAnchor="middle"
                              fill="#000000"
                              fontSize={9.5}
                              fontWeight="bold"
                              fontFamily="JetBrains Mono, monospace"
                            >
                              L3
                            </text>
                          </>
                        )}
                        {project.networkSystem !== 'TN-C' && (
                          <text
                            x={mainBusNX}
                            y={286}
                            textAnchor="middle"
                            fill="#0369A1"
                            fontSize={9.5}
                            fontWeight="bold"
                            fontFamily="JetBrains Mono, monospace"
                          >
                            N
                          </text>
                        )}
                        <text
                          x={mainBusPEX}
                          y={286}
                          textAnchor="middle"
                          fill="#15803D"
                          fontSize={9.5}
                          fontWeight="bold"
                          fontFamily="JetBrains Mono, monospace"
                        >
                          {project.networkSystem === 'TN-C' ? 'PEN' : 'PE'}
                        </text>
                      </g>
                    )}

                    {/* ================================================================= */}
                    {/* HORIZONTAL CIRCUIT BRANCHES STACKED ZHORA DOLE ACROSS A4 WIDTH    */}
                    {/* ================================================================= */}
                    <g
                      transform={
                        portraitSpineScale < 1
                          ? `translate(0, ${portraitSpineStartY}) scale(1, ${portraitSpineScale}) translate(0, -${portraitSpineStartY})`
                          : undefined
                      }
                    >
                      {displayMode === 'single-line' ? (
                        <line
                          x1={mainBus1LX}
                          y1={portraitSpineStartY}
                          x2={mainBus1LX}
                          y2={mainBusBottomY}
                          stroke="#000000"
                          strokeWidth={3.8}
                        />
                      ) : (
                        <>
                          <line
                            x1={mainBusL1X}
                            y1={portraitSpineStartY}
                            x2={mainBusL1X}
                            y2={mainBusBottomY}
                            stroke="#000000"
                            strokeWidth={2.4}
                          />
                          {isThreePhase && (
                            <>
                              <line
                                x1={mainBusL2X}
                                y1={portraitSpineStartY}
                                x2={mainBusL2X}
                                y2={mainBusBottomY}
                                stroke="#000000"
                                strokeWidth={2.4}
                              />
                              <line
                                x1={mainBusL3X}
                                y1={portraitSpineStartY}
                                x2={mainBusL3X}
                                y2={mainBusBottomY}
                                stroke="#000000"
                                strokeWidth={2.4}
                              />
                            </>
                          )}
                          {project.networkSystem !== 'TN-C' && (
                            <line
                              x1={mainBusNX}
                              y1={portraitSpineStartY}
                              x2={mainBusNX}
                              y2={mainBusBottomY}
                              stroke="#0369A1"
                              strokeWidth={2.4}
                            />
                          )}
                          <line
                            x1={mainBusPEX}
                            y1={portraitSpineStartY}
                            x2={mainBusPEX}
                            y2={mainBusBottomY}
                            stroke="#15803D"
                            strokeWidth={2.4}
                            strokeDasharray="6 3"
                          />
                        </>
                      )}
                    {portraitSpineItems.map((item, itemIdx) => {
                      const renderHorizontalCircuitRow = (
                        c: CircuitConfig,
                        cy: number,
                        hasParentRcd: boolean,
                        subBusX1L: number,
                        subBusL1X: number,
                        subBusL2X: number,
                        subBusL3X: number,
                        subBusNX: number
                      ) => {
                        const isThreePoleCircuit = c.poles === '3P' || c.poles === '4P';
                        const isCircuitSelected =
                          selectedElement?.type === 'circuit' && selectedElement.id === c.id;
                        const isCompactRow = portraitCircuitRowH < 66;
                        const mcbHalfH = isCompactRow ? 13 : 17;
                        const mcbTopTextOff = isCompactRow ? 16 : 21;
                        const mcbBotTextOff = isCompactRow ? 22 : 29;
                        const cableHalfH = isCompactRow ? 14 : 18;
                        const loadHalfH = isCompactRow ? 18 : 23;
                        const mcbLeftX = 298;
                        const mcbRightX = 366;
                        const mcbMidX = 332;
                        const cableEndX = 558;
                        const loadEndX = 964;

                        // Determine source X coordinate for phase and N
                        const phaseTapX = hasParentRcd
                          ? displayMode === 'single-line'
                            ? subBusX1L
                            : c.phase === 'L2' && isThreePhase
                            ? subBusL2X
                            : c.phase === 'L3' && isThreePhase
                            ? subBusL3X
                            : subBusL1X
                          : displayMode === 'single-line'
                          ? mainBus1LX
                          : c.phase === 'L2' && isThreePhase
                          ? mainBusL2X
                          : c.phase === 'L3' && isThreePhase
                          ? mainBusL3X
                          : mainBusL1X;

                        const nTapX = hasParentRcd
                          ? displayMode === 'single-line'
                            ? subBusX1L + 12
                            : subBusNX
                          : mainBusNX;

                        return (
                          <g
                            key={`p-horiz-circ-${c.id}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedElement({ type: 'circuit', id: c.id });
                            }}
                            className="cursor-pointer"
                          >
                            {/* 1. Feeder from Vertical Sub-Busbar / Main Busbar into Horizontal MCB */}
                            {displayMode === 'single-line' || !isThreePoleCircuit ? (
                              <>
                                <line
                                  x1={phaseTapX}
                                  y1={cy}
                                  x2={mcbLeftX}
                                  y2={cy}
                                  stroke="#000000"
                                  strokeWidth={2.3}
                                />
                                <circle cx={phaseTapX} cy={cy} r={3.6} fill="#000000" />
                              </>
                            ) : (
                              <>
                                <line
                                  x1={hasParentRcd ? subBusL1X : mainBusL1X}
                                  y1={cy - 5}
                                  x2={mcbLeftX}
                                  y2={cy - 5}
                                  stroke="#000000"
                                  strokeWidth={1.7}
                                />
                                <circle
                                  cx={hasParentRcd ? subBusL1X : mainBusL1X}
                                  cy={cy - 5}
                                  r={3}
                                  fill="#000000"
                                />
                                <line
                                  x1={hasParentRcd ? subBusL2X : mainBusL2X}
                                  y1={cy}
                                  x2={mcbLeftX}
                                  y2={cy}
                                  stroke="#000000"
                                  strokeWidth={1.7}
                                />
                                <circle
                                  cx={hasParentRcd ? subBusL2X : mainBusL2X}
                                  cy={cy}
                                  r={3}
                                  fill="#000000"
                                />
                                <line
                                  x1={hasParentRcd ? subBusL3X : mainBusL3X}
                                  y1={cy + 5}
                                  x2={mcbLeftX}
                                  y2={cy + 5}
                                  stroke="#000000"
                                  strokeWidth={1.7}
                                />
                                <circle
                                  cx={hasParentRcd ? subBusL3X : mainBusL3X}
                                  cy={cy + 5}
                                  r={3}
                                  fill="#000000"
                                />
                              </>
                            )}

                            {/* 2. Horizontal MCB Box (68 × 2*mcbHalfH at x = 298..366) */}
                            <rect
                              x={mcbLeftX}
                              y={cy - mcbHalfH}
                              width={68}
                              height={mcbHalfH * 2}
                              rx={4}
                              fill={isCircuitSelected ? '#EFF6FF' : '#FFFFFF'}
                              stroke={isCircuitSelected ? '#0066FF' : '#000000'}
                              strokeWidth={isCircuitSelected ? 3 : 2}
                            />
                            {displayMode !== 'single-line' && isThreePoleCircuit ? (
                              [-5, 0, 5].map((yOff) => (
                                <g key={`h-mcb-3p-${c.id}-${yOff}`}>
                                  <line
                                    x1={mcbLeftX}
                                    y1={cy + yOff}
                                    x2={mcbLeftX + 16}
                                    y2={cy + yOff}
                                    stroke="#000000"
                                    strokeWidth={1.5}
                                  />
                                  <line
                                    x1={mcbRightX - 16}
                                    y1={cy + yOff}
                                    x2={mcbRightX}
                                    y2={cy + yOff}
                                    stroke="#000000"
                                    strokeWidth={1.5}
                                  />
                                  <line
                                    x1={mcbRightX - 16}
                                    y1={cy + yOff}
                                    x2={mcbLeftX + 19}
                                    y2={cy + yOff - 4.5}
                                    stroke="#000000"
                                    strokeWidth={1.8}
                                  />
                                </g>
                              ))
                            ) : (
                              <>
                                <line
                                  x1={mcbLeftX}
                                  y1={cy}
                                  x2={mcbLeftX + 16}
                                  y2={cy}
                                  stroke="#000000"
                                  strokeWidth={2}
                                />
                                <line
                                  x1={mcbRightX - 16}
                                  y1={cy}
                                  x2={mcbRightX}
                                  y2={cy}
                                  stroke="#000000"
                                  strokeWidth={2}
                                />
                                <line
                                  x1={mcbRightX - 16}
                                  y1={cy}
                                  x2={mcbLeftX + 19}
                                  y2={cy - (isCompactRow ? 7 : 9)}
                                  stroke="#000000"
                                  strokeWidth={2.2}
                                />
                                <line
                                  x1={mcbLeftX + 13}
                                  y1={cy - 3.5}
                                  x2={mcbLeftX + 19}
                                  y2={cy + 3.5}
                                  stroke="#000000"
                                  strokeWidth={1.7}
                                />
                                <line
                                  x1={mcbLeftX + 13}
                                  y1={cy + 3.5}
                                  x2={mcbLeftX + 19}
                                  y2={cy - 3.5}
                                  stroke="#000000"
                                  strokeWidth={1.7}
                                />
                              </>
                            )}

                            {/* Upright Breaker Labels Above & Below MCB Box */}
                            <text
                              x={mcbMidX}
                              y={cy - mcbTopTextOff}
                              textAnchor="middle"
                              fill="#000000"
                              fontSize={isCompactRow ? 11.2 : 12.5}
                              fontWeight="bold"
                              fontFamily="JetBrains Mono, monospace"
                            >
                              {c.label} • {c.characteristic}
                              {c.ratedCurrent}A ({c.poles})
                            </text>
                            <text
                              x={mcbMidX}
                              y={cy + mcbBotTextOff}
                              textAnchor="middle"
                              fill="#0F172A"
                              fontSize={isCompactRow ? 9.8 : 11}
                              fontWeight="bold"
                              fontFamily="JetBrains Mono, monospace"
                            >
                              Fáza {c.phase === 'L1,L2,L3' ? '3F' : c.phase} • {c.breakingCapacity}
                            </text>

                            {/* 3. Horizontal Cable Section (x = 366..558) */}
                            {displayMode === 'single-line' ? (
                              <g>
                                <line
                                  x1={mcbRightX}
                                  y1={cy}
                                  x2={cableEndX}
                                  y2={cy}
                                  stroke="#000000"
                                  strokeWidth={2.3}
                                />
                                <line
                                  x1={mcbRightX + 14}
                                  y1={cy + 6}
                                  x2={mcbRightX + 24}
                                  y2={cy - 6}
                                  stroke="#000000"
                                  strokeWidth={1.8}
                                />
                                <text
                                  x={mcbRightX + 19}
                                  y={cy - 9}
                                  textAnchor="middle"
                                  fill="#000000"
                                  fontSize={10.5}
                                  fontWeight="bold"
                                  fontFamily="JetBrains Mono, monospace"
                                >
                                  {isThreePoleCircuit ? '5' : '3'}
                                </text>
                              </g>
                            ) : (
                              <g>
                                {isThreePoleCircuit ? (
                                  <>
                                    <line
                                      x1={mcbRightX}
                                      y1={cy - 5}
                                      x2={cableEndX}
                                      y2={cy - 5}
                                      stroke="#000000"
                                      strokeWidth={1.6}
                                    />
                                    <line
                                      x1={mcbRightX}
                                      y1={cy}
                                      x2={cableEndX}
                                      y2={cy}
                                      stroke="#000000"
                                      strokeWidth={1.6}
                                    />
                                    <line
                                      x1={mcbRightX}
                                      y1={cy + 5}
                                      x2={cableEndX}
                                      y2={cy + 5}
                                      stroke="#000000"
                                      strokeWidth={1.6}
                                    />
                                  </>
                                ) : (
                                  <line
                                    x1={mcbRightX}
                                    y1={cy}
                                    x2={cableEndX}
                                    y2={cy}
                                    stroke="#000000"
                                    strokeWidth={2}
                                  />
                                )}
                                {project.networkSystem !== 'TN-C' && (
                                  <>
                                    <line
                                      x1={nTapX}
                                      y1={cy + 9}
                                      x2={cableEndX}
                                      y2={cy + 9}
                                      stroke="#0369A1"
                                      strokeWidth={1.5}
                                    />
                                    <circle cx={nTapX} cy={cy + 9} r={2.6} fill="#0369A1" />
                                  </>
                                )}
                                <line
                                  x1={mainBusPEX}
                                  y1={cy + 14}
                                  x2={cableEndX}
                                  y2={cy + 14}
                                  stroke="#15803D"
                                  strokeWidth={1.5}
                                  strokeDasharray="4 2"
                                />
                                <circle cx={mainBusPEX} cy={cy + 14} r={2.6} fill="#15803D" />
                              </g>
                            )}

                            {/* Horizontal Cable Tag Pill (x = 398..546) */}
                            <rect
                              x={398}
                              y={cy - cableHalfH}
                              width={148}
                              height={cableHalfH * 2}
                              rx={4}
                              fill="#FFFFFF"
                              stroke="#64748B"
                              strokeWidth={1.3}
                            />
                            <text
                              x={472}
                              y={cy - (isCompactRow ? 2.5 : 4)}
                              textAnchor="middle"
                              fill="#000000"
                              fontSize={isCompactRow ? 10.5 : 11.5}
                              fontWeight="bold"
                              fontFamily="JetBrains Mono, monospace"
                            >
                              {c.cable}
                            </text>
                            <text
                              x={472}
                              y={cy + (isCompactRow ? 9.5 : 11)}
                              textAnchor="middle"
                              fill="#0369A1"
                              fontSize={isCompactRow ? 9.5 : 10.5}
                              fontWeight="bold"
                              fontFamily="JetBrains Mono, monospace"
                            >
                              Dĺžka: {c.cableLengthM || 15} m •{' '}
                              {c.phase === 'L1,L2,L3' ? '400 V' : '230 V'}
                            </text>

                            {/* 4. Horizontal Circuit / Appliance Terminal Box (x = 558..964) */}
                            <rect
                              x={cableEndX}
                              y={cy - loadHalfH}
                              width={loadEndX - cableEndX}
                              height={loadHalfH * 2}
                              rx={4}
                              fill={isCircuitSelected ? '#EFF6FF' : '#FFFFFF'}
                              stroke={isCircuitSelected ? '#0066FF' : '#000000'}
                              strokeWidth={isCircuitSelected ? 2.8 : 2}
                            />
                            <rect
                              x={cableEndX}
                              y={cy - loadHalfH}
                              width={54}
                              height={loadHalfH * 2}
                              rx={4}
                              fill="#F1F5F9"
                              stroke="#000000"
                              strokeWidth={1.4}
                            />
                            <text
                              x={cableEndX + 27}
                              y={cy - (isCompactRow ? 2.5 : 4)}
                              textAnchor="middle"
                              fill="#000000"
                              fontSize={isCompactRow ? 12 : 13}
                              fontWeight="bold"
                              fontFamily="JetBrains Mono, monospace"
                            >
                              {c.label}
                            </text>
                            <text
                              x={cableEndX + 27}
                              y={cy + (isCompactRow ? 11.5 : 14)}
                              textAnchor="middle"
                              fill="#0369A1"
                              fontSize={isCompactRow ? 10 : 11}
                              fontWeight="bold"
                              fontFamily="JetBrains Mono, monospace"
                            >
                              {c.phase === 'L1,L2,L3' ? '3F' : c.phase}
                            </text>

                            <text
                              x={cableEndX + 64}
                              y={cy - (isCompactRow ? 2.5 : 4)}
                              fill="#000000"
                              fontSize={isCompactRow ? 12.2 : 13.5}
                              fontWeight="bold"
                              fontFamily="Plus Jakarta Sans, sans-serif"
                            >
                              {c.name.length > 38 ? `${c.name.slice(0, 37)}…` : c.name}
                            </text>
                            <text
                              x={cableEndX + 64}
                              y={cy + (isCompactRow ? 11.5 : 14)}
                              fill="#1E293B"
                              fontSize={isCompactRow ? 10.5 : 11.5}
                              fontWeight="bold"
                              fontFamily="JetBrains Mono, monospace"
                            >
                              {c.category} • Istič {c.characteristic}
                              {c.ratedCurrent}A ({c.poles})
                            </text>
                            <text
                              x={loadEndX - 12}
                              y={cy + (isCompactRow ? 11.5 : 14)}
                              textAnchor="end"
                              fill="#0369A1"
                              fontSize={isCompactRow ? 10.5 : 11.5}
                              fontWeight="bold"
                              fontFamily="JetBrains Mono, monospace"
                            >
                              P = {c.powerKw.toFixed(2)} kW
                            </text>
                          </g>
                        );
                      };

                      // CASE A: RCD GROUP WITH CHILD CIRCUITS
                      if (item.kind === 'rcd-group' && item.rcd) {
                        const rcd = item.rcd;
                        const isRcdSelected =
                          selectedElement?.type === 'rcd' && selectedElement.id === rcd.id;
                        const firstCy =
                          item.topY + portraitGroupHeaderH + portraitCircuitRowH / 2;
                        const lastCy =
                          item.topY +
                          portraitGroupHeaderH +
                          (item.circuits.length - 1) * portraitCircuitRowH +
                          portraitCircuitRowH / 2;

                        const rcdLeftX = 136;
                        const rcdRightX = 206;
                        const rcdMidX = 171;
                        const subBusX1L = 240;
                        const subBusL1X = 232;
                        const subBusL2X = 242;
                        const subBusL3X = 252;
                        const subBusNX = 262;

                        return (
                          <g key={`p-spine-rcd-${rcd.id}-${itemIdx}`}>
                            {/* Group Header Bar across width */}
                            <rect
                              x={132}
                              y={item.topY}
                              width={832}
                              height={22}
                              rx={3}
                              fill="#F8FAFC"
                              stroke="#CBD5E1"
                              strokeWidth={1.1}
                            />
                            <text
                              x={142}
                              y={item.topY + 15}
                              fill="#0F172A"
                              fontSize={11.5}
                              fontWeight="bold"
                              fontFamily="JetBrains Mono, monospace"
                            >
                              SKUPINA {rcd.label} — {rcd.deviceKind} {rcd.poles} •{' '}
                              {rcd.ratedCurrent}A / {rcd.sensitivity}mA (Typ {rcd.type}) •{' '}
                              {rcd.manufacturer}
                            </text>
                            <text
                              x={954}
                              y={item.topY + 15}
                              textAnchor="end"
                              fill="#0369A1"
                              fontSize={11}
                              fontWeight="bold"
                              fontFamily="JetBrains Mono, monospace"
                            >
                              Nulová svorkovnica N({rcd.label})
                            </text>

                            {/* Horizontal Tap from Vertical Main Busbar into RCD Symbol */}
                            <g
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedElement({ type: 'rcd', id: rcd.id });
                              }}
                              className="cursor-pointer"
                            >
                              {displayMode === 'single-line' ? (
                                <>
                                  <line
                                    x1={mainBus1LX}
                                    y1={firstCy}
                                    x2={rcdLeftX}
                                    y2={firstCy}
                                    stroke="#000000"
                                    strokeWidth={2.6}
                                  />
                                  <circle cx={mainBus1LX} cy={firstCy} r={4} fill="#000000" />
                                  <line
                                    x1={rcdRightX}
                                    y1={firstCy}
                                    x2={subBusX1L}
                                    y2={firstCy}
                                    stroke="#000000"
                                    strokeWidth={2.6}
                                  />
                                  <circle cx={subBusX1L} cy={firstCy} r={3.6} fill="#000000" />
                                </>
                              ) : (
                                <>
                                  <line
                                    x1={mainBusL1X}
                                    y1={firstCy - 5}
                                    x2={rcdLeftX}
                                    y2={firstCy - 5}
                                    stroke="#000000"
                                    strokeWidth={1.8}
                                  />
                                  <circle cx={mainBusL1X} cy={firstCy - 5} r={3} fill="#000000" />
                                  <line
                                    x1={rcdRightX}
                                    y1={firstCy - 5}
                                    x2={subBusL1X}
                                    y2={firstCy - 5}
                                    stroke="#000000"
                                    strokeWidth={1.8}
                                  />
                                  {rcd.poles === '4P' && isThreePhase && (
                                    <>
                                      <line
                                        x1={mainBusL2X}
                                        y1={firstCy}
                                        x2={rcdLeftX}
                                        y2={firstCy}
                                        stroke="#000000"
                                        strokeWidth={1.8}
                                      />
                                      <circle cx={mainBusL2X} cy={firstCy} r={3} fill="#000000" />
                                      <line
                                        x1={rcdRightX}
                                        y1={firstCy}
                                        x2={subBusL2X}
                                        y2={firstCy}
                                        stroke="#000000"
                                        strokeWidth={1.8}
                                      />
                                      <line
                                        x1={mainBusL3X}
                                        y1={firstCy + 5}
                                        x2={rcdLeftX}
                                        y2={firstCy + 5}
                                        stroke="#000000"
                                        strokeWidth={1.8}
                                      />
                                      <circle
                                        cx={mainBusL3X}
                                        cy={firstCy + 5}
                                        r={3}
                                        fill="#000000"
                                      />
                                      <line
                                        x1={rcdRightX}
                                        y1={firstCy + 5}
                                        x2={subBusL3X}
                                        y2={firstCy + 5}
                                        stroke="#000000"
                                        strokeWidth={1.8}
                                      />
                                    </>
                                  )}
                                  {project.networkSystem !== 'TN-C' && (
                                    <>
                                      <line
                                        x1={mainBusNX}
                                        y1={firstCy + 10}
                                        x2={subBusNX}
                                        y2={firstCy + 10}
                                        stroke="#0369A1"
                                        strokeWidth={1.8}
                                      />
                                      <circle cx={mainBusNX} cy={firstCy + 10} r={3} fill="#0369A1" />
                                    </>
                                  )}
                                </>
                              )}

                              {/* Horizontal RCD Box (70 × 38 at x = 136..206) */}
                              <rect
                                x={rcdLeftX}
                                y={firstCy - 19}
                                width={70}
                                height={38}
                                rx={4}
                                fill={isRcdSelected ? '#EFF6FF' : '#FFFFFF'}
                                stroke={isRcdSelected ? '#0066FF' : '#000000'}
                                strokeWidth={isRcdSelected ? 3 : 2.1}
                              />
                              <ellipse
                                cx={rcdLeftX + 44}
                                cy={firstCy}
                                rx={5.5}
                                ry={11}
                                fill="none"
                                stroke="#000000"
                                strokeWidth={1.7}
                              />
                              <line
                                x1={rcdLeftX}
                                y1={firstCy}
                                x2={rcdLeftX + 16}
                                y2={firstCy}
                                stroke="#000000"
                                strokeWidth={1.9}
                              />
                              <line
                                x1={rcdLeftX + 50}
                                y1={firstCy}
                                x2={rcdRightX}
                                y2={firstCy}
                                stroke="#000000"
                                strokeWidth={1.9}
                              />
                              <line
                                x1={rcdLeftX + 50}
                                y1={firstCy}
                                x2={rcdLeftX + 19}
                                y2={firstCy - 8}
                                stroke="#000000"
                                strokeWidth={2.1}
                              />
                              <rect
                                x={rcdLeftX + 6}
                                y={firstCy - 15}
                                width={12}
                                height={9}
                                rx={1.5}
                                fill="#F8FAFC"
                                stroke="#000000"
                                strokeWidth={1.1}
                              />
                              <text
                                x={rcdLeftX + 12}
                                y={firstCy - 8}
                                textAnchor="middle"
                                fill="#000000"
                                fontSize={7.5}
                                fontWeight="bold"
                                fontFamily="JetBrains Mono, monospace"
                              >
                                T
                              </text>

                              {/* Upright RCD Labels */}
                              <text
                                x={rcdMidX}
                                y={firstCy - 23}
                                textAnchor="middle"
                                fill="#000000"
                                fontSize={12}
                                fontWeight="bold"
                                fontFamily="JetBrains Mono, monospace"
                              >
                                {rcd.label} ({rcd.poles})
                              </text>
                              <text
                                x={rcdMidX}
                                y={firstCy + 31}
                                textAnchor="middle"
                                fill="#0F172A"
                                fontSize={10.5}
                                fontWeight="bold"
                                fontFamily="JetBrains Mono, monospace"
                              >
                                {rcd.ratedCurrent}A/{rcd.sensitivity}mA Typ {rcd.type}
                              </text>
                            </g>

                            {/* Vertical RCD Sub-Busbar connecting all circuits in this group */}
                            {displayMode === 'single-line' ? (
                              <>
                                <line
                                  x1={subBusX1L}
                                  y1={firstCy}
                                  x2={subBusX1L}
                                  y2={lastCy}
                                  stroke="#000000"
                                  strokeWidth={3}
                                />
                                <line
                                  x1={subBusX1L + 12}
                                  y1={firstCy}
                                  x2={subBusX1L + 12}
                                  y2={lastCy}
                                  stroke="#0369A1"
                                  strokeWidth={2}
                                  strokeDasharray="4 2"
                                />
                                <text
                                  x={subBusX1L + 6}
                                  y={firstCy - 10}
                                  textAnchor="middle"
                                  fill="#0369A1"
                                  fontSize={10}
                                  fontWeight="bold"
                                  fontFamily="JetBrains Mono, monospace"
                                >
                                  N({rcd.label})
                                </text>
                              </>
                            ) : (
                              <>
                                <line
                                  x1={subBusL1X}
                                  y1={firstCy - 5}
                                  x2={subBusL1X}
                                  y2={lastCy + 5}
                                  stroke="#000000"
                                  strokeWidth={2.2}
                                />
                                {rcd.poles === '4P' && isThreePhase && (
                                  <>
                                    <line
                                      x1={subBusL2X}
                                      y1={firstCy}
                                      x2={subBusL2X}
                                      y2={lastCy + 5}
                                      stroke="#000000"
                                      strokeWidth={2}
                                    />
                                    <line
                                      x1={subBusL3X}
                                      y1={firstCy + 5}
                                      x2={subBusL3X}
                                      y2={lastCy + 5}
                                      stroke="#000000"
                                      strokeWidth={2}
                                    />
                                  </>
                                )}
                                <line
                                  x1={subBusNX}
                                  y1={firstCy + 10}
                                  x2={subBusNX}
                                  y2={lastCy + 10}
                                  stroke="#0369A1"
                                  strokeWidth={2}
                                />
                              </>
                            )}

                            {/* Render each horizontal circuit row in this RCD group */}
                            {item.circuits.map((c, cIdx) => {
                              const cy =
                                item.topY +
                                portraitGroupHeaderH +
                                cIdx * portraitCircuitRowH +
                                portraitCircuitRowH / 2;
                              return renderHorizontalCircuitRow(
                                c,
                                cy,
                                true,
                                subBusX1L,
                                subBusL1X,
                                subBusL2X,
                                subBusL3X,
                                subBusNX
                              );
                            })}
                          </g>
                        );
                      }

                      // CASE B: RESERVE RCD WITHOUT CIRCUITS (e.g. FI2 in TEST 1)
                      if (item.kind === 'rcd-empty' && item.rcd) {
                        const rcd = item.rcd;
                        const cy = item.topY + item.height / 2;
                        const isRcdSelected =
                          selectedElement?.type === 'rcd' && selectedElement.id === rcd.id;
                        const rcdLeftX = 136;
                        const rcdRightX = 206;

                        return (
                          <g
                            key={`p-spine-empty-rcd-${rcd.id}-${itemIdx}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedElement({ type: 'rcd', id: rcd.id });
                            }}
                            className="cursor-pointer"
                          >
                            <line
                              x1={displayMode === 'single-line' ? mainBus1LX : mainBusL1X}
                              y1={cy}
                              x2={rcdLeftX}
                              y2={cy}
                              stroke="#000000"
                              strokeWidth={2.4}
                            />
                            <circle
                              cx={displayMode === 'single-line' ? mainBus1LX : mainBusL1X}
                              cy={cy}
                              r={3.8}
                              fill="#000000"
                            />
                            <rect
                              x={rcdLeftX}
                              y={cy - 19}
                              width={70}
                              height={38}
                              rx={4}
                              fill={isRcdSelected ? '#EFF6FF' : '#FFFFFF'}
                              stroke={isRcdSelected ? '#0066FF' : '#000000'}
                              strokeWidth={isRcdSelected ? 3 : 2.1}
                            />
                            <ellipse
                              cx={rcdLeftX + 44}
                              cy={cy}
                              rx={5.5}
                              ry={11}
                              fill="none"
                              stroke="#000000"
                              strokeWidth={1.7}
                            />
                            <line
                              x1={rcdLeftX}
                              y1={cy}
                              x2={rcdLeftX + 16}
                              y2={cy}
                              stroke="#000000"
                              strokeWidth={1.9}
                            />
                            <line
                              x1={rcdLeftX + 50}
                              y1={cy}
                              x2={rcdRightX}
                              y2={cy}
                              stroke="#000000"
                              strokeWidth={1.9}
                            />
                            <line
                              x1={rcdLeftX + 50}
                              y1={cy}
                              x2={rcdLeftX + 19}
                              y2={cy - 8}
                              stroke="#000000"
                              strokeWidth={2.1}
                            />
                            <text
                              x={171}
                              y={cy - 23}
                              textAnchor="middle"
                              fill="#000000"
                              fontSize={12}
                              fontWeight="bold"
                              fontFamily="JetBrains Mono, monospace"
                            >
                              {rcd.label} ({rcd.poles})
                            </text>
                            <line
                              x1={rcdRightX}
                              y1={cy}
                              x2={298}
                              y2={cy}
                              stroke="#475569"
                              strokeWidth={2}
                              strokeDasharray="5 3"
                            />
                            <rect
                              x={298}
                              y={cy - 20}
                              width={666}
                              height={40}
                              rx={4}
                              fill="#F8FAFC"
                              stroke="#64748B"
                              strokeWidth={1.6}
                              strokeDasharray="6 3"
                            />
                            <text
                              x={314}
                              y={cy + 5}
                              fill="#334155"
                              fontSize={12.5}
                              fontWeight="bold"
                              fontFamily="JetBrains Mono, monospace"
                            >
                              {rcd.label} — {rcd.deviceKind} {rcd.poles} {rcd.ratedCurrent}A /{' '}
                              {rcd.sensitivity}mA (Typ {rcd.type}) • Rezerva FI (neobsadený vývod)
                            </text>
                          </g>
                        );
                      }

                      // CASE C: STANDALONE RCBO (e.g. FI3 in TEST 3)
                      if (item.kind === 'rcbo-standalone' && item.rcd) {
                        const rcbo = item.rcd;
                        const cy = item.topY + item.height / 2;
                        const isRcboSelected =
                          selectedElement?.type === 'rcd' && selectedElement.id === rcbo.id;
                        const rcboName = rcbo.circuitName || `Samostatný okruh ${rcbo.label}`;
                        const rcboCable =
                          rcbo.cableType ||
                          (rcbo.poles === '4P' ? 'CYKY-J 5x2,5 mm²' : 'CYKY-J 3x2,5 mm²');
                        const rcboPower = rcbo.powerKw ?? 2.2;
                        const rcboPhase =
                          rcbo.phase || (rcbo.poles === '4P' ? 'L1,L2,L3' : 'L1');
                        const mcbLeftX = 298;
                        const mcbRightX = 366;
                        const cableEndX = 558;
                        const loadEndX = 964;

                        return (
                          <g
                            key={`p-spine-rcbo-${rcbo.id}-${itemIdx}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedElement({ type: 'rcd', id: rcbo.id });
                            }}
                            className="cursor-pointer"
                          >
                            <line
                              x1={displayMode === 'single-line' ? mainBus1LX : mainBusL1X}
                              y1={cy}
                              x2={mcbLeftX}
                              y2={cy}
                              stroke="#000000"
                              strokeWidth={2.4}
                            />
                            <circle
                              cx={displayMode === 'single-line' ? mainBus1LX : mainBusL1X}
                              cy={cy}
                              r={3.8}
                              fill="#000000"
                            />
                            <rect
                              x={mcbLeftX}
                              y={cy - 18}
                              width={68}
                              height={36}
                              rx={4}
                              fill={isRcboSelected ? '#EFF6FF' : '#FFFFFF'}
                              stroke={isRcboSelected ? '#0066FF' : '#000000'}
                              strokeWidth={isRcboSelected ? 3 : 2.1}
                            />
                            <ellipse
                              cx={mcbLeftX + 44}
                              cy={cy}
                              rx={5}
                              ry={10}
                              fill="none"
                              stroke="#000000"
                              strokeWidth={1.6}
                            />
                            <line
                              x1={mcbLeftX}
                              y1={cy}
                              x2={mcbLeftX + 16}
                              y2={cy}
                              stroke="#000000"
                              strokeWidth={1.9}
                            />
                            <line
                              x1={mcbLeftX + 49}
                              y1={cy}
                              x2={mcbRightX}
                              y2={cy}
                              stroke="#000000"
                              strokeWidth={1.9}
                            />
                            <line
                              x1={mcbLeftX + 49}
                              y1={cy}
                              x2={mcbLeftX + 18}
                              y2={cy - 8}
                              stroke="#000000"
                              strokeWidth={2.1}
                            />
                            <text
                              x={332}
                              y={cy - 22}
                              textAnchor="middle"
                              fill="#000000"
                              fontSize={12.5}
                              fontWeight="bold"
                              fontFamily="JetBrains Mono, monospace"
                            >
                              {rcbo.label} • RCBO {rcbo.characteristic || 'B'}
                              {rcbo.ratedCurrent}A
                            </text>
                            <text
                              x={332}
                              y={cy + 30}
                              textAnchor="middle"
                              fill="#0F172A"
                              fontSize={10.5}
                              fontWeight="bold"
                              fontFamily="JetBrains Mono, monospace"
                            >
                              {rcbo.sensitivity}mA Typ {rcbo.type} ({rcbo.poles})
                            </text>

                            <line
                              x1={mcbRightX}
                              y1={cy}
                              x2={cableEndX}
                              y2={cy}
                              stroke="#000000"
                              strokeWidth={2.3}
                            />
                            <rect
                              x={398}
                              y={cy - 19}
                              width={148}
                              height={36}
                              rx={4}
                              fill="#FFFFFF"
                              stroke="#64748B"
                              strokeWidth={1.3}
                            />
                            <text
                              x={472}
                              y={cy - 4}
                              textAnchor="middle"
                              fill="#000000"
                              fontSize={11.5}
                              fontWeight="bold"
                              fontFamily="JetBrains Mono, monospace"
                            >
                              {rcboCable}
                            </text>
                            <text
                              x={472}
                              y={cy + 11}
                              textAnchor="middle"
                              fill="#0369A1"
                              fontSize={10.5}
                              fontWeight="bold"
                              fontFamily="JetBrains Mono, monospace"
                            >
                              Dĺžka: {rcbo.cableLengthM || 15} m • Fáza {rcboPhase}
                            </text>

                            <rect
                              x={cableEndX}
                              y={cy - 23}
                              width={loadEndX - cableEndX}
                              height={46}
                              rx={4}
                              fill={isRcboSelected ? '#EFF6FF' : '#FFFFFF'}
                              stroke={isRcboSelected ? '#0066FF' : '#000000'}
                              strokeWidth={2}
                            />
                            <rect
                              x={cableEndX}
                              y={cy - 23}
                              width={54}
                              height={46}
                              rx={4}
                              fill="#F1F5F9"
                              stroke="#000000"
                              strokeWidth={1.4}
                            />
                            <text
                              x={cableEndX + 27}
                              y={cy - 4}
                              textAnchor="middle"
                              fill="#000000"
                              fontSize={13}
                              fontWeight="bold"
                              fontFamily="JetBrains Mono, monospace"
                            >
                              {rcbo.label}
                            </text>
                            <text
                              x={cableEndX + 27}
                              y={cy + 14}
                              textAnchor="middle"
                              fill="#0369A1"
                              fontSize={11}
                              fontWeight="bold"
                              fontFamily="JetBrains Mono, monospace"
                            >
                              RCBO
                            </text>
                            <text
                              x={cableEndX + 64}
                              y={cy - 4}
                              fill="#000000"
                              fontSize={13.5}
                              fontWeight="bold"
                              fontFamily="Plus Jakarta Sans, sans-serif"
                            >
                              {rcboName.length > 36 ? `${rcboName.slice(0, 35)}…` : rcboName}
                            </text>
                            <text
                              x={cableEndX + 64}
                              y={cy + 14}
                              fill="#1E293B"
                              fontSize={11.5}
                              fontWeight="bold"
                              fontFamily="JetBrains Mono, monospace"
                            >
                              Ističochránič {rcbo.characteristic || 'B'}
                              {rcbo.ratedCurrent}A/{rcbo.sensitivity}mA ({rcbo.poles})
                            </text>
                            <text
                              x={loadEndX - 12}
                              y={cy + 14}
                              textAnchor="end"
                              fill="#0369A1"
                              fontSize={11.5}
                              fontWeight="bold"
                              fontFamily="JetBrains Mono, monospace"
                            >
                              P = {rcboPower.toFixed(2)} kW
                            </text>
                          </g>
                        );
                      }

                      // CASE D: DIRECT CIRCUITS WITHOUT RCD
                      return (
                        <g key={`p-spine-direct-${itemIdx}`}>
                          <rect
                            x={132}
                            y={item.topY}
                            width={832}
                            height={22}
                            rx={3}
                            fill="#F8FAFC"
                            stroke="#CBD5E1"
                            strokeWidth={1.1}
                          />
                          <text
                            x={142}
                            y={item.topY + 15}
                            fill="#0F172A"
                            fontSize={11.5}
                            fontWeight="bold"
                            fontFamily="JetBrains Mono, monospace"
                          >
                            PRIAME VÝVODY BEZ PRÚDOVÉHO CHRÁNIČA (NAPOJENÉ PRIAMO NA HL. ZBERNICU)
                          </text>
                          {item.circuits.map((c, cIdx) => {
                            const cy =
                              item.topY +
                              portraitGroupHeaderH +
                              cIdx * portraitCircuitRowH +
                              portraitCircuitRowH / 2;
                            return renderHorizontalCircuitRow(
                              c,
                              cy,
                              false,
                              mainBus1LX,
                              mainBusL1X,
                              mainBusL2X,
                              mainBusL3X,
                              mainBusNX
                            );
                          })}
                        </g>
                      );
                    })}
                    </g>

                    {/* Bottom Full-Width STN Title Block in Portrait Mode */}
                    <g transform={`translate(28, ${canvasHeight - 98})`}>
                      <rect
                        x={0}
                        y={0}
                        width={944}
                        height={74}
                        fill="#FFFFFF"
                        stroke="#000000"
                        strokeWidth={2}
                      />
                      <line x1={0} y1={25} x2={944} y2={25} stroke="#000000" strokeWidth={1.3} />
                      <line x1={0} y1={49} x2={944} y2={49} stroke="#000000" strokeWidth={1.3} />
                      <line x1={610} y1={0} x2={610} y2={74} stroke="#000000" strokeWidth={1.3} />

                      <text
                        x={12}
                        y={17}
                        fill="#000000"
                        fontSize={12.5}
                        fontWeight="bold"
                        fontFamily="Inter, Plus Jakarta Sans, sans-serif"
                      >
                        NÁZOV:{' '}
                        {project.name.length > 52 ? `${project.name.slice(0, 52)}…` : project.name}
                      </text>
                      <text
                        x={624}
                        y={17}
                        fill="#000000"
                        fontSize={12.5}
                        fontWeight="bold"
                        fontFamily="JetBrains Mono, monospace"
                      >
                        SÚSTAVA: {project.networkSystem} ({project.voltage})
                      </text>

                      <text
                        x={12}
                        y={42}
                        fill="#0F172A"
                        fontSize={12}
                        fontWeight="bold"
                        fontFamily="Inter, Plus Jakarta Sans, sans-serif"
                      >
                        Vypracoval:{' '}
                        {(project.designerName || 'Projekčná kancelária').length > 48
                          ? `${(project.designerName || 'Projekčná kancelária').slice(0, 48)}…`
                          : project.designerName || 'Projekčná kancelária'}
                      </text>
                      <text
                        x={624}
                        y={42}
                        fill="#0F172A"
                        fontSize={12}
                        fontWeight="bold"
                        fontFamily="JetBrains Mono, monospace"
                      >
                        Dátum: {project.projectDate}
                      </text>

                      <text
                        x={12}
                        y={66}
                        fill="#1E293B"
                        fontSize={11.5}
                        fontWeight="bold"
                        fontFamily="JetBrains Mono, monospace"
                      >
                        Norma: STN EN 61439-3 / STN 33 2000-4-41 • A4 na výšku (zhora dole)
                      </text>
                      <text
                        x={624}
                        y={66}
                        fill="#000000"
                        fontSize={12.5}
                        fontWeight="bold"
                        fontFamily="JetBrains Mono, monospace"
                      >
                        Č. zákazky: {project.projectNumber}
                      </text>
                    </g>
                  </>
                );
              })()
            ) : (
              /* ================================================================= */
              /* LANDSCAPE MODE (NA ŠÍRKU) — VETVY AJ TEXT ZHORA DOLE (ROTATE 90)  */
              /* ================================================================= */
              <>
                {/* Top Header Banner inside Schema */}
                <g transform="translate(28, 28)">
                  <text
                    x={0}
                    y={18}
                    fill="#000000"
                    fontSize={18}
                    fontWeight="bold"
                    fontFamily="Plus Jakarta Sans, sans-serif"
                  >
                    {project.name.toUpperCase()} —{' '}
                    {displayMode === 'single-line'
                      ? 'JEDNOPÓLOVÁ SCHÉMA ZAPOJENIA (1L)'
                      : displayMode === 'multi-line'
                      ? 'TROJPÓLOVÁ / VIACPÓLOVÁ SCHÉMA ZAPOJENIA (3L)'
                      : 'DETAILNÁ SCHÉMA ZAPOJENIA VODIČOV (L1, L2, L3, N, PE / PEN)'}
                  </text>
                  <text
                    x={0}
                    y={39}
                    fill="#0F172A"
                    fontSize={13}
                    fontWeight="bold"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    Sústava: {project.networkSystem} | {project.supplySystem.toUpperCase()} (
                    {project.voltage}) | Pred elektromerom ({upstreamBreaker.designation}):{' '}
                    {upstreamBreaker.enabled
                      ? `${upstreamBreaker.poles} ${upstreamBreaker.characteristic}${upstreamBreaker.ratedCurrent}A (${upstreamBreaker.placement})`
                      : 'Vypnuté'}{' '}
                    | V rozvádzači ({internalDevice.designation}):{' '}
                    {internalDevice.enabled
                      ? `${internalDevice.deviceType} ${internalDevice.poles} ${
                          isInternalBreaker ? `${internalDevice.characteristic || 'B'}` : ''
                        }${internalDevice.ratedCurrent}A`
                      : 'Bez hl. prvku'}
                  </text>
                </g>

                {/* 1. COMPLETE VERTICAL INCOMING CHAIN */}
                <g transform="translate(122, 74)">
                  <line x1={0} y1={0} x2={0} y2={22} stroke="#000000" strokeWidth={2.6} />
                  <line x1={-6} y1={7} x2={6} y2={14} stroke="#000000" strokeWidth={1.8} />
                  <text
                    x={16}
                    y={12}
                    fill="#000000"
                    fontSize={12}
                    fontFamily="JetBrains Mono, monospace"
                    fontWeight="bold"
                  >
                    PRÍVOD ELEKTRICKEJ ENERGIE ({project.networkSystem} • {project.voltage})
                  </text>

                  {/* QF0 */}
                  <g
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedElement({ type: 'main' });
                    }}
                    className="cursor-pointer"
                  >
                    <rect
                      x={-34}
                      y={22}
                      width={68}
                      height={46}
                      rx={4}
                      fill={selectedElement?.type === 'main' ? '#EFF6FF' : '#FFFFFF'}
                      stroke={selectedElement?.type === 'main' ? '#0066FF' : '#000000'}
                      strokeWidth={selectedElement?.type === 'main' ? 3 : 2.2}
                      strokeDasharray="4 2"
                    />
                    {upstreamBreaker.enabled ? (
                      <>
                        <line x1={0} y1={22} x2={0} y2={33} stroke="#000000" strokeWidth={2.1} />
                        <line x1={0} y1={57} x2={0} y2={68} stroke="#000000" strokeWidth={2.1} />
                        <line x1={0} y1={57} x2={-11} y2={36} stroke="#000000" strokeWidth={2.4} />
                        <line x1={-4.5} y1={31} x2={4.5} y2={37} stroke="#000000" strokeWidth={1.8} />
                        <line x1={-4.5} y1={37} x2={4.5} y2={31} stroke="#000000" strokeWidth={1.8} />
                        <text
                          x={42}
                          y={38}
                          fill="#000000"
                          fontSize={13}
                          fontWeight="bold"
                          fontFamily="JetBrains Mono, monospace"
                        >
                          {upstreamBreaker.designation} – HLAVNÝ ISTIČ ({upstreamBreaker.placement.toUpperCase()})
                        </text>
                        <text
                          x={42}
                          y={56}
                          fill="#0F172A"
                          fontSize={12}
                          fontFamily="JetBrains Mono, monospace"
                          fontWeight="bold"
                        >
                          {upstreamBreaker.poles} {upstreamBreaker.characteristic}
                          {upstreamBreaker.ratedCurrent}A / {upstreamBreaker.breakingCapacity} ({upstreamBreaker.manufacturer} {upstreamBreaker.model})
                        </text>
                      </>
                    ) : (
                      <>
                        <line x1={0} y1={22} x2={0} y2={68} stroke="#475569" strokeWidth={2} strokeDasharray="3 3" />
                        <text
                          x={42}
                          y={48}
                          fill="#334155"
                          fontSize={12}
                          fontWeight="bold"
                          fontFamily="JetBrains Mono, monospace"
                        >
                          {upstreamBreaker.designation} – Hlavný istič pred elektromerom (vypnutý)
                        </text>
                      </>
                    )}
                  </g>

                  {/* ELEKTROMER kWh */}
                  <line x1={0} y1={68} x2={0} y2={82} stroke="#000000" strokeWidth={2.3} />
                  {electricityMeter.enabled ? (
                    <g>
                      <rect
                        x={-26}
                        y={82}
                        width={52}
                        height={36}
                        rx={4}
                        fill="#FFFFFF"
                        stroke="#000000"
                        strokeWidth={1.9}
                        strokeDasharray="3 2"
                      />
                      <circle cx={0} cy={100} r={12} fill="#F8FAFC" stroke="#000000" strokeWidth={1.5} />
                      <text
                        x={0}
                        y={104}
                        textAnchor="middle"
                        fill="#000000"
                        fontSize={10}
                        fontWeight="bold"
                        fontFamily="JetBrains Mono, monospace"
                      >
                        kWh
                      </text>
                      <text
                        x={38}
                        y={96}
                        fill="#000000"
                        fontSize={12.5}
                        fontWeight="bold"
                        fontFamily="JetBrains Mono, monospace"
                      >
                        ELEKTROMER ({electricityMeter.type})
                      </text>
                      <text
                        x={38}
                        y={112}
                        fill="#1E293B"
                        fontSize={11.5}
                        fontWeight="bold"
                        fontFamily="JetBrains Mono, monospace"
                      >
                        {electricityMeter.location} • {electricityMeter.tariff}
                      </text>
                    </g>
                  ) : (
                    <line x1={0} y1={82} x2={0} y2={118} stroke="#000000" strokeWidth={2.3} />
                  )}

                  {/* PRÍVOD DO BYTOVÉHO ROZVÁDZAČA */}
                  <line x1={0} y1={118} x2={0} y2={140} stroke="#000000" strokeWidth={2.6} />
                  <line x1={-6} y1={126} x2={6} y2={131} stroke="#000000" strokeWidth={1.6} />
                  <text
                    x={16}
                    y={132}
                    fill="#000000"
                    fontSize={12}
                    fontWeight="bold"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    PRÍVOD DO BYTOVÉHO ROZVÁDZAČA ({project.supplyCable})
                  </text>

                  {/* QS1 / QF1 */}
                  <g
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedElement({ type: 'internal-main' });
                    }}
                    className="cursor-pointer"
                  >
                    <rect
                      x={-34}
                      y={140}
                      width={68}
                      height={50}
                      rx={4}
                      fill={selectedElement?.type === 'internal-main' ? '#EFF6FF' : '#FFFFFF'}
                      stroke={selectedElement?.type === 'internal-main' ? '#0066FF' : '#000000'}
                      strokeWidth={selectedElement?.type === 'internal-main' ? 3 : 2.2}
                    />
                    {internalDevice.enabled ? (
                      <>
                        <line x1={0} y1={140} x2={0} y2={152} stroke="#000000" strokeWidth={2.1} />
                        <line x1={0} y1={178} x2={0} y2={190} stroke="#000000" strokeWidth={2.1} />
                        <line x1={0} y1={178} x2={-11} y2={155} stroke="#000000" strokeWidth={2.4} />
                        {isInternalBreaker ? (
                          <>
                            <line x1={-4.5} y1={150} x2={4.5} y2={156} stroke="#000000" strokeWidth={1.8} />
                            <line x1={-4.5} y1={156} x2={4.5} y2={150} stroke="#000000" strokeWidth={1.8} />
                          </>
                        ) : (
                          <>
                            <line x1={-5.5} y1={152} x2={5.5} y2={152} stroke="#000000" strokeWidth={2.2} />
                            <circle cx={0} cy={178} r={2.5} fill="#000000" />
                          </>
                        )}
                        <text
                          x={42}
                          y={156}
                          fill="#000000"
                          fontSize={13}
                          fontWeight="bold"
                          fontFamily="JetBrains Mono, monospace"
                        >
                          {internalDevice.designation} – {internalDevice.deviceType.toUpperCase()} V ROZVÁDZAČI
                        </text>
                        <text
                          x={42}
                          y={173}
                          fill="#0F172A"
                          fontSize={12}
                          fontWeight="bold"
                          fontFamily="JetBrains Mono, monospace"
                        >
                          {internalDevice.poles}{' '}
                          {isInternalBreaker
                            ? `char. ${internalDevice.characteristic || 'B'} ${internalDevice.ratedCurrent}A (${
                                internalDevice.breakingCapacity || '10 kA'
                              })`
                            : `In = ${internalDevice.ratedCurrent}A (bez nadprúdovej ochrany)`}{' '}
                          • {internalDevice.manufacturer} {internalDevice.model}
                        </text>
                        <text
                          x={42}
                          y={188}
                          fill="#334155"
                          fontSize={11}
                          fontWeight="bold"
                          fontFamily="Plus Jakarta Sans, sans-serif"
                        >
                          {internalDevice.modules} mod. • Poloha:{' '}
                          {internalDevice.topologyPosition === 'ZA_SPD_PRED_RCD'
                            ? 'Za SPD, pred chráničmi FI'
                            : 'Hneď na vstupe rozvádzača (pred SPD a FI)'}
                        </text>
                      </>
                    ) : (
                      <>
                        <line x1={0} y1={140} x2={0} y2={190} stroke="#000000" strokeWidth={2.3} />
                        <text
                          x={42}
                          y={168}
                          fill="#334155"
                          fontSize={11.5}
                          fontWeight="bold"
                          fontFamily="JetBrains Mono, monospace"
                        >
                          Priame napojenie zberníc (bez hl. prvku v rozvádzači)
                        </text>
                      </>
                    )}
                  </g>

                  <line x1={0} y1={190} x2={0} y2={busY_L1 - 74} stroke="#000000" strokeWidth={2.8} />
                  <circle cx={0} cy={busY_L1 - 74} r={4.5} fill="#000000" />
                </g>

                {/* PEN Split Point visualization */}
                {(project.networkSystem === 'TN-C-S' || displayMode === 'wiring-diagram') && (
                  <g transform="translate(22, 224)">
                    <rect
                      x={0}
                      y={0}
                      width={86}
                      height={50}
                      rx={4}
                      fill="#F0FDF4"
                      stroke="#15803D"
                      strokeWidth={1.8}
                    />
                    <text x={43} y={17} textAnchor="middle" fill="#15803D" fontSize={10} fontWeight="bold" fontFamily="JetBrains Mono, monospace">
                      {project.networkSystem === 'TN-C-S' ? 'ROZDELENIE' : 'UZOL PE/N'}
                    </text>
                    <text x={43} y={32} textAnchor="middle" fill="#000000" fontSize={10} fontWeight="bold" fontFamily="JetBrains Mono, monospace">
                      {project.networkSystem === 'TN-C-S' ? 'PEN → PE+N' : project.networkSystem}
                    </text>
                    <text x={43} y={45} textAnchor="middle" fill="#0369A1" fontSize={9.5} fontWeight="bold" fontFamily="JetBrains Mono, monospace">
                      HOP ≤ 10 Ω
                    </text>
                  </g>
                )}

                {/* 2. SURGE PROTECTOR (SPD - FV1) */}
                {mainBreaker.hasSurgeProtector && (
                  <g
                    transform="translate(725, 165)"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedElement({ type: 'spd' });
                    }}
                    className="cursor-pointer"
                  >
                    <line x1={0} y1={busY_L1 - 165} x2={0} y2={48} stroke="#000000" strokeWidth={2} />
                    <circle cx={0} cy={busY_L1 - 165} r={4} fill="#000000" />
                    <rect x={-26} y={10} width={52} height={38} rx={3} fill="#FFFFFF" stroke="#000000" strokeWidth={1.8} />
                    <polygon points="-5,22 5,22 0,34" fill="#000000" />
                    <line x1={-7} y1={34} x2={7} y2={34} stroke="#000000" strokeWidth={1.8} />
                    <text x={34} y={24} fill="#000000" fontSize={12.5} fontWeight="bold" fontFamily="JetBrains Mono, monospace">
                      FV1 – PREPÄŤOVÁ OCHRANA ({mainBreaker.surgeProtectorType})
                    </text>
                    <text x={34} y={40} fill="#1E293B" fontSize={11.5} fontWeight="bold" fontFamily="JetBrains Mono, monospace">
                      {mainBreaker.manufacturer} SPD
                    </text>
                    <line x1={0} y1={10} x2={0} y2={-4} stroke="#15803D" strokeWidth={1.8} />
                    <line x1={-8} y1={-4} x2={8} y2={-4} stroke="#15803D" strokeWidth={1.8} />
                    <line x1={-5} y1={-8} x2={5} y2={-8} stroke="#15803D" strokeWidth={1.8} />
                    <line x1={-2} y1={-12} x2={2} y2={-12} stroke="#15803D" strokeWidth={1.8} />
                  </g>
                )}

                {/* 3. MAIN HORIZONTAL BUSBARS */}
                {displayMode === 'single-line' ? (
                  <g>
                    <line x1={82} y1={busY_L1} x2={canvasWidth - 65} y2={busY_L1} stroke="#000000" strokeWidth={3.5} />
                    <text x={28} y={busY_L1 - 10} fill="#000000" fontSize={12.5} fontWeight="bold" fontFamily="JetBrains Mono, monospace">
                      {isThreePhase ? '3L+N+PE' : 'L+N+PE'}
                    </text>
                  </g>
                ) : (
                  <g>
                    <line x1={82} y1={busY_L1} x2={canvasWidth - 65} y2={busY_L1} stroke="#000000" strokeWidth={2.4} />
                    <text x={28} y={busY_L1 + 4} fill="#000000" fontSize={12} fontWeight="bold" fontFamily="JetBrains Mono, monospace">L1</text>

                    {isThreePhase && (
                      <>
                        <line x1={82} y1={busY_L2} x2={canvasWidth - 65} y2={busY_L2} stroke="#000000" strokeWidth={2.4} />
                        <text x={28} y={busY_L2 + 4} fill="#000000" fontSize={12} fontWeight="bold" fontFamily="JetBrains Mono, monospace">L2</text>

                        <line x1={82} y1={busY_L3} x2={canvasWidth - 65} y2={busY_L3} stroke="#000000" strokeWidth={2.4} />
                        <text x={28} y={busY_L3 + 4} fill="#000000" fontSize={12} fontWeight="bold" fontFamily="JetBrains Mono, monospace">L3</text>
                      </>
                    )}

                    {project.networkSystem !== 'TN-C' && (
                      <>
                        <line x1={82} y1={busY_N} x2={canvasWidth - 65} y2={busY_N} stroke="#0369A1" strokeWidth={2.5} />
                        <text x={28} y={busY_N + 4} fill="#0369A1" fontSize={12} fontWeight="bold" fontFamily="JetBrains Mono, monospace">N (modrý)</text>
                      </>
                    )}

                    <line x1={82} y1={busY_PE} x2={canvasWidth - 65} y2={busY_PE} stroke="#15803D" strokeWidth={2.5} strokeDasharray="6 3" />
                    <text x={28} y={busY_PE + 4} fill="#15803D" fontSize={12} fontWeight="bold" fontFamily="JetBrains Mono, monospace">
                      {project.networkSystem === 'TN-C' ? 'PEN (ZŽ)' : 'PE (ZŽ)'}
                    </text>
                  </g>
                )}

                {/* 4. RCD GROUPS (RCCB / RCBO) & SUB-BUSBARS — VERTICAL TEXT ZHORA DOLE */}
                {rcdGroups.map((group, gIdx) => {
                  const groupCols = columns.filter((col) => col.groupIndex === gIdx);
                  if (groupCols.length === 0) return null;

                  const firstX = groupCols[0].x;
                  const lastX = groupCols[groupCols.length - 1].x;
                  const rcdCenterX = firstX - 14;
                  const rcd = group.rcd;
                  const isSelected = selectedElement?.type === 'rcd' && selectedElement.id === rcd.id;

                  return (
                    <g
                      key={rcd.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedElement({ type: 'rcd', id: rcd.id });
                      }}
                      className="cursor-pointer"
                    >
                      {displayMode !== 'single-line' ? (
                        <>
                          <line x1={rcdCenterX - 8} y1={busY_L1} x2={rcdCenterX - 8} y2={rcdBoxY} stroke="#000000" strokeWidth={1.8} />
                          <circle cx={rcdCenterX - 8} cy={busY_L1} r={3.2} fill="#000000" />
                          {rcd.poles === '4P' && isThreePhase && (
                            <>
                              <line x1={rcdCenterX - 3} y1={busY_L2} x2={rcdCenterX - 3} y2={rcdBoxY} stroke="#000000" strokeWidth={1.8} />
                              <circle cx={rcdCenterX - 3} cy={busY_L2} r={3.2} fill="#000000" />
                              <line x1={rcdCenterX + 3} y1={busY_L3} x2={rcdCenterX + 3} y2={rcdBoxY} stroke="#000000" strokeWidth={1.8} />
                              <circle cx={rcdCenterX + 3} cy={busY_L3} r={3.2} fill="#000000" />
                            </>
                          )}
                          {project.networkSystem !== 'TN-C' && (
                            <>
                              <line x1={rcdCenterX + 8} y1={busY_N} x2={rcdCenterX + 8} y2={rcdBoxY} stroke="#0369A1" strokeWidth={1.8} />
                              <circle cx={rcdCenterX + 8} cy={busY_N} r={3.2} fill="#0369A1" />
                            </>
                          )}
                        </>
                      ) : (
                        <>
                          <line x1={rcdCenterX} y1={busY_L1} x2={rcdCenterX} y2={rcdBoxY} stroke="#000000" strokeWidth={2.2} />
                          <circle cx={rcdCenterX} cy={busY_L1} r={3.8} fill="#000000" />
                        </>
                      )}

                      <rect
                        x={rcdCenterX - 18}
                        y={rcdBoxY}
                        width={36}
                        height={56}
                        rx={4}
                        fill={isSelected ? '#EFF6FF' : '#FFFFFF'}
                        stroke={isSelected ? '#0066FF' : '#000000'}
                        strokeWidth={isSelected ? 2.8 : 2}
                      />

                      <ellipse cx={rcdCenterX} cy={rcdBoxY + 34} rx={11} ry={5} fill="none" stroke="#000000" strokeWidth={1.7} />
                      <line x1={rcdCenterX} y1={rcdBoxY} x2={rcdCenterX} y2={rcdBoxY + 14} stroke="#000000" strokeWidth={1.7} />
                      <line x1={rcdCenterX} y1={rcdBoxY + 41} x2={rcdCenterX} y2={rcdBoxY + 56} stroke="#000000" strokeWidth={1.7} />
                      <line x1={rcdCenterX} y1={rcdBoxY + 41} x2={rcdCenterX - 7} y2={rcdBoxY + 16} stroke="#000000" strokeWidth={2} />
                      {rcd.deviceKind === 'RCBO' && (
                        <>
                          <line x1={rcdCenterX - 3.5} y1={rcdBoxY + 11} x2={rcdCenterX + 3.5} y2={rcdBoxY + 18} stroke="#000000" strokeWidth={1.7} />
                          <line x1={rcdCenterX + 3.5} y1={rcdBoxY + 11} x2={rcdCenterX - 3.5} y2={rcdBoxY + 18} stroke="#000000" strokeWidth={1.7} />
                        </>
                      )}

                      <rect x={rcdCenterX + 5} y={rcdBoxY + 6} width={11} height={11} rx={2} fill="#F8FAFC" stroke="#000000" strokeWidth={1.1} />
                      <text x={rcdCenterX + 10.5} y={rcdBoxY + 14.5} textAnchor="middle" fill="#000000" fontSize={8.5} fontWeight="bold" fontFamily="JetBrains Mono, monospace">
                        T
                      </text>

                      {/* Vertical RCD Label oriented TOP-TO-BOTTOM (rotate(90)) */}
                      <text
                        x={firstX + 22}
                        y={rcdBoxY - 2}
                        textAnchor="start"
                        fill="#000000"
                        fontSize={12.5}
                        fontWeight="bold"
                        fontFamily="JetBrains Mono, monospace"
                        transform={`rotate(90, ${firstX + 22}, ${rcdBoxY - 2})`}
                      >
                        {rcd.label} • {rcd.deviceKind} {rcd.poles}
                      </text>
                      <text
                        x={firstX + 9}
                        y={rcdBoxY - 2}
                        textAnchor="start"
                        fill="#0F172A"
                        fontSize={11}
                        fontWeight="bold"
                        fontFamily="JetBrains Mono, monospace"
                        transform={`rotate(90, ${firstX + 9}, ${rcdBoxY - 2})`}
                      >
                        {rcd.ratedCurrent}A/{rcd.sensitivity}mA • Typ {rcd.type}
                      </text>

                      {group.circuits.length > 0 && (
                        <>
                          <line x1={rcdCenterX} y1={rcdBoxY + 56} x2={rcdCenterX} y2={rcdBusY} stroke="#000000" strokeWidth={2.2} />
                          <line x1={rcdCenterX} y1={rcdBusY} x2={lastX - 14} y2={rcdBusY} stroke="#000000" strokeWidth={2.8} />
                          <line
                            x1={rcdCenterX}
                            y1={rcdBusY + 13}
                            x2={lastX + 12}
                            y2={rcdBusY + 13}
                            stroke="#0369A1"
                            strokeWidth={2.2}
                            strokeDasharray={displayMode === 'wiring-diagram' ? undefined : '4 2'}
                          />
                          <text x={rcdCenterX - 18} y={rcdBusY - 5} fill="#0369A1" fontSize={11} fontFamily="JetBrains Mono, monospace" fontWeight="bold">
                            N({rcd.label})
                          </text>
                        </>
                      )}
                    </g>
                  );
                })}

                {/* 5. FINAL CIRCUITS (MCBs) & STANDALONE RCBOs — VERTICAL TEXT ZHORA DOLE */}
                {columns.map((col, idx) => {
                  const x = col.x;
                  const symX = x - 14;
                  const c = col.circuit;

                  if (!c) {
                    if (col.rcboOnly) {
                      const rcbo = col.rcboOnly;
                      const rcboName = rcbo.circuitName || `Okruh ${rcbo.label}`;
                      const rcboCable = rcbo.cableType || (rcbo.poles === '4P' ? 'CYKY-J 5x2,5 mm²' : 'CYKY-J 3x2,5 mm²');
                      const rcboPower = rcbo.powerKw ?? 2.2;
                      const rcboPhase = rcbo.phase || (rcbo.poles === '4P' ? 'L1,L2,L3' : 'L1');
                      return (
                        <g
                          key={`rcbo-load-${rcbo.id}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedElement({ type: 'rcd', id: rcbo.id });
                          }}
                          className="cursor-pointer"
                        >
                          <line x1={symX} y1={rcdBoxY + 56} x2={symX} y2={loadBoxY} stroke="#000000" strokeWidth={2} />
                          {displayMode !== 'single-line' && (
                            <>
                              <line x1={symX + 5} y1={rcdBoxY + 56} x2={symX + 5} y2={loadBoxY} stroke="#0369A1" strokeWidth={1.7} />
                              <line x1={symX + 10} y1={busY_PE} x2={symX + 10} y2={loadBoxY} stroke="#15803D" strokeWidth={1.6} strokeDasharray="4 2" />
                              <circle cx={symX + 10} cy={busY_PE} r={2.8} fill="#15803D" />
                            </>
                          )}
                          <line x1={symX - 6} y1={mcbBoxY + 80} x2={symX + 6} y2={mcbBoxY + 71} stroke="#000000" strokeWidth={1.8} />
                          <text x={symX - 16} y={mcbBoxY + 80} fill="#000000" fontSize={11} fontWeight="bold" fontFamily="JetBrains Mono, monospace">
                            {rcbo.poles === '4P' ? '5' : '3'}
                          </text>
                          <text
                            x={x + 12}
                            y={mcbBoxY + 100}
                            textAnchor="start"
                            fill="#0F172A"
                            fontSize={11.5}
                            fontWeight="bold"
                            fontFamily="JetBrains Mono, monospace"
                            transform={`rotate(90, ${x + 12}, ${mcbBoxY + 100})`}
                          >
                            {rcboCable} (15m)
                          </text>
                          <rect x={x - 34} y={loadBoxY} width={68} height={310} rx={4} fill="#FFFFFF" stroke="#000000" strokeWidth={1.8} />
                          <text
                            x={x + 14}
                            y={loadBoxY + 16}
                            textAnchor="start"
                            fill="#000000"
                            fontSize={13.5}
                            fontWeight="bold"
                            fontFamily="Plus Jakarta Sans, sans-serif"
                            transform={`rotate(90, ${x + 14}, ${loadBoxY + 16})`}
                          >
                            {rcbo.label} — {rcboName}
                          </text>
                          <text
                            x={x - 1}
                            y={loadBoxY + 16}
                            textAnchor="start"
                            fill="#1E293B"
                            fontSize={11.5}
                            fontWeight="bold"
                            fontFamily="JetBrains Mono, monospace"
                            transform={`rotate(90, ${x - 1}, ${loadBoxY + 16})`}
                          >
                            RCBO ({rcboPhase})
                          </text>
                          <text
                            x={x - 16}
                            y={loadBoxY + 16}
                            textAnchor="start"
                            fill="#0369A1"
                            fontSize={12}
                            fontWeight="bold"
                            fontFamily="JetBrains Mono, monospace"
                            transform={`rotate(90, ${x - 16}, ${loadBoxY + 16})`}
                          >
                            P = {rcboPower.toFixed(2)} kW
                          </text>
                        </g>
                      );
                    }

                    return (
                      <g key={`empty-${idx}`}>
                        <text
                          x={x}
                          y={mcbBoxY + 10}
                          textAnchor="start"
                          fill="#475569"
                          fontSize={11.5}
                          fontWeight="bold"
                          fontFamily="JetBrains Mono, monospace"
                          transform={`rotate(90, ${x}, ${mcbBoxY + 10})`}
                        >
                          Rezerva FI
                        </text>
                      </g>
                    );
                  }

                  const hasParentRcd = Boolean(col.parentRcd);
                  const topSourceY = hasParentRcd ? rcdBusY : busY_L1;
                  const isCircuitSelected = selectedElement?.type === 'circuit' && selectedElement.id === c.id;
                  const isThreePoleCircuit = c.poles === '3P' || c.poles === '4P';

                  return (
                    <g
                      key={c.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedElement({ type: 'circuit', id: c.id });
                      }}
                      onDragOver={(e) => e.preventDefault()}
                      className="cursor-pointer"
                    >
                      <line x1={symX} y1={topSourceY} x2={symX} y2={mcbBoxY} stroke="#000000" strokeWidth={2} />
                      <circle cx={symX} cy={topSourceY} r={3.5} fill="#000000" />

                      {displayMode !== 'single-line' && isThreePoleCircuit && (
                        <>
                          <line x1={symX - 6} y1={topSourceY} x2={symX - 6} y2={mcbBoxY} stroke="#000000" strokeWidth={1.6} />
                          <line x1={symX + 6} y1={topSourceY} x2={symX + 6} y2={mcbBoxY} stroke="#000000" strokeWidth={1.6} />
                        </>
                      )}

                      <rect
                        x={symX - 18}
                        y={mcbBoxY}
                        width={36}
                        height={54}
                        rx={4}
                        fill={isCircuitSelected ? '#EFF6FF' : '#FFFFFF'}
                        stroke={isCircuitSelected ? '#0066FF' : '#000000'}
                        strokeWidth={isCircuitSelected ? 2.8 : 1.9}
                      />
                      <line x1={symX} y1={mcbBoxY} x2={symX} y2={mcbBoxY + 13} stroke="#000000" strokeWidth={1.8} />
                      <line x1={symX} y1={mcbBoxY + 41} x2={symX} y2={mcbBoxY + 54} stroke="#000000" strokeWidth={1.8} />
                      <line x1={symX} y1={mcbBoxY + 41} x2={symX - 9} y2={mcbBoxY + 16} stroke="#000000" strokeWidth={2} />
                      <path
                        d={`M ${symX - 5} ${mcbBoxY + 26} L ${symX - 1} ${mcbBoxY + 26} L ${symX - 1} ${mcbBoxY + 31}`}
                        fill="none"
                        stroke="#000000"
                        strokeWidth={1.4}
                      />

                      {/* Vertical MCB Label oriented TOP-TO-BOTTOM (rotate(90)) */}
                      <text
                        x={x + 22}
                        y={mcbBoxY - 2}
                        textAnchor="start"
                        fill="#000000"
                        fontSize={13}
                        fontWeight="bold"
                        fontFamily="JetBrains Mono, monospace"
                        transform={`rotate(90, ${x + 22}, ${mcbBoxY - 2})`}
                      >
                        {c.label} • {c.characteristic}
                        {c.ratedCurrent}A ({c.poles})
                      </text>
                      <text
                        x={x + 9}
                        y={mcbBoxY - 2}
                        textAnchor="start"
                        fill="#0F172A"
                        fontSize={11}
                        fontWeight="bold"
                        fontFamily="JetBrains Mono, monospace"
                        transform={`rotate(90, ${x + 9}, ${mcbBoxY - 2})`}
                      >
                        Fáza {c.phase === 'L1,L2,L3' ? '3F' : c.phase} • {c.breakingCapacity}
                      </text>

                      {displayMode !== 'single-line' ? (
                        <g>
                          <line x1={symX} y1={mcbBoxY + 54} x2={symX} y2={loadBoxY} stroke="#000000" strokeWidth={1.8} />
                          {isThreePoleCircuit && (
                            <>
                              <line x1={symX - 6} y1={mcbBoxY + 54} x2={symX - 6} y2={loadBoxY} stroke="#000000" strokeWidth={1.5} />
                              <line x1={symX + 6} y1={mcbBoxY + 54} x2={symX + 6} y2={loadBoxY} stroke="#000000" strokeWidth={1.5} />
                            </>
                          )}
                          <line x1={symX + 11} y1={hasParentRcd ? rcdBusY + 13 : busY_N} x2={symX + 11} y2={loadBoxY} stroke="#0369A1" strokeWidth={1.7} />
                          <circle cx={symX + 11} cy={hasParentRcd ? rcdBusY + 13 : busY_N} r={2.8} fill="#0369A1" />
                          <line x1={symX + 16} y1={busY_PE} x2={symX + 16} y2={loadBoxY} stroke="#15803D" strokeWidth={1.6} strokeDasharray="4 2" />
                          <circle cx={symX + 16} cy={busY_PE} r={2.8} fill="#15803D" />
                        </g>
                      ) : (
                        <g>
                          <line x1={symX} y1={mcbBoxY + 54} x2={symX} y2={loadBoxY} stroke="#000000" strokeWidth={1.8} />
                          <line x1={symX - 5} y1={mcbBoxY + 80} x2={symX + 5} y2={mcbBoxY + 71} stroke="#000000" strokeWidth={1.8} />
                          <text x={symX - 15} y={mcbBoxY + 80} fill="#000000" fontSize={11} fontWeight="bold" fontFamily="JetBrains Mono, monospace">
                            {isThreePoleCircuit ? '5' : '3'}
                          </text>
                        </g>
                      )}

                      {/* Vertical Cable Text oriented TOP-TO-BOTTOM (rotate(90)) */}
                      <text
                        x={x + 14}
                        y={mcbBoxY + 106}
                        textAnchor="start"
                        fill="#0F172A"
                        fontSize={11.5}
                        fontWeight="bold"
                        fontFamily="JetBrains Mono, monospace"
                        transform={`rotate(90, ${x + 14}, ${mcbBoxY + 106})`}
                      >
                        {c.cable} ({c.cableLengthM || 15}m)
                      </text>

                      {/* Vertical Terminal Load Box oriented TOP-TO-BOTTOM (rotate(90)) */}
                      <rect
                        x={x - 34}
                        y={loadBoxY}
                        width={68}
                        height={310}
                        rx={4}
                        fill={isCircuitSelected ? '#EFF6FF' : '#FFFFFF'}
                        stroke={isCircuitSelected ? '#0066FF' : '#000000'}
                        strokeWidth={1.8}
                      />
                      <text
                        x={x + 14}
                        y={loadBoxY + 16}
                        textAnchor="start"
                        fill="#000000"
                        fontSize={13.5}
                        fontWeight="bold"
                        fontFamily="Plus Jakarta Sans, sans-serif"
                        transform={`rotate(90, ${x + 14}, ${loadBoxY + 16})`}
                      >
                        {c.label} — {c.name}
                      </text>
                      <text
                        x={x - 1}
                        y={loadBoxY + 16}
                        textAnchor="start"
                        fill="#334155"
                        fontSize={11.5}
                        fontWeight="bold"
                        fontFamily="JetBrains Mono, monospace"
                        transform={`rotate(90, ${x - 1}, ${loadBoxY + 16})`}
                      >
                        {c.category} • {c.characteristic}{c.ratedCurrent}A ({c.poles})
                      </text>
                      <text
                        x={x - 16}
                        y={loadBoxY + 16}
                        textAnchor="start"
                        fill="#0369A1"
                        fontSize={12}
                        fontWeight="bold"
                        fontFamily="JetBrains Mono, monospace"
                        transform={`rotate(90, ${x - 16}, ${loadBoxY + 16})`}
                      >
                        P = {c.powerKw.toFixed(2)} kW • {c.phase}
                      </text>
                    </g>
                  );
                })}

                {/* Wiring Diagram Mandatory Separation Note */}
                {displayMode === 'wiring-diagram' && (
                  <g transform={`translate(28, ${canvasHeight - 98})`}>
                    <rect x={0} y={0} width={620} height={64} rx={4} fill="#F8FAFC" stroke="#0369A1" strokeWidth={1.6} />
                    <text x={14} y={20} fill="#0369A1" fontSize={11.5} fontWeight="bold" fontFamily="JetBrains Mono, monospace">
                      PRAVIDLO ODDELENIA NEUTRÁLNYCH VODIČOV N(FIx) PODĽA STN 33 2000-4-41:
                    </text>
                    <text x={14} y={38} fill="#000000" fontSize={11} fontWeight="bold" fontFamily="Plus Jakarta Sans, sans-serif">
                      Každý prúdový chránič (FI1, FI2...) má vlastnú izolovanú nulovú svorkovnicu N(FIx).
                    </text>
                    <text x={14} y={54} fill="#1E293B" fontSize={10.5} fontFamily="Plus Jakarta Sans, sans-serif">
                      Neutrálne vodiče za rôznymi prúdovými chráničmi sa nesmú spájať! Ochranné PE sú spoločné na HOP.
                    </text>
                  </g>
                )}

                {/* 6. TECHNICAL TITLE BLOCK */}
                <g transform={`translate(${canvasWidth - 515}, ${canvasHeight - 98})`}>
                  <rect x={0} y={0} width={485} height={74} fill="#FFFFFF" stroke="#000000" strokeWidth={1.8} />
                  <line x1={0} y1={25} x2={485} y2={25} stroke="#000000" strokeWidth={1.2} />
                  <line x1={0} y1={49} x2={485} y2={49} stroke="#000000" strokeWidth={1.2} />
                  <line x1={305} y1={0} x2={305} y2={74} stroke="#000000" strokeWidth={1.2} />

                  <text x={10} y={17} fill="#000000" fontSize={11.5} fontWeight="bold" fontFamily="Inter, Plus Jakarta Sans, sans-serif">
                    NÁZOV: {project.name.length > 34 ? `${project.name.slice(0, 34)}…` : project.name}
                  </text>
                  <text x={315} y={17} fill="#000000" fontSize={11.5} fontWeight="bold" fontFamily="JetBrains Mono, monospace">
                    SÚSTAVA: {project.networkSystem}
                  </text>

                  <text x={10} y={41} fill="#0F172A" fontSize={11} fontWeight="bold" fontFamily="Inter, Plus Jakarta Sans, sans-serif">
                    Vypracoval:{' '}
                    {(project.designerName || 'Projekčná kancelária').length > 30
                      ? `${(project.designerName || 'Projekčná kancelária').slice(0, 30)}…`
                      : project.designerName || 'Projekčná kancelária'}
                  </text>
                  <text x={315} y={41} fill="#0F172A" fontSize={11} fontWeight="bold" fontFamily="JetBrains Mono, monospace">
                    Dátum: {project.projectDate}
                  </text>

                  <text x={10} y={66} fill="#1E293B" fontSize={10.5} fontWeight="bold" fontFamily="JetBrains Mono, monospace">
                    Norma: STN EN 61439-3 / STN 33 2000-4-41
                  </text>
                  <text x={315} y={66} fill="#000000" fontSize={11.5} fontWeight="bold" fontFamily="JetBrains Mono, monospace">
                    Č. zákazky: {project.projectNumber}
                  </text>
                </g>
              </>
            )}
          </svg>
        </div>
      </div>

      {/* Bottom Drag-and-Drop Quick Strip for Reordering Circuits — Hidden in print and compactMode */}
      {!compactMode && onProjectChange && (
        <div className="no-print print:hidden px-4 py-2 bg-[#0F172A] border-t border-slate-800 flex items-center gap-2 overflow-x-auto">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 shrink-0">
            Drag &amp; Drop poradie okruhov:
          </span>
          {circuits.map((c) => {
            const rcd = rcds.find((r) => r.id === c.rcdId);
            const isSelected =
              selectedElement?.type === 'circuit' && selectedElement.id === c.id;
            return (
              <div
                key={c.id}
                draggable
                onDragStart={() => setDraggedCircuitId(c.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDropCircuitOnColumn(c.id, c.rcdId)}
                onClick={() => setSelectedElement({ type: 'circuit', id: c.id })}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-mono cursor-grab active:cursor-grabbing shrink-0 transition-all ${
                  isSelected
                    ? 'bg-[#0066FF]/25 border-[#0066FF] text-white'
                    : 'bg-[#0B1120] border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                <span className="font-bold text-[#38BDF8]">{c.label}</span>
                <span className="text-[11px] text-slate-300 truncate max-w-[90px]">{c.name}</span>
                {rcd && (
                  <span className="px-1 py-0.2 rounded bg-blue-500/20 text-blue-300 text-[10px]">
                    {rcd.label}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Printable Breaker & Circuit Legend Table when printing directly from Schema Editor or Wizard */}
      {!compactMode && (
        <div
          className={`hidden print:block mt-4 pt-3 border-t-2 border-black bg-white text-black ${
            isPortrait ? 'break-before-page' : ''
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-extrabold uppercase tracking-wider text-black">
                ROZPIS ISTIČOV A ELEKTRICKÝCH OKRUHOV K SCHÉME — {project.name}
              </h3>
              <p className="text-xs text-black font-mono mt-0.5">
                Hlavný istič pred elektromerom ({upstreamBreaker.designation}):{' '}
                {upstreamBreaker.enabled
                  ? `${upstreamBreaker.poles} ${upstreamBreaker.characteristic}${upstreamBreaker.ratedCurrent} A (${upstreamBreaker.placement})`
                  : 'Nezahrnutý'}{' '}
                | Hlavný prvok v rozvádzači ({internalDevice.designation}):{' '}
                {internalDevice.enabled
                  ? `${internalDevice.deviceType} ${internalDevice.poles} ${internalDevice.hasOvercurrentProtection && internalDevice.characteristic ? internalDevice.characteristic : ''}${internalDevice.ratedCurrent} A`
                  : 'Neosadený'}{' '}
                | Sústava: {project.supplySystem.toUpperCase()} ({project.voltage}, {project.networkSystem})
              </p>
            </div>
            <div className="text-right font-mono text-xs text-black">
              Č. zákazky: <strong>{project.projectNumber}</strong> | Dátum: <strong>{project.projectDate}</strong>
            </div>
          </div>

          <table className="w-full text-left border-collapse border-2 border-black text-xs text-black">
            <thead>
              <tr className="bg-slate-200 text-black border-b-2 border-black font-bold">
                <th className="py-1.5 px-2 border-r border-black">Istič</th>
                <th className="py-1.5 px-2 border-r border-black">Názov okruhu / Spotrebič</th>
                <th className="py-1.5 px-2 border-r border-black">Typ a hodnota ističa</th>
                <th className="py-1.5 px-2 border-r border-black">Chránič</th>
                <th className="py-1.5 px-2 border-r border-black">Fáza</th>
                <th className="py-1.5 px-2 border-r border-black">Kábel</th>
                <th className="py-1.5 px-2">Príkon</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-400 font-mono">
              {circuits.map((c) => {
                const rcd = rcds.find((r) => r.id === c.rcdId);
                return (
                  <tr key={c.id}>
                    <td className="py-1.5 px-2 border-r border-slate-500 font-bold text-black">
                      {c.label}
                    </td>
                    <td className="py-1.5 px-2 border-r border-slate-500 font-sans font-bold text-black">
                      {c.name}
                    </td>
                    <td className="py-1.5 px-2 border-r border-slate-500 font-bold text-black">
                      {c.poles} {c.characteristic}{c.ratedCurrent} A ({c.model})
                    </td>
                    <td className="py-1.5 px-2 border-r border-slate-500 text-black">
                      {rcd ? `${rcd.label} (${rcd.ratedCurrent}A/${rcd.sensitivity}mA)` : 'Bez FI'}
                    </td>
                    <td className="py-1.5 px-2 border-r border-slate-500 font-bold text-black">{c.phase}</td>
                    <td className="py-1.5 px-2 border-r border-slate-500 text-black">{c.cable}</td>
                    <td className="py-1.5 px-2 font-bold text-black">{c.powerKw.toFixed(2)} kW</td>
                  </tr>
                );
              })}
              {rcds
                .filter((r) => r.deviceKind === 'RCBO' && !circuits.some((c) => c.rcdId === r.id))
                .map((rcbo) => (
                  <tr key={rcbo.id}>
                    <td className="py-1.5 px-2 border-r border-slate-500 font-bold text-black">
                      {rcbo.label}
                    </td>
                    <td className="py-1.5 px-2 border-r border-slate-500 font-sans font-bold text-black">
                      {rcbo.circuitName || rcbo.notes || 'Samostatný okruh RCBO'}
                    </td>
                    <td className="py-1.5 px-2 border-r border-slate-500 font-bold text-black">
                      RCBO {rcbo.poles} {rcbo.characteristic || 'B'}{rcbo.ratedCurrent} A / {rcbo.sensitivity} mA ({rcbo.model})
                    </td>
                    <td className="py-1.5 px-2 border-r border-slate-500 text-black">
                      RCBO ({rcbo.label}, Typ {rcbo.type})
                    </td>
                    <td className="py-1.5 px-2 border-r border-slate-500 font-bold text-black">
                      {rcbo.phase || (rcbo.poles === '4P' ? 'L1,L2,L3' : 'L1')}
                    </td>
                    <td className="py-1.5 px-2 border-r border-slate-500 text-black">
                      {rcbo.cableType || 'CYKY-J 3x2,5 mm²'}
                    </td>
                    <td className="py-1.5 px-2 font-bold text-black">{(rcbo.powerKw ?? 0.6).toFixed(2)} kW</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
