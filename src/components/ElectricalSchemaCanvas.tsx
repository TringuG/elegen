import React, { useState, useRef } from 'react';
import {
  SwitchboardProject,
  SchemaDisplayMode,
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
} from 'lucide-react';

interface Props {
  project: SwitchboardProject;
  displayMode: SchemaDisplayMode;
  onDisplayModeChange: (mode: SchemaDisplayMode) => void;
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

export const ElectricalSchemaCanvas: React.FC<Props> = ({
  project,
  displayMode,
  onDisplayModeChange,
  onProjectChange,
  compactMode = false,
}) => {
  const [zoom, setZoom] = useState<number>(compactMode ? 0.82 : 1);
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

  // Calculate horizontal positions for every final column
  const colSpacing =
    displayMode === 'wiring-diagram' ? 148 : displayMode === 'multi-line' ? 132 : 112;
  const leftMargin = 205;

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
    currentX += 38;
  });

  directCircuits.forEach((c) => {
    columns.push({
      circuit: c,
      x: currentX,
      groupIndex: -1,
    });
    currentX += colSpacing;
  });

  const canvasWidth = Math.max(1260, currentX + 140);
  const canvasHeight = displayMode === 'wiring-diagram' ? 1010 : 940;

  // Busbar Y coordinates shifted to give generous space to QF0 -> Elektromer -> Prívod -> QS1/QF1
  const busY_L1 = 278;
  const busY_L2 = 296;
  const busY_L3 = 314;
  const busY_N = 335;
  const busY_PE = 355;

  const rcdBoxY = 408;
  const rcdBusY = 520;
  const mcbBoxY = 582;
  const cableStartY = 675;
  const loadBoxY = 760;

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
    setAutoRouteStatus('Generujem čistý PDF výkres (elektrická schéma + rozpis ističov a okruhov)...');
    try {
      await exportCleanSchemaToPdf(project, {
        svgElement: svgRef.current,
        displayMode,
        paperFormat: 'A3',
      });
      setAutoRouteStatus(
        'PDF výkres (čisto schéma + popis ktorý okruh je na ktorom ističi) bol úspešne stiahnutý.'
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
      {/* Top Canvas Toolbar — Hidden in print and in compactMode */}
      {!compactMode && (
        <div className="no-print print:hidden flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-[#0F172A] border-b border-slate-800">
          <div className="flex flex-wrap items-center gap-2">
            {/* 1L / 3L / Wiring Diagram Toggle */}
            <div className="inline-flex rounded-xl bg-[#0B1120] p-1 border border-slate-800">
              <button
                type="button"
                onClick={() => onDisplayModeChange('single-line')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  displayMode === 'single-line'
                    ? 'bg-[#0066FF] text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <GitCommit className="w-3.5 h-3.5" />
                Jednopólová (1L)
              </button>
              <button
                type="button"
                onClick={() => onDisplayModeChange('multi-line')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  displayMode === 'multi-line'
                    ? 'bg-[#0066FF] text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                Viacpólová (3L)
              </button>
              <button
                type="button"
                onClick={() => onDisplayModeChange('wiring-diagram')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  displayMode === 'wiring-diagram'
                    ? 'bg-[#0066FF] text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Cable className="w-3.5 h-3.5" />
                Detailné zapojenie (Vodiče)
              </button>
            </div>

            {onProjectChange && (
              <div className="flex items-center gap-1.5 pl-1 border-l border-slate-800">
                <button
                  type="button"
                  onClick={handleAddQuickCircuit}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#1E293B] hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold transition-colors cursor-pointer"
                  title="Pridať nový vývodový okruh priamo do schémy"
                >
                  <Plus className="w-3.5 h-3.5 text-[#38BDF8]" />
                  + Okruh (FA)
                </button>
                <button
                  type="button"
                  onClick={handleAddQuickRcd}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#1E293B] hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold transition-colors cursor-pointer"
                  title="Pridať prúdový chránič priamo do schémy"
                >
                  <Plus className="w-3.5 h-3.5 text-[#38BDF8]" />
                  + Chránič (FI)
                </button>
                <button
                  type="button"
                  onClick={handleAutoAlignAndRoute}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#0066FF]/20 hover:bg-[#0066FF]/30 text-[#38BDF8] border border-[#0066FF]/40 text-xs font-bold transition-colors cursor-pointer"
                  title="Automaticky zarovnať stĺpce, prepojiť zbernice a prečíslovať FA1..FAn"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Auto-zarovnať &amp; spojiť
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <div className="flex items-center bg-[#0B1120] rounded-lg border border-slate-800 p-0.5">
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(0.45, +(z - 0.15).toFixed(2)))}
                className="p-1.5 text-slate-400 hover:text-white transition-colors cursor-pointer"
                title="Oddialiť"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <span className="px-2 text-xs font-mono text-slate-300 tabular-nums">
                {Math.round(zoom * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(2.2, +(z + 0.15).toFixed(2)))}
                className="p-1.5 text-slate-400 hover:text-white transition-colors cursor-pointer"
                title="Priblížiť"
              >
                <ZoomIn className="w-4 h-4" />
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
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#1E293B] hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold transition-colors cursor-pointer"
              title="Stiahnuť čisto schému ako vektorový súbor SVG"
            >
              <Download className="w-3.5 h-3.5 text-[#38BDF8]" />
              SVG
            </button>

            <button
              type="button"
              onClick={handleExportPng}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#1E293B] hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold transition-colors cursor-pointer"
              title="Stiahnuť čisto schému + rozpis ističov ako obrázok PNG"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              PNG
            </button>

            <button
              type="button"
              onClick={handleExportPdf}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#0066FF] hover:bg-[#2563EB] text-white text-xs font-bold shadow-sm transition-colors cursor-pointer"
              title="Stiahnuť čistý PDF súbor (elektrická schéma + tabuľka ktorý okruh je na ktorom ističi)"
            >
              <Download className="w-3.5 h-3.5" />
              Export PDF (Schéma + Ističe)
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#1E293B] hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold transition-colors cursor-pointer"
              title="Vytlačiť na tlačiarni"
            >
              <Printer className="w-3.5 h-3.5 text-slate-300" />
              Tlač
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

            {/* Outer Technical Drawing Frame (STN EN ISO 5457 style - Black & White CAD) */}
            <rect
              x={12}
              y={12}
              width={canvasWidth - 24}
              height={canvasHeight - 24}
              fill="none"
              stroke="#0F172A"
              strokeWidth={1.75}
            />
            <rect
              x={18}
              y={18}
              width={canvasWidth - 36}
              height={canvasHeight - 36}
              fill="none"
              stroke="#475569"
              strokeWidth={0.9}
            />

            {/* Top Header Banner inside Schema */}
            <g transform="translate(28, 28)">
              <text
                x={0}
                y={16}
                fill="#0F172A"
                fontSize={14}
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
                y={34}
                fill="#334155"
                fontSize={11}
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

            {/* 1. COMPLETE VERTICAL INCOMING CHAIN (SECTION 1.C):
                PRÍVOD ELEKTRICKEJ ENERGIE
                ↓
                HLAVNÝ ISTIČ PRED ELEKTROMEROM QF0
                ↓
                ELEKTROMER (kWh)
                ↓
                PRÍVOD DO BYTOVÉHO ROZVÁDZAČA
                ↓
                HLAVNÝ VYPÍNAČ ALEBO ISTIČ V ROZVÁDZAČI QS1/QF1 */}
            <g transform="translate(118, 66)">
              {/* Step 1: PRÍVOD ELEKTRICKEJ ENERGIE */}
              <line x1={0} y1={0} x2={0} y2={20} stroke="#0F172A" strokeWidth={2.2} />
              <line x1={-6} y1={7} x2={6} y2={13} stroke="#0F172A" strokeWidth={1.5} />
              <text
                x={14}
                y={10}
                fill="#0F172A"
                fontSize={9.5}
                fontFamily="JetBrains Mono, monospace"
                fontWeight="bold"
              >
                PRÍVOD ELEKTRICKEJ ENERGIE ({project.networkSystem} • {project.voltage})
              </text>

              {/* Step 2: HLAVNÝ ISTIČ PRED ELEKTROMEROM QF0 */}
              <g
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedElement({ type: 'main' });
                }}
                className="cursor-pointer"
              >
                <rect
                  x={-34}
                  y={20}
                  width={68}
                  height={44}
                  rx={4}
                  fill={selectedElement?.type === 'main' ? '#EFF6FF' : '#FFFFFF'}
                  stroke={selectedElement?.type === 'main' ? '#0066FF' : '#0F172A'}
                  strokeWidth={selectedElement?.type === 'main' ? 2.5 : 1.75}
                  strokeDasharray="4 2"
                />
                {upstreamBreaker.enabled ? (
                  <>
                    <line x1={0} y1={20} x2={0} y2={30} stroke="#0F172A" strokeWidth={1.75} />
                    <line x1={0} y1={54} x2={0} y2={64} stroke="#0F172A" strokeWidth={1.75} />
                    <line x1={0} y1={54} x2={-10} y2={33} stroke="#0F172A" strokeWidth={2} />
                    {/* IEC Circuit Breaker Cross 'x' */}
                    <line x1={-4} y1={28} x2={4} y2={34} stroke="#0F172A" strokeWidth={1.5} />
                    <line x1={-4} y1={34} x2={4} y2={28} stroke="#0F172A" strokeWidth={1.5} />
                    <text
                      x={40}
                      y={33}
                      fill="#0F172A"
                      fontSize={10.5}
                      fontWeight="bold"
                      fontFamily="JetBrains Mono, monospace"
                    >
                      {upstreamBreaker.designation} – HLAVNÝ ISTIČ ({upstreamBreaker.placement.toUpperCase()})
                    </text>
                    <text
                      x={40}
                      y={46}
                      fill="#334155"
                      fontSize={10}
                      fontFamily="JetBrains Mono, monospace"
                      fontWeight="bold"
                    >
                      {upstreamBreaker.poles} {upstreamBreaker.characteristic}
                      {upstreamBreaker.ratedCurrent}A / {upstreamBreaker.breakingCapacity} ({upstreamBreaker.manufacturer} {upstreamBreaker.model})
                    </text>
                  </>
                ) : (
                  <>
                    <line x1={0} y1={20} x2={0} y2={64} stroke="#64748B" strokeWidth={1.75} strokeDasharray="3 3" />
                    <text
                      x={40}
                      y={44}
                      fill="#64748B"
                      fontSize={9.5}
                      fontFamily="JetBrains Mono, monospace"
                    >
                      {upstreamBreaker.designation} – Hlavný istič pred elektromerom (vypnutý)
                    </text>
                  </>
                )}
              </g>

              {/* Step 3: ELEKTROMER (kWh) */}
              <line x1={0} y1={64} x2={0} y2={78} stroke="#0F172A" strokeWidth={2} />
              {electricityMeter.enabled ? (
                <g>
                  <rect
                    x={-26}
                    y={78}
                    width={52}
                    height={34}
                    rx={4}
                    fill="#FFFFFF"
                    stroke="#0F172A"
                    strokeWidth={1.5}
                    strokeDasharray="3 2"
                  />
                  <circle cx={0} cy={95} r={11} fill="#F8FAFC" stroke="#0F172A" strokeWidth={1.3} />
                  <text
                    x={0}
                    y={98.5}
                    textAnchor="middle"
                    fill="#0F172A"
                    fontSize={8.5}
                    fontWeight="bold"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    kWh
                  </text>
                  <text
                    x={34}
                    y={92}
                    fill="#0F172A"
                    fontSize={10}
                    fontWeight="bold"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    ELEKTROMER ({electricityMeter.type})
                  </text>
                  <text
                    x={34}
                    y={104}
                    fill="#475569"
                    fontSize={9}
                    fontFamily="JetBrains Mono, monospace"
                  >
                    {electricityMeter.location} • {electricityMeter.tariff}
                  </text>
                </g>
              ) : (
                <line x1={0} y1={78} x2={0} y2={112} stroke="#0F172A" strokeWidth={2} />
              )}

              {/* Step 4: PRÍVOD DO BYTOVÉHO ROZVÁDZAČA */}
              <line x1={0} y1={112} x2={0} y2={134} stroke="#0F172A" strokeWidth={2.2} />
              <line x1={-6} y1={120} x2={6} y2={125} stroke="#0F172A" strokeWidth={1.4} />
              <text
                x={14}
                y={126}
                fill="#0F172A"
                fontSize={9.5}
                fontWeight="bold"
                fontFamily="JetBrains Mono, monospace"
              >
                PRÍVOD DO BYTOVÉHO ROZVÁDZAČA ({project.supplyCable})
              </text>

              {/* Step 5: HLAVNÝ VYPÍNAČ ALEBO ISTIČ V ROZVÁDZAČI (QS1 / QF1) */}
              <g
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedElement({ type: 'internal-main' });
                }}
                className="cursor-pointer"
              >
                <rect
                  x={-34}
                  y={134}
                  width={68}
                  height={48}
                  rx={4}
                  fill={selectedElement?.type === 'internal-main' ? '#EFF6FF' : '#FFFFFF'}
                  stroke={selectedElement?.type === 'internal-main' ? '#0066FF' : '#0F172A'}
                  strokeWidth={selectedElement?.type === 'internal-main' ? 2.5 : 1.75}
                />

                {internalDevice.enabled ? (
                  <>
                    <line x1={0} y1={134} x2={0} y2={145} stroke="#0F172A" strokeWidth={1.75} />
                    <line x1={0} y1={170} x2={0} y2={182} stroke="#0F172A" strokeWidth={1.75} />
                    <line
                      x1={0}
                      y1={170}
                      x2={-10}
                      y2={148}
                      stroke="#0F172A"
                      strokeWidth={2}
                    />
                    {isInternalBreaker ? (
                      <>
                        {/* IEC Circuit Breaker Cross 'x' ONLY when device is Istič or hasOvercurrentProtection */}
                        <line x1={-4} y1={143} x2={4} y2={149} stroke="#0F172A" strokeWidth={1.5} />
                        <line x1={-4} y1={149} x2={4} y2={143} stroke="#0F172A" strokeWidth={1.5} />
                      </>
                    ) : (
                      <>
                        {/* IEC Switch-Disconnector Isolating Bar (NO breaker cross!) */}
                        <line x1={-5} y1={145} x2={5} y2={145} stroke="#0F172A" strokeWidth={2} />
                        <circle cx={0} cy={170} r={2.2} fill="#0F172A" />
                      </>
                    )}
                    <text
                      x={40}
                      y={149}
                      fill="#0F172A"
                      fontSize={10.5}
                      fontWeight="bold"
                      fontFamily="JetBrains Mono, monospace"
                    >
                      {internalDevice.designation} – {internalDevice.deviceType.toUpperCase()} V ROZVÁDZAČI
                    </text>
                    <text
                      x={40}
                      y={162}
                      fill="#334155"
                      fontSize={10}
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
                      x={40}
                      y={174}
                      fill="#475569"
                      fontSize={9}
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
                    <line x1={0} y1={134} x2={0} y2={182} stroke="#0F172A" strokeWidth={2} />
                    <text
                      x={40}
                      y={160}
                      fill="#64748B"
                      fontSize={9.5}
                      fontFamily="JetBrains Mono, monospace"
                    >
                      Priame napojenie zberníc (bez samostatného hl. prvku v rozvádzači)
                    </text>
                  </>
                )}
              </g>

              <line
                x1={0}
                y1={182}
                x2={0}
                y2={busY_L1 - 66}
                stroke="#0F172A"
                strokeWidth={2.5}
              />
              <circle cx={0} cy={busY_L1 - 66} r={4} fill="#0F172A" />
            </g>

            {/* PEN Split Point visualization for TN-C-S (Green PE + Blue N) */}
            {(project.networkSystem === 'TN-C-S' || displayMode === 'wiring-diagram') && (
              <g transform="translate(20, 212)">
                <rect
                  x={0}
                  y={0}
                  width={72}
                  height={42}
                  rx={4}
                  fill="#F0FDF4"
                  stroke="#16A34A"
                  strokeWidth={1.5}
                />
                <text
                  x={36}
                  y={15}
                  textAnchor="middle"
                  fill="#15803D"
                  fontSize={9}
                  fontWeight="bold"
                  fontFamily="JetBrains Mono, monospace"
                >
                  {project.networkSystem === 'TN-C-S' ? 'BOD ROZDELENIA' : 'UZOL PE / N'}
                </text>
                <text
                  x={36}
                  y={27}
                  textAnchor="middle"
                  fill="#0F172A"
                  fontSize={8.5}
                  fontWeight="bold"
                  fontFamily="JetBrains Mono, monospace"
                >
                  {project.networkSystem === 'TN-C-S'
                    ? 'PEN → PE + N'
                    : `Sústava ${project.networkSystem}`}
                </text>
                <text
                  x={36}
                  y={37}
                  textAnchor="middle"
                  fill="#0284C7"
                  fontSize={8}
                  fontWeight="bold"
                  fontFamily="JetBrains Mono, monospace"
                >
                  HOP (MET) ≤ 10 Ω
                </text>
              </g>
            )}

            {/* 2. SURGE PROTECTOR (SPD - FV1) IF INSTALLED */}
            {mainBreaker.hasSurgeProtector && (
              <g
                transform="translate(565, 160)"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedElement({ type: 'spd' });
                }}
                className="cursor-pointer"
              >
                <line
                  x1={0}
                  y1={busY_L1 - 160}
                  x2={0}
                  y2={48}
                  stroke="#0F172A"
                  strokeWidth={1.75}
                />
                <circle cx={0} cy={busY_L1 - 160} r={3.5} fill="#0F172A" />
                <rect
                  x={-26}
                  y={10}
                  width={52}
                  height={38}
                  rx={3}
                  fill="#FFFFFF"
                  stroke="#0F172A"
                  strokeWidth={1.5}
                />
                <polygon points="-5,22 5,22 0,34" fill="#0F172A" />
                <line x1={-7} y1={34} x2={7} y2={34} stroke="#0F172A" strokeWidth={1.5} />
                <text
                  x={32}
                  y={24}
                  fill="#0F172A"
                  fontSize={10}
                  fontWeight="bold"
                  fontFamily="JetBrains Mono, monospace"
                >
                  FV1 – PREPÄŤOVÁ OCHRANA ({mainBreaker.surgeProtectorType})
                </text>
                <text
                  x={32}
                  y={36}
                  fill="#475569"
                  fontSize={9.5}
                  fontFamily="JetBrains Mono, monospace"
                >
                  {mainBreaker.manufacturer} SPD
                </text>
                {/* Green PE Earthing Symbol */}
                <line x1={0} y1={10} x2={0} y2={-4} stroke="#16A34A" strokeWidth={1.6} />
                <line x1={-8} y1={-4} x2={8} y2={-4} stroke="#16A34A" strokeWidth={1.6} />
                <line x1={-5} y1={-8} x2={5} y2={-8} stroke="#16A34A" strokeWidth={1.6} />
                <line x1={-2} y1={-12} x2={2} y2={-12} stroke="#16A34A" strokeWidth={1.6} />
              </g>
            )}

            {/* 3. MAIN HORIZONTAL BUSBARS (L1, L2, L3 = Black, N = Blue, PE = Green) */}
            {displayMode === 'single-line' ? (
              <g>
                <line
                  x1={75}
                  y1={busY_L1}
                  x2={canvasWidth - 65}
                  y2={busY_L1}
                  stroke="#0F172A"
                  strokeWidth={3}
                />
                <text
                  x={28}
                  y={busY_L1 - 8}
                  fill="#0F172A"
                  fontSize={10.5}
                  fontWeight="bold"
                  fontFamily="JetBrains Mono, monospace"
                >
                  {isThreePhase ? '3L+N+PE' : 'L+N+PE'}
                </text>
              </g>
            ) : (
              <g>
                <line
                  x1={75}
                  y1={busY_L1}
                  x2={canvasWidth - 65}
                  y2={busY_L1}
                  stroke="#0F172A"
                  strokeWidth={2}
                />
                <text
                  x={28}
                  y={busY_L1 + 4}
                  fill="#0F172A"
                  fontSize={10}
                  fontWeight="bold"
                  fontFamily="JetBrains Mono, monospace"
                >
                  L1
                </text>

                {isThreePhase && (
                  <>
                    <line
                      x1={75}
                      y1={busY_L2}
                      x2={canvasWidth - 65}
                      y2={busY_L2}
                      stroke="#0F172A"
                      strokeWidth={2}
                    />
                    <text
                      x={28}
                      y={busY_L2 + 4}
                      fill="#0F172A"
                      fontSize={10}
                      fontWeight="bold"
                      fontFamily="JetBrains Mono, monospace"
                    >
                      L2
                    </text>

                    <line
                      x1={75}
                      y1={busY_L3}
                      x2={canvasWidth - 65}
                      y2={busY_L3}
                      stroke="#0F172A"
                      strokeWidth={2}
                    />
                    <text
                      x={28}
                      y={busY_L3 + 4}
                      fill="#0F172A"
                      fontSize={10}
                      fontWeight="bold"
                      fontFamily="JetBrains Mono, monospace"
                    >
                      L3
                    </text>
                  </>
                )}

                {project.networkSystem !== 'TN-C' && (
                  <>
                    <line
                      x1={75}
                      y1={busY_N}
                      x2={canvasWidth - 65}
                      y2={busY_N}
                      stroke="#0284C7"
                      strokeWidth={2.2}
                    />
                    <text
                      x={28}
                      y={busY_N + 4}
                      fill="#0284C7"
                      fontSize={10}
                      fontWeight="bold"
                      fontFamily="JetBrains Mono, monospace"
                    >
                      N (modrý)
                    </text>
                  </>
                )}

                <line
                  x1={75}
                  y1={busY_PE}
                  x2={canvasWidth - 65}
                  y2={busY_PE}
                  stroke="#16A34A"
                  strokeWidth={2.2}
                  strokeDasharray="6 3"
                />
                <text
                  x={28}
                  y={busY_PE + 4}
                  fill="#15803D"
                  fontSize={10}
                  fontWeight="bold"
                  fontFamily="JetBrains Mono, monospace"
                >
                  {project.networkSystem === 'TN-C' ? 'PEN (ZŽ)' : 'PE (ZŽ)'}
                </text>
              </g>
            )}

            {/* 4. RCD GROUPS (RCCB / RCBO) & SUB-BUSBARS + N(FIx) BARS */}
            {rcdGroups.map((group, gIdx) => {
              const groupCols = columns.filter((col) => col.groupIndex === gIdx);
              if (groupCols.length === 0) return null;

              const firstX = groupCols[0].x;
              const lastX = groupCols[groupCols.length - 1].x;
              const rcdCenterX = firstX;
              const rcd = group.rcd;
              const isSelected =
                selectedElement?.type === 'rcd' && selectedElement.id === rcd.id;

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
                      <line
                        x1={rcdCenterX - 8}
                        y1={busY_L1}
                        x2={rcdCenterX - 8}
                        y2={rcdBoxY}
                        stroke="#0F172A"
                        strokeWidth={1.6}
                      />
                      <circle cx={rcdCenterX - 8} cy={busY_L1} r={3} fill="#0F172A" />
                      {rcd.poles === '4P' && isThreePhase && (
                        <>
                          <line
                            x1={rcdCenterX - 3}
                            y1={busY_L2}
                            x2={rcdCenterX - 3}
                            y2={rcdBoxY}
                            stroke="#0F172A"
                            strokeWidth={1.6}
                          />
                          <circle cx={rcdCenterX - 3} cy={busY_L2} r={3} fill="#0F172A" />
                          <line
                            x1={rcdCenterX + 3}
                            y1={busY_L3}
                            x2={rcdCenterX + 3}
                            y2={rcdBoxY}
                            stroke="#0F172A"
                            strokeWidth={1.6}
                          />
                          <circle cx={rcdCenterX + 3} cy={busY_L3} r={3} fill="#0F172A" />
                        </>
                      )}
                      {project.networkSystem !== 'TN-C' && (
                        <>
                          <line
                            x1={rcdCenterX + 8}
                            y1={busY_N}
                            x2={rcdCenterX + 8}
                            y2={rcdBoxY}
                            stroke="#0284C7"
                            strokeWidth={1.6}
                          />
                          <circle cx={rcdCenterX + 8} cy={busY_N} r={3} fill="#0284C7" />
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      <line
                        x1={rcdCenterX}
                        y1={busY_L1}
                        x2={rcdCenterX}
                        y2={rcdBoxY}
                        stroke="#0F172A"
                        strokeWidth={2}
                      />
                      <circle cx={rcdCenterX} cy={busY_L1} r={3.5} fill="#0F172A" />
                    </>
                  )}

                  <rect
                    x={rcdCenterX - 32}
                    y={rcdBoxY}
                    width={64}
                    height={58}
                    rx={4}
                    fill={isSelected ? '#EFF6FF' : '#FFFFFF'}
                    stroke={isSelected ? '#0066FF' : '#0F172A'}
                    strokeWidth={isSelected ? 2.5 : 1.75}
                  />

                  <ellipse
                    cx={rcdCenterX}
                    cy={rcdBoxY + 34}
                    rx={14}
                    ry={6}
                    fill="none"
                    stroke="#0F172A"
                    strokeWidth={1.5}
                  />
                  <line
                    x1={rcdCenterX}
                    y1={rcdBoxY}
                    x2={rcdCenterX}
                    y2={rcdBoxY + 14}
                    stroke="#0F172A"
                    strokeWidth={1.5}
                  />
                  <line
                    x1={rcdCenterX}
                    y1={rcdBoxY + 42}
                    x2={rcdCenterX}
                    y2={rcdBoxY + 58}
                    stroke="#0F172A"
                    strokeWidth={1.5}
                  />
                  <line
                    x1={rcdCenterX}
                    y1={rcdBoxY + 42}
                    x2={rcdCenterX - 9}
                    y2={rcdBoxY + 16}
                    stroke="#0F172A"
                    strokeWidth={1.75}
                  />
                  {rcd.deviceKind === 'RCBO' && (
                    <>
                      <line
                        x1={rcdCenterX - 3.5}
                        y1={rcdBoxY + 11.5}
                        x2={rcdCenterX + 3.5}
                        y2={rcdBoxY + 18.5}
                        stroke="#0F172A"
                        strokeWidth={1.5}
                      />
                      <line
                        x1={rcdCenterX + 3.5}
                        y1={rcdBoxY + 11.5}
                        x2={rcdCenterX - 3.5}
                        y2={rcdBoxY + 18.5}
                        stroke="#0F172A"
                        strokeWidth={1.5}
                      />
                    </>
                  )}

                  <rect
                    x={rcdCenterX + 12}
                    y={rcdBoxY + 8}
                    width={13}
                    height={11}
                    rx={2}
                    fill="#F8FAFC"
                    stroke="#0F172A"
                    strokeWidth={1}
                  />
                  <text
                    x={rcdCenterX + 18.5}
                    y={rcdBoxY + 16.5}
                    textAnchor="middle"
                    fill="#0F172A"
                    fontSize={8}
                    fontWeight="bold"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    T
                  </text>

                  <text
                    x={rcdCenterX - 36}
                    y={rcdBoxY + 14}
                    textAnchor="end"
                    fill="#0F172A"
                    fontSize={11}
                    fontWeight="bold"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    {rcd.label}
                  </text>
                  <text
                    x={rcdCenterX - 36}
                    y={rcdBoxY + 27}
                    textAnchor="end"
                    fill="#0F172A"
                    fontSize={9.5}
                    fontWeight="bold"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    {rcd.deviceKind} {rcd.poles}
                  </text>
                  <text
                    x={rcdCenterX - 36}
                    y={rcdBoxY + 39}
                    textAnchor="end"
                    fill="#334155"
                    fontSize={9}
                    fontFamily="JetBrains Mono, monospace"
                  >
                    {rcd.characteristic ? `${rcd.characteristic}` : ''}
                    {rcd.ratedCurrent}A/{rcd.sensitivity}mA
                  </text>
                  <text
                    x={rcdCenterX - 36}
                    y={rcdBoxY + 51}
                    textAnchor="end"
                    fill="#0F172A"
                    fontSize={9}
                    fontWeight="bold"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    Typ {rcd.type}
                  </text>

                  {group.circuits.length > 0 && (
                    <>
                      {/* Phase sub-busbar from RCD (Black) */}
                      <line
                        x1={rcdCenterX}
                        y1={rcdBoxY + 58}
                        x2={rcdCenterX}
                        y2={rcdBusY}
                        stroke="#0F172A"
                        strokeWidth={2}
                      />

                      <line
                        x1={firstX}
                        y1={rcdBusY}
                        x2={lastX}
                        y2={rcdBusY}
                        stroke="#0F172A"
                        strokeWidth={2.5}
                      />
                      {/* Neutral sub-busbar N(FIx) (Blue) */}
                      <line
                        x1={firstX}
                        y1={rcdBusY + 12}
                        x2={lastX + 30}
                        y2={rcdBusY + 12}
                        stroke="#0284C7"
                        strokeWidth={2}
                        strokeDasharray={displayMode === 'wiring-diagram' ? undefined : '4 2'}
                      />
                      <rect
                        x={firstX - 2}
                        y={rcdBusY - 22}
                        width={Math.max(115, lastX - firstX + 56)}
                        height={16}
                        rx={3}
                        fill="#EFF6FF"
                        stroke="#0284C7"
                        strokeWidth={1}
                      />
                      <text
                        x={firstX + 6}
                        y={rcdBusY - 11}
                        fill="#0284C7"
                        fontSize={9}
                        fontFamily="JetBrains Mono, monospace"
                        fontWeight="bold"
                      >
                        {rcd.label} • Izolovaná nulová svorkovnica N({rcd.label})
                      </text>
                    </>
                  )}
                </g>
              );
            })}

            {/* 5. FINAL CIRCUITS (MCBs - FA1, FA2...) & STANDALONE RCBO OUTGOING WIRING */}
            {columns.map((col, idx) => {
              const x = col.x;
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
                      <line
                        x1={x}
                        y1={rcdBoxY + 58}
                        x2={x}
                        y2={loadBoxY}
                        stroke="#0F172A"
                        strokeWidth={1.75}
                      />
                      {displayMode === 'wiring-diagram' && (
                        <>
                          <line
                            x1={x + 4}
                            y1={rcdBoxY + 58}
                            x2={x + 4}
                            y2={loadBoxY}
                            stroke="#0284C7"
                            strokeWidth={1.5}
                          />
                          <line
                            x1={x + 9}
                            y1={busY_PE}
                            x2={x + 9}
                            y2={loadBoxY}
                            stroke="#16A34A"
                            strokeWidth={1.4}
                            strokeDasharray="4 2"
                          />
                          <circle cx={x + 9} cy={busY_PE} r={2.5} fill="#16A34A" />
                        </>
                      )}
                      <line
                        x1={x - 5}
                        y1={mcbBoxY + 70}
                        x2={x + 5}
                        y2={mcbBoxY + 62}
                        stroke="#0F172A"
                        strokeWidth={1.5}
                      />
                      <text
                        x={x + 8}
                        y={mcbBoxY + 69}
                        fill="#0F172A"
                        fontSize={8.5}
                        fontWeight="bold"
                        fontFamily="JetBrains Mono, monospace"
                      >
                        {rcbo.poles === '4P' ? '5' : '3'}
                      </text>
                      <text
                        x={x - 8}
                        y={loadBoxY - 6}
                        fill="#334155"
                        fontSize={8}
                        fontFamily="JetBrains Mono, monospace"
                        transform={`rotate(-90, ${x - 8}, ${loadBoxY - 6})`}
                      >
                        {rcboCable} (15m)
                      </text>
                      <rect
                        x={x - 42}
                        y={loadBoxY}
                        width={84}
                        height={56}
                        rx={4}
                        fill="#FFFFFF"
                        stroke="#0F172A"
                        strokeWidth={1.5}
                      />
                      <text
                        x={x}
                        y={loadBoxY + 16}
                        textAnchor="middle"
                        fill="#0F172A"
                        fontSize={9.5}
                        fontWeight="bold"
                        fontFamily="Plus Jakarta Sans, sans-serif"
                      >
                        {rcboName.length > 13 ? rcboName.slice(0, 12) + '…' : rcboName}
                      </text>
                      <text
                        x={x}
                        y={loadBoxY + 30}
                        textAnchor="middle"
                        fill="#334155"
                        fontSize={8.5}
                        fontFamily="JetBrains Mono, monospace"
                      >
                        RCBO ({rcboPhase})
                      </text>
                      <text
                        x={x}
                        y={loadBoxY + 45}
                        textAnchor="middle"
                        fill="#0F172A"
                        fontSize={9}
                        fontWeight="bold"
                        fontFamily="JetBrains Mono, monospace"
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
                      y={mcbBoxY + 25}
                      textAnchor="middle"
                      fill="#64748B"
                      fontSize={9.5}
                      fontFamily="JetBrains Mono, monospace"
                    >
                      Rezerva FI
                    </text>
                  </g>
                );
              }

              const hasParentRcd = Boolean(col.parentRcd);
              const topSourceY = hasParentRcd ? rcdBusY : busY_L1;
              const isCircuitSelected =
                selectedElement?.type === 'circuit' && selectedElement.id === c.id;

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
                  <line
                    x1={x}
                    y1={topSourceY}
                    x2={x}
                    y2={mcbBoxY}
                    stroke="#0F172A"
                    strokeWidth={1.75}
                  />
                  <circle
                    cx={x}
                    cy={topSourceY}
                    r={3}
                    fill="#0F172A"
                  />

                  {(displayMode === 'multi-line' || displayMode === 'wiring-diagram') &&
                    (c.poles === '3P' || c.poles === '4P') && (
                      <>
                        <line
                          x1={x - 6}
                          y1={topSourceY}
                          x2={x - 6}
                          y2={mcbBoxY}
                          stroke="#0F172A"
                          strokeWidth={1.3}
                        />
                        <line
                          x1={x + 6}
                          y1={topSourceY}
                          x2={x + 6}
                          y2={mcbBoxY}
                          stroke="#0F172A"
                          strokeWidth={1.3}
                        />
                      </>
                    )}

                  <rect
                    x={x - 24}
                    y={mcbBoxY}
                    width={48}
                    height={52}
                    rx={4}
                    fill={isCircuitSelected ? '#EFF6FF' : '#FFFFFF'}
                    stroke={isCircuitSelected ? '#0066FF' : '#0F172A'}
                    strokeWidth={isCircuitSelected ? 2.5 : 1.5}
                  />

                  <line
                    x1={x}
                    y1={mcbBoxY}
                    x2={x}
                    y2={mcbBoxY + 13}
                    stroke="#0F172A"
                    strokeWidth={1.5}
                  />
                  <line
                    x1={x}
                    y1={mcbBoxY + 39}
                    x2={x}
                    y2={mcbBoxY + 52}
                    stroke="#0F172A"
                    strokeWidth={1.5}
                  />
                  <line
                    x1={x}
                    y1={mcbBoxY + 39}
                    x2={x - 9}
                    y2={mcbBoxY + 16}
                    stroke="#0F172A"
                    strokeWidth={1.75}
                  />
                  <path
                    d={`M ${x - 5} ${mcbBoxY + 25} L ${x - 1} ${mcbBoxY + 25} L ${x - 1} ${
                      mcbBoxY + 30
                    }`}
                    fill="none"
                    stroke="#0F172A"
                    strokeWidth={1.2}
                  />

                  <text
                    x={x}
                    y={mcbBoxY - 20}
                    textAnchor="middle"
                    fill="#0F172A"
                    fontSize={10.5}
                    fontWeight="bold"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    {c.label}
                  </text>
                  <text
                    x={x}
                    y={mcbBoxY - 7}
                    textAnchor="middle"
                    fill="#0F172A"
                    fontSize={9.5}
                    fontWeight="bold"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    {c.characteristic}
                    {c.ratedCurrent}A ({c.poles})
                  </text>

                  <rect
                    x={x + 14}
                    y={mcbBoxY + 4}
                    width={c.phase === 'L1,L2,L3' ? 28 : 20}
                    height={13}
                    rx={2}
                    fill="#F8FAFC"
                    stroke="#0F172A"
                    strokeWidth={1}
                  />
                  <text
                    x={x + (c.phase === 'L1,L2,L3' ? 28 : 24)}
                    y={mcbBoxY + 13}
                    textAnchor="middle"
                    fill="#0F172A"
                    fontSize={8}
                    fontWeight="bold"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    {c.phase === 'L1,L2,L3' ? '3F' : c.phase}
                  </text>

                  {displayMode === 'wiring-diagram' ? (
                    <g>
                      {/* Phase conductor L from bottom of MCB (Black) */}
                      <line
                        x1={x}
                        y1={mcbBoxY + 52}
                        x2={x}
                        y2={loadBoxY}
                        stroke="#0F172A"
                        strokeWidth={1.6}
                      />
                      {/* Neutral conductor N (Blue) routed cleanly on the right of MCB */}
                      <polyline
                        points={`${x + 28},${hasParentRcd ? rcdBusY + 12 : busY_N} ${x + 28},${mcbBoxY + 58} ${x + 5},${mcbBoxY + 58} ${x + 5},${loadBoxY}`}
                        fill="none"
                        stroke="#0284C7"
                        strokeWidth={1.5}
                      />
                      <circle
                        cx={x + 28}
                        cy={hasParentRcd ? rcdBusY + 12 : busY_N}
                        r={2.5}
                        fill="#0284C7"
                      />
                      {/* Protective conductor PE (Green) routed cleanly on the right */}
                      <polyline
                        points={`${x + 34},${busY_PE} ${x + 34},${mcbBoxY + 64} ${x + 10},${mcbBoxY + 64} ${x + 10},${loadBoxY}`}
                        fill="none"
                        stroke="#16A34A"
                        strokeWidth={1.4}
                        strokeDasharray="4 2"
                      />
                      <circle cx={x + 34} cy={busY_PE} r={2.5} fill="#16A34A" />
                    </g>
                  ) : (
                    <g>
                      <line
                        x1={x}
                        y1={mcbBoxY + 52}
                        x2={x}
                        y2={loadBoxY}
                        stroke="#0F172A"
                        strokeWidth={1.5}
                      />
                      <line
                        x1={x - 5}
                        y1={mcbBoxY + 70}
                        x2={x + 5}
                        y2={mcbBoxY + 62}
                        stroke="#0F172A"
                        strokeWidth={1.5}
                      />
                      <text
                        x={x + 8}
                        y={mcbBoxY + 69}
                        fill="#0F172A"
                        fontSize={8.5}
                        fontWeight="bold"
                        fontFamily="JetBrains Mono, monospace"
                      >
                        {c.poles === '3P' || c.poles === '4P' ? '5' : '3'}
                      </text>
                    </g>
                  )}

                  <text
                    x={x - 8}
                    y={loadBoxY - 6}
                    fill="#334155"
                    fontSize={8}
                    fontFamily="JetBrains Mono, monospace"
                    transform={`rotate(-90, ${x - 8}, ${loadBoxY - 6})`}
                  >
                    {c.cable} ({c.cableLengthM || 15}m)
                  </text>

                  <rect
                    x={x - 42}
                    y={loadBoxY}
                    width={84}
                    height={56}
                    rx={4}
                    fill={isCircuitSelected ? '#EFF6FF' : '#FFFFFF'}
                    stroke={isCircuitSelected ? '#0066FF' : '#0F172A'}
                    strokeWidth={1.5}
                  />
                  <text
                    x={x}
                    y={loadBoxY + 16}
                    textAnchor="middle"
                    fill="#0F172A"
                    fontSize={9.5}
                    fontWeight="bold"
                    fontFamily="Plus Jakarta Sans, sans-serif"
                  >
                    {c.name.length > 13 ? c.name.slice(0, 12) + '…' : c.name}
                  </text>
                  <text
                    x={x}
                    y={loadBoxY + 30}
                    textAnchor="middle"
                    fill="#475569"
                    fontSize={8.5}
                    fontFamily="Plus Jakarta Sans, sans-serif"
                  >
                    {c.category.length > 14 ? c.category.slice(0, 13) + '…' : c.category}
                  </text>
                  <text
                    x={x}
                    y={loadBoxY + 45}
                    textAnchor="middle"
                    fill="#0F172A"
                    fontSize={9}
                    fontWeight="bold"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    P = {c.powerKw.toFixed(2)} kW
                  </text>
                </g>
              );
            })}

            {/* Wiring Diagram Mandatory Separation Note */}
            {displayMode === 'wiring-diagram' && (
              <g transform={`translate(28, ${canvasHeight - 92})`}>
                <rect
                  x={0}
                  y={0}
                  width={560}
                  height={56}
                  rx={4}
                  fill="#F8FAFC"
                  stroke="#0284C7"
                  strokeWidth={1.4}
                />
                <text
                  x={12}
                  y={18}
                  fill="#0284C7"
                  fontSize={10}
                  fontWeight="bold"
                  fontFamily="JetBrains Mono, monospace"
                >
                  PRAVIDLO ODDELENIA NEUTRÁLNYCH VODIČOV N(FIx) PODĽA STN 33 2000-4-41:
                </text>
                <text
                  x={12}
                  y={33}
                  fill="#0F172A"
                  fontSize={9.5}
                  fontFamily="Plus Jakarta Sans, sans-serif"
                >
                  Každý prúdový chránič (FI1, FI2...) má vlastnú izolovanú nulovú svorkovnicu N(FIx).
                </text>
                <text
                  x={12}
                  y={47}
                  fill="#334155"
                  fontSize={9}
                  fontFamily="Plus Jakarta Sans, sans-serif"
                >
                  Neutrálne vodiče za rôznymi prúdovými chráničmi sa nesmú vzájomne spájať! Ochranné
                  vodiče PE sú spoločné na HOP.
                </text>
              </g>
            )}

            {/* 6. TECHNICAL TITLE BLOCK (ROZPISKA VÝKRESU — ČIERNO-BIELA STN) */}
            <g transform={`translate(${canvasWidth - 465}, ${canvasHeight - 92})`}>
              <rect
                x={0}
                y={0}
                width={435}
                height={68}
                fill="#FFFFFF"
                stroke="#0F172A"
                strokeWidth={1.5}
              />
              <line x1={0} y1={24} x2={435} y2={24} stroke="#0F172A" strokeWidth={1} />
              <line x1={0} y1={46} x2={435} y2={46} stroke="#0F172A" strokeWidth={1} />
              <line x1={280} y1={0} x2={280} y2={68} stroke="#0F172A" strokeWidth={1} />

              <text
                x={10}
                y={16}
                fill="#0F172A"
                fontSize={9.5}
                fontWeight="bold"
                fontFamily="Inter, Plus Jakarta Sans, sans-serif"
              >
                NÁZOV:{' '}
                {project.name.length > 34 ? `${project.name.slice(0, 34)}…` : project.name}
              </text>
              <text
                x={290}
                y={16}
                fill="#0F172A"
                fontSize={9.5}
                fontWeight="bold"
                fontFamily="JetBrains Mono, monospace"
              >
                SÚSTAVA: {project.networkSystem}
              </text>

              <text
                x={10}
                y={39}
                fill="#334155"
                fontSize={9}
                fontFamily="Inter, Plus Jakarta Sans, sans-serif"
              >
                Vypracoval:{' '}
                {(project.designerName || 'Projekčná kancelária').length > 32
                  ? `${(project.designerName || 'Projekčná kancelária').slice(0, 32)}…`
                  : project.designerName || 'Projekčná kancelária'}
              </text>
              <text
                x={290}
                y={39}
                fill="#334155"
                fontSize={9.5}
                fontFamily="JetBrains Mono, monospace"
              >
                Dátum: {project.projectDate}
              </text>

              <text
                x={10}
                y={60}
                fill="#475569"
                fontSize={9}
                fontFamily="JetBrains Mono, monospace"
              >
                Norma: STN EN 61439-3 / STN 33 2000-4-41
              </text>
              <text
                x={290}
                y={60}
                fill="#0F172A"
                fontSize={9.5}
                fontWeight="bold"
                fontFamily="JetBrains Mono, monospace"
              >
                Č. zákazky: {project.projectNumber}
              </text>
            </g>
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
        <div className="hidden print:block mt-4 pt-3 border-t-2 border-slate-900 bg-white text-slate-900">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-900">
                ROZPIS ISTIČOV A ELEKTRICKÝCH OKRUHOV K SCHÉME — {project.name}
              </h3>
              <p className="text-[10px] text-slate-600 font-mono">
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
            <div className="text-right font-mono text-[10px] text-slate-600">
              Č. zákazky: <strong>{project.projectNumber}</strong> | Dátum: <strong>{project.projectDate}</strong>
            </div>
          </div>

          <table className="w-full text-left border-collapse border border-slate-900 text-[10px]">
            <thead>
              <tr className="bg-slate-100 text-slate-900 border-b border-slate-900 font-bold">
                <th className="py-1 px-2 border-r border-slate-400">Istič</th>
                <th className="py-1 px-2 border-r border-slate-400">Názov okruhu / Spotrebič (Ktorý okruh je na ističi)</th>
                <th className="py-1 px-2 border-r border-slate-400">Typ a hodnota ističa</th>
                <th className="py-1 px-2 border-r border-slate-400">Prúdový chránič</th>
                <th className="py-1 px-2 border-r border-slate-400">Fáza</th>
                <th className="py-1 px-2 border-r border-slate-400">Kábel a prierez</th>
                <th className="py-1 px-2">Príkon</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-300 font-mono">
              {circuits.map((c) => {
                const rcd = rcds.find((r) => r.id === c.rcdId);
                return (
                  <tr key={c.id}>
                    <td className="py-1 px-2 border-r border-slate-300 font-bold text-slate-900">
                      {c.label}
                    </td>
                    <td className="py-1 px-2 border-r border-slate-300 font-sans font-semibold text-slate-900">
                      {c.name}
                    </td>
                    <td className="py-1 px-2 border-r border-slate-300 font-bold">
                      {c.poles} {c.characteristic}{c.ratedCurrent} A ({c.model})
                    </td>
                    <td className="py-1 px-2 border-r border-slate-300">
                      {rcd ? `${rcd.label} (${rcd.ratedCurrent}A/${rcd.sensitivity}mA)` : 'Bez FI (priamo)'}
                    </td>
                    <td className="py-1 px-2 border-r border-slate-300 font-bold">{c.phase}</td>
                    <td className="py-1 px-2 border-r border-slate-300">{c.cable}</td>
                    <td className="py-1 px-2">{c.powerKw.toFixed(2)} kW</td>
                  </tr>
                );
              })}
              {rcds
                .filter((r) => r.deviceKind === 'RCBO' && !circuits.some((c) => c.rcdId === r.id))
                .map((rcbo) => (
                  <tr key={rcbo.id}>
                    <td className="py-1 px-2 border-r border-slate-300 font-bold text-slate-900">
                      {rcbo.label}
                    </td>
                    <td className="py-1 px-2 border-r border-slate-300 font-sans font-semibold text-slate-900">
                      {rcbo.circuitName || rcbo.notes || 'Samostatný okruh RCBO'}
                    </td>
                    <td className="py-1 px-2 border-r border-slate-300 font-bold">
                      RCBO {rcbo.poles} {rcbo.characteristic || 'B'}{rcbo.ratedCurrent} A / {rcbo.sensitivity} mA ({rcbo.model})
                    </td>
                    <td className="py-1 px-2 border-r border-slate-300">
                      Integrovaný ističochránič ({rcbo.label}, Typ {rcbo.type})
                    </td>
                    <td className="py-1 px-2 border-r border-slate-300 font-bold">
                      {rcbo.phase || (rcbo.poles === '4P' ? 'L1,L2,L3' : 'L1')}
                    </td>
                    <td className="py-1 px-2 border-r border-slate-300">
                      {rcbo.cableType || 'CYKY-J 3x2,5 mm²'}
                    </td>
                    <td className="py-1 px-2">{(rcbo.powerKw ?? 0.6).toFixed(2)} kW</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
