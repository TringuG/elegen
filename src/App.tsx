import React, { useState, useEffect } from 'react';
import {
  NavigationSection,
  SchemaDisplayMode,
  SwitchboardProject,
} from './types/electrical';
import {
  PROJECT_TEMPLATES,
  applySupplySystemChange,
  calculateDinRailAllocation,
  calculatePhaseLoad,
  getEffectiveInternalDevice,
  getEffectiveUpstreamBreaker,
  validateStnCompliance,
} from './utils/electricalEngine';
import { StepByStepWizardView } from './components/StepByStepWizardView';
import { ElectricalSchemaCanvas } from './components/ElectricalSchemaCanvas';
import { DashboardAndProjectsView } from './components/DashboardAndProjectsView';
import { SmartDesignerAndPhaseBalancingView } from './components/SmartDesignerAndPhaseBalancingView';
import { SmartValidationAndComponentLibraryView } from './components/SmartValidationAndComponentLibraryView';
import { ElectricalCalculatorView } from './components/ElectricalCalculatorView';
import { DistributionBoard3DView } from './components/DistributionBoard3DView';
import { ProfessionalExportView } from './components/ProfessionalExportView';
import { AutoCircuitImportView } from './components/AutoCircuitImportView';
import { SwitchboardManufacturingView } from './components/SwitchboardManufacturingView';
import { AutoSchemaGeneratorModal } from './components/AutoSchemaGeneratorModal';
import { exportCleanSchemaToPdf } from './utils/pdfSchemaExport';
import {
  Zap,
  FolderKanban,
  Wand2,
  Cpu,
  PackageSearch,
  FileSpreadsheet,
  ShieldCheck,
  Calculator,
  Box,
  Settings,
  RotateCcw,
  Save,
  Check,
  AlertTriangle,
  XCircle,
  ClipboardPaste,
  Sliders,
  ChevronDown,
  ChevronRight,
  Activity,
  Sparkles,
  FileCode2,
  Download,
  Award,
  Menu,
  X,
} from 'lucide-react';

const STORAGE_KEY_PROJECTS = 'elektro_schema_pro_saved_projects_v3';
const STORAGE_KEY_ACTIVE_ID = 'elektro_schema_pro_active_id_v3';

const PRIMARY_NAV_ITEMS: {
  id: NavigationSection;
  label: string;
  shortLabel?: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  {
    id: 'dashboard',
    label: 'Projekty',
    subtitle: 'Zoznam a prehľad rozvádzačov',
    icon: FolderKanban,
  },
  {
    id: 'smart-designer',
    label: 'Nový rozvádzač',
    subtitle: 'Sprievodca návrhom krok za krokom',
    icon: Wand2,
  },
  {
    id: 'schema-editor',
    label: 'Editor schémy',
    subtitle: 'Interaktívna 1P / 3P výkresová schéma',
    icon: Cpu,
  },
  {
    id: 'manufacturing',
    label: 'Výroba & Štítok',
    subtitle: 'Výrobný štítok, kusová skúška a CE',
    icon: Award,
  },
  {
    id: 'component-library',
    label: 'Komponenty',
    subtitle: 'Katalóg prístrojov Eaton, OEZ, Hager',
    icon: PackageSearch,
  },
  {
    id: 'documentation',
    label: 'Dokumentácia a export',
    shortLabel: 'Dokumentácia & PDF',
    subtitle: 'Výkaz materiálu, sprievodná správa a PDF',
    icon: FileSpreadsheet,
  },
];

const ADVANCED_NAV_ITEMS: {
  id: NavigationSection;
  label: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  {
    id: 'auto-import',
    label: 'Import okruhov zo zoznamu',
    subtitle: 'Hromadné vloženie textového zoznamu',
    icon: ClipboardPaste,
  },
  {
    id: 'new-project',
    label: 'Rozdelenie fáz a AI návrh',
    subtitle: 'Optimalizácia L1/L2/L3 a generátor',
    icon: Sparkles,
  },
  {
    id: 'calculations',
    label: 'Výpočty (Ib, ΔU, Zs, Ik)',
    subtitle: 'Elektrotechnické dimenzovanie vodičov',
    icon: Calculator,
  },
  {
    id: 'validation',
    label: 'Kontrola súladu s STN',
    subtitle: 'Automatický audit STN EN 61439',
    icon: ShieldCheck,
  },
  {
    id: 'board-3d',
    label: '3D náhľad a DIN lišty',
    subtitle: 'Fyzické osadenie modulov v skrini',
    icon: Box,
  },
  {
    id: 'settings',
    label: 'Nastavenia aplikácie',
    subtitle: 'Predvolený projektant, normy a úložisko',
    icon: Settings,
  },
];

function getInitialSavedProjects(): SwitchboardProject[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PROJECTS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0 && parsed[0]?.name) {
        return parsed;
      }
    }
  } catch (e) {
    console.error('Chyba načítania uložených projektov:', e);
  }
  const templates = Object.values(PROJECT_TEMPLATES);
  return templates.map((t) => JSON.parse(JSON.stringify(t)));
}

export function App() {
  const [savedProjects, setSavedProjects] = useState<SwitchboardProject[]>(getInitialSavedProjects);

  const [activeProject, setActiveProject] = useState<SwitchboardProject>(() => {
    try {
      const savedId = localStorage.getItem(STORAGE_KEY_ACTIVE_ID);
      const list = getInitialSavedProjects();
      if (savedId) {
        const found = list.find((p) => p.id === savedId);
        if (found) return found;
      }
      return list[0];
    } catch {
      return JSON.parse(JSON.stringify(PROJECT_TEMPLATES['rodinny_dom_3f']));
    }
  });

  const [activeSection, setActiveSection] = useState<NavigationSection>('dashboard');
  const [displayMode, setDisplayMode] = useState<SchemaDisplayMode>('single-line');
  const [showAdvancedNav, setShowAdvancedNav] = useState<boolean>(false);
  const [saveToast, setSaveToast] = useState<string | null>(null);
  const [confirmResetModal, setConfirmResetModal] = useState<boolean>(false);
  const [autoSchemaModalOpen, setAutoSchemaModalOpen] = useState<boolean>(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);

  // Sync activeProject into savedProjects & localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_ACTIVE_ID, activeProject.id);
    } catch {
      // ignore
    }
  }, [activeProject.id]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_PROJECTS, JSON.stringify(savedProjects));
    } catch {
      // ignore
    }
  }, [savedProjects]);

  const triggerToast = (msg: string) => {
    setSaveToast(msg);
    setTimeout(() => setSaveToast(null), 2600);
  };

  const handleProjectChange = (updated: SwitchboardProject, actionDescription?: string) => {
    const nowStr = new Date().toLocaleString('sk-SK');
    let nextProject = { ...updated };

    if (actionDescription) {
      const snapshotJson = JSON.stringify({
        ...updated,
        history: undefined,
      });
      const newEntry = {
        id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: nowStr,
        action: actionDescription,
        author: updated.designerName || 'Projektant',
        snapshot: snapshotJson,
      };
      nextProject = {
        ...updated,
        history: [newEntry, ...(updated.history || []).slice(0, 29)],
      };
    }

    setActiveProject(nextProject);
    setSavedProjects((prev) => {
      const exists = prev.some((p) => p.id === nextProject.id);
      if (exists) {
        return prev.map((p) => (p.id === nextProject.id ? nextProject : p));
      }
      return [nextProject, ...prev];
    });
  };

  const handleSelectProject = (project: SwitchboardProject) => {
    setActiveProject(project);
    triggerToast(`Otvorený: ${project.name}`);
  };

  const handleCreateFromTemplate = (templateKey: string) => {
    const tpl = PROJECT_TEMPLATES[templateKey] || Object.values(PROJECT_TEMPLATES)[0];
    if (!tpl) return;
    const clone: SwitchboardProject = JSON.parse(JSON.stringify(tpl));
    clone.id = `proj-${Date.now()}`;
    clone.projectDate = new Date().toLocaleDateString('sk-SK');
    clone.history = [
      {
        id: `hist-${Date.now()}`,
        timestamp: new Date().toLocaleString('sk-SK'),
        action: `Vytvorený projekt zo šablóny: ${tpl.name}`,
        author: clone.designerName,
      },
    ];
    setSavedProjects((prev) => [clone, ...prev]);
    setActiveProject(clone);
    setActiveSection('smart-designer');
    triggerToast(`Vytvorený: ${clone.name}`);
  };

  const handleCreateBlankProject = (supplySystem: '1f' | '3f') => {
    const baseTemplate =
      supplySystem === '1f'
        ? PROJECT_TEMPLATES['byt_1f_230v']
        : PROJECT_TEMPLATES['rodinny_dom_3f'];
    const blank: SwitchboardProject = JSON.parse(JSON.stringify(baseTemplate));
    blank.id = `proj-blank-${Date.now()}`;
    blank.name =
      supplySystem === '1f'
        ? 'Nový 1-fázový rozvádzač (230 V)'
        : 'Nový 3-fázový rozvádzač (400 V)';
    blank.projectNumber = `ESG-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`;
    blank.projectDate = new Date().toLocaleDateString('sk-SK');
    const configured = applySupplySystemChange(blank, supplySystem);
    configured.rcds = configured.rcds.slice(0, 1);
    configured.circuits = configured.circuits.slice(0, 2).map((c, idx) => ({
      ...c,
      id: `circ-init-${idx + 1}`,
      label: `FA${idx + 1}`,
      rcdId: configured.rcds[0]?.id || 'NONE',
    }));
    configured.history = [
      {
        id: `hist-${Date.now()}`,
        timestamp: new Date().toLocaleString('sk-SK'),
        action: `Vytvorený čistý ${supplySystem === '1f' ? '1-fázový' : '3-fázový'} rozvádzač`,
        author: configured.designerName,
      },
    ];

    setSavedProjects((prev) => [configured, ...prev]);
    setActiveProject(configured);
    setActiveSection('smart-designer');
    triggerToast(`Vytvorený čistý ${supplySystem.toUpperCase()} rozvádzač`);
  };

  const handleRenameProject = (projectId: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setSavedProjects((prev) =>
      prev.map((p) => (p.id === projectId ? { ...p, name: trimmed } : p))
    );
    if (activeProject.id === projectId) {
      setActiveProject((prev) => ({ ...prev, name: trimmed }));
    }
    triggerToast('Názov projektu upravený');
  };

  const handleDuplicateProject = (project: SwitchboardProject) => {
    const copy: SwitchboardProject = JSON.parse(JSON.stringify(project));
    copy.id = `proj-copy-${Date.now()}`;
    copy.name = `${project.name} (Kópia)`;
    copy.projectDate = new Date().toLocaleDateString('sk-SK');
    setSavedProjects((prev) => [copy, ...prev]);
    setActiveProject(copy);
    triggerToast('Projekt skopírovaný');
  };

  const handleDeleteProject = (projectId: string) => {
    if (savedProjects.length <= 1) return;
    const remaining = savedProjects.filter((p) => p.id !== projectId);
    setSavedProjects(remaining);
    if (activeProject.id === projectId && remaining[0]) {
      setActiveProject(remaining[0]);
    }
    triggerToast('Projekt vymazaný');
  };

  const handleImportProjectJson = (imported: SwitchboardProject) => {
    const projectWithId: SwitchboardProject = {
      ...imported,
      id: imported.id || `proj-imp-${Date.now()}`,
    };
    setSavedProjects((prev) => {
      const filtered = prev.filter((p) => p.id !== projectWithId.id);
      return [projectWithId, ...filtered];
    });
    setActiveProject(projectWithId);
    triggerToast(`Importovaný: ${projectWithId.name}`);
  };

  const handleRestoreHistorySnapshot = (snapshotJson: string) => {
    try {
      const restored = JSON.parse(snapshotJson) as SwitchboardProject;
      handleProjectChange(
        {
          ...restored,
          id: activeProject.id,
          history: activeProject.history,
        },
        'Obnovená verzia z histórie revízií'
      );
      triggerToast('Verzia z histórie obnovená');
    } catch (e) {
      console.error('Chyba obnovy snímky:', e);
    }
  };

  const handleResetAllProjects = () => {
    localStorage.removeItem(STORAGE_KEY_PROJECTS);
    localStorage.removeItem(STORAGE_KEY_ACTIVE_ID);
    const defaults = getInitialSavedProjects();
    setSavedProjects(defaults);
    setActiveProject(defaults[0]);
    setConfirmResetModal(false);
    triggerToast('Obnovené predvolené vzorové projekty');
  };

  const upstream = getEffectiveUpstreamBreaker(activeProject);
  const internalDev = getEffectiveInternalDevice(activeProject);
  const din = calculateDinRailAllocation(activeProject);
  const load = calculatePhaseLoad(activeProject);
  const issues = validateStnCompliance(activeProject);

  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const warningCount = issues.filter((i) => i.severity === 'warning').length;
  const isAdvancedActive = ADVANCED_NAV_ITEMS.some((item) => item.id === activeSection);

  return (
    <div className="min-h-screen flex flex-col bg-[#F1F5F9] text-slate-900 selection:bg-[#0066FF] selection:text-white">
      {/* TOP STRUCTURAL HEADER — DEEP NAVY / ANTHRACITE (#0B1120) */}
      <header className="no-print sticky top-0 z-40 bg-[#0B1120] border-b border-slate-800/90 text-white shadow-md">
        <div className="max-w-[1920px] mx-auto px-3 sm:px-4 lg:px-6 min-h-14 sm:min-h-16 py-2 flex items-center justify-between gap-2 sm:gap-4">
          {/* Brand Logo & System Identity */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 shrink-0">
            <button
              type="button"
              onClick={() => setActiveSection('dashboard')}
              className="flex items-center gap-2 sm:gap-2.5 text-left group focus:outline-none cursor-pointer shrink-0"
            >
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-[#0066FF] to-[#0EA5E9] flex items-center justify-center shadow-lg shadow-[#0066FF]/30 group-hover:scale-105 transition-transform shrink-0">
                <Zap className="w-4 h-4 sm:w-5 sm:h-5 text-white fill-white/20" />
              </div>
              <div className="flex items-center gap-1.5 whitespace-nowrap">
                <span className="text-xs sm:text-base font-extrabold tracking-tight text-white">
                  ELEKTRO SCHEMA
                </span>
                <span className="hidden lg:inline text-xs sm:text-base font-extrabold tracking-tight text-white">
                  GENERATOR
                </span>
                <span className="px-1.5 py-0.5 text-[9px] sm:text-[10px] font-mono font-bold uppercase tracking-wider bg-[#0066FF] text-white rounded">
                  PRO
                </span>
              </div>
            </button>

            <div className="hidden 2xl:block h-7 w-px bg-slate-800 mx-1 shrink-0" />

            {/* Active Switchboard Quick Badge */}
            <div className="hidden 2xl:flex items-center gap-2.5 bg-[#0F172A] border border-slate-800 rounded-xl px-3.5 py-1.5 min-w-0">
              <div className="min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Aktívny projekt
                </div>
                <div className="text-xs font-bold text-white truncate max-w-[200px]">
                  {activeProject.name}
                </div>
              </div>
              <span className="px-2 py-0.5 rounded bg-[#0066FF]/20 text-[#38BDF8] border border-[#0066FF]/40 font-mono text-[11px] font-bold whitespace-nowrap shrink-0">
                {activeProject.supplySystem === '3f' ? '3F 400 V' : '1F 230 V'} • {activeProject.networkSystem}
              </span>
              <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 font-mono text-[11px] font-semibold whitespace-nowrap shrink-0">
                {upstream.designation}: {upstream.enabled ? `${upstream.poles} ${upstream.characteristic}${upstream.ratedCurrent}A` : 'Vyp.'}
              </span>
              <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 font-mono text-[11px] font-semibold whitespace-nowrap shrink-0">
                {internalDev.designation}: {internalDev.enabled ? `${internalDev.poles} ${internalDev.ratedCurrent}A` : 'Vyp.'}
              </span>
            </div>
          </div>

          {/* Right Engineering Telemetry & Quick Actions */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Live STN Validation Pill */}
            <button
              type="button"
              onClick={() => {
                setShowAdvancedNav(true);
                setActiveSection('validation');
              }}
              title="Otvoriť kontrolu súladu s normami STN"
              className={`hidden md:flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all whitespace-nowrap cursor-pointer shrink-0 ${
                errorCount > 0
                  ? 'bg-red-500/15 border-red-500/40 text-red-300 hover:bg-red-500/25'
                  : warningCount > 0
                  ? 'bg-amber-500/15 border-amber-500/40 text-amber-300 hover:bg-amber-500/25'
                  : 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25'
              }`}
            >
              {errorCount > 0 ? (
                <>
                  <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                  <span className="hidden xl:inline">{errorCount} chýb STN</span>
                  <span className="xl:hidden font-mono font-bold">{errorCount}</span>
                </>
              ) : warningCount > 0 ? (
                <>
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span className="hidden xl:inline">{warningCount} upozornení</span>
                  <span className="xl:hidden font-mono font-bold">{warningCount}</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span className="hidden xl:inline">STN 61439 OK</span>
                  <span className="xl:hidden font-mono font-bold">STN OK</span>
                </>
              )}
            </button>

            {/* Quick Stats */}
            <div className="hidden 2xl:flex items-center gap-2.5 bg-[#0F172A] border border-slate-800 rounded-lg px-3 py-1.5 text-xs font-mono whitespace-nowrap">
              <span className="text-slate-400">
                Okruhy: <strong className="text-white">{activeProject.circuits.length}</strong>
              </span>
              <span className="text-slate-700">|</span>
              <span className="text-slate-400">
                Chrániče: <strong className="text-white">{activeProject.rcds.length}</strong>
              </span>
              <span className="text-slate-700">|</span>
              <span className="text-slate-400">
                Moduly:{' '}
                <strong className="text-[#38BDF8]">
                  {din.totalUsedModules}/{din.totalCapacityModules} M
                </strong>
              </span>
            </div>

            {saveToast && (
              <div className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-bold whitespace-nowrap">
                <Check className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline">{saveToast}</span>
              </div>
            )}

            <button
              type="button"
              onClick={() => setAutoSchemaModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-xl bg-gradient-to-r from-[#0066FF] to-blue-600 hover:from-blue-600 hover:to-[#0052CC] text-white text-xs font-bold shadow-md shadow-[#0066FF]/30 transition-all cursor-pointer whitespace-nowrap shrink-0"
              title="Automaticky vytvoriť hotovú schému rozvádzača 1 klikom"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-300 animate-pulse shrink-0" />
              <span className="hidden xl:inline">Automatické vytvorenie schémy</span>
              <span className="xl:hidden">Auto schéma</span>
            </button>

            <button
              type="button"
              onClick={() => {
                handleProjectChange(activeProject, 'Manuálne uloženie projektu');
                triggerToast('Projekt uložený');
              }}
              className="flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-lg bg-[#1E293B] hover:bg-slate-700 text-white text-xs font-bold border border-slate-700/80 transition-all cursor-pointer whitespace-nowrap shrink-0"
            >
              <Save className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">Uložiť</span>
            </button>

            <button
              type="button"
              onClick={() => setConfirmResetModal(true)}
              className="p-1.5 sm:p-2 rounded-lg bg-[#1E293B] hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/80 transition-colors cursor-pointer shrink-0"
              title="Obnoviť vzorové projekty"
            >
              <RotateCcw className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>
          </div>
        </div>

        {/* Mobile Horizontal Module Switcher (under header on screens < lg) */}
        <div className="lg:hidden bg-[#0F172A] border-t border-slate-800/90 px-3 py-2 flex items-center justify-between gap-2 overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-1.5 shrink-0">
            {PRIMARY_NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setActiveSection(item.id);
                    setMobileMenuOpen(false);
                  }}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                    isActive
                      ? 'bg-[#0066FF] text-white shadow-sm'
                      : 'text-slate-300 hover:text-white hover:bg-[#1E293B]'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span>{item.shortLabel || item.label}</span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            className={`p-1.5 rounded-lg border text-xs font-bold flex items-center gap-1 shrink-0 cursor-pointer ${
              mobileMenuOpen || isAdvancedActive
                ? 'bg-[#0066FF]/20 border-[#0066FF]/60 text-[#38BDF8]'
                : 'bg-[#1E293B] border-slate-700 text-slate-300 hover:text-white'
            }`}
            title="Rozbaliť ďalšie nástroje a telemetriu"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span className="text-[11px] font-mono">Viac</span>
            {mobileMenuOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* Mobile Expandable Panel for Advanced Tools & Telemetry */}
        {mobileMenuOpen && (
          <div className="lg:hidden bg-[#0B1120] border-t border-slate-800 p-4 space-y-4 animate-in slide-in-from-top-2 duration-150">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                Pokročilé nástroje &amp; nastavenia
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {ADVANCED_NAV_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeSection === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setActiveSection(item.id);
                        setMobileMenuOpen(false);
                      }}
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-all cursor-pointer ${
                        isActive
                          ? 'bg-[#0066FF] text-white font-bold'
                          : 'bg-[#0F172A] text-slate-300 hover:bg-[#1E293B] hover:text-white'
                      }`}
                    >
                      <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-[#38BDF8]'}`} />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold truncate">{item.label}</div>
                        <div className={`text-[10px] truncate ${isActive ? 'text-blue-100' : 'text-slate-400'}`}>
                          {item.subtitle}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Quick Mobile Telemetry */}
            <div className="p-3 bg-[#0F172A] rounded-xl border border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-300 flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-[#38BDF8]" />
                  Výpočtový príkon Ps
                </span>
                <span className="font-mono font-bold text-[#38BDF8]">{load.simultaneousKw} kW</span>
              </div>
              <div className="text-[11px] text-slate-400 font-mono flex items-center justify-between">
                <span>Asymetria fáz:</span>
                <span className={`font-bold ${load.asymmetryPercent > 20 ? 'text-red-400' : 'text-emerald-400'}`}>
                  {load.asymmetryPercent} %
                </span>
              </div>
            </div>
          </div>
        )}
      </header>

      {/* MAIN APPLICATION BODY: DEEP NAVY SIDEBAR + CRISP LIGHT WORKSPACE */}
      <div className="flex-1 max-w-[1920px] w-full mx-auto flex flex-col lg:flex-row">
        {/* LEFT STRUCTURAL SIDEBAR — DEEP NAVY / ANTHRACITE (#0F172A) */}
        <aside className="no-print hidden lg:flex lg:w-72 shrink-0 bg-[#0F172A] border-r border-slate-800/90 text-slate-200 flex-col justify-between">
          <div className="p-4 space-y-6">
            {/* PRIMARY 5 NAVIGATION ITEMS (SECTION 4 REQUIREMENT) */}
            <div>
              <div className="px-3 mb-2.5 flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Hlavná navigácia
                </span>
                <span className="text-[10px] font-mono text-slate-500">5 modulov</span>
              </div>
              <nav className="space-y-1.5">
                {PRIMARY_NAV_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeSection === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setActiveSection(item.id)}
                      className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-left transition-all cursor-pointer ${
                        isActive
                          ? 'bg-[#0066FF] text-white shadow-md shadow-[#0066FF]/25 font-bold'
                          : 'text-slate-300 hover:bg-[#1E293B] hover:text-white font-medium'
                      }`}
                    >
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                          isActive ? 'bg-white/15 text-white' : 'bg-[#1E293B] text-[#38BDF8]'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm leading-tight truncate">{item.label}</div>
                        <div
                          className={`text-[11px] truncate mt-0.5 ${
                            isActive ? 'text-blue-100' : 'text-slate-400'
                          }`}
                        >
                          {item.subtitle}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </nav>
            </div>

            {/* COLLAPSIBLE ADVANCED TOOLS & SETTINGS */}
            <div className="pt-2 border-t border-slate-800/80">
              <button
                type="button"
                onClick={() => setShowAdvancedNav((prev) => !prev)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer ${
                  isAdvancedActive || showAdvancedNav
                    ? 'text-[#38BDF8] bg-[#1E293B]/70'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-[#1E293B]/40'
                }`}
              >
                <span className="flex items-center gap-2">
                  <Sliders className="w-3.5 h-3.5" />
                  <span>Pokročilé nástroje ({ADVANCED_NAV_ITEMS.length})</span>
                </span>
                {showAdvancedNav || isAdvancedActive ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
              </button>

              {(showAdvancedNav || isAdvancedActive) && (
                <div className="mt-2 space-y-1">
                  {ADVANCED_NAV_ITEMS.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeSection === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setActiveSection(item.id)}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-all cursor-pointer ${
                          isActive
                            ? 'bg-[#0066FF] text-white font-bold shadow-sm'
                            : 'text-slate-300 hover:bg-[#1E293B] hover:text-white font-medium'
                        }`}
                      >
                        <Icon
                          className={`w-4 h-4 shrink-0 ${
                            isActive ? 'text-white' : 'text-[#38BDF8]'
                          }`}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-xs leading-tight truncate">{item.label}</div>
                          <div
                            className={`text-[10px] truncate ${
                              isActive ? 'text-blue-100' : 'text-slate-400'
                            }`}
                          >
                            {item.subtitle}
                          </div>
                        </div>
                        {item.id === 'validation' && (errorCount > 0 || warningCount > 0) && (
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                              errorCount > 0
                                ? 'bg-red-500 text-white'
                                : 'bg-amber-400 text-slate-950'
                            }`}
                          >
                            {errorCount > 0 ? errorCount : warningCount}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* SIDEBAR TECHNICAL TELEMETRY CARD */}
          <div className="p-4 border-t border-slate-800/80 bg-[#0B1120]/60 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-300 flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-[#38BDF8]" />
                Výpočtový príkon Ps
              </span>
              <span className="font-mono font-bold text-[#38BDF8]">
                {load.simultaneousKw} kW
              </span>
            </div>

            {/* Phase Balance Mini Bars */}
            <div className="space-y-1.5">
              {(activeProject.phaseCount === 3
                ? (['L1', 'L2', 'L3'] as const)
                : (['L1'] as const)
              ).map((ph) => {
                const phData = load[ph];
                const pct = Math.min(100, phData.utilizationPercent || 0);
                return (
                  <div key={ph} className="space-y-0.5">
                    <div className="flex justify-between text-[10px] font-mono">
                      <span className="text-slate-400">{ph}</span>
                      <span className="text-slate-200 font-semibold">
                        {phData.currentA} A ({phData.utilizationPercent}%)
                      </span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          pct > 95
                            ? 'bg-red-500'
                            : pct > 80
                            ? 'bg-amber-400'
                            : 'bg-[#0066FF]'
                        }`}
                        style={{ width: `${Math.max(4, pct)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400 font-mono">
              <span>Asymetria fáz:</span>
              <span
                className={`font-bold ${
                  load.asymmetryPercent > 20
                    ? 'text-red-400'
                    : load.asymmetryPercent > 12
                    ? 'text-amber-400'
                    : 'text-emerald-400'
                }`}
              >
                {load.asymmetryPercent} %
              </span>
            </div>
          </div>
        </aside>

        {/* RIGHT LIGHT WORKSPACE AREA — CRISP LIGHT BACKGROUND (#F1F5F9) */}
        <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8 print:p-0 bg-[#F1F5F9] print:bg-white text-slate-900 overflow-x-hidden print:overflow-visible">
          {activeSection === 'dashboard' && (
            <DashboardAndProjectsView
              mode="dashboard"
              activeProject={activeProject}
              savedProjects={savedProjects}
              onSelectProject={handleSelectProject}
              onCreateFromTemplate={handleCreateFromTemplate}
              onCreateBlankProject={handleCreateBlankProject}
              onRenameProject={handleRenameProject}
              onDuplicateProject={handleDuplicateProject}
              onDeleteProject={handleDeleteProject}
              onImportProjectJson={handleImportProjectJson}
              onRestoreHistorySnapshot={handleRestoreHistorySnapshot}
              onNavigate={setActiveSection}
            />
          )}

          {activeSection === 'smart-designer' && (
            <StepByStepWizardView
              project={activeProject}
              onProjectChange={handleProjectChange}
              displayMode={displayMode}
              onDisplayModeChange={setDisplayMode}
              onOpenFullEditor={() => setActiveSection('schema-editor')}
              onOpenExport={() => setActiveSection('documentation')}
            />
          )}

          {activeSection === 'auto-import' && (
            <AutoCircuitImportView
              project={activeProject}
              onProjectChange={handleProjectChange}
              onNavigate={setActiveSection}
            />
          )}

          {activeSection === 'new-project' && (
            <SmartDesignerAndPhaseBalancingView
              project={activeProject}
              onChange={handleProjectChange}
              onNavigate={setActiveSection}
            />
          )}

          {activeSection === 'schema-editor' && (
            <div className="space-y-5 print:space-y-0">
              {/* Top Technical Bar for Full-Screen Schema Editor */}
              <div className="no-print bg-[#0B1120] text-white rounded-2xl p-4 sm:px-6 border border-slate-800 shadow-sm flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#0066FF]/20 border border-[#0066FF]/40 flex items-center justify-center text-[#38BDF8]">
                    <FileCode2 className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h1 className="text-lg font-extrabold tracking-tight text-white">
                        Editor elektrickej schémy (CAD)
                      </h1>
                      <span className="px-2 py-0.5 rounded bg-[#0066FF] text-white text-[11px] font-mono font-bold">
                        STN EN 60617
                      </span>
                    </div>
                    <p className="text-xs text-slate-400">
                      Jednopólové a viacpólové zapojenie • Tlačidlo „Tlač / PDF“ vytlačí čisto schému a k nej rozpis ističov a okruhov
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveSection('smart-designer')}
                    className="px-3.5 py-2 rounded-xl bg-[#1E293B] hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold transition-colors cursor-pointer"
                  >
                    Upraviť v sprievodcovi
                  </button>
                  <button
                    type="button"
                    onClick={() => exportCleanSchemaToPdf(activeProject, { displayMode, paperFormat: 'A3' })}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-sm transition-colors cursor-pointer"
                    title="Priamo stiahnuť čistý PDF súbor (elektrická schéma + tabuľka ktorý okruh je na ktorom ističi)"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Stiahnuť PDF (Schéma + Ističe)
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveSection('documentation')}
                    className="px-4 py-2 rounded-xl bg-[#0066FF] hover:bg-[#2563EB] text-white text-xs font-bold shadow-sm transition-colors cursor-pointer"
                  >
                    Dokumentácia a kusovník
                  </button>
                </div>
              </div>

              <div className="h-[520px] sm:h-[640px] lg:h-[740px] print:h-auto bg-white rounded-2xl border border-slate-200 print:border-0 shadow-sm print:shadow-none overflow-hidden print:overflow-visible">
                <ElectricalSchemaCanvas
                  project={activeProject}
                  displayMode={displayMode}
                  onDisplayModeChange={setDisplayMode}
                  onProjectChange={handleProjectChange}
                />
              </div>

              {/* On-Screen Breaker-to-Circuit Legend Card (Hidden in print because ElectricalSchemaCanvas prints its own compact table) */}
              <div className="no-print bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="text-sm font-extrabold uppercase tracking-wider text-slate-900">
                      Popis k schéme — Ktorý okruh je na ktorom ističi ({activeProject.circuits.length} vývodov)
                    </h3>
                    <p className="text-xs text-slate-500">
                      Tento prehľad sa automaticky vytlačí pod čistou schémou pri kliknutí na „Tlač / PDF (Schéma + Ističe)“.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
                    <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-800 font-bold">
                      {upstream.designation}: {upstream.enabled ? `${upstream.poles} ${upstream.characteristic}${upstream.ratedCurrent}A` : 'Nezahrnutý'}
                    </span>
                    <span className="px-2.5 py-1 rounded-lg bg-blue-50 text-[#0066FF] font-bold">
                      {internalDev.designation}: {internalDev.enabled ? `${internalDev.deviceType} (${internalDev.poles} ${internalDev.ratedCurrent}A)` : 'Neosadený'}
                    </span>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-mono uppercase text-slate-500">
                        <th className="py-2 px-3">Istič v schéme</th>
                        <th className="py-2 px-3">Ktorý okruh / spotrebič je na ističi</th>
                        <th className="py-2 px-3">Typ a hodnota ističa</th>
                        <th className="py-2 px-3">Prúdový chránič</th>
                        <th className="py-2 px-3">Fáza</th>
                        <th className="py-2 px-3">Kábel a prierez</th>
                        <th className="py-2 px-3 text-right">Príkon</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono">
                      {activeProject.circuits.map((c) => {
                        const rcd = activeProject.rcds.find((r) => r.id === c.rcdId);
                        return (
                          <tr key={c.id} className="hover:bg-slate-50">
                            <td className="py-2 px-3 font-bold text-[#0066FF]">{c.label}</td>
                            <td className="py-2 px-3 font-sans font-bold text-slate-900">{c.name}</td>
                            <td className="py-2 px-3 font-bold text-slate-800">
                              {c.poles} {c.characteristic}{c.ratedCurrent} A ({c.model})
                            </td>
                            <td className="py-2 px-3 text-slate-700">
                              {rcd ? `${rcd.label} (${rcd.ratedCurrent}A/${rcd.sensitivity}mA)` : 'Bez FI (priamo)'}
                            </td>
                            <td className="py-2 px-3 font-bold text-slate-800">{c.phase}</td>
                            <td className="py-2 px-3 text-emerald-700 font-semibold">{c.cable}</td>
                            <td className="py-2 px-3 text-right text-slate-700">{c.powerKw.toFixed(2)} kW</td>
                          </tr>
                        );
                      })}
                      {activeProject.rcds
                        .filter((r) => r.deviceKind === 'RCBO' && !activeProject.circuits.some((c) => c.rcdId === r.id))
                        .map((rcbo) => (
                          <tr key={rcbo.id} className="hover:bg-slate-50">
                            <td className="py-2 px-3 font-bold text-amber-600">{rcbo.label}</td>
                            <td className="py-2 px-3 font-sans font-bold text-slate-900">
                              {rcbo.circuitName || rcbo.notes || 'Samostatný okruh RCBO'}
                            </td>
                            <td className="py-2 px-3 font-bold text-slate-800">
                              RCBO {rcbo.poles} {rcbo.characteristic || 'B'}{rcbo.ratedCurrent} A ({rcbo.model})
                            </td>
                            <td className="py-2 px-3 text-slate-700">
                              Integrovaný ističochránič ({rcbo.sensitivity}mA, Typ {rcbo.type})
                            </td>
                            <td className="py-2 px-3 font-bold text-slate-800">
                              {rcbo.phase || (rcbo.poles === '4P' ? 'L1,L2,L3' : 'L1')}
                            </td>
                            <td className="py-2 px-3 text-emerald-700 font-semibold">
                              {rcbo.cableType || 'CYKY-J 3x2,5 mm²'}
                            </td>
                            <td className="py-2 px-3 text-right text-slate-700">
                              {(rcbo.powerKw ?? 0.6).toFixed(2)} kW
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeSection === 'manufacturing' && (
            <SwitchboardManufacturingView
              project={activeProject}
              onProjectChange={handleProjectChange}
              onNavigateToSchema={() => setActiveSection('schema-editor')}
            />
          )}

          {activeSection === 'validation' && (
            <SmartValidationAndComponentLibraryView
              mode="validation"
              project={activeProject}
              onProjectChange={handleProjectChange}
            />
          )}

          {activeSection === 'component-library' && (
            <SmartValidationAndComponentLibraryView
              mode="component-library"
              project={activeProject}
              onProjectChange={handleProjectChange}
            />
          )}

          {activeSection === 'calculations' && (
            <ElectricalCalculatorView
              project={activeProject}
              onProjectChange={handleProjectChange}
            />
          )}

          {activeSection === 'board-3d' && (
            <DistributionBoard3DView project={activeProject} />
          )}

          {activeSection === 'documentation' && (
            <ProfessionalExportView
              mode="documentation"
              project={activeProject}
              onProjectChange={handleProjectChange}
              onResetAllProjects={handleResetAllProjects}
            />
          )}

          {(activeSection === 'settings' || activeSection === 'advanced-settings') && (
            <ProfessionalExportView
              mode="settings"
              project={activeProject}
              onProjectChange={handleProjectChange}
              onResetAllProjects={handleResetAllProjects}
            />
          )}
        </main>
      </div>

      {/* AUTO SCHEMA GENERATOR MODAL */}
      <AutoSchemaGeneratorModal
        isOpen={autoSchemaModalOpen}
        onClose={() => setAutoSchemaModalOpen(false)}
        onGenerateProject={(newProj, desc) => {
          handleSelectProject(newProj);
          setActiveSection('schema-editor');
          triggerToast('Schéma rozvádzača bola úspešne vytvorená');
        }}
      />

      {/* RESET CONFIRMATION MODAL */}
      {confirmResetModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-red-50 border border-red-200 flex items-center justify-center text-red-600">
                <RotateCcw className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Obnoviť vzorové projekty?
                </h3>
                <p className="text-xs text-slate-500">
                  Lokálne uložené projekty budú nahradené východiskovými vzorovými šablónami.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmResetModal(false)}
                className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-bold cursor-pointer"
              >
                Zrušiť
              </button>
              <button
                type="button"
                onClick={handleResetAllProjects}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold cursor-pointer"
              >
                Obnoviť vzorové projekty
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
