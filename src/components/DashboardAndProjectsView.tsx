import React, { useRef, useState } from 'react';
import {
  FolderPlus,
  Copy,
  Trash2,
  Download,
  Upload,
  History,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  FileCode2,
  Sparkles,
  RotateCcw,
  Edit3,
  Check,
  Plus,
  Zap,
  Cpu,
  FileSpreadsheet,
  ClipboardPaste,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  Layers,
  ShieldCheck,
  Award,
  Tag,
} from 'lucide-react';
import { NavigationSection, SwitchboardProject } from '../types/electrical';
import {
  PROJECT_TEMPLATES,
  calculateDinRailAllocation,
  calculatePhaseLoad,
  getEffectiveInternalDevice,
  getEffectiveUpstreamBreaker,
  validateStnCompliance,
} from '../utils/electricalEngine';

interface DashboardAndProjectsViewProps {
  activeProject: SwitchboardProject;
  savedProjects: SwitchboardProject[];
  onSelectProject: (project: SwitchboardProject) => void;
  onCreateFromTemplate: (templateKey: string) => void;
  onCreateBlankProject?: (supplySystem: '1f' | '3f') => void;
  onRenameProject?: (projectId: string, newName: string) => void;
  onDuplicateProject: (project: SwitchboardProject) => void;
  onDeleteProject: (projectId: string) => void;
  onImportProjectJson: (project: SwitchboardProject) => void;
  onRestoreHistorySnapshot: (snapshotJson: string) => void;
  onNavigate: (section: NavigationSection) => void;
  mode: 'dashboard' | 'new-project';
}

export const DashboardAndProjectsView: React.FC<DashboardAndProjectsViewProps> = ({
  activeProject,
  savedProjects,
  onSelectProject,
  onCreateFromTemplate,
  onCreateBlankProject,
  onRenameProject,
  onDuplicateProject,
  onDeleteProject,
  onImportProjectJson,
  onRestoreHistorySnapshot,
  onNavigate,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState<string>('');
  const [showRevisionHistory, setShowRevisionHistory] = useState<boolean>(false);

  const din = calculateDinRailAllocation(activeProject);
  const load = calculatePhaseLoad(activeProject);
  const issues = validateStnCompliance(activeProject);
  const upstream = getEffectiveUpstreamBreaker(activeProject);
  const internalDev = getEffectiveInternalDevice(activeProject);

  const redCount = issues.filter((i) => i.severity === 'error').length;
  const orangeCount = issues.filter((i) => i.severity === 'warning').length;
  const greenCount = issues.filter((i) => i.severity === 'ok').length;

  const handleExportJson = (proj: SwitchboardProject) => {
    const json = JSON.stringify(proj, null, 2);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${proj.projectNumber || 'projekt-rozvadzaca'}.elektro.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(String(ev.target?.result)) as SwitchboardProject;
        if (parsed && parsed.name && Array.isArray(parsed.circuits)) {
          onImportProjectJson(parsed);
        }
      } catch (err) {
        console.error('Neplatný súbor projektu JSON:', err);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const templateEntries: {
    key: string;
    badge: string;
    title: string;
    desc: string;
    specs: string;
  }[] = [
    {
      key: 'byt_1f_230v',
      badge: 'TEST 1 • 1F 230 V',
      title: '1-fázový bytový rozvádzač (5 okruhov)',
      desc: 'Kompaktný rozvádzač pre byt alebo garsónku (sústava TN-S, 1x25 A, prúdový chránič FI1 + svetelné a zásuvkové okruhy).',
      specs: '1F 230V • QF0 1P B25A • QS1 2P 40A',
    },
    {
      key: 'test2_byt_3f_viac_fi',
      badge: 'TEST 2 • 3F BYT',
      title: '3-fázový bytový rozvádzač s viacerými chráničmi',
      desc: 'Trojfázový bytový rozvádzač s viacerými skupinami prúdových chráničov FI1, FI2, FI3 a varnou doskou 400 V.',
      specs: '3F 400V • QF0 3P B25A • 3× RCD',
    },
    {
      key: 'rodinny_dom_3f',
      badge: 'TEST 3 • 3F RODINNÝ DOM',
      title: '3-fázový rodinný dom (Hlavný rozvádzač, 9 okruhov)',
      desc: 'Kompletný domový rozvádzač so samostatným ističom pred elektromerom QF0, hlavným vypínačom QS1, SPD a 3 skupinami RCD.',
      specs: '3F 400V • QF0 3P B25A • QS1 4P 40A',
    },
    {
      key: 'test4_qf0_a_vypinac_qs1',
      badge: 'TEST 4 • QF0 + VYPÍNAČ QS1',
      title: 'Rozvádzač s ističom pred elektromerom QF0 a vypínačom QS1',
      desc: 'Ukážkové zapojenie dvoch hlavných prvkov: nadradený istič QF0 pred elektromerom + hlavný vypínač QS1 priamo v rozvádzači.',
      specs: '3F 400V • QF0 B25A + QS1 40A',
    },
    {
      key: 'test5_qf0_a_istic_qf1',
      badge: 'TEST 5 • QF0 + ISTIČ QF1',
      title: 'Rozvádzač s ističom pred elektromerom QF0 a ističom QF1',
      desc: 'Ukážkové zapojenie dvoch ističov v sérii s automatickou kontrolou selektivity (QF0 C32A pred elektromerom + QF1 B25A v rozvádzači).',
      specs: '3F 400V • QF0 C32A + QF1 B25A',
    },
    {
      key: 'test6_rcbo_a_rccb',
      badge: 'TEST 6 • RCCB + RCBO',
      title: 'Rozvádzač s kombináciou skupinových RCCB a samostatných RCBO',
      desc: 'Kombinácia skupinových chráničov RCCB pre bežné okruhy a samostatných ističochráničov RCBO pre chladničku, kotol a exteriér.',
      specs: '3F 400V • RCCB + RCBO • SPD T1+T2',
    },
  ];

  return (
    <div className="space-y-6">
      {/* ===================================================================== */}
      {/* SCREEN 1: HERO ACTIVE PROJECT BANNER (DEEP NAVY + ELECTRIC BLUE)      */}
      {/* ===================================================================== */}
      <div className="bg-gradient-to-r from-[#0B1120] via-[#0F172A] to-[#1E293B] text-white rounded-2xl p-6 lg:p-7 border border-slate-800 shadow-lg">
        <div className="flex flex-col 2xl:flex-row 2xl:items-center justify-between gap-5 sm:gap-6">
          <div className="space-y-3 max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-1 rounded-md bg-[#0066FF] text-white font-mono text-xs font-bold uppercase tracking-wider">
                Aktívny rozvádzač
              </span>
              <span className="px-2.5 py-1 rounded-md bg-slate-800/90 border border-slate-700 text-[#38BDF8] font-mono text-xs font-semibold">
                {activeProject.projectNumber}
              </span>
              <span className="px-2.5 py-1 rounded-md bg-slate-800/90 border border-slate-700 text-slate-300 text-xs font-medium">
                {activeProject.objectType} • {activeProject.supplySystem === '3f' ? '3F 400 V' : '1F 230 V'} ({activeProject.networkSystem})
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              {activeProject.name}
            </h1>

            {/* Two Distinct Main Protective Devices Summary Pill Bar */}
            <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
              <div className="px-3 py-1.5 rounded-xl bg-slate-900/90 border border-slate-700/80 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                <span className="text-slate-400">Pred elektromerom:</span>
                <span className="font-mono font-bold text-white">
                  {upstream.enabled
                    ? `${upstream.designation} (${upstream.poles} ${upstream.characteristic}${upstream.ratedCurrent}A)`
                    : 'Bez QF0'}
                </span>
              </div>

              <div className="px-3 py-1.5 rounded-xl bg-slate-900/90 border border-slate-700/80 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#38BDF8]" />
                <span className="text-slate-400">Hlavný prvok v rozvádzači:</span>
                <span className="font-mono font-bold text-white">
                  {internalDev.enabled
                    ? `${internalDev.designation} – ${internalDev.deviceType} (${internalDev.poles} ${internalDev.ratedCurrent}A)`
                    : 'Bez hlavného prvku'}
                </span>
              </div>

              <div className="px-3 py-1.5 rounded-xl bg-slate-900/90 border border-slate-700/80 flex items-center gap-2">
                <span className="text-slate-400">Prívod:</span>
                <span className="font-mono font-semibold text-slate-200">
                  {activeProject.supplyCable}
                </span>
              </div>
            </div>
          </div>

          {/* Primary CTA Buttons */}
          <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
            <button
              type="button"
              onClick={() => onNavigate('smart-designer')}
              className="inline-flex items-center justify-center gap-2 px-4 sm:px-5 py-2.5 sm:py-3 rounded-xl bg-[#0066FF] hover:bg-[#2563EB] text-white text-xs sm:text-sm font-bold shadow-lg shadow-[#0066FF]/30 transition-all cursor-pointer whitespace-nowrap"
            >
              <Sparkles className="w-4 h-4" />
              <span>Upraviť rozvádzač</span>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('schema-editor')}
              className="inline-flex items-center justify-center gap-2 px-3.5 sm:px-4 py-2.5 sm:py-3 rounded-xl bg-[#1E293B] hover:bg-slate-700 text-white border border-slate-700 text-xs sm:text-sm font-bold transition-all cursor-pointer whitespace-nowrap"
            >
              <Cpu className="w-4 h-4 text-[#38BDF8]" />
              <span>Editor schémy</span>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('manufacturing')}
              className="inline-flex items-center justify-center gap-2 px-3.5 sm:px-4 py-2.5 sm:py-3 rounded-xl bg-[#1E293B] hover:bg-slate-700 text-white border border-slate-700 text-xs sm:text-sm font-bold transition-all cursor-pointer whitespace-nowrap"
              title="Generovať výrobný štítok, protokol kusovej skúšky a CE vyhlásenie o zhode"
            >
              <Award className="w-4 h-4 text-amber-400" />
              <span>Výroba &amp; Štítok</span>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('documentation')}
              className="inline-flex items-center justify-center gap-2 px-3.5 sm:px-4 py-2.5 sm:py-3 rounded-xl bg-[#1E293B] hover:bg-slate-700 text-white border border-slate-700 text-xs sm:text-sm font-bold transition-all cursor-pointer whitespace-nowrap"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
              <span>Kusovník a PDF</span>
            </button>
          </div>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* ENGINEERING KPI CARDS (CRISP WHITE SURFACE + ELECTRIC BLUE ACCENTS)   */}
      {/* ===================================================================== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* Card 1: Power & Current */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Výpočtový príkon a prúd
            </span>
            <span className="w-8 h-8 rounded-lg bg-blue-50 text-[#0066FF] flex items-center justify-center">
              <Zap className="w-4 h-4" />
            </span>
          </div>
          <div className="my-3">
            <div className="text-2xl font-mono font-extrabold text-slate-900">
              {load.simultaneousKw} kW{' '}
              <span className="text-sm font-semibold text-[#0066FF]">
                ({load.estimatedMaxCurrentA} A)
              </span>
            </div>
            <div className="text-xs text-slate-500 mt-1">
              Inštalovaný príkon Pi = <strong className="text-slate-700">{load.totalInstalledKw} kW</strong> (β = {load.simultaneityFactor})
            </div>
          </div>
          <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs font-mono text-slate-600">
            <span>Fázová asymetria:</span>
            <span
              className={`font-bold ${
                load.asymmetryPercent > 20
                  ? 'text-red-600'
                  : load.asymmetryPercent > 12
                  ? 'text-amber-600'
                  : 'text-emerald-600'
              }`}
            >
              {load.asymmetryPercent} %
            </span>
          </div>
        </div>

        {/* Card 2: Circuits & RCDs */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Ochranné prvky a vývody
            </span>
            <span className="w-8 h-8 rounded-lg bg-blue-50 text-[#0066FF] flex items-center justify-center">
              <Layers className="w-4 h-4" />
            </span>
          </div>
          <div className="my-3">
            <div className="text-2xl font-mono font-extrabold text-slate-900">
              {activeProject.circuits.length} okruhov{' '}
              <span className="text-sm font-semibold text-slate-500">
                / {activeProject.rcds.length} RCD
              </span>
            </div>
            <div className="text-xs text-slate-500 mt-1">
              Výrobca zostavy:{' '}
              <strong className="text-slate-800">{activeProject.mainBreaker.manufacturer}</strong>
            </div>
          </div>
          <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
            <button
              type="button"
              onClick={() => onNavigate('auto-import')}
              className="text-[#0066FF] hover:underline font-bold inline-flex items-center gap-1 cursor-pointer"
            >
              <ClipboardPaste className="w-3.5 h-3.5" />
              <span>Hromadný import okruhov</span>
            </button>
          </div>
        </div>

        {/* Card 3: Enclosure & DIN Modules */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Kapacita skrine a DIN lišty
            </span>
            <span className="px-2 py-0.5 rounded bg-blue-50 text-[#0066FF] font-mono text-xs font-bold">
              {din.rows.length}×{din.modulesPerRow} M
            </span>
          </div>
          <div className="my-3">
            <div className="text-2xl font-mono font-extrabold text-slate-900">
              {din.totalUsedModules} / {din.totalCapacityModules} M
            </div>
            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden mt-2">
              <div
                className={`h-full rounded-full ${
                  din.reservePercentage < 20 ? 'bg-amber-500' : 'bg-[#0066FF]'
                }`}
                style={{
                  width: `${Math.min(
                    100,
                    Math.round((din.totalUsedModules / din.totalCapacityModules) * 100)
                  )}%`,
                }}
              />
            </div>
          </div>
          <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs font-mono text-slate-600">
            <span>Voľná rezerva (STN ≥20%):</span>
            <span
              className={`font-bold ${
                din.reservePercentage < 20 ? 'text-amber-600' : 'text-emerald-600'
              }`}
            >
              +{din.reservePercentage} %
            </span>
          </div>
        </div>

        {/* Card 4: STN Compliance Status */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Technický audit STN EN
            </span>
            <span className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4" />
            </span>
          </div>
          <div className="my-3 flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 font-mono text-xs font-bold flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              {greenCount} OK
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 font-mono text-xs font-bold flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
              {orangeCount} Upoz.
            </span>
            <span
              className={`px-2.5 py-1 rounded-lg border font-mono text-xs font-bold flex items-center gap-1 ${
                redCount > 0
                  ? 'bg-red-50 border-red-200 text-red-800'
                  : 'bg-slate-50 border-slate-200 text-slate-500'
              }`}
            >
              <XCircle className="w-3.5 h-3.5" />
              {redCount} Chýb
            </span>
          </div>
          <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
            <button
              type="button"
              onClick={() => onNavigate('validation')}
              className="text-[#0066FF] hover:underline font-bold inline-flex items-center gap-1 cursor-pointer"
            >
              <span>Zobraziť detailnú kontrolu</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* SCREEN 2: SAVED PROJECTS & TEMPLATES WORKSPACE                        */}
      {/* ===================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT COLUMN (7 cols): SAVED PROJECTS LIST */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-lg font-extrabold text-slate-900">
                Uložené projekty rozvádzačov ({savedProjects.length})
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Vyberte existujúci projekt na úpravu, vytvorte čistý 1F/3F rozvádzač alebo importujte JSON.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {onCreateBlankProject && (
                <>
                  <button
                    type="button"
                    onClick={() => onCreateBlankProject('1f')}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5 text-[#0066FF]" />
                    <span>Nový 1F (230 V)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onCreateBlankProject('3f')}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#0066FF] hover:bg-[#2563EB] text-white text-xs font-bold shadow-sm transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Nový 3F (400 V)</span>
                  </button>
                </>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleFileChange}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
                title="Načítať projekt zo súboru .json"
              >
                <Upload className="w-3.5 h-3.5 text-slate-600" />
                <span>Import JSON</span>
              </button>
            </div>
          </div>

          {/* Project Cards List */}
          <div className="space-y-3">
            {savedProjects.map((proj) => {
              const isSelected = proj.id === activeProject.id;
              const isRenaming = renamingId === proj.id;
              const projUpstream = getEffectiveUpstreamBreaker(proj);
              const projInternal = getEffectiveInternalDevice(proj);

              return (
                <div
                  key={proj.id}
                  onClick={() => {
                    if (!isRenaming) onSelectProject(proj);
                  }}
                  className={`p-4 rounded-xl border-2 transition-all cursor-pointer ${
                    isSelected
                      ? 'border-[#0066FF] bg-blue-50/40 shadow-sm'
                      : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/70'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {isSelected && (
                          <span className="px-2 py-0.5 rounded bg-[#0066FF] text-white text-[10px] font-mono font-bold uppercase">
                            Aktívny
                          </span>
                        )}
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 font-mono text-[11px] font-bold">
                          {proj.supplySystem === '3f' ? '3F 400 V' : '1F 230 V'} • {proj.networkSystem}
                        </span>
                        <span className="text-xs text-slate-500 font-medium">
                          {proj.objectType}
                        </span>
                      </div>

                      {isRenaming ? (
                        <div
                          className="flex items-center gap-2 pt-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="text"
                            value={renameText}
                            onChange={(e) => setRenameText(e.target.value)}
                            className="px-3 py-1.5 rounded-lg bg-white border border-[#0066FF] text-sm font-bold text-slate-900 focus:outline-none"
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() => {
                              if (onRenameProject) onRenameProject(proj.id, renameText);
                              setRenamingId(null);
                            }}
                            className="px-3 py-1.5 rounded-lg bg-[#0066FF] text-white text-xs font-bold flex items-center gap-1"
                          >
                            <Check className="w-3.5 h-3.5" />
                            Uložiť
                          </button>
                        </div>
                      ) : (
                        <h3 className="text-base font-bold text-slate-900 truncate">
                          {proj.name}
                        </h3>
                      )}

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 font-mono">
                        <span>
                          QF0: <strong>{projUpstream.poles} {projUpstream.characteristic}{projUpstream.ratedCurrent}A</strong>
                        </span>
                        <span>
                          {projInternal.designation}: <strong>{projInternal.deviceType} ({projInternal.ratedCurrent}A)</strong>
                        </span>
                        <span>
                          Chrániče: <strong>{proj.rcds.length}</strong>
                        </span>
                        <span>
                          Okruhy: <strong>{proj.circuits.length}</strong>
                        </span>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div
                      className="flex flex-wrap items-center gap-1.5 shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          onSelectProject(proj);
                          onNavigate('smart-designer');
                        }}
                        className="px-3 py-1.5 rounded-lg bg-[#0066FF] hover:bg-[#2563EB] text-white text-xs font-bold transition-colors cursor-pointer"
                      >
                        Otvoriť
                      </button>

                      {onRenameProject && (
                        <button
                          type="button"
                          onClick={() => {
                            setRenamingId(proj.id);
                            setRenameText(proj.name);
                          }}
                          title="Premenovať projekt"
                          className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => onDuplicateProject(proj)}
                        title="Duplikovať projekt"
                        className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleExportJson(proj)}
                        title="Stiahnuť projekt ako JSON"
                        className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>

                      {savedProjects.length > 1 && (
                        <button
                          type="button"
                          onClick={() => onDeleteProject(proj.id)}
                          title="Vymazať projekt"
                          className="p-2 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Collapsible Revision History */}
          <div className="pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setShowRevisionHistory((prev) => !prev)}
              className="flex items-center justify-between w-full text-xs font-bold uppercase tracking-wider text-slate-500 hover:text-[#0066FF] transition-colors cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <History className="w-4 h-4" />
                <span>História revízií aktívneho projektu ({(activeProject.history || []).length})</span>
              </span>
              {showRevisionHistory ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </button>

            {showRevisionHistory && (
              <div className="mt-3 space-y-2 max-h-56 overflow-y-auto pr-1">
                {(activeProject.history || []).length === 0 ? (
                  <p className="text-xs text-slate-500 italic">
                    Zatiaľ žiadne zaznamenané zmeny v histórii projektu.
                  </p>
                ) : (
                  (activeProject.history || []).map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs"
                    >
                      <div>
                        <div className="font-semibold text-slate-800">{entry.action}</div>
                        <div className="text-[11px] text-slate-500 font-mono">
                          {entry.timestamp} • {entry.author}
                        </div>
                      </div>
                      {entry.snapshot && (
                        <button
                          type="button"
                          onClick={() => onRestoreHistorySnapshot(entry.snapshot!)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-slate-300 hover:border-[#0066FF] text-slate-700 hover:text-[#0066FF] font-semibold text-[11px] cursor-pointer"
                        >
                          <RotateCcw className="w-3 h-3" />
                          Obnoviť
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN (5 cols): PRESET ENGINEERING TEMPLATES */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
          <div className="border-b border-slate-100 pb-4">
            <div className="flex items-center gap-2">
              <FolderPlus className="w-5 h-5 text-[#0066FF]" />
              <h2 className="text-lg font-extrabold text-slate-900">
                Vzorové šablóny rozvádzačov (STN)
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Rýchle vytvorenie kompletného rozvádzača podľa typu objektu jedným kliknutím.
            </p>
          </div>

          <div className="space-y-3">
            {templateEntries.map((tpl) => (
              <div
                key={tpl.key}
                className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 hover:bg-blue-50/40 hover:border-[#0066FF]/50 transition-all flex flex-col justify-between gap-3"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="px-2 py-0.5 rounded bg-blue-100/80 text-[#0066FF] font-mono text-[10px] font-bold">
                      {tpl.badge}
                    </span>
                    <span className="font-mono text-[11px] text-slate-500 font-semibold">
                      {tpl.specs}
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-slate-900">{tpl.title}</h3>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">{tpl.desc}</p>
                </div>

                <div className="flex items-center justify-end">
                  <button
                    type="button"
                    onClick={() => onCreateFromTemplate(tpl.key)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white hover:bg-[#0066FF] text-[#0066FF] hover:text-white border border-[#0066FF]/40 text-xs font-bold transition-all shadow-xs cursor-pointer"
                  >
                    <FileCode2 className="w-3.5 h-3.5" />
                    <span>Vytvoriť rozvádzač zo šablóny</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
