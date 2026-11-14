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

  // Portrait A4 layout geometry (4 columns per row, compact 960px width, giant readable fonts)
  const isPortrait = schemaOrientation === 'portrait';
  const portraitColsPerRow = 4;
  const portraitColX = [215, 403, 591, 779];
  const portraitRowsStartY = displayMode === 'single-line' ? 378 : 438;
  const portraitRowHeight = 452;

  const portraitRows: RenderColumn[][] = [];
  for (let i = 0; i < columns.length; i += portraitColsPerRow) {
    portraitRows.push(columns.slice(i, i + portraitColsPerRow));
  }
  if (portraitRows.length === 0) {
    portraitRows.push([]);
  }

  const landscapeWidth = Math.max(1320, currentX + 140);
  const landscapeHeight = displayMode === 'wiring-diagram' ? 1050 : 980;

  const portraitWidth = 960;
  const portraitHeight = Math.max(
    1320,
    portraitRowsStartY + portraitRows.length * portraitRowHeight + 112
  );

  const canvasWidth = isPortrait ? portraitWidth : landscapeWidth;
  const canvasHeight = isPortrait ? portraitHeight : landscapeHeight;

  // Busbar Y coordinates for Landscape mode
  const busY_L1 = 290;
  const busY_L2 = 310;
  const busY_L3 = 330;
  const busY_N = 352;
  const busY_PE = 374;

  const rcdBoxY = 426;
  const rcdBusY = 544;
  const mcbBoxY = 612;
  const cableStartY = 670;
  const loadBoxY = 788;

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
              ? 'w-full flex items-center justify-center p-0'
              : 'min-w-max min-h-full flex items-center justify-center p-4'
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
            {/* PORTRAIT A4 MODE (NA VÝŠKU) — 4 STĹPCE NA RAD, VEĽKÉ PÍSMO        */}
            {/* ================================================================= */}
            {isPortrait ? (
              <>
                {/* Top Header Banner */}
                <g transform="translate(28, 30)">
                  <text
                    x={0}
                    y={18}
                    fill="#000000"
                    fontSize={17}
                    fontWeight="bold"
                    fontFamily="Plus Jakarta Sans, sans-serif"
                  >
                    {project.name.length > 52
                      ? `${project.name.slice(0, 51).toUpperCase()}…`
                      : project.name.toUpperCase()}{' '}
                    —{' '}
                    {displayMode === 'single-line'
                      ? 'JEDNOPÓLOVÁ SCHÉMA (1L)'
                      : displayMode === 'multi-line'
                      ? 'VIACPÓLOVÁ SCHÉMA (3L)'
                      : 'DETAILNÉ ZAPOJENIE'}
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
                    {project.voltage}) | Prívod: {project.supplyCable} | Krytie: {project.ipRating}
                  </text>
                </g>

                {/* Left-Top Vertical Incoming Chain: Prívod -> QF0 -> kWh -> QS1/QF1 */}
                <g transform="translate(95, 84)">
                  {/* Step 1: PRÍVOD */}
                  <line x1={0} y1={0} x2={0} y2={24} stroke="#000000" strokeWidth={2.8} />
                  <line x1={-7} y1={8} x2={7} y2={15} stroke="#000000" strokeWidth={1.8} />
                  <text
                    x={16}
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
                      x={-34}
                      y={24}
                      width={68}
                      height={48}
                      rx={4}
                      fill={selectedElement?.type === 'main' ? '#EFF6FF' : '#FFFFFF'}
                      stroke={selectedElement?.type === 'main' ? '#0066FF' : '#000000'}
                      strokeWidth={selectedElement?.type === 'main' ? 3 : 2.2}
                      strokeDasharray="5 2"
                    />
                    {upstreamBreaker.enabled ? (
                      <>
                        <line x1={0} y1={24} x2={0} y2={35} stroke="#000000" strokeWidth={2.2} />
                        <line x1={0} y1={60} x2={0} y2={72} stroke="#000000" strokeWidth={2.2} />
                        <line x1={0} y1={60} x2={-11} y2={38} stroke="#000000" strokeWidth={2.4} />
                        <line x1={-5} y1={32} x2={5} y2={38} stroke="#000000" strokeWidth={1.8} />
                        <line x1={-5} y1={38} x2={5} y2={32} stroke="#000000" strokeWidth={1.8} />
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
                  <line x1={0} y1={72} x2={0} y2={84} stroke="#000000" strokeWidth={2.4} />
                  {electricityMeter.enabled ? (
                    <g>
                      <rect
                        x={-28}
                        y={84}
                        width={56}
                        height={38}
                        rx={4}
                        fill="#FFFFFF"
                        stroke="#000000"
                        strokeWidth={2}
                        strokeDasharray="4 2"
                      />
                      <circle cx={0} cy={103} r={13} fill="#F8FAFC" stroke="#000000" strokeWidth={1.6} />
                      <text
                        x={0}
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
                  <line x1={0} y1={122} x2={0} y2={148} stroke="#000000" strokeWidth={2.8} />
                  <line x1={-7} y1={131} x2={7} y2={137} stroke="#000000" strokeWidth={1.8} />
                  <text
                    x={16}
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
                      x={-34}
                      y={148}
                      width={68}
                      height={54}
                      rx={4}
                      fill={selectedElement?.type === 'internal-main' ? '#EFF6FF' : '#FFFFFF'}
                      stroke={selectedElement?.type === 'internal-main' ? '#0066FF' : '#000000'}
                      strokeWidth={selectedElement?.type === 'internal-main' ? 3 : 2.2}
                    />
                    {internalDevice.enabled ? (
                      <>
                        <line x1={0} y1={148} x2={0} y2={161} stroke="#000000" strokeWidth={2.2} />
                        <line x1={0} y1={189} x2={0} y2={202} stroke="#000000" strokeWidth={2.2} />
                        <line x1={0} y1={189} x2={-11} y2={164} stroke="#000000" strokeWidth={2.4} />
                        {isInternalBreaker ? (
                          <>
                            <line x1={-5} y1={159} x2={5} y2={165} stroke="#000000" strokeWidth={1.8} />
                            <line x1={-5} y1={165} x2={5} y2={159} stroke="#000000" strokeWidth={1.8} />
                          </>
                        ) : (
                          <>
                            <line x1={-6} y1={161} x2={6} y2={161} stroke="#000000" strokeWidth={2.2} />
                            <circle cx={0} cy={189} r={2.6} fill="#000000" />
                          </>
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

                  {/* Wire down to Main Busbar L1 at Y = 330 (relative y = 246) */}
                  <line x1={0} y1={202} x2={0} y2={246} stroke="#000000" strokeWidth={3} />
                  <circle cx={0} cy={246} r={4.5} fill="#000000" />
                </g>

                {/* Right-Top Box: PEN Split Point */}
                {(project.networkSystem === 'TN-C-S' || displayMode === 'wiring-diagram') && (
                  <g transform="translate(650, 84)">
                    <rect
                      x={0}
                      y={0}
                      width={280}
                      height={66}
                      rx={5}
                      fill="#F0FDF4"
                      stroke="#15803D"
                      strokeWidth={2}
                    />
                    <text
                      x={140}
                      y={21}
                      textAnchor="middle"
                      fill="#15803D"
                      fontSize={12}
                      fontWeight="bold"
                      fontFamily="JetBrains Mono, monospace"
                    >
                      {project.networkSystem === 'TN-C-S' ? 'BOD ROZDELENIA PEN → PE + N' : `UZOL PE / N (${project.networkSystem})`}
                    </text>
                    <text
                      x={140}
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
                      x={140}
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

                {/* Right-Top Surge Protector (SPD - FV1) */}
                {mainBreaker.hasSurgeProtector && (
                  <g
                    transform="translate(682, 200)"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedElement({ type: 'spd' });
                    }}
                    className="cursor-pointer"
                  >
                    <line x1={0} y1={48} x2={0} y2={130} stroke="#000000" strokeWidth={2.2} />
                    <circle cx={0} cy={130} r={4} fill="#000000" />
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
                    {/* Green PE symbol */}
                    <line x1={0} y1={8} x2={0} y2={-6} stroke="#15803D" strokeWidth={2} />
                    <line x1={-10} y1={-6} x2={10} y2={-6} stroke="#15803D" strokeWidth={2} />
                    <line x1={-6} y1={-11} x2={6} y2={-11} stroke="#15803D" strokeWidth={2} />
                    <line x1={-3} y1={-16} x2={3} y2={-16} stroke="#15803D" strokeWidth={2} />
                  </g>
                )}

                {/* Main Top Horizontal Busbars */}
                {(() => {
                  const pBusL1 = 330;
                  const pBusL2 = 348;
                  const pBusL3 = 366;
                  const pBusN = 386;
                  const pBusPE = 406;
                  const lastRowTopBusY =
                    portraitRowsStartY + (portraitRows.length - 1) * portraitRowHeight + 22;

                  return (
                    <g>
                      {displayMode === 'single-line' ? (
                        <>
                          <line x1={62} y1={pBusL1} x2={930} y2={pBusL1} stroke="#000000" strokeWidth={3.5} />
                          <text
                            x={26}
                            y={pBusL1 - 9}
                            fill="#000000"
                            fontSize={13}
                            fontWeight="bold"
                            fontFamily="JetBrains Mono, monospace"
                          >
                            {isThreePhase ? '3L+N+PE' : 'L+N+PE'}
                          </text>
                          {/* Vertical Main Trunk feeding every row on the left */}
                          <line
                            x1={62}
                            y1={pBusL1}
                            x2={62}
                            y2={lastRowTopBusY}
                            stroke="#000000"
                            strokeWidth={3.5}
                          />
                          <circle cx={62} cy={pBusL1} r={4.5} fill="#000000" />
                        </>
                      ) : (
                        <>
                          <line x1={42} y1={pBusL1} x2={930} y2={pBusL1} stroke="#000000" strokeWidth={2.4} />
                          <text x={24} y={pBusL1 + 4} fill="#000000" fontSize={12} fontWeight="bold" fontFamily="JetBrains Mono, monospace">L1</text>
                          <line x1={42} y1={pBusL1} x2={42} y2={lastRowTopBusY} stroke="#000000" strokeWidth={2.2} />

                          {isThreePhase && (
                            <>
                              <line x1={52} y1={pBusL2} x2={930} y2={pBusL2} stroke="#000000" strokeWidth={2.4} />
                              <text x={24} y={pBusL2 + 4} fill="#000000" fontSize={12} fontWeight="bold" fontFamily="JetBrains Mono, monospace">L2</text>
                              <line x1={52} y1={pBusL2} x2={52} y2={lastRowTopBusY + 12} stroke="#000000" strokeWidth={2.2} />

                              <line x1={62} y1={pBusL3} x2={930} y2={pBusL3} stroke="#000000" strokeWidth={2.4} />
                              <text x={24} y={pBusL3 + 4} fill="#000000" fontSize={12} fontWeight="bold" fontFamily="JetBrains Mono, monospace">L3</text>
                              <line x1={62} y1={pBusL3} x2={62} y2={lastRowTopBusY + 24} stroke="#000000" strokeWidth={2.2} />
                            </>
                          )}

                          {project.networkSystem !== 'TN-C' && (
                            <>
                              <line x1={74} y1={pBusN} x2={930} y2={pBusN} stroke="#0369A1" strokeWidth={2.6} />
                              <text x={24} y={pBusN + 4} fill="#0369A1" fontSize={12} fontWeight="bold" fontFamily="JetBrains Mono, monospace">N</text>
                              <line x1={74} y1={pBusN} x2={74} y2={lastRowTopBusY + 36} stroke="#0369A1" strokeWidth={2.4} />
                            </>
                          )}

                          <line x1={86} y1={pBusPE} x2={930} y2={pBusPE} stroke="#15803D" strokeWidth={2.6} strokeDasharray="6 3" />
                          <text x={24} y={pBusPE + 4} fill="#15803D" fontSize={12} fontWeight="bold" fontFamily="JetBrains Mono, monospace">PE</text>
                          <line x1={86} y1={pBusPE} x2={86} y2={lastRowTopBusY + 48} stroke="#15803D" strokeWidth={2.4} strokeDasharray="6 3" />
                        </>
                      )}

                      {/* Render each Portrait Row (up to 4 columns per row) */}
                      {portraitRows.map((rowCols, rowIdx) => {
                        if (rowCols.length === 0) return null;

                        const rowTop = portraitRowsStartY + rowIdx * portraitRowHeight;
                        const rowBusY = rowTop + 22;
                        const rowRcdBoxY = rowTop + 62;
                        const rowRcdBusY = rowTop + 150;
                        const rowMcbBoxY = rowTop + 204;
                        const rowLoadBoxY = rowTop + 324;

                        // Assign column X positions from fixed portrait 4-slot grid
                        const positionedCols = rowCols.map((col, idx) => ({
                          ...col,
                          px: portraitColX[idx],
                        }));
                        const rowLastX = positionedCols[positionedCols.length - 1].px;

                        // Group adjacent columns in this row by RCD id to draw RCD headers and sub-busbars
                        interface RcdRowSegment {
                          rcd?: RcdConfig;
                          cols: typeof positionedCols;
                          isFirstOccurrenceOfRcd: boolean;
                        }
                        const segments: RcdRowSegment[] = [];
                        positionedCols.forEach((pCol) => {
                          const lastSeg = segments[segments.length - 1];
                          const rcdId = pCol.parentRcd?.id || 'NONE';
                          if (lastSeg && (lastSeg.rcd?.id || 'NONE') === rcdId) {
                            lastSeg.cols.push(pCol);
                          } else {
                            // Check if this RCD already appeared in an earlier row
                            const appearedEarlier =
                              pCol.parentRcd &&
                              portraitRows
                                .slice(0, rowIdx)
                                .some((prevRow) =>
                                  prevRow.some((c) => c.parentRcd?.id === pCol.parentRcd?.id)
                                );
                            segments.push({
                              rcd: pCol.parentRcd,
                              cols: [pCol],
                              isFirstOccurrenceOfRcd: !appearedEarlier,
                            });
                          }
                        });

                        return (
                          <g key={`portrait-row-${rowIdx}`}>
                            {/* Row Label Pill on Left */}
                            <text
                              x={102}
                              y={rowBusY - 6}
                              fill="#334155"
                              fontSize={11}
                              fontWeight="bold"
                              fontFamily="JetBrains Mono, monospace"
                            >
                              RAD {rowIdx + 1} ({positionedCols[0].circuit?.label || positionedCols[0].rcboOnly?.label || ''}–
                              {positionedCols[positionedCols.length - 1].circuit?.label ||
                                positionedCols[positionedCols.length - 1].rcboOnly?.label ||
                                ''})
                            </text>

                            {/* Row Horizontal Busbar(s) */}
                            {displayMode === 'single-line' ? (
                              <>
                                <line
                                  x1={62}
                                  y1={rowBusY}
                                  x2={rowLastX + 48}
                                  y2={rowBusY}
                                  stroke="#000000"
                                  strokeWidth={3}
                                />
                                <circle cx={62} cy={rowBusY} r={4} fill="#000000" />
                              </>
                            ) : (
                              <>
                                <line x1={42} y1={rowBusY} x2={rowLastX + 48} y2={rowBusY} stroke="#000000" strokeWidth={2.2} />
                                <circle cx={42} cy={rowBusY} r={3.5} fill="#000000" />
                                {isThreePhase && (
                                  <>
                                    <line x1={52} y1={rowBusY + 12} x2={rowLastX + 48} y2={rowBusY + 12} stroke="#000000" strokeWidth={2} />
                                    <circle cx={52} cy={rowBusY + 12} r={3.5} fill="#000000" />
                                    <line x1={62} y1={rowBusY + 24} x2={rowLastX + 48} y2={rowBusY + 24} stroke="#000000" strokeWidth={2} />
                                    <circle cx={62} cy={rowBusY + 24} r={3.5} fill="#000000" />
                                  </>
                                )}
                                {project.networkSystem !== 'TN-C' && (
                                  <>
                                    <line x1={74} y1={rowBusY + 36} x2={rowLastX + 48} y2={rowBusY + 36} stroke="#0369A1" strokeWidth={2.2} />
                                    <circle cx={74} cy={rowBusY + 36} r={3.5} fill="#0369A1" />
                                  </>
                                )}
                                <line x1={86} y1={rowBusY + 48} x2={rowLastX + 48} y2={rowBusY + 48} stroke="#15803D" strokeWidth={2.2} strokeDasharray="5 3" />
                                <circle cx={86} cy={rowBusY + 48} r={3.5} fill="#15803D" />
                              </>
                            )}

                            {/* RCD Symbols & Sub-busbars for this row */}
                            {segments.map((seg, sIdx) => {
                              if (!seg.rcd) return null;
                              const rcd = seg.rcd;
                              const firstPx = seg.cols[0].px;
                              const lastPx = seg.cols[seg.cols.length - 1].px;
                              const isSelected =
                                selectedElement?.type === 'rcd' && selectedElement.id === rcd.id;
                              const hasChildCircuits = seg.cols.some((c) => Boolean(c.circuit));

                              if (!seg.isFirstOccurrenceOfRcd) {
                                // Continuation sub-busbar from earlier row's RCD
                                return (
                                  <g key={`cont-${rcd.id}-${sIdx}`}>
                                    <rect
                                      x={firstPx - 78}
                                      y={rowRcdBoxY + 18}
                                      width={Math.max(156, lastPx - firstPx + 140)}
                                      height={24}
                                      rx={4}
                                      fill="#EFF6FF"
                                      stroke="#0369A1"
                                      strokeWidth={1.5}
                                    />
                                    <text
                                      x={firstPx - 70}
                                      y={rowRcdBoxY + 34}
                                      fill="#0369A1"
                                      fontSize={11.5}
                                      fontWeight="bold"
                                      fontFamily="JetBrains Mono, monospace"
                                    >
                                      ↳ Pokračovanie z {rcd.label} ({rcd.ratedCurrent}A/{rcd.sensitivity}mA) • N({rcd.label})
                                    </text>
                                    <line
                                      x1={firstPx}
                                      y1={rowRcdBoxY + 42}
                                      x2={firstPx}
                                      y2={rowRcdBusY}
                                      stroke="#000000"
                                      strokeWidth={2.4}
                                    />
                                    <line
                                      x1={firstPx}
                                      y1={rowRcdBusY}
                                      x2={lastPx}
                                      y2={rowRcdBusY}
                                      stroke="#000000"
                                      strokeWidth={2.8}
                                    />
                                    <line
                                      x1={firstPx}
                                      y1={rowRcdBusY + 13}
                                      x2={lastPx + 24}
                                      y2={rowRcdBusY + 13}
                                      stroke="#0369A1"
                                      strokeWidth={2.2}
                                      strokeDasharray="4 2"
                                    />
                                  </g>
                                );
                              }

                              return (
                                <g
                                  key={`p-rcd-${rcd.id}-${sIdx}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedElement({ type: 'rcd', id: rcd.id });
                                  }}
                                  className="cursor-pointer"
                                >
                                  <line
                                    x1={firstPx}
                                    y1={rowBusY}
                                    x2={firstPx}
                                    y2={rowRcdBoxY}
                                    stroke="#000000"
                                    strokeWidth={2.4}
                                  />
                                  <circle cx={firstPx} cy={rowBusY} r={4} fill="#000000" />

                                  {/* RCD Symbol Box (52 × 54) */}
                                  <rect
                                    x={firstPx - 26}
                                    y={rowRcdBoxY}
                                    width={52}
                                    height={54}
                                    rx={4}
                                    fill={isSelected ? '#EFF6FF' : '#FFFFFF'}
                                    stroke={isSelected ? '#0066FF' : '#000000'}
                                    strokeWidth={isSelected ? 3 : 2.2}
                                  />
                                  <ellipse
                                    cx={firstPx}
                                    cy={rowRcdBoxY + 32}
                                    rx={12}
                                    ry={5.5}
                                    fill="none"
                                    stroke="#000000"
                                    strokeWidth={1.8}
                                  />
                                  <line x1={firstPx} y1={rowRcdBoxY} x2={firstPx} y2={rowRcdBoxY + 14} stroke="#000000" strokeWidth={1.8} />
                                  <line x1={firstPx} y1={rowRcdBoxY + 40} x2={firstPx} y2={rowRcdBoxY + 54} stroke="#000000" strokeWidth={1.8} />
                                  <line x1={firstPx} y1={rowRcdBoxY + 40} x2={firstPx - 8} y2={rowRcdBoxY + 16} stroke="#000000" strokeWidth={2.1} />
                                  {rcd.deviceKind === 'RCBO' && (
                                    <>
                                      <line x1={firstPx - 3.5} y1={rowRcdBoxY + 11} x2={firstPx + 3.5} y2={rowRcdBoxY + 18} stroke="#000000" strokeWidth={1.8} />
                                      <line x1={firstPx + 3.5} y1={rowRcdBoxY + 11} x2={firstPx - 3.5} y2={rowRcdBoxY + 18} stroke="#000000" strokeWidth={1.8} />
                                    </>
                                  )}
                                  {/* Test button T */}
                                  <rect x={firstPx + 10} y={rowRcdBoxY + 7} width={13} height={12} rx={2} fill="#F8FAFC" stroke="#000000" strokeWidth={1.2} />
                                  <text x={firstPx + 16.5} y={rowRcdBoxY + 16.5} textAnchor="middle" fill="#000000" fontSize={9} fontWeight="bold" fontFamily="JetBrains Mono, monospace">
                                    T
                                  </text>

                                  {/* Compact Split Left/Right RCD Labels (Zero overlap with neighboring columns!) */}
                                  <text
                                    x={firstPx - 30}
                                    y={rowRcdBoxY + 21}
                                    textAnchor="end"
                                    fill="#000000"
                                    fontSize={14}
                                    fontWeight="bold"
                                    fontFamily="JetBrains Mono, monospace"
                                  >
                                    {rcd.label}
                                  </text>
                                  <text
                                    x={firstPx - 30}
                                    y={rowRcdBoxY + 38}
                                    textAnchor="end"
                                    fill="#0F172A"
                                    fontSize={11.5}
                                    fontWeight="bold"
                                    fontFamily="JetBrains Mono, monospace"
                                  >
                                    {rcd.poles}•{rcd.type}
                                  </text>

                                  <text
                                    x={firstPx + 30}
                                    y={rowRcdBoxY + 21}
                                    textAnchor="start"
                                    fill="#000000"
                                    fontSize={11.5}
                                    fontWeight="bold"
                                    fontFamily="JetBrains Mono, monospace"
                                  >
                                    {rcd.deviceKind}
                                  </text>
                                  <text
                                    x={firstPx + 30}
                                    y={rowRcdBoxY + 38}
                                    textAnchor="start"
                                    fill="#0F172A"
                                    fontSize={11.5}
                                    fontWeight="bold"
                                    fontFamily="JetBrains Mono, monospace"
                                  >
                                    {rcd.ratedCurrent}A/{rcd.sensitivity}mA
                                  </text>

                                  {hasChildCircuits && (
                                    <>
                                      <line
                                        x1={firstPx}
                                        y1={rowRcdBoxY + 54}
                                        x2={firstPx}
                                        y2={rowRcdBusY}
                                        stroke="#000000"
                                        strokeWidth={2.4}
                                      />
                                      <line
                                        x1={firstPx}
                                        y1={rowRcdBusY}
                                        x2={lastPx}
                                        y2={rowRcdBusY}
                                        stroke="#000000"
                                        strokeWidth={2.8}
                                      />
                                      <line
                                        x1={firstPx}
                                        y1={rowRcdBusY + 13}
                                        x2={lastPx + 24}
                                        y2={rowRcdBusY + 13}
                                        stroke="#0369A1"
                                        strokeWidth={2.2}
                                        strokeDasharray={displayMode === 'wiring-diagram' ? undefined : '4 2'}
                                      />
                                      <rect
                                        x={firstPx + 8}
                                        y={rowRcdBusY - 24}
                                        width={Math.max(136, lastPx - firstPx + 42)}
                                        height={19}
                                        rx={3}
                                        fill="#EFF6FF"
                                        stroke="#0369A1"
                                        strokeWidth={1.2}
                                      />
                                      <text
                                        x={firstPx + 14}
                                        y={rowRcdBusY - 11}
                                        fill="#0369A1"
                                        fontSize={11}
                                        fontWeight="bold"
                                        fontFamily="JetBrains Mono, monospace"
                                      >
                                        {rcd.label} • N({rcd.label})
                                      </text>
                                    </>
                                  )}
                                </g>
                              );
                            })}

                            {/* Final Circuits & Standalone RCBOs in this Portrait Row */}
                            {positionedCols.map((pCol, cIdx) => {
                              const px = pCol.px;
                              const c = pCol.circuit;

                              if (!c) {
                                if (pCol.rcboOnly) {
                                  const rcbo = pCol.rcboOnly;
                                  const rcboName = rcbo.circuitName || `Okruh ${rcbo.label}`;
                                  const rcboLines = wrapTextLines(rcboName, 19, 2);
                                  const rcboCable =
                                    rcbo.cableType ||
                                    (rcbo.poles === '4P' ? 'CYKY-J 5x2,5 mm²' : 'CYKY-J 3x2,5 mm²');
                                  const rcboPower = rcbo.powerKw ?? 2.2;
                                  const rcboPhase =
                                    rcbo.phase || (rcbo.poles === '4P' ? 'L1,L2,L3' : 'L1');
                                  return (
                                    <g
                                      key={`p-rcbo-${rcbo.id}-${cIdx}`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedElement({ type: 'rcd', id: rcbo.id });
                                      }}
                                      className="cursor-pointer"
                                    >
                                      <line
                                        x1={px}
                                        y1={rowRcdBoxY + 54}
                                        x2={px}
                                        y2={rowLoadBoxY}
                                        stroke="#000000"
                                        strokeWidth={2.2}
                                      />
                                      {/* Conductor count */}
                                      <line x1={px - 6} y1={rowRcdBoxY + 94} x2={px + 6} y2={rowRcdBoxY + 84} stroke="#000000" strokeWidth={1.8} />
                                      <text x={px + 10} y={rowRcdBoxY + 94} fill="#000000" fontSize={11.5} fontWeight="bold" fontFamily="JetBrains Mono, monospace">
                                        {rcbo.poles === '4P' ? '5' : '3'}
                                      </text>

                                      {/* Horizontal Readable Cable Tag */}
                                      <rect
                                        x={px - 80}
                                        y={rowLoadBoxY - 46}
                                        width={160}
                                        height={36}
                                        rx={4}
                                        fill="#FFFFFF"
                                        stroke="#64748B"
                                        strokeWidth={1.2}
                                      />
                                      <text x={px} y={rowLoadBoxY - 31} textAnchor="middle" fill="#000000" fontSize={11.5} fontWeight="bold" fontFamily="JetBrains Mono, monospace">
                                        {rcboCable}
                                      </text>
                                      <text x={px} y={rowLoadBoxY - 16} textAnchor="middle" fill="#1E293B" fontSize={11} fontWeight="bold" fontFamily="JetBrains Mono, monospace">
                                        {rcboPhase} • {rcbo.cableLengthM || 15} m
                                      </text>

                                      {/* Large Load Box */}
                                      <rect
                                        x={px - 84}
                                        y={rowLoadBoxY}
                                        width={168}
                                        height={82}
                                        rx={5}
                                        fill="#FFFFFF"
                                        stroke="#000000"
                                        strokeWidth={2}
                                      />
                                      <text x={px} y={rowLoadBoxY + 21} textAnchor="middle" fill="#000000" fontSize={13} fontWeight="bold" fontFamily="Plus Jakarta Sans, sans-serif">
                                        {rcboLines[0]}
                                      </text>
                                      {rcboLines[1] && (
                                        <text x={px} y={rowLoadBoxY + 38} textAnchor="middle" fill="#000000" fontSize={12.5} fontWeight="bold" fontFamily="Plus Jakarta Sans, sans-serif">
                                          {rcboLines[1]}
                                        </text>
                                      )}
                                      <text x={px} y={rowLoadBoxY + (rcboLines[1] ? 55 : 46)} textAnchor="middle" fill="#334155" fontSize={11} fontWeight="bold" fontFamily="JetBrains Mono, monospace">
                                        RCBO ({rcboPhase})
                                      </text>
                                      <text x={px} y={rowLoadBoxY + 73} textAnchor="middle" fill="#000000" fontSize={12.5} fontWeight="bold" fontFamily="JetBrains Mono, monospace">
                                        P = {rcboPower.toFixed(2)} kW
                                      </text>
                                    </g>
                                  );
                                }
                                return (
                                  <g key={`p-empty-${cIdx}`}>
                                    <text x={px} y={rowMcbBoxY + 24} textAnchor="middle" fill="#475569" fontSize={12} fontWeight="bold" fontFamily="JetBrains Mono, monospace">
                                      Rezerva FI
                                    </text>
                                  </g>
                                );
                              }

                              const hasParentRcd = Boolean(pCol.parentRcd);
                              const topSourceY = hasParentRcd ? rowRcdBusY : rowBusY;
                              const isCircuitSelected =
                                selectedElement?.type === 'circuit' && selectedElement.id === c.id;
                              const nameLines = wrapTextLines(c.name, 19, 2);

                              return (
                                <g
                                  key={`p-circ-${c.id}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedElement({ type: 'circuit', id: c.id });
                                  }}
                                  className="cursor-pointer"
                                >
                                  <line
                                    x1={px}
                                    y1={topSourceY}
                                    x2={px}
                                    y2={rowMcbBoxY}
                                    stroke="#000000"
                                    strokeWidth={2.2}
                                  />
                                  <circle cx={px} cy={topSourceY} r={3.8} fill="#000000" />

                                  {(displayMode === 'multi-line' || displayMode === 'wiring-diagram') &&
                                    (c.poles === '3P' || c.poles === '4P') && (
                                      <>
                                        <line x1={px - 7} y1={topSourceY} x2={px - 7} y2={rowMcbBoxY} stroke="#000000" strokeWidth={1.6} />
                                        <line x1={px + 7} y1={topSourceY} x2={px + 7} y2={rowMcbBoxY} stroke="#000000" strokeWidth={1.6} />
                                      </>
                                    )}

                                  {/* MCB Label & Rating ABOVE Breaker Box (Large high-contrast text) */}
                                  <text
                                    x={px}
                                    y={rowMcbBoxY - 26}
                                    textAnchor="middle"
                                    fill="#000000"
                                    fontSize={15.5}
                                    fontWeight="bold"
                                    fontFamily="JetBrains Mono, monospace"
                                  >
                                    {c.label}
                                  </text>
                                  <text
                                    x={px}
                                    y={rowMcbBoxY - 8}
                                    textAnchor="middle"
                                    fill="#000000"
                                    fontSize={13}
                                    fontWeight="bold"
                                    fontFamily="JetBrains Mono, monospace"
                                  >
                                    {c.characteristic}
                                    {c.ratedCurrent}A ({c.poles})
                                  </text>

                                  {/* MCB Box (54 × 56) */}
                                  <rect
                                    x={px - 27}
                                    y={rowMcbBoxY}
                                    width={54}
                                    height={56}
                                    rx={4}
                                    fill={isCircuitSelected ? '#EFF6FF' : '#FFFFFF'}
                                    stroke={isCircuitSelected ? '#0066FF' : '#000000'}
                                    strokeWidth={isCircuitSelected ? 3 : 2}
                                  />
                                  <line x1={px} y1={rowMcbBoxY} x2={px} y2={rowMcbBoxY + 14} stroke="#000000" strokeWidth={1.8} />
                                  <line x1={px} y1={rowMcbBoxY + 42} x2={px} y2={rowMcbBoxY + 56} stroke="#000000" strokeWidth={1.8} />
                                  <line x1={px} y1={rowMcbBoxY + 42} x2={px - 10} y2={rowMcbBoxY + 17} stroke="#000000" strokeWidth={2.2} />
                                  <path
                                    d={`M ${px - 6} ${rowMcbBoxY + 27} L ${px - 1} ${rowMcbBoxY + 27} L ${px - 1} ${rowMcbBoxY + 33}`}
                                    fill="none"
                                    stroke="#000000"
                                    strokeWidth={1.5}
                                  />

                                  {/* Phase Badge */}
                                  <rect
                                    x={px + 31}
                                    y={rowMcbBoxY + 4}
                                    width={34}
                                    height={18}
                                    rx={3}
                                    fill="#F8FAFC"
                                    stroke="#000000"
                                    strokeWidth={1.3}
                                  />
                                  <text
                                    x={px + 48}
                                    y={rowMcbBoxY + 17}
                                    textAnchor="middle"
                                    fill="#000000"
                                    fontSize={11.5}
                                    fontWeight="bold"
                                    fontFamily="JetBrains Mono, monospace"
                                  >
                                    {c.phase === 'L1,L2,L3' ? '3F' : c.phase}
                                  </text>

                                  {/* Outgoing Wire(s) */}
                                  {displayMode === 'wiring-diagram' ? (
                                    <g>
                                      <line x1={px} y1={rowMcbBoxY + 56} x2={px} y2={rowLoadBoxY} stroke="#000000" strokeWidth={2} />
                                      <polyline
                                        points={`${px + 32},${hasParentRcd ? rowRcdBusY + 13 : rowBusY + 36} ${px + 32},${rowMcbBoxY + 62} ${px + 6},${rowMcbBoxY + 62} ${px + 6},${rowLoadBoxY}`}
                                        fill="none"
                                        stroke="#0369A1"
                                        strokeWidth={1.8}
                                      />
                                      <circle cx={px + 32} cy={hasParentRcd ? rowRcdBusY + 13 : rowBusY + 36} r={3} fill="#0369A1" />
                                      <polyline
                                        points={`${px + 38},${rowBusY + 48} ${px + 38},${rowMcbBoxY + 68} ${px + 12},${rowMcbBoxY + 68} ${px + 12},${rowLoadBoxY}`}
                                        fill="none"
                                        stroke="#15803D"
                                        strokeWidth={1.7}
                                        strokeDasharray="4 2"
                                      />
                                      <circle cx={px + 38} cy={rowBusY + 48} r={3} fill="#15803D" />
                                    </g>
                                  ) : (
                                    <g>
                                      <line x1={px} y1={rowMcbBoxY + 56} x2={px} y2={rowLoadBoxY} stroke="#000000" strokeWidth={2} />
                                      <line x1={px - 6} y1={rowMcbBoxY + 72} x2={px + 6} y2={rowMcbBoxY + 63} stroke="#000000" strokeWidth={1.8} />
                                      <text x={px + 10} y={rowMcbBoxY + 71} fill="#000000" fontSize={11.5} fontWeight="bold" fontFamily="JetBrains Mono, monospace">
                                        {c.poles === '3P' || c.poles === '4P' ? '5' : '3'}
                                      </text>
                                    </g>
                                  )}

                                  {/* Horizontal Cable Tag Pill (Easy to read when printed!) */}
                                  <rect
                                    x={px - 80}
                                    y={rowLoadBoxY - 46}
                                    width={160}
                                    height={36}
                                    rx={4}
                                    fill="#FFFFFF"
                                    stroke="#64748B"
                                    strokeWidth={1.2}
                                  />
                                  <text
                                    x={px}
                                    y={rowLoadBoxY - 31}
                                    textAnchor="middle"
                                    fill="#000000"
                                    fontSize={11.5}
                                    fontWeight="bold"
                                    fontFamily="JetBrains Mono, monospace"
                                  >
                                    {c.cable.length > 21 ? `${c.cable.slice(0, 20)}…` : c.cable}
                                  </text>
                                  <text
                                    x={px}
                                    y={rowLoadBoxY - 16}
                                    textAnchor="middle"
                                    fill="#1E293B"
                                    fontSize={11}
                                    fontWeight="bold"
                                    fontFamily="JetBrains Mono, monospace"
                                  >
                                    Dĺžka: {c.cableLengthM || 15} m
                                  </text>

                                  {/* Large Load Box */}
                                  <rect
                                    x={px - 84}
                                    y={rowLoadBoxY}
                                    width={168}
                                    height={82}
                                    rx={5}
                                    fill={isCircuitSelected ? '#EFF6FF' : '#FFFFFF'}
                                    stroke={isCircuitSelected ? '#0066FF' : '#000000'}
                                    strokeWidth={2}
                                  />
                                  <text
                                    x={px}
                                    y={rowLoadBoxY + 21}
                                    textAnchor="middle"
                                    fill="#000000"
                                    fontSize={13}
                                    fontWeight="bold"
                                    fontFamily="Plus Jakarta Sans, sans-serif"
                                  >
                                    {nameLines[0]}
                                  </text>
                                  {nameLines[1] && (
                                    <text
                                      x={px}
                                      y={rowLoadBoxY + 38}
                                      textAnchor="middle"
                                      fill="#000000"
                                      fontSize={12.5}
                                      fontWeight="bold"
                                      fontFamily="Plus Jakarta Sans, sans-serif"
                                    >
                                      {nameLines[1]}
                                    </text>
                                  )}
                                  <text
                                    x={px}
                                    y={rowLoadBoxY + (nameLines[1] ? 55 : 46)}
                                    textAnchor="middle"
                                    fill="#334155"
                                    fontSize={11}
                                    fontWeight="bold"
                                    fontFamily="Plus Jakarta Sans, sans-serif"
                                  >
                                    {c.category.length > 22 ? `${c.category.slice(0, 21)}…` : c.category}
                                  </text>
                                  <text
                                    x={px}
                                    y={rowLoadBoxY + 73}
                                    textAnchor="middle"
                                    fill="#000000"
                                    fontSize={12.5}
                                    fontWeight="bold"
                                    fontFamily="JetBrains Mono, monospace"
                                  >
                                    P = {c.powerKw.toFixed(2)} kW
                                  </text>
                                </g>
                              );
                            })}
                          </g>
                        );
                      })}
                    </g>
                  );
                })()}

                {/* Bottom Full-Width STN Title Block in Portrait Mode */}
                <g transform={`translate(28, ${canvasHeight - 102})`}>
                  <rect x={0} y={0} width={904} height={76} fill="#FFFFFF" stroke="#000000" strokeWidth={2} />
                  <line x1={0} y1={26} x2={904} y2={26} stroke="#000000" strokeWidth={1.3} />
                  <line x1={0} y1={51} x2={904} y2={51} stroke="#000000" strokeWidth={1.3} />
                  <line x1={590} y1={0} x2={590} y2={76} stroke="#000000" strokeWidth={1.3} />

                  <text x={12} y={18} fill="#000000" fontSize={12.5} fontWeight="bold" fontFamily="Inter, Plus Jakarta Sans, sans-serif">
                    NÁZOV: {project.name.length > 48 ? `${project.name.slice(0, 48)}…` : project.name}
                  </text>
                  <text x={604} y={18} fill="#000000" fontSize={12.5} fontWeight="bold" fontFamily="JetBrains Mono, monospace">
                    SÚSTAVA: {project.networkSystem} ({project.voltage})
                  </text>

                  <text x={12} y={43} fill="#0F172A" fontSize={12} fontWeight="bold" fontFamily="Inter, Plus Jakarta Sans, sans-serif">
                    Vypracoval:{' '}
                    {(project.designerName || 'Projekčná kancelária').length > 45
                      ? `${(project.designerName || 'Projekčná kancelária').slice(0, 45)}…`
                      : project.designerName || 'Projekčná kancelária'}
                  </text>
                  <text x={604} y={43} fill="#0F172A" fontSize={12} fontWeight="bold" fontFamily="JetBrains Mono, monospace">
                    Dátum: {project.projectDate}
                  </text>

                  <text x={12} y={68} fill="#1E293B" fontSize={12} fontWeight="bold" fontFamily="JetBrains Mono, monospace">
                    Norma: STN EN 61439-3 / STN 33 2000-4-41 • Formát A4 na výšku
                  </text>
                  <text x={604} y={68} fill="#000000" fontSize={12.5} fontWeight="bold" fontFamily="JetBrains Mono, monospace">
                    Č. zákazky: {project.projectNumber}
                  </text>
                </g>
              </>
            ) : (
              /* ================================================================= */
              /* LANDSCAPE MODE (NA ŠÍRKU) — ZVÄČŠENÉ ČITATEĽNÉ FONTY A KONTRAST    */
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
                      ? 'VIACPÓLOVÁ SCHÉMA ZAPOJENIA (3L)'
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

                {/* 4. RCD GROUPS (RCCB / RCBO) & SUB-BUSBARS */}
                {rcdGroups.map((group, gIdx) => {
                  const groupCols = columns.filter((col) => col.groupIndex === gIdx);
                  if (groupCols.length === 0) return null;

                  const firstX = groupCols[0].x;
                  const lastX = groupCols[groupCols.length - 1].x;
                  const rcdCenterX = firstX;
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
                      {displayMode === 'wiring-diagram' ? (
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
                        x={rcdCenterX - 32}
                        y={rcdBoxY}
                        width={64}
                        height={60}
                        rx={4}
                        fill={isSelected ? '#EFF6FF' : '#FFFFFF'}
                        stroke={isSelected ? '#0066FF' : '#000000'}
                        strokeWidth={isSelected ? 2.8 : 2}
                      />

                      <ellipse cx={rcdCenterX} cy={rcdBoxY + 35} rx={14} ry={6} fill="none" stroke="#000000" strokeWidth={1.7} />
                      <line x1={rcdCenterX} y1={rcdBoxY} x2={rcdCenterX} y2={rcdBoxY + 15} stroke="#000000" strokeWidth={1.7} />
                      <line x1={rcdCenterX} y1={rcdBoxY + 43} x2={rcdCenterX} y2={rcdBoxY + 60} stroke="#000000" strokeWidth={1.7} />
                      <line x1={rcdCenterX} y1={rcdBoxY + 43} x2={rcdCenterX - 9} y2={rcdBoxY + 17} stroke="#000000" strokeWidth={2} />
                      {rcd.deviceKind === 'RCBO' && (
                        <>
                          <line x1={rcdCenterX - 3.5} y1={rcdBoxY + 12} x2={rcdCenterX + 3.5} y2={rcdBoxY + 19} stroke="#000000" strokeWidth={1.7} />
                          <line x1={rcdCenterX + 3.5} y1={rcdBoxY + 12} x2={rcdCenterX - 3.5} y2={rcdBoxY + 19} stroke="#000000" strokeWidth={1.7} />
                        </>
                      )}

                      <rect x={rcdCenterX + 12} y={rcdBoxY + 8} width={14} height={12} rx={2} fill="#F8FAFC" stroke="#000000" strokeWidth={1.2} />
                      <text x={rcdCenterX + 19} y={rcdBoxY + 17.5} textAnchor="middle" fill="#000000" fontSize={9} fontWeight="bold" fontFamily="JetBrains Mono, monospace">
                        T
                      </text>

                      <text x={rcdCenterX - 38} y={rcdBoxY + 15} textAnchor="end" fill="#000000" fontSize={13} fontWeight="bold" fontFamily="JetBrains Mono, monospace">
                        {rcd.label}
                      </text>
                      <text x={rcdCenterX - 38} y={rcdBoxY + 30} textAnchor="end" fill="#000000" fontSize={11.5} fontWeight="bold" fontFamily="JetBrains Mono, monospace">
                        {rcd.deviceKind} {rcd.poles}
                      </text>
                      <text x={rcdCenterX - 38} y={rcdBoxY + 44} textAnchor="end" fill="#0F172A" fontSize={11} fontWeight="bold" fontFamily="JetBrains Mono, monospace">
                        {rcd.characteristic ? `${rcd.characteristic}` : ''}
                        {rcd.ratedCurrent}A/{rcd.sensitivity}mA
                      </text>
                      <text x={rcdCenterX - 38} y={rcdBoxY + 57} textAnchor="end" fill="#000000" fontSize={11} fontWeight="bold" fontFamily="JetBrains Mono, monospace">
                        Typ {rcd.type}
                      </text>

                      {group.circuits.length > 0 && (
                        <>
                          <line x1={rcdCenterX} y1={rcdBoxY + 60} x2={rcdCenterX} y2={rcdBusY} stroke="#000000" strokeWidth={2.2} />
                          <line x1={firstX} y1={rcdBusY} x2={lastX} y2={rcdBusY} stroke="#000000" strokeWidth={2.8} />
                          <line
                            x1={firstX}
                            y1={rcdBusY + 13}
                            x2={lastX + 32}
                            y2={rcdBusY + 13}
                            stroke="#0369A1"
                            strokeWidth={2.2}
                            strokeDasharray={displayMode === 'wiring-diagram' ? undefined : '4 2'}
                          />
                          <rect x={firstX - 2} y={rcdBusY - 25} width={Math.max(150, lastX - firstX + 64)} height={19} rx={3} fill="#EFF6FF" stroke="#0369A1" strokeWidth={1.2} />
                          <text x={firstX + 8} y={rcdBusY - 12} fill="#0369A1" fontSize={11} fontFamily="JetBrains Mono, monospace" fontWeight="bold">
                            {rcd.label} • N({rcd.label})
                          </text>
                        </>
                      )}
                    </g>
                  );
                })}

                {/* 5. FINAL CIRCUITS (MCBs) & STANDALONE RCBOs */}
                {columns.map((col, idx) => {
                  const x = col.x;
                  const c = col.circuit;

                  if (!c) {
                    if (col.rcboOnly) {
                      const rcbo = col.rcboOnly;
                      const rcboName = rcbo.circuitName || `Okruh ${rcbo.label}`;
                      const rcboLines = wrapTextLines(rcboName, 15, 2);
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
                          <line x1={x} y1={rcdBoxY + 60} x2={x} y2={loadBoxY} stroke="#000000" strokeWidth={2} />
                          {displayMode === 'wiring-diagram' && (
                            <>
                              <line x1={x + 4} y1={rcdBoxY + 60} x2={x + 4} y2={loadBoxY} stroke="#0369A1" strokeWidth={1.7} />
                              <line x1={x + 9} y1={busY_PE} x2={x + 9} y2={loadBoxY} stroke="#15803D" strokeWidth={1.6} strokeDasharray="4 2" />
                              <circle cx={x + 9} cy={busY_PE} r={2.8} fill="#15803D" />
                            </>
                          )}
                          <line x1={x - 6} y1={mcbBoxY + 72} x2={x + 6} y2={mcbBoxY + 63} stroke="#000000" strokeWidth={1.8} />
                          <text x={x + 10} y={mcbBoxY + 71} fill="#000000" fontSize={11} fontWeight="bold" fontFamily="JetBrains Mono, monospace">
                            {rcbo.poles === '4P' ? '5' : '3'}
                          </text>
                          <text
                            x={x - 10}
                            y={loadBoxY - 8}
                            fill="#0F172A"
                            fontSize={10.5}
                            fontWeight="bold"
                            fontFamily="JetBrains Mono, monospace"
                            transform={`rotate(-90, ${x - 10}, ${loadBoxY - 8})`}
                          >
                            {rcboCable} (15m)
                          </text>
                          <rect x={x - 56} y={loadBoxY} width={112} height={74} rx={4} fill="#FFFFFF" stroke="#000000" strokeWidth={1.8} />
                          <text x={x} y={loadBoxY + 19} textAnchor="middle" fill="#000000" fontSize={11.5} fontWeight="bold" fontFamily="Plus Jakarta Sans, sans-serif">
                            {rcboLines[0]}
                          </text>
                          {rcboLines[1] && (
                            <text x={x} y={loadBoxY + 34} textAnchor="middle" fill="#000000" fontSize={11} fontWeight="bold" fontFamily="Plus Jakarta Sans, sans-serif">
                              {rcboLines[1]}
                            </text>
                          )}
                          <text x={x} y={loadBoxY + 50} textAnchor="middle" fill="#1E293B" fontSize={10.5} fontWeight="bold" fontFamily="JetBrains Mono, monospace">
                            RCBO ({rcboPhase})
                          </text>
                          <text x={x} y={loadBoxY + 66} textAnchor="middle" fill="#000000" fontSize={11.5} fontWeight="bold" fontFamily="JetBrains Mono, monospace">
                            P = {rcboPower.toFixed(2)} kW
                          </text>
                        </g>
                      );
                    }

                    return (
                      <g key={`empty-${idx}`}>
                        <text x={x} y={mcbBoxY + 25} textAnchor="middle" fill="#475569" fontSize={11.5} fontWeight="bold" fontFamily="JetBrains Mono, monospace">
                          Rezerva FI
                        </text>
                      </g>
                    );
                  }

                  const hasParentRcd = Boolean(col.parentRcd);
                  const topSourceY = hasParentRcd ? rcdBusY : busY_L1;
                  const isCircuitSelected = selectedElement?.type === 'circuit' && selectedElement.id === c.id;
                  const nameLines = wrapTextLines(c.name, 15, 2);

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
                      <line x1={x} y1={topSourceY} x2={x} y2={mcbBoxY} stroke="#000000" strokeWidth={2} />
                      <circle cx={x} cy={topSourceY} r={3.5} fill="#000000" />

                      {(displayMode === 'multi-line' || displayMode === 'wiring-diagram') &&
                        (c.poles === '3P' || c.poles === '4P') && (
                          <>
                            <line x1={x - 6} y1={topSourceY} x2={x - 6} y2={mcbBoxY} stroke="#000000" strokeWidth={1.5} />
                            <line x1={x + 6} y1={topSourceY} x2={x + 6} y2={mcbBoxY} stroke="#000000" strokeWidth={1.5} />
                          </>
                        )}

                      <rect
                        x={x - 25}
                        y={mcbBoxY}
                        width={50}
                        height={54}
                        rx={4}
                        fill={isCircuitSelected ? '#EFF6FF' : '#FFFFFF'}
                        stroke={isCircuitSelected ? '#0066FF' : '#000000'}
                        strokeWidth={isCircuitSelected ? 2.8 : 1.9}
                      />
                      <line x1={x} y1={mcbBoxY} x2={x} y2={mcbBoxY + 13} stroke="#000000" strokeWidth={1.8} />
                      <line x1={x} y1={mcbBoxY + 41} x2={x} y2={mcbBoxY + 54} stroke="#000000" strokeWidth={1.8} />
                      <line x1={x} y1={mcbBoxY + 41} x2={x - 9} y2={mcbBoxY + 16} stroke="#000000" strokeWidth={2} />
                      <path
                        d={`M ${x - 5} ${mcbBoxY + 26} L ${x - 1} ${mcbBoxY + 26} L ${x - 1} ${mcbBoxY + 31}`}
                        fill="none"
                        stroke="#000000"
                        strokeWidth={1.4}
                      />

                      <text x={x} y={mcbBoxY - 24} textAnchor="middle" fill="#000000" fontSize={13.5} fontWeight="bold" fontFamily="JetBrains Mono, monospace">
                        {c.label}
                      </text>
                      <text x={x} y={mcbBoxY - 7} textAnchor="middle" fill="#000000" fontSize={11.5} fontWeight="bold" fontFamily="JetBrains Mono, monospace">
                        {c.characteristic}
                        {c.ratedCurrent}A ({c.poles})
                      </text>

                      <rect x={x + 16} y={mcbBoxY + 4} width={c.phase === 'L1,L2,L3' ? 30 : 24} height={16} rx={2} fill="#F8FAFC" stroke="#000000" strokeWidth={1.2} />
                      <text x={x + (c.phase === 'L1,L2,L3' ? 31 : 28)} y={mcbBoxY + 15} textAnchor="middle" fill="#000000" fontSize={10} fontWeight="bold" fontFamily="JetBrains Mono, monospace">
                        {c.phase === 'L1,L2,L3' ? '3F' : c.phase}
                      </text>

                      {displayMode === 'wiring-diagram' ? (
                        <g>
                          <line x1={x} y1={mcbBoxY + 54} x2={x} y2={loadBoxY} stroke="#000000" strokeWidth={1.8} />
                          <polyline
                            points={`${x + 28},${hasParentRcd ? rcdBusY + 13 : busY_N} ${x + 28},${mcbBoxY + 60} ${x + 5},${mcbBoxY + 60} ${x + 5},${loadBoxY}`}
                            fill="none"
                            stroke="#0369A1"
                            strokeWidth={1.7}
                          />
                          <circle cx={x + 28} cy={hasParentRcd ? rcdBusY + 13 : busY_N} r={2.8} fill="#0369A1" />
                          <polyline
                            points={`${x + 34},${busY_PE} ${x + 34},${mcbBoxY + 66} ${x + 10},${mcbBoxY + 66} ${x + 10},${loadBoxY}`}
                            fill="none"
                            stroke="#15803D"
                            strokeWidth={1.6}
                            strokeDasharray="4 2"
                          />
                          <circle cx={x + 34} cy={busY_PE} r={2.8} fill="#15803D" />
                        </g>
                      ) : (
                        <g>
                          <line x1={x} y1={mcbBoxY + 54} x2={x} y2={loadBoxY} stroke="#000000" strokeWidth={1.8} />
                          <line x1={x - 5} y1={mcbBoxY + 72} x2={x + 5} y2={mcbBoxY + 63} stroke="#000000" strokeWidth={1.8} />
                          <text x={x + 9} y={mcbBoxY + 71} fill="#000000" fontSize={11} fontWeight="bold" fontFamily="JetBrains Mono, monospace">
                            {c.poles === '3P' || c.poles === '4P' ? '5' : '3'}
                          </text>
                        </g>
                      )}

                      <text
                        x={x - 10}
                        y={loadBoxY - 8}
                        fill="#0F172A"
                        fontSize={10.5}
                        fontWeight="bold"
                        fontFamily="JetBrains Mono, monospace"
                        transform={`rotate(-90, ${x - 10}, ${loadBoxY - 8})`}
                      >
                        {c.cable} ({c.cableLengthM || 15}m)
                      </text>

                      <rect
                        x={x - 56}
                        y={loadBoxY}
                        width={112}
                        height={74}
                        rx={4}
                        fill={isCircuitSelected ? '#EFF6FF' : '#FFFFFF'}
                        stroke={isCircuitSelected ? '#0066FF' : '#000000'}
                        strokeWidth={1.8}
                      />
                      <text x={x} y={loadBoxY + 19} textAnchor="middle" fill="#000000" fontSize={11.5} fontWeight="bold" fontFamily="Plus Jakarta Sans, sans-serif">
                        {nameLines[0]}
                      </text>
                      {nameLines[1] && (
                        <text x={x} y={loadBoxY + 34} textAnchor="middle" fill="#000000" fontSize={11} fontWeight="bold" fontFamily="Plus Jakarta Sans, sans-serif">
                          {nameLines[1]}
                        </text>
                      )}
                      <text x={x} y={loadBoxY + 50} textAnchor="middle" fill="#334155" fontSize={10} fontWeight="bold" fontFamily="Plus Jakarta Sans, sans-serif">
                        {c.category.length > 16 ? `${c.category.slice(0, 15)}…` : c.category}
                      </text>
                      <text x={x} y={loadBoxY + 66} textAnchor="middle" fill="#000000" fontSize={11.5} fontWeight="bold" fontFamily="JetBrains Mono, monospace">
                        P = {c.powerKw.toFixed(2)} kW
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
