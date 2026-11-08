import React from 'react';
import { Download, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { SwitchboardProject } from '../types/electrical';
import {
  calculateDinRailAllocation,
  calculatePhaseLoad,
  generateBom,
  validateStnCompliance,
  getEffectiveUpstreamBreaker,
  getEffectiveInternalDevice,
} from '../utils/electricalEngine';

interface DinRailAndBomViewProps {
  project: SwitchboardProject;
  mode: 'din-layout' | 'bom-and-stn';
}

export const DinRailAndBomView: React.FC<DinRailAndBomViewProps> = ({ project, mode }) => {
  const din = calculateDinRailAllocation(project);
  const bom = generateBom(project);
  const issues = validateStnCompliance(project);
  const load = calculatePhaseLoad(project);
  const upstream = getEffectiveUpstreamBreaker(project);
  const internalDev = getEffectiveInternalDevice(project);

  const handleExportCsv = () => {
    const headers = [
      'Oznacenie',
      'Popis pristroja',
      'Kategoria',
      'Technicka specifikacia',
      'Vyrobca',
      'Model',
      'Pocet modulov (18mm)',
      'Mnozstvo (ks)',
    ];
    const rows = bom.map((item) => [
      item.code,
      `"${item.designation}"`,
      `"${item.category}"`,
      `"${item.description}"`,
      `"${item.manufacturer}"`,
      `"${item.model}"`,
      String(item.modules),
      String(item.quantity),
    ]);
    const csvContent =
      '\uFEFF' + [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `kusovnik-${project.projectNumber || 'rozvadzac'}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (mode === 'din-layout') {
    return (
      <div className="space-y-5 p-5 bg-white border border-slate-200 rounded-2xl shadow-sm">
        {/* Hlavička pohľadu na rozvádzač */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <h2 className="text-base font-extrabold text-slate-900">
              Rozloženie prístrojov v rozvádzači (DIN lišty 35 mm) — {project.name}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Odporúčaná skriňa: {din.recommendedEnclosure} · Montáž: {project.enclosureMounting}
            </p>
          </div>

          <div className="flex items-center gap-4 text-xs font-mono tabular-nums">
            <div>
              <span className="text-slate-500">Obsadené moduly: </span>
              <span className="font-bold text-[#0066FF]">{din.totalUsedModules} M</span>
            </div>
            <span className="text-slate-300">·</span>
            <div>
              <span className="text-slate-500">Kapacita skrine: </span>
              <span className="font-bold text-slate-900">{din.totalCapacityModules} M</span>
            </div>
            <span className="text-slate-300">·</span>
            <div>
              <span className="text-slate-500">Rezerva (STN ≥ 20 %): </span>
              <span className="font-bold text-emerald-700">{din.reservePercentage} %</span>
            </div>
          </div>
        </div>

        {/* Info o dvoch hlavných ochranných prvkoch (QF0 + QS1/QF1) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex flex-col justify-between gap-1">
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold text-slate-900">
                1. Hlavný istič pred elektromerom ({upstream.designation})
              </span>
              <span className="px-2 py-0.5 rounded bg-blue-50 text-[#0066FF] border border-blue-200 font-mono text-[11px] font-bold">
                {upstream.enabled
                  ? `${upstream.poles} ${upstream.characteristic}${upstream.ratedCurrent} A (${upstream.breakingCapacity})`
                  : 'Nezahrnutý'}
              </span>
            </div>
            <span className="text-slate-600 text-[11px]">
              {upstream.enabled
                ? `${upstream.manufacturer} ${upstream.model} · Umiestnenie: ${upstream.placement} (nezaberá miesto na DIN lište v rozvádzači)`
                : 'Predradený istič v elektromerovom rozvádzači nie je zobrazený.'}
            </span>
          </div>

          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex flex-col justify-between gap-1">
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold text-slate-900">
                2. Hlavný prvok v rozvádzači ({internalDev.designation} — {internalDev.deviceType})
              </span>
              <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-mono text-[11px] font-bold">
                {internalDev.enabled
                  ? `${internalDev.poles} ${internalDev.hasOvercurrentProtection && internalDev.characteristic ? internalDev.characteristic : ''}${internalDev.ratedCurrent} A (${internalDev.modules} M)`
                  : 'Neosadený'}
              </span>
            </div>
            <span className="text-slate-600 text-[11px]">
              {internalDev.enabled
                ? `${internalDev.manufacturer} ${internalDev.model} · Osadený priamo na 1. DIN lište rozvádzača.`
                : 'Rozvádzač nemá samostatný vstupný hlavný prvok na DIN lište.'}
            </span>
          </div>
        </div>

        {/* Horné svorkovnice PE a N */}
        <div className="p-4 bg-slate-900 text-slate-100 rounded-lg border border-slate-800">
          <div className="text-xs font-mono text-slate-400 mb-2">
            SVORKOVNICOVÝ PRIESTOR ROZVÁDZAČA ({project.networkSystem})
          </div>
          <div className="flex flex-wrap gap-3">
            <div className="px-3 py-2 bg-emerald-950/90 border border-emerald-600/60 rounded text-xs font-mono">
              <div className="font-bold text-emerald-300">PE zbernica (Zeleno-žltá)</div>
              <div className="text-emerald-200/80 text-[11px]">
                {project.networkSystem === 'TN-C-S'
                  ? 'Bod rozdelenia PEN → PE + N (uzemnené na HOP)'
                  : 'Hlavná ochranná svorkovnica PE'}
              </div>
            </div>

            {project.networkSystem !== 'TN-C' && (
              <div className="px-3 py-2 bg-sky-950/90 border border-sky-600/60 rounded text-xs font-mono">
                <div className="font-bold text-sky-300">Hlavná N svorkovnica (Modrá)</div>
                <div className="text-sky-200/80 text-[11px]">
                  Vstupný nulový vodič N pred chráničmi
                </div>
              </div>
            )}

            {project.rcds
              .filter((r) => r.deviceKind === 'RCCB')
              .map((rccb) => (
                <div
                  key={rccb.id}
                  className="px-3 py-2 bg-blue-950/80 border border-blue-500/60 rounded text-xs font-mono"
                >
                  <div className="font-bold text-blue-200">Svorkovnica N({rccb.label})</div>
                  <div className="text-blue-300/80 text-[11px]">
                    Izolovaná nulová zbernica za chráničom {rccb.label}
                  </div>
                </div>
              ))}
          </div>

          {/* Jednotlivé DIN lišty */}
          <div className="mt-5 space-y-5">
            {din.rows.map((rowSlots, rowIdx) => {
              const usedInRow = rowSlots.reduce((acc, s) => acc + s.modules, 0);
              const emptyModules = Math.max(0, din.modulesPerRow - usedInRow);

              return (
                <div key={rowIdx} className="bg-slate-800/90 border border-slate-700 rounded-md p-3.5">
                  <div className="flex items-center justify-between text-xs font-mono text-slate-300 mb-2.5">
                    <span>
                      DIN LIŠTA Č. {rowIdx + 1} (TH35 / {din.modulesPerRow} modulov)
                    </span>
                    <span>
                      Obsadené: {usedInRow} / {din.modulesPerRow} M (Voľné: {emptyModules} M)
                    </span>
                  </div>

                  {/* Kovová DIN koľajnica */}
                  <div className="relative py-2">
                    <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-4 bg-slate-600 border-y border-slate-500 rounded-xs" />
                    <div
                      className="relative grid gap-1"
                      style={{
                        gridTemplateColumns: `repeat(${din.modulesPerRow}, minmax(0, 1fr))`,
                      }}
                    >
                      {rowSlots.map((slot) => {
                        const headerBg =
                          slot.type === 'main-breaker'
                            ? 'bg-amber-600 text-white'
                            : slot.type === 'main-switch'
                            ? 'bg-slate-700 text-white'
                            : slot.type === 'spd'
                            ? 'bg-red-600 text-white'
                            : slot.type === 'rccb'
                            ? 'bg-blue-600 text-white'
                            : slot.type === 'rcbo'
                            ? 'bg-indigo-600 text-white'
                            : 'bg-slate-200 text-slate-900';

                        return (
                          <div
                            key={slot.id}
                            style={{ gridColumn: `span ${slot.modules} / span ${slot.modules}` }}
                            className="bg-white text-slate-900 border-2 border-slate-400 rounded shadow-xs flex flex-col justify-between min-h-[126px] p-1.5 select-none"
                          >
                            <div
                              className={`px-1.5 py-0.5 rounded-xs text-[10px] font-mono font-bold flex items-center justify-between ${headerBg}`}
                            >
                              <span className="truncate">{slot.label}</span>
                              <span>{slot.poles}</span>
                            </div>

                            {/* Stredná páčka prístroja */}
                            <div className="my-1.5 flex flex-col items-center">
                              <div className="w-3/4 h-3 bg-slate-800 rounded-xs border border-slate-950" />
                              <div className="text-[10px] font-mono font-bold text-slate-900 mt-1 text-center leading-tight">
                                {slot.ratingText}
                              </div>
                              <div className="text-[9px] text-slate-600 text-center line-clamp-1 mt-0.5">
                                {slot.sublabel}
                              </div>
                            </div>

                            <div className="border-t border-slate-200 pt-1 flex items-center justify-between text-[9px] font-mono text-slate-500">
                              <span className="truncate">{slot.phaseText}</span>
                              <span>{slot.modules}M</span>
                            </div>
                          </div>
                        );
                      })}

                      {/* Voľné moduly (záslepky) */}
                      {Array.from({ length: emptyModules }).map((_, emptyIdx) => (
                        <div
                          key={`empty-${rowIdx}-${emptyIdx}`}
                          className="bg-slate-700/60 border border-dashed border-slate-500 rounded min-h-[126px] flex flex-col items-center justify-center p-1 text-center"
                        >
                          <span className="text-[10px] font-mono text-slate-400">REZERVA</span>
                          <span className="text-[9px] font-mono text-slate-500 mt-0.5">1M</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // Mode: BOM & STN Compliance
  return (
    <div className="space-y-6">
      {/* KONTROLA SÚLADU S NORMAMI STN EN IEC */}
      <section className="bg-white border border-slate-200 rounded-lg p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 mb-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Automatická kontrola návrhu podľa STN EN IEC
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Verifikácia selektivity, dimenzovania prúdových chráničov RCCB/RCBO, prierezov vodičov a fázovej symetrie
            </p>
          </div>
          <span className="text-xs font-mono text-slate-600">
            Súdobý príkon: {load.simultaneousKw} kW (Ib ≈ {load.estimatedMaxCurrentA} A)
          </span>
        </div>

        <div className="space-y-2.5">
          {issues.map((issue) => (
            <div
              key={issue.id}
              className={`p-3.5 rounded-md border flex items-start gap-3 ${
                issue.severity === 'error'
                  ? 'bg-red-50/70 border-red-200 text-red-950'
                  : issue.severity === 'warning'
                  ? 'bg-amber-50/70 border-amber-200 text-amber-950'
                  : 'bg-emerald-50/60 border-emerald-200 text-emerald-950'
              }`}
            >
              {issue.severity === 'error' ? (
                <XCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              ) : issue.severity === 'warning' ? (
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              )}
              <div className="flex-1 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{issue.title}</span>
                  <span className="text-slate-400">·</span>
                  <span className="font-mono text-[11px] opacity-80">{issue.code}</span>
                </div>
                <p className="mt-1 leading-relaxed opacity-90">{issue.message}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* KUSOVNÍK PRÍSTROJOV (BILL OF MATERIALS) */}
      <section className="bg-white border border-slate-200 rounded-lg p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3 mb-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Výpis materiálu a prístrojov rozvádzača (Kusovník / BOM)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Kompletná špecifikácia prvkov pre cenovú ponuku a objednávku elektromateriálu
            </p>
          </div>
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Exportovať kusovník (CSV / Excel)
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 bg-slate-50">
                <th className="py-2.5 px-3 font-medium">Ozn.</th>
                <th className="py-2.5 px-3 font-medium">Názov a účel prístroja</th>
                <th className="py-2.5 px-3 font-medium">Kategória</th>
                <th className="py-2.5 px-3 font-medium">Technická špecifikácia</th>
                <th className="py-2.5 px-3 font-medium">Výrobca &amp; Model</th>
                <th className="py-2.5 px-3 font-medium text-right">Moduly</th>
                <th className="py-2.5 px-3 font-medium text-right">Počet</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {bom.map((item) => (
                <tr key={item.code} className="hover:bg-slate-50/80">
                  <td className="py-2.5 px-3 font-mono font-bold text-slate-900">{item.code}</td>
                  <td className="py-2.5 px-3 font-medium text-slate-900">{item.designation}</td>
                  <td className="py-2.5 px-3 text-slate-600">{item.category}</td>
                  <td className="py-2.5 px-3 font-mono text-slate-700">{item.description}</td>
                  <td className="py-2.5 px-3 font-mono text-slate-800">
                    {item.manufacturer} <span className="font-semibold">{item.model}</span>
                  </td>
                  <td className="py-2.5 px-3 font-mono text-right tabular-nums text-slate-700">
                    {item.modules} M
                  </td>
                  <td className="py-2.5 px-3 font-mono text-right tabular-nums font-semibold text-slate-900">
                    {item.quantity} ks
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
