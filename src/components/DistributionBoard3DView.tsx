import React, { useState } from 'react';
import { SwitchboardProject } from '../types/electrical';
import { calculateDinRailAllocation, DinModuleSlot } from '../utils/electricalEngine';
import { DinRailAndBomView } from './DinRailAndBomView';
import {
  Box,
  Layers,
  RotateCcw,
  Eye,
  EyeOff,
  Maximize2,
  Cpu,
  Ruler,
  Shield,
} from 'lucide-react';

interface Props {
  project: SwitchboardProject;
}

export const DistributionBoard3DView: React.FC<Props> = ({ project }) => {
  const [viewMode, setViewMode] = useState<'3d' | '2d'>('3d');
  const [rotX, setRotX] = useState<number>(18);
  const [rotY, setRotY] = useState<number>(-24);
  const [zoom3d, setZoom3d] = useState<number>(1);
  const [exploded, setExploded] = useState<boolean>(false);
  const [showDoor, setShowDoor] = useState<boolean>(false);
  const [showBusbars, setShowBusbars] = useState<boolean>(true);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragOrigin, setDragOrigin] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const dinLayout = calculateDinRailAllocation(project);
  const allSlots: DinModuleSlot[] = dinLayout.rows.flat();
  const freeModules = Math.max(0, dinLayout.totalCapacityModules - dinLayout.totalUsedModules);

  const selectedItem =
    allSlots.find((s) => s.id === selectedSlotId) || allSlots[0] || null;

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsDragging(true);
    setDragOrigin({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    const dx = e.clientX - dragOrigin.x;
    const dy = e.clientY - dragOrigin.y;
    setRotY((prev) => Math.max(-65, Math.min(65, prev + dx * 0.35)));
    setRotX((prev) => Math.max(-35, Math.min(55, prev - dy * 0.35)));
    setDragOrigin({ x: e.clientX, y: e.clientY });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  return (
    <div className="space-y-5">
      {/* Top Bar: 2D / 3D Switcher + Enclosure Summary — Deep Navy + Electric Blue */}
      <div className="bg-[#0B1120] border border-slate-800 rounded-2xl p-4 sm:px-6 shadow-md flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="inline-flex rounded-xl bg-[#0F172A] p-1 border border-slate-800">
            <button
              type="button"
              onClick={() => setViewMode('3d')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                viewMode === '3d'
                  ? 'bg-[#0066FF] text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Box className="w-4 h-4" />
              3D Náhľad rozvádzača
            </button>
            <button
              type="button"
              onClick={() => setViewMode('2d')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                viewMode === '2d'
                  ? 'bg-[#0066FF] text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Layers className="w-4 h-4" />
              2D Montážny pohľad &amp; Kusovník
            </button>
          </div>

          <div className="hidden md:flex items-center gap-4 pl-3 border-l border-slate-800 text-xs">
            <div className="flex items-center gap-1.5 text-slate-300">
              <Ruler className="w-3.5 h-3.5 text-[#38BDF8]" />
              <span>Rozmery skrine:</span>
              <span className="font-mono font-bold text-white tabular-nums">
                {dinLayout.dimensionsMm.width} × {dinLayout.dimensionsMm.height} ×{' '}
                {dinLayout.dimensionsMm.depth} mm
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-slate-300">
              <Cpu className="w-3.5 h-3.5 text-[#38BDF8]" />
              <span>Obsadenosť:</span>
              <span className="font-mono font-bold text-emerald-400 tabular-nums">
                {dinLayout.totalUsedModules} / {dinLayout.totalCapacityModules} M ({freeModules}{' '}
                voľných)
              </span>
            </div>
          </div>
        </div>

        {viewMode === '3d' && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setRotX(18);
                setRotY(-24);
                setZoom3d(1);
              }}
              className="px-3 py-1.5 rounded-lg bg-[#1E293B] hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 transition-colors cursor-pointer"
            >
              Izometria
            </button>
            <button
              type="button"
              onClick={() => {
                setRotX(0);
                setRotY(0);
                setZoom3d(1.05);
              }}
              className="px-3 py-1.5 rounded-lg bg-[#1E293B] hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 transition-colors cursor-pointer"
            >
              Čelný pohľad
            </button>
            <button
              type="button"
              onClick={() => {
                setRotX(12);
                setRotY(42);
              }}
              className="px-3 py-1.5 rounded-lg bg-[#1E293B] hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 transition-colors cursor-pointer"
            >
              Bočný profil
            </button>
            <button
              type="button"
              onClick={() => setExploded((v) => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                exploded
                  ? 'bg-[#0066FF] border-[#0066FF] text-white'
                  : 'bg-[#1E293B] border-slate-700 text-slate-300 hover:text-white'
              }`}
            >
              <Maximize2 className="w-3.5 h-3.5" />
              Explodovaný 3D rez
            </button>
            <button
              type="button"
              onClick={() => setShowDoor((v) => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                showDoor
                  ? 'bg-[#0066FF] border-[#0066FF] text-white'
                  : 'bg-[#1E293B] border-slate-700 text-slate-300 hover:text-white'
              }`}
            >
              {showDoor ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              Dvierka {project.ipRating}
            </button>
          </div>
        )}
      </div>

      {viewMode === '2d' ? (
        <DinRailAndBomView mode="din-layout" project={project} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Interactive 3D Viewport (8 cols) */}
          <div className="lg:col-span-8 bg-[#070b12] border border-slate-800 rounded-xl overflow-hidden flex flex-col min-h-[640px] relative">
            <div className="px-4 py-2.5 bg-slate-900/80 border-b border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
              <span>
                Ťahaním myšou otáčajte 3D skriňu rozvádzača • Kliknutím na prístroj zobrazíte detail
              </span>
              <div className="flex items-center gap-3 font-mono text-[11px]">
                <span>Os X: {Math.round(rotX)}°</span>
                <span>Os Y: {Math.round(rotY)}°</span>
                <button
                  type="button"
                  onClick={() => {
                    setRotX(18);
                    setRotY(-24);
                    setZoom3d(1);
                    setExploded(false);
                  }}
                  className="text-amber-400 hover:underline flex items-center gap-1"
                >
                  <RotateCcw className="w-3 h-3" /> Reset
                </button>
              </div>
            </div>

            <div
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              className={`flex-1 flex items-center justify-center p-8 select-none overflow-hidden ${
                isDragging ? 'cursor-grabbing' : 'cursor-grab'
              }`}
              style={{
                perspective: '1300px',
                backgroundImage:
                  'radial-gradient(circle at 50% 45%, rgba(30, 41, 59, 0.45) 0%, rgba(7, 11, 18, 0.98) 75%)',
              }}
            >
              <div
                className="relative transition-transform duration-75"
                style={{
                  transformStyle: 'preserve-3d',
                  transform: `scale(${zoom3d}) rotateX(${rotX}deg) rotateY(${rotY}deg)`,
                }}
              >
                <div
                  className="relative rounded-xl border-2 border-slate-600 bg-gradient-to-b from-slate-900 via-slate-950 to-slate-900 shadow-[0_35px_90px_rgba(0,0,0,0.85)] p-6"
                  style={{
                    width: '670px',
                    transformStyle: 'preserve-3d',
                  }}
                >
                  <div
                    className="absolute top-0 bottom-0 -left-8 w-8 bg-slate-800/90 border border-slate-700 origin-right"
                    style={{ transform: 'rotateY(-90deg)' }}
                  />
                  <div
                    className="absolute top-0 bottom-0 -right-8 w-8 bg-slate-800/90 border border-slate-700 origin-left"
                    style={{ transform: 'rotateY(90deg)' }}
                  />
                  <div
                    className="absolute -top-8 left-0 right-0 h-8 bg-slate-800/90 border border-slate-700 origin-bottom flex items-center justify-center"
                    style={{ transform: 'rotateX(90deg)' }}
                  >
                    <span className="font-mono text-[10px] text-amber-400">
                      Hĺbka skrine: {dinLayout.dimensionsMm.depth} mm
                    </span>
                  </div>

                  {/* Top Ruler */}
                  <div
                    className="mb-4 flex items-center justify-between px-3 py-1.5 rounded bg-slate-950/90 border border-slate-800 text-[11px] font-mono text-slate-300"
                    style={{ transform: `translateZ(${exploded ? 25 : 8}px)` }}
                  >
                    <span className="text-amber-400 font-bold">SKRIŇA: {project.name}</span>
                    <span>
                      Šírka: {dinLayout.dimensionsMm.width} mm ({dinLayout.modulesPerRow} M) × Výška:{' '}
                      {dinLayout.dimensionsMm.height} mm ({dinLayout.rows.length}× DIN)
                    </span>
                  </div>

                  {/* TOP TERMINAL BLOCKS: PE & N(FIx) */}
                  <div
                    className="mb-5 grid grid-cols-1 md:grid-cols-2 gap-3 p-3 rounded-lg bg-slate-950/90 border border-slate-800"
                    style={{
                      transform: `translateZ(${exploded ? 45 : 18}px)`,
                      boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
                    }}
                  >
                    <div className="flex items-center justify-between px-3 py-2 rounded bg-emerald-950/50 border border-emerald-500/40">
                      <div>
                        <div className="text-[10px] font-mono font-bold uppercase text-emerald-400">
                          Hlavná ochranná svorkovnica PE (HOP)
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          Cu lišta {project.circuits.length + 6}×16 mm² • {project.networkSystem}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        {Array.from({ length: 8 }).map((_, idx) => (
                          <span
                            key={idx}
                            className="w-2.5 h-2.5 rounded-full bg-emerald-400/80 border border-amber-300"
                          />
                        ))}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 px-3 py-2 rounded bg-sky-950/40 border border-sky-500/40">
                      <div className="w-full text-[10px] font-mono font-bold uppercase text-sky-400">
                        Izolované nulové svorkovnice N / N(FIx)
                      </div>
                      <span className="px-2 py-0.5 rounded bg-sky-500/20 border border-sky-400/40 text-[10px] font-mono text-sky-200">
                        Hlavná N
                      </span>
                      {project.rcds
                        .filter((r) => r.deviceKind === 'RCCB')
                        .map((r) => (
                          <span
                            key={r.id}
                            className="px-2 py-0.5 rounded bg-cyan-500/20 border border-cyan-400/50 text-[10px] font-mono font-bold text-cyan-200"
                          >
                            N({r.label}) izolovaná
                          </span>
                        ))}
                    </div>
                  </div>

                  {/* 3D DIN RAILS & MODULAR SWITCHGEAR */}
                  <div className="space-y-5" style={{ transformStyle: 'preserve-3d' }}>
                    {dinLayout.rows.map((rowSlots, rIdx) => {
                      const usedInRow = rowSlots.reduce((acc, s) => acc + s.modules, 0);
                      const freeInRow = Math.max(0, dinLayout.modulesPerRow - usedInRow);

                      return (
                        <div
                          key={rIdx}
                          className="relative pt-2 pb-3 px-3 rounded-lg bg-slate-900/70 border border-slate-800/90"
                          style={{ transformStyle: 'preserve-3d' }}
                        >
                          <div className="flex items-center justify-between mb-1.5 text-[10px] font-mono text-slate-400">
                            <span>DIN LIŠTA {rIdx + 1}. RAD (TH35 / 7.5 mm)</span>
                            <span>
                              Obsadené: {usedInRow}/{dinLayout.modulesPerRow} M • Voľné: {freeInRow}{' '}
                              M
                            </span>
                          </div>

                          <div
                            className="relative h-24 flex items-center"
                            style={{ transformStyle: 'preserve-3d' }}
                          >
                            <div
                              className="absolute inset-x-0 h-5 bg-gradient-to-b from-slate-400 via-slate-300 to-slate-500 border-y border-slate-600 rounded-sm shadow-inner"
                              style={{ transform: `translateZ(${exploded ? 12 : 4}px)` }}
                            />

                            <div
                              className="relative z-10 w-full grid gap-0.5 h-full items-center"
                              style={{
                                gridTemplateColumns: `repeat(${dinLayout.modulesPerRow}, minmax(0, 1fr))`,
                                transform: `translateZ(${exploded ? 56 : 24}px)`,
                                transformStyle: 'preserve-3d',
                              }}
                            >
                              {rowSlots.map((slot) => {
                                const isSelected = selectedItem?.id === slot.id;

                                const topAccent =
                                  slot.type === 'main-breaker' || slot.type === 'main-switch'
                                    ? 'border-t-4 border-t-amber-500'
                                    : slot.type === 'spd'
                                    ? 'border-t-4 border-t-purple-500'
                                    : slot.type === 'rccb' || slot.type === 'rcbo'
                                    ? 'border-t-4 border-t-cyan-400'
                                    : 'border-t-4 border-t-emerald-500';

                                const handleBg =
                                  slot.type === 'main-breaker' || slot.type === 'main-switch'
                                    ? 'bg-red-500'
                                    : slot.type === 'spd'
                                    ? 'bg-purple-500'
                                    : slot.type === 'rccb' || slot.type === 'rcbo'
                                    ? 'bg-cyan-400'
                                    : 'bg-slate-900';

                                return (
                                  <button
                                    type="button"
                                    key={slot.id}
                                    onClick={() => setSelectedSlotId(slot.id)}
                                    style={{
                                      gridColumn: `span ${slot.modules} / span ${slot.modules}`,
                                      transform: isSelected ? 'translateZ(12px)' : 'translateZ(0px)',
                                    }}
                                    className={`h-24 rounded border flex flex-col justify-between p-1.5 text-left transition-all shadow-[0_10px_20px_rgba(0,0,0,0.65)] ${topAccent} ${
                                      isSelected
                                        ? 'bg-slate-100 text-slate-950 border-amber-400 ring-2 ring-amber-400'
                                        : 'bg-gradient-to-b from-slate-200 via-slate-100 to-slate-300 text-slate-900 border-slate-400 hover:brightness-105'
                                    }`}
                                  >
                                    <div className="flex items-center justify-between w-full">
                                      <span className="font-mono text-[9.5px] font-extrabold px-1 rounded bg-slate-900 text-amber-400 truncate">
                                        {slot.label.split(' ')[0]}
                                      </span>
                                      <span className="font-mono text-[8.5px] font-bold text-slate-600">
                                        {slot.modules}M
                                      </span>
                                    </div>

                                    <div className="my-auto flex flex-col items-center justify-center w-full">
                                      <div className="w-4/5 h-5 rounded-sm bg-slate-300 border border-slate-400 flex items-center justify-center shadow-inner">
                                        <div
                                          className={`w-3/4 h-2.5 rounded-xs ${handleBg} shadow-sm`}
                                        />
                                      </div>
                                    </div>

                                    <div className="w-full truncate font-mono text-[8px] font-bold text-slate-700 text-center">
                                      {slot.ratingText}
                                    </div>
                                  </button>
                                );
                              })}

                              {Array.from({ length: freeInRow }).map((_, fIdx) => (
                                <div
                                  key={`blank-${fIdx}`}
                                  style={{ gridColumn: 'span 1 / span 1' }}
                                  className="h-20 rounded border border-dashed border-slate-700 bg-slate-900/65 flex flex-col items-center justify-center text-[8px] font-mono text-slate-500"
                                  title="Voľný modul (Záslepka)"
                                >
                                  <span>REZ</span>
                                  <span>1M</span>
                                </div>
                              ))}
                            </div>

                            {showBusbars && rowSlots.length > 0 && (
                              <div
                                className="absolute -bottom-2 left-2 right-12 h-2.5 rounded-xs bg-gradient-to-r from-amber-600 via-amber-500 to-amber-600 border border-amber-300/60 shadow"
                                style={{ transform: `translateZ(${exploded ? 74 : 30}px)` }}
                                title="Medená prepojovacia lišta 10 mm² (L1/L2/L3)"
                              />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {showDoor && (
                    <div
                      className="absolute inset-3 rounded-xl bg-sky-950/25 border-2 border-sky-400/40 backdrop-blur-[1px] pointer-events-none flex items-end justify-between p-4"
                      style={{ transform: `translateZ(${exploded ? 115 : 52}px)` }}
                    >
                      <span className="px-2.5 py-1 rounded bg-slate-950/90 border border-sky-500/40 text-[11px] font-mono text-sky-300">
                        Dvierka rozvádzača {project.ipRating} / IK07 (priehľadný kryt)
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="px-4 py-3 bg-slate-900/95 border-t border-slate-800 flex flex-wrap items-center justify-between gap-4 text-xs">
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-slate-300">
                  <span>Náklon X:</span>
                  <input
                    type="range"
                    min={-35}
                    max={55}
                    value={rotX}
                    onChange={(e) => setRotX(Number(e.target.value))}
                    className="w-24 accent-amber-500"
                  />
                </label>
                <label className="flex items-center gap-2 text-slate-300">
                  <span>Otočenie Y:</span>
                  <input
                    type="range"
                    min={-65}
                    max={65}
                    value={rotY}
                    onChange={(e) => setRotY(Number(e.target.value))}
                    className="w-24 accent-amber-500"
                  />
                </label>
                <label className="flex items-center gap-2 text-slate-300">
                  <span>Priblíženie:</span>
                  <input
                    type="range"
                    min={0.7}
                    max={1.35}
                    step={0.05}
                    value={zoom3d}
                    onChange={(e) => setZoom3d(Number(e.target.value))}
                    className="w-24 accent-amber-500"
                  />
                </label>
              </div>

              <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showBusbars}
                  onChange={(e) => setShowBusbars(e.target.checked)}
                  className="accent-amber-500 rounded"
                />
                <span>Zobraziť prepojovacie hrebeňové lišty Cu</span>
              </label>
            </div>
          </div>

          {/* Right Column: Selected 3D Component Inspector & Enclosure Technical Specs — Crisp White Cards */}
          <div className="lg:col-span-4 space-y-4">
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <span className="text-xs font-extrabold uppercase tracking-wider text-[#0066FF]">
                  Detail vybraného 3D modulu
                </span>
                {selectedItem && (
                  <span className="px-2.5 py-0.5 rounded-md bg-blue-50 text-[#0066FF] border border-blue-200 font-mono text-xs font-bold">
                    {selectedItem.label}
                  </span>
                )}
              </div>

              {selectedItem ? (
                <div className="space-y-3 text-xs">
                  <div>
                    <div className="text-slate-500 font-medium">Funkcia a popis prístroja:</div>
                    <div className="text-sm font-extrabold text-slate-900 mt-0.5">
                      {selectedItem.sublabel}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5 pt-1">
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                      <div className="text-[11px] text-slate-500 font-medium">Menovité parametre</div>
                      <div className="font-mono font-bold text-[#0066FF] mt-0.5">
                        {selectedItem.ratingText} ({selectedItem.poles})
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                      <div className="text-[11px] text-slate-500 font-medium">Šírka na DIN lište</div>
                      <div className="font-mono font-bold text-slate-900 mt-0.5">
                        {selectedItem.modules} M ({selectedItem.modules * 17.5} mm)
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                      <div className="text-[11px] text-slate-500 font-medium">Výrobca a model</div>
                      <div className="font-mono font-bold text-slate-900 mt-0.5">
                        {selectedItem.manufacturer} {selectedItem.model}
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                      <div className="text-[11px] text-slate-500 font-medium">Fáza / Skupina</div>
                      <div className="font-mono font-bold text-emerald-700 mt-0.5">
                        {selectedItem.phaseText} • {selectedItem.rcdGroupLabel || 'Hlavný'}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-500">Kliknite na prístroj v 3D modeli.</p>
              )}
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                <Shield className="w-4 h-4 text-[#0066FF]" />
                <span className="text-xs font-extrabold uppercase tracking-wider text-slate-900">
                  Parametre rozvádzacej skrine (STN EN 61439-3)
                </span>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-500">Odporúčaná skriňa:</span>
                  <span className="font-mono font-bold text-slate-900 text-right">
                    {dinLayout.recommendedEnclosure}
                  </span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-500">Vonkajšie rozmery (Š×V×H):</span>
                  <span className="font-mono font-bold text-[#0066FF]">
                    {dinLayout.dimensionsMm.width} × {dinLayout.dimensionsMm.height} ×{' '}
                    {dinLayout.dimensionsMm.depth} mm
                  </span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-500">Obsadené moduly:</span>
                  <span className="font-mono font-bold text-slate-900">{dinLayout.totalUsedModules} M</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-500">Voľné moduly (rezerva):</span>
                  <span
                    className={`font-mono font-bold ${
                      dinLayout.reservePercentage >= 20 ? 'text-emerald-600' : 'text-amber-600'
                    }`}
                  >
                    {freeModules} M ({dinLayout.reservePercentage} %)
                  </span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-500">Odhadovaný stratový výkon Pde:</span>
                  <span className="font-mono font-bold text-slate-900">
                    {dinLayout.estimatedPowerLossW} W
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
