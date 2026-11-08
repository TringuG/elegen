import React, { useState } from 'react';
import { SwitchboardProject } from '../types/electrical';
import {
  generateBom,
  calculateCircuitParameters,
  validateStnCompliance,
  calculateDinRailAllocation,
  getEffectiveUpstreamBreaker,
  getEffectiveElectricityMeter,
  getEffectiveInternalDevice,
} from '../utils/electricalEngine';
import { ElectricalSchemaCanvas } from './ElectricalSchemaCanvas';
import {
  FileText,
  Printer,
  Download,
  CheckSquare,
  Square,
  Settings,
  Save,
  RotateCcw,
  FileSpreadsheet,
  CheckCircle2,
} from 'lucide-react';

interface Props {
  mode: 'documentation' | 'settings';
  project: SwitchboardProject;
  onProjectChange: (updated: SwitchboardProject, actionDescription?: string) => void;
  onResetAllProjects?: () => void;
}

export const ProfessionalExportView: React.FC<Props> = ({
  mode,
  project,
  onProjectChange,
  onResetAllProjects,
}) => {
  const [paperFormat, setPaperFormat] = useState<'A4' | 'A3' | 'LARGE'>('A3');
  const [includedSections, setIncludedSections] = useState({
    singleLineSchema: true,
    multiLineSchema: false,
    wiringDiagram: true,
    bom: true,
    circuitList: true,
    technicalDescription: true,
    symbolLegend: true,
    calculationReport: true,
    validationProtocol: true,
  });

  const [settingsSavedBanner, setSettingsSavedBanner] = useState(false);

  // ===========================================================================
  // SCREEN 13: NASTAVENIA APLIKÁCIE (LIGHT TECHNICAL DESIGN)
  // ===========================================================================
  if (mode === 'settings') {
    return (
      <div className="max-w-4xl space-y-6">
        {/* Deep Navy Structural Header */}
        <div className="bg-[#0B1120] text-white rounded-2xl p-6 border border-slate-800 shadow-md flex items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-[#0066FF]/20 border border-[#0066FF]/40 flex items-center justify-center text-[#38BDF8]">
              <Settings className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold tracking-tight text-white">
                Nastavenia aplikácie a projekčného prostredia
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Predvolené údaje projektanta do rozpisky výkresu, normatívne parametre siete a správa lokálnej databázy.
              </p>
            </div>
          </div>
        </div>

        {/* Crisp White Settings Form Card */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
          {settingsSavedBanner && (
            <div className="px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-800 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Nastavenia projektu boli automaticky uložené do lokálneho úložiska prehliadača.</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-xs">
            <label className="space-y-1.5">
              <span className="text-slate-700 font-bold uppercase tracking-wider">
                Zodpovedný projektant / Projekčná kancelária
              </span>
              <input
                type="text"
                value={project.designerName}
                onChange={(e) =>
                  onProjectChange(
                    {
                      ...project,
                      designerName: e.target.value,
                    },
                    'Zmena mena projektanta'
                  )
                }
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 font-medium focus:bg-white focus:border-[#0066FF] focus:outline-none"
              />
            </label>

            <label className="space-y-1.5">
              <span className="text-slate-700 font-bold uppercase tracking-wider">
                Číslo zákazky / Označenie dokumentácie
              </span>
              <input
                type="text"
                value={project.projectNumber}
                onChange={(e) =>
                  onProjectChange(
                    {
                      ...project,
                      projectNumber: e.target.value,
                    },
                    'Zmena čísla zákazky'
                  )
                }
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 font-mono font-bold focus:bg-white focus:border-[#0066FF] focus:outline-none"
              />
            </label>

            <label className="space-y-1.5">
              <span className="text-slate-700 font-bold uppercase tracking-wider">
                Mesto / Miesto stavby
              </span>
              <input
                type="text"
                value={project.locationCity || 'Bratislava'}
                onChange={(e) =>
                  onProjectChange(
                    {
                      ...project,
                      locationCity: e.target.value,
                    },
                    'Zmena miesta stavby'
                  )
                }
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 font-medium focus:bg-white focus:border-[#0066FF] focus:outline-none"
              />
            </label>

            <label className="space-y-1.5">
              <span className="text-slate-700 font-bold uppercase tracking-wider">
                Predvolená impedancia nadradenej siete Zq (Ω)
              </span>
              <input
                type="number"
                step={0.05}
                min={0.05}
                max={2.0}
                value={project.mainBreaker.supplyTransformerImpedanceOhm ?? 0.25}
                onChange={(e) =>
                  onProjectChange(
                    {
                      ...project,
                      mainBreaker: {
                        ...project.mainBreaker,
                        supplyTransformerImpedanceOhm: Math.max(
                          0.05,
                          Number(e.target.value) || 0.25
                        ),
                      },
                    },
                    'Zmena impedancie nadradenej siete Zq'
                  )
                }
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 font-mono font-bold focus:bg-white focus:border-[#0066FF] focus:outline-none"
              />
            </label>
          </div>

          <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => {
                setSettingsSavedBanner(true);
                setTimeout(() => setSettingsSavedBanner(false), 3000);
              }}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#0066FF] hover:bg-[#2563EB] text-white font-bold text-xs shadow-sm transition-colors cursor-pointer"
            >
              <Save className="w-4 h-4" />
              Uložiť nastavenia prostredia
            </button>

            {onResetAllProjects && (
              <button
                type="button"
                onClick={onResetAllProjects}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 font-bold text-xs transition-colors cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                Obnoviť výrobné nastavenia a vzorové projekty
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ===========================================================================
  // SCREENS 11 & 12: VÝKAZ MATERIÁLU (BOM) + TECHNICKÁ DOKUMENTÁCIA A EXPORT PDF
  // ===========================================================================
  const bom = generateBom(project);
  const calcs = calculateCircuitParameters(project);
  const validations = validateStnCompliance(project);
  const din = calculateDinRailAllocation(project);
  const upstream = getEffectiveUpstreamBreaker(project);
  const meter = getEffectiveElectricityMeter(project);
  const internalDev = getEffectiveInternalDevice(project);

  const toggleSection = (key: keyof typeof includedSections) => {
    setIncludedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handlePrintPdf = () => {
    window.print();
  };

  const handleExportBomCsv = () => {
    const headers = [
      'Kód',
      'Označenie v schéme',
      'Kategória',
      'Popis komponentu',
      'Výrobca',
      'Model',
      'Katalógové číslo',
      'Počet modulov (18mm)',
      'Množstvo (ks)',
    ];
    const rows = bom.map((b) => [
      b.code,
      b.designation,
      b.category,
      `"${b.description.replace(/"/g, '""')}"`,
      b.manufacturer,
      b.model,
      b.catalogNumber,
      String(b.modules),
      String(b.quantity),
    ]);
    const csvContent =
      '\uFEFF' + [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${project.projectNumber || 'rozvadzac'}_kusovnik_BOM.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportCircuitTableCsv = () => {
    const headers = [
      'Označenie',
      'Názov okruhu',
      'Kategória',
      'Chránič (RCD)',
      'Póly',
      'Istič',
      'Fáza',
      'Kábel',
      'Dĺžka (m)',
      'Výkon (kW)',
      'Prúd Ib (A)',
      'Úbytok ΔU (%)',
      'Impedancia Zs (Ω)',
    ];
    const rows = calcs.map((c) => {
      const circ = project.circuits.find((x) => x.id === c.circuitId);
      const rcdLabel =
        circ?.rcdId === 'NONE'
          ? 'Bez RCD'
          : project.rcds.find((r) => r.id === circ?.rcdId)?.label || '-';
      return [
        c.label,
        `"${c.name.replace(/"/g, '""')}"`,
        circ?.category || '-',
        rcdLabel,
        c.poles,
        `${c.breakerChar}${c.breakerCurrentIn}A`,
        c.phase,
        `"${c.cableText}"`,
        String(c.lengthM),
        String(c.powerKw),
        String(c.designCurrentIb),
        String(c.voltageDropPercent),
        String(c.loopImpedanceZsOhm),
      ];
    });
    const csvContent =
      '\uFEFF' + [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${project.projectNumber || 'rozvadzac'}_tabulka_okruhov.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Top Action & Export Control Bar (Hidden during print) */}
      <div className="no-print space-y-4">
        <div className="bg-[#0B1120] text-white rounded-2xl p-6 border border-slate-800 shadow-md flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-[#0066FF]/20 border border-[#0066FF]/40 flex items-center justify-center text-[#38BDF8] shrink-0">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold tracking-tight text-white">
                Výkaz materiálu (BOM), technická dokumentácia a export PDF
              </h1>
              <p className="text-xs text-slate-400 mt-1">
                Kompletný realizačný výstup s výkresovou pečiatkou STN ISO 7200, kusovníkom prístrojov, tabuľkou výpočtov a sprievodnou správou.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Format Selector */}
            <div className="inline-flex rounded-xl bg-[#1E293B] p-1 border border-slate-700 text-xs">
              {(['A4', 'A3', 'LARGE'] as const).map((fmt) => (
                <button
                  key={fmt}
                  type="button"
                  onClick={() => setPaperFormat(fmt)}
                  className={`px-3 py-1.5 rounded-lg font-mono font-bold transition-colors cursor-pointer ${
                    paperFormat === fmt
                      ? 'bg-[#0066FF] text-white'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {fmt === 'LARGE' ? 'A2 / Veľký formát' : `Formát ${fmt}`}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={handleExportBomCsv}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-[#1E293B] hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-[#38BDF8]" />
              Kusovník CSV
            </button>

            <button
              type="button"
              onClick={handleExportCircuitTableCsv}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-[#1E293B] hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 transition-colors cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
              Okruhy CSV
            </button>

            <button
              type="button"
              onClick={handlePrintPdf}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#0066FF] hover:bg-[#2563EB] text-white font-bold text-xs shadow-lg shadow-[#0066FF]/30 transition-all cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              Tlačiť / Uložiť PDF ({paperFormat})
            </button>
          </div>
        </div>

        {/* Section Toggles Card */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2.5">
            Zahrnuté prílohy v tlačovej zostave dokumentácie:
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            {[
              { key: 'singleLineSchema' as const, label: 'Jednopólová schéma' },
              { key: 'multiLineSchema' as const, label: 'Viacpólová schéma' },
              { key: 'wiringDiagram' as const, label: 'Schéma zapojenia rozvádzača' },
              { key: 'bom' as const, label: 'Výkaz materiálu (Kusovník BOM)' },
              { key: 'circuitList' as const, label: 'Zoznam okruhov a výpočty' },
              { key: 'technicalDescription' as const, label: 'Technická sprievodná správa' },
              { key: 'symbolLegend' as const, label: 'Legenda značiek STN EN 60617' },
              { key: 'validationProtocol' as const, label: 'Protokol kontroly a revízie' },
            ].map((sec) => {
              const active = includedSections[sec.key];
              return (
                <button
                  key={sec.key}
                  type="button"
                  onClick={() => toggleSection(sec.key)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border font-semibold transition-all cursor-pointer ${
                    active
                      ? 'bg-blue-50 border-[#0066FF] text-[#0066FF]'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {active ? (
                    <CheckSquare className="w-3.5 h-3.5 text-[#0066FF]" />
                  ) : (
                    <Square className="w-3.5 h-3.5 text-slate-400" />
                  )}
                  {sec.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* PRINTABLE / EXPORTABLE ENGINEERING DOSSIER SHEET (CRISP WHITE PAPER)  */}
      {/* ===================================================================== */}
      <div className="bg-white text-slate-900 rounded-2xl border border-slate-300 shadow-sm p-6 sm:p-8 space-y-8 print:border-0 print:shadow-none print:p-0">
        {/* Document Header Banner */}
        <div className="border-2 border-slate-900 p-5 flex flex-wrap items-center justify-between gap-4 bg-slate-50">
          <div>
            <div className="text-[11px] font-mono uppercase tracking-widest text-[#0066FF] font-bold">
              PROJEKTOVÁ DOKUMENTÁCIA ELEKTROINŠTALÁCIE • STN EN 61439-3 / STN EN 61082-1
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900 mt-0.5">
              {project.name}
            </h1>
            <p className="text-xs text-slate-600 mt-1">
              Objekt: <strong>{project.objectType}</strong> | Sústava:{' '}
              <strong>
                {project.supplySystem.toUpperCase()} ({project.voltage}, {project.networkSystem})
              </strong>{' '}
              | Prívod: <strong>{project.supplyCable}</strong> | Krytie:{' '}
              <strong>{project.ipRating}</strong>
            </p>
            <p className="text-xs text-slate-700 mt-1 font-mono">
              Pred elektromerom:{' '}
              <strong>
                {upstream.enabled
                  ? `${upstream.designation} (${upstream.poles} ${upstream.characteristic}${upstream.ratedCurrent}A, ${upstream.placement})`
                  : 'Bez QF0'}
              </strong>{' '}
              | Meranie: <strong>{meter.enabled ? meter.type : 'Bez elektromera'}</strong> | V rozvádzači:{' '}
              <strong>
                {internalDev.enabled
                  ? `${internalDev.designation} – ${internalDev.deviceType} (${internalDev.poles} ${internalDev.ratedCurrent}A)`
                  : 'Bez hlavného prvku'}
              </strong>
            </p>
          </div>
          <div className="text-right font-mono text-xs border-l border-slate-300 pl-4">
            <div className="text-slate-500">Číslo projektu:</div>
            <div className="font-bold text-slate-900 text-sm">{project.projectNumber}</div>
            <div className="text-slate-500 mt-1">Dátum vyhotovenia:</div>
            <div className="font-bold text-slate-900">{project.projectDate}</div>
          </div>
        </div>

        {/* 1. Technical Description (Technická sprievodná správa) */}
        {includedSections.technicalDescription && (
          <section className="space-y-2.5">
            <h3 className="text-sm font-extrabold uppercase tracking-wider text-slate-900 border-b-2 border-slate-900 pb-1">
              1. Technická sprievodná správa
            </h3>
            <div className="text-xs text-slate-700 leading-relaxed space-y-2">
              <p>
                Predmetom dokumentácie je návrh a zapojenie nízkoprúdového rozvádzača{' '}
                <strong>{project.name}</strong> pre objekt <strong>{project.objectType}</strong>.
                Rozvádzač je napájaný prívodným káblom <strong>{project.supplyCable}</strong> v
                sieti <strong>{project.networkSystem}</strong> s menovitým napätím{' '}
                <strong>{project.voltage}</strong>, 50 Hz.
              </p>
              <p>
                <strong>Hlavné ochranné a spínacie prvky:</strong>{' '}
                {upstream.enabled
                  ? `Hlavné istenie pred elektromerom tvorí istič ${upstream.designation} (${upstream.manufacturer} ${upstream.model}, ${upstream.poles}, charakteristika ${upstream.characteristic}, In = ${upstream.ratedCurrent} A, Icn = ${upstream.breakingCapacity}, umiestnenie: ${upstream.placement}). `
                  : 'Hlavný istič pred elektromerom QF0 nie je v tejto časti riešený. '}
                {internalDev.enabled
                  ? `Priamo v bytovom/domovom rozvádzači je na vstupe osadený samostatný hlavný prvok ${internalDev.designation} – ${internalDev.deviceType} (${internalDev.manufacturer} ${internalDev.model}, ${internalDev.poles}, In = ${internalDev.ratedCurrent} A, ${internalDev.modules} mod.).`
                  : ''}
              </p>
              <p>
                Ochrana pred úrazom elektrickým prúdom pri nepriamom dotyku je zabezpečená
                automatickým odpojením od zdroja v zmysle <strong>STN 33 2000-4-41</strong> pomocou
                nadprúdových istiacich prístrojov a prúdových chráničov s menovitým rozdielovým
                prúdom IΔn ≤ 30 mA pre všetky zásuvkové a svetelné okruhy v obytných priestoroch.
              </p>
              <p>
                Navrhovaná skriňa rozvádzača má <strong>{din.rows.length} DIN lišty</strong> s
                celkovou kapacitou <strong>{din.totalCapacityModules} modulov</strong> (obsadených{' '}
                <strong>{din.totalUsedModules} modulov</strong>, voľná rezerva{' '}
                <strong>{din.reservePercentage} %</strong>), montáž:{' '}
                <strong>{project.enclosureMounting}</strong>, krytie{' '}
                <strong>{project.ipRating}</strong>.
              </p>
            </div>
          </section>
        )}

        {/* 2. Single-Line Schematic */}
        {includedSections.singleLineSchema && (
          <section className="space-y-2.5 break-inside-avoid">
            <h3 className="text-sm font-extrabold uppercase tracking-wider text-slate-900 border-b-2 border-slate-900 pb-1">
              2. Jednopólová schéma rozvádzača
            </h3>
            <div className="h-[520px] border border-slate-300 rounded-xl overflow-hidden">
              <ElectricalSchemaCanvas
                project={project}
                displayMode="single-line"
                onDisplayModeChange={() => {}}
                compactMode={true}
              />
            </div>
          </section>
        )}

        {/* 3. Multi-Line Schematic */}
        {includedSections.multiLineSchema && (
          <section className="space-y-2.5 break-inside-avoid">
            <h3 className="text-sm font-extrabold uppercase tracking-wider text-slate-900 border-b-2 border-slate-900 pb-1">
              3. Viacpólová schéma rozvádzača (L1, L2, L3, N, PE)
            </h3>
            <div className="h-[540px] border border-slate-300 rounded-xl overflow-hidden">
              <ElectricalSchemaCanvas
                project={project}
                displayMode="multi-line"
                onDisplayModeChange={() => {}}
                compactMode={true}
              />
            </div>
          </section>
        )}

        {/* 4. Wiring Diagram */}
        {includedSections.wiringDiagram && (
          <section className="space-y-2.5 break-inside-avoid">
            <h3 className="text-sm font-extrabold uppercase tracking-wider text-slate-900 border-b-2 border-slate-900 pb-1">
              4. Schéma vnútorného zapojenia a prípojníc PE / N
            </h3>
            <div className="h-[520px] border border-slate-300 rounded-xl overflow-hidden">
              <ElectricalSchemaCanvas
                project={project}
                displayMode="wiring-diagram"
                onDisplayModeChange={() => {}}
                compactMode={true}
              />
            </div>
          </section>
        )}

        {/* 5. Circuit List & Calculation Report */}
        {includedSections.circuitList && (
          <section className="space-y-2.5 break-inside-avoid">
            <h3 className="text-sm font-extrabold uppercase tracking-wider text-slate-900 border-b-2 border-slate-900 pb-1">
              5. Tabuľka elektrických okruhov a výpočtových parametrov
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse border border-slate-300 text-[11px]">
                <thead>
                  <tr className="bg-slate-100 text-slate-800 border-b border-slate-300">
                    <th className="py-2 px-2.5 border-r border-slate-300">Ozn.</th>
                    <th className="py-2 px-2.5 border-r border-slate-300">Názov okruhu</th>
                    <th className="py-2 px-2.5 border-r border-slate-300">RCD</th>
                    <th className="py-2 px-2.5 border-r border-slate-300">Istič</th>
                    <th className="py-2 px-2.5 border-r border-slate-300">Fáza</th>
                    <th className="py-2 px-2.5 border-r border-slate-300">Kábel / Dĺžka</th>
                    <th className="py-2 px-2.5 border-r border-slate-300">Príkon P</th>
                    <th className="py-2 px-2.5 border-r border-slate-300">Prúd Ib / Iz</th>
                    <th className="py-2 px-2.5 border-r border-slate-300">Úbytok ΔU</th>
                    <th className="py-2 px-2.5">Slučka Zs</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-mono">
                  {calcs.map((c) => {
                    const circ = project.circuits.find((x) => x.id === c.circuitId);
                    const rcd = project.rcds.find((r) => r.id === circ?.rcdId);
                    return (
                      <tr key={c.circuitId}>
                        <td className="py-1.5 px-2.5 border-r border-slate-300 font-bold text-[#0066FF]">
                          {c.label}
                        </td>
                        <td className="py-1.5 px-2.5 border-r border-slate-300 font-sans font-semibold text-slate-900">
                          {c.name}
                        </td>
                        <td className="py-1.5 px-2.5 border-r border-slate-300">
                          {rcd ? rcd.label : 'Bez RCD'}
                        </td>
                        <td className="py-1.5 px-2.5 border-r border-slate-300 font-bold">
                          {c.poles} {c.breakerChar}
                          {c.breakerCurrentIn}A
                        </td>
                        <td className="py-1.5 px-2.5 border-r border-slate-300">{c.phase}</td>
                        <td className="py-1.5 px-2.5 border-r border-slate-300">
                          {c.cableText} ({c.lengthM}m)
                        </td>
                        <td className="py-1.5 px-2.5 border-r border-slate-300">
                          {c.powerKw.toFixed(2)} kW
                        </td>
                        <td className="py-1.5 px-2.5 border-r border-slate-300">
                          {c.designCurrentIb}A / {c.currentCarryingCapacityIz}A
                        </td>
                        <td
                          className={`py-1.5 px-2.5 border-r border-slate-300 font-bold ${
                            c.voltageDropOk ? 'text-slate-900' : 'text-red-600'
                          }`}
                        >
                          {c.voltageDropPercent}%
                        </td>
                        <td
                          className={`py-1.5 px-2.5 font-bold ${
                            c.disconnectConditionOk ? 'text-slate-900' : 'text-red-600'
                          }`}
                        >
                          {c.loopImpedanceZsOhm} Ω
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* 6. Bill of Materials (Výkaz materiálu - Kusovník BOM) */}
        {includedSections.bom && (
          <section className="space-y-2.5 break-inside-avoid">
            <h3 className="text-sm font-extrabold uppercase tracking-wider text-slate-900 border-b-2 border-slate-900 pb-1">
              6. Výkaz materiálu (Kusovník prístrojov – BOM)
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse border border-slate-300 text-[11px]">
                <thead>
                  <tr className="bg-slate-100 text-slate-800 border-b border-slate-300">
                    <th className="py-2 px-2.5 border-r border-slate-300">Kód</th>
                    <th className="py-2 px-2.5 border-r border-slate-300">Označenie v schéme</th>
                    <th className="py-2 px-2.5 border-r border-slate-300">Kategória</th>
                    <th className="py-2 px-2.5 border-r border-slate-300">Popis komponentu</th>
                    <th className="py-2 px-2.5 border-r border-slate-300">Výrobca / Model</th>
                    <th className="py-2 px-2.5 border-r border-slate-300">Kat. číslo</th>
                    <th className="py-2 px-2.5 border-r border-slate-300 text-center">Moduly</th>
                    <th className="py-2 px-2.5 text-center">Počet ks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {bom.map((item) => (
                    <tr key={item.code}>
                      <td className="py-1.5 px-2.5 border-r border-slate-300 font-mono text-slate-600">
                        {item.code}
                      </td>
                      <td className="py-1.5 px-2.5 border-r border-slate-300 font-mono font-bold text-[#0066FF]">
                        {item.designation}
                      </td>
                      <td className="py-1.5 px-2.5 border-r border-slate-300 font-semibold">
                        {item.category}
                      </td>
                      <td className="py-1.5 px-2.5 border-r border-slate-300">
                        {item.description}
                      </td>
                      <td className="py-1.5 px-2.5 border-r border-slate-300 font-mono font-bold">
                        {item.manufacturer} {item.model}
                      </td>
                      <td className="py-1.5 px-2.5 border-r border-slate-300 font-mono text-slate-600">
                        {item.catalogNumber}
                      </td>
                      <td className="py-1.5 px-2.5 border-r border-slate-300 font-mono text-center">
                        {item.modules > 0 ? `${item.modules} M` : '-'}
                      </td>
                      <td className="py-1.5 px-2.5 font-mono font-bold text-center">
                        {item.quantity} ks
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* 7. Symbol Legend */}
        {includedSections.symbolLegend && (
          <section className="space-y-2.5 break-inside-avoid">
            <h3 className="text-sm font-extrabold uppercase tracking-wider text-slate-900 border-b-2 border-slate-900 pb-1">
              7. Legenda elektrotechnických značiek (STN EN 60617 / STN EN 81346-2)
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5 text-[11px]">
              <div className="p-2.5 border border-slate-300 rounded-lg bg-slate-50">
                <div className="font-mono font-bold text-slate-900">QF0</div>
                <div className="text-slate-600">Hlavný istič pred elektromerom</div>
              </div>
              <div className="p-2.5 border border-slate-300 rounded-lg bg-slate-50">
                <div className="font-mono font-bold text-slate-900">QS1 / QF1</div>
                <div className="text-slate-600">Hlavný vypínač / istič v rozvádzači</div>
              </div>
              <div className="p-2.5 border border-slate-300 rounded-lg bg-slate-50">
                <div className="font-mono font-bold text-slate-900">FV1 (SPD)</div>
                <div className="text-slate-600">Zvodič prepätia T1+T2 / T2</div>
              </div>
              <div className="p-2.5 border border-slate-300 rounded-lg bg-slate-50">
                <div className="font-mono font-bold text-slate-900">FI1..FIn</div>
                <div className="text-slate-600">Prúdový chránič RCCB / RCBO</div>
              </div>
              <div className="p-2.5 border border-slate-300 rounded-lg bg-slate-50">
                <div className="font-mono font-bold text-slate-900">FA1..FAn</div>
                <div className="text-slate-600">Inštalačný istič koncového okruhu</div>
              </div>
              <div className="p-2.5 border border-slate-300 rounded-lg bg-slate-50">
                <div className="font-mono font-bold text-slate-900">PE / N</div>
                <div className="text-slate-600">Ochranná (ZEL-ŽLT) a neutrálna (MODRÁ) zbernica</div>
              </div>
            </div>
          </section>
        )}

        {/* 8. Validation Protocol */}
        {includedSections.validationProtocol && (
          <section className="space-y-2.5 break-inside-avoid">
            <h3 className="text-sm font-extrabold uppercase tracking-wider text-slate-900 border-b-2 border-slate-900 pb-1">
              8. Protokol kontroly návrhu a podmienky pre revíziu
            </h3>
            <div className="space-y-1.5 text-[11px]">
              {validations.map((v) => (
                <div
                  key={v.id}
                  className="flex items-start gap-2 py-1 border-b border-slate-200"
                >
                  <span
                    className={`font-mono font-bold uppercase px-1.5 py-0.5 rounded text-[10px] ${
                      v.severity === 'error'
                        ? 'bg-red-100 text-red-800'
                        : v.severity === 'warning'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-emerald-100 text-emerald-800'
                    }`}
                  >
                    {v.severity === 'error'
                      ? 'CHYBA'
                      : v.severity === 'warning'
                      ? 'UPOZORNENIE'
                      : 'OK'}
                  </span>
                  <div>
                    <span className="font-bold text-slate-900">
                      [{v.code}] {v.title}:
                    </span>{' '}
                    <span className="text-slate-700">{v.message}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Official Engineering Title Block (Výkresová pečiatka STN ISO 7200) */}
        <footer className="pt-4 break-inside-avoid">
          <div className="border-2 border-slate-900 grid grid-cols-1 md:grid-cols-4 text-xs">
            <div className="p-3 border-b md:border-b-0 md:border-r border-slate-900">
              <div className="text-[10px] uppercase text-slate-500 font-bold">
                Zodpovedný projektant:
              </div>
              <div className="font-bold text-slate-900 mt-0.5">{project.designerName}</div>
              <div className="text-[10px] text-slate-500 mt-2">
                Miesto stavby: {project.locationCity || 'Bratislava'}
              </div>
            </div>
            <div className="p-3 border-b md:border-b-0 md:border-r border-slate-900">
              <div className="text-[10px] uppercase text-slate-500 font-bold">Názov výkresu:</div>
              <div className="font-bold text-slate-900 mt-0.5">{project.name}</div>
              <div className="text-[10px] text-slate-500 mt-2">
                Sústava: {project.supplySystem.toUpperCase()} / {project.voltage} /{' '}
                {project.networkSystem}
              </div>
            </div>
            <div className="p-3 border-b md:border-b-0 md:border-r border-slate-900 font-mono">
              <div className="text-[10px] uppercase text-slate-500 font-sans font-bold">
                Číslo výkresu / Formát:
              </div>
              <div className="font-bold text-slate-900 mt-0.5">
                {project.projectNumber} • {paperFormat}
              </div>
              <div className="text-[10px] text-slate-500 mt-2">
                Dátum: {project.projectDate}
              </div>
            </div>
            <div className="p-3 bg-slate-50 flex flex-col justify-between">
              <div className="text-[10px] uppercase text-slate-500 font-bold">
                Odborné vyhlásenie:
              </div>
              <div className="text-[10px] text-slate-600 leading-tight mt-1">
                Pred uvedením do prevádzky vykonať východiskovú revíziu podľa STN 33 2000-6.
              </div>
              <div className="text-[10px] font-mono text-right text-slate-500 mt-2">
                Pečiatka a podpis: .......................
              </div>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
};
