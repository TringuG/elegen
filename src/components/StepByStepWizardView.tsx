import React, { useState } from 'react';
import {
  BreakerCharacteristic,
  BreakingCapacity,
  CircuitCategory,
  CircuitConfig,
  InternalDeviceTopologyPosition,
  InternalMainDeviceConfig,
  InternalMainDeviceCurrent,
  InternalMainDeviceType,
  MainBreakerCurrent,
  Manufacturer,
  NetworkSystemType,
  ObjectType,
  PhaseAllocation,
  PolesType,
  RcdConfig,
  RcdDeviceKind,
  RcdPoles,
  RcdRatedCurrent,
  RcdSensitivity,
  RcdType,
  SchemaDisplayMode,
  SwitchboardProject,
  UpstreamBreakerPlacement,
} from '../types/electrical';
import {
  applySupplySystemChange,
  balanceCircuitPhases,
  calculatePhaseLoad,
  getEffectiveElectricityMeter,
  getEffectiveInternalDevice,
  getEffectiveUpstreamBreaker,
  getPolesModuleCount,
  INTERNAL_DEVICE_CURRENTS,
  INTERNAL_DEVICE_TYPES,
  MAIN_BREAKER_CURRENTS,
  MANUFACTURERS,
  RCBO_CURRENTS,
  RCCB_CURRENTS,
  RCD_SENSITIVITIES,
  RCD_TYPES,
  suggestCircuitBreakerModel,
  suggestInternalMainDeviceModel,
  suggestMainBreakerModel,
  suggestRcdModel,
  UPSTREAM_PLACEMENTS,
  validateStnCompliance,
} from '../utils/electricalEngine';
import { AutoCircuitImportView } from './AutoCircuitImportView';
import { ElectricalSchemaCanvas } from './ElectricalSchemaCanvas';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Edit3,
  FileSpreadsheet,
  FileText,
  Layers,
  Plus,
  Settings,
  Shield,
  Sparkles,
  Trash2,
} from 'lucide-react';

interface Props {
  project: SwitchboardProject;
  onProjectChange: (updated: SwitchboardProject, actionDescription?: string) => void;
  displayMode: SchemaDisplayMode;
  onDisplayModeChange: (mode: SchemaDisplayMode) => void;
  onOpenFullEditor: () => void;
  onOpenExport: () => void;
  isProMode?: boolean;
}

const WIZARD_STEPS = [
  { step: 1, title: 'Základné údaje', shortTitle: '1. Základné údaje' },
  { step: 2, title: 'Hlavné prvky', shortTitle: '2. Hlavné prvky' },
  { step: 3, title: 'Prúdové chrániče', shortTitle: '3. Prúdové chrániče' },
  { step: 4, title: 'Okruhy', shortTitle: '4. Okruhy' },
  { step: 5, title: 'Rozdelenie fáz', shortTitle: '5. Rozdelenie fáz' },
  { step: 6, title: 'Výsledná schéma', shortTitle: '6. Výsledná schéma' },
] as const;

const OBJECT_TYPES: ObjectType[] = [
  'Rodinný dom',
  'Byt',
  'Garáž / Dielňa',
  'Komerčná prevádzka',
  'Chata / Rekreačný objekt',
  'Iné',
];

const NETWORK_SYSTEMS: NetworkSystemType[] = ['TN-C-S', 'TN-S', 'TN-C', 'TT'];

const CIRCUIT_CATEGORIES: CircuitCategory[] = [
  'Osvetlenie',
  'Zásuvky',
  'Kuchyňa / Spotrebiče',
  'Kúpeľňa / Práčovňa',
  'Technológia / Kúrenie',
  'Exteriér / Garáž / EV',
  'Rezerva',
];

export const StepByStepWizardView: React.FC<Props> = ({
  project,
  onProjectChange,
  displayMode,
  onDisplayModeChange,
  onOpenFullEditor,
  onOpenExport,
  isProMode = false,
}) => {
  const [activeStep, setActiveStep] = useState<number>(1);
  const [showBasicAdvanced, setShowBasicAdvanced] = useState(false);

  // Step 2 edit states
  const [editingUpstream, setEditingUpstream] = useState(false);
  const [editingMeter, setEditingMeter] = useState(false);
  const [editingInternal, setEditingInternal] = useState(false);
  const [editingSpd, setEditingSpd] = useState(false);
  const [showInternalAdvanced, setShowInternalAdvanced] = useState(false);

  // Step 3 edit state
  const [editingRcdId, setEditingRcdId] = useState<string | null>(null);
  const [showRcdAdvancedId, setShowRcdAdvancedId] = useState<string | null>(null);

  // Step 4 edit state & Auto Import toggle
  const [editingCircuitId, setEditingCircuitId] = useState<string | null>(null);
  const [showCircuitAdvancedId, setShowCircuitAdvancedId] = useState<string | null>(null);
  const [showAutoImportPanel, setShowAutoImportPanel] = useState(false);

  const upstream = getEffectiveUpstreamBreaker(project);
  const meter = getEffectiveElectricityMeter(project);
  const internalDev = getEffectiveInternalDevice(project);
  const phaseLoad = calculatePhaseLoad(project);
  const issues = validateStnCompliance(project);

  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const warningCount = issues.filter((i) => i.severity === 'warning').length;
  const okCount = issues.filter((i) => i.severity === 'ok').length;

  const updateUpstreamBreaker = (
    changes: Partial<{
      enabled: boolean;
      designation: string;
      placement: UpstreamBreakerPlacement;
      poles: PolesType;
      ratedCurrent: MainBreakerCurrent;
      characteristic: BreakerCharacteristic;
      breakingCapacity: BreakingCapacity;
      manufacturer: Manufacturer;
      model: string;
    }>,
    desc = 'Úprava hlavného ističa pred elektromerom QF0'
  ) => {
    const nextPoles = changes.poles ?? upstream.poles;
    const nextChar = changes.characteristic ?? upstream.characteristic;
    const nextCurrent = changes.ratedCurrent ?? upstream.ratedCurrent;
    const nextCap = changes.breakingCapacity ?? upstream.breakingCapacity;
    const nextMfg = changes.manufacturer ?? upstream.manufacturer;
    const nextModel =
      changes.model !== undefined
        ? changes.model
        : suggestMainBreakerModel(nextMfg, nextPoles, nextChar, nextCurrent, nextCap);

    onProjectChange(
      {
        ...project,
        mainBreaker: {
          ...project.mainBreaker,
          enabled: changes.enabled ?? upstream.enabled,
          designation: changes.designation ?? upstream.designation,
          placement: changes.placement ?? upstream.placement,
          poles: nextPoles,
          ratedCurrent: nextCurrent,
          characteristic: nextChar,
          breakingCapacity: nextCap,
          manufacturer: nextMfg,
          model: nextModel,
        },
      },
      desc
    );
  };

  const updateInternalDevice = (
    changes: Partial<InternalMainDeviceConfig>,
    desc = 'Úprava hlavného prvku v bytovom rozvádzači'
  ) => {
    const merged: InternalMainDeviceConfig = {
      ...internalDev,
      ...changes,
    };

    // CRITICAL RULE: Never automatically treat Hlavný vypínač or Odpínač as an Istič unless explicitly requested
    if (changes.deviceType !== undefined && changes.hasOvercurrentProtection === undefined) {
      merged.hasOvercurrentProtection = changes.deviceType === 'Istič';
      merged.designation = changes.deviceType === 'Istič' ? 'QF1' : 'QS1';
    }

    if (changes.poles !== undefined && changes.modules === undefined) {
      merged.modules = getPolesModuleCount(changes.poles);
    }

    if (
      changes.model === undefined &&
      (changes.deviceType !== undefined ||
        changes.manufacturer !== undefined ||
        changes.poles !== undefined ||
        changes.ratedCurrent !== undefined ||
        changes.characteristic !== undefined ||
        changes.hasOvercurrentProtection !== undefined)
    ) {
      merged.model = suggestInternalMainDeviceModel(
        merged.manufacturer,
        merged.deviceType,
        merged.poles,
        merged.ratedCurrent,
        merged.characteristic || 'B',
        merged.hasOvercurrentProtection
      );
    }

    onProjectChange(
      {
        ...project,
        mainBreaker: {
          ...project.mainBreaker,
          hasInternalMainSwitch: merged.enabled,
          location:
            merged.enabled && (merged.deviceType === 'Istič' || merged.hasOvercurrentProtection) && !upstream.enabled
              ? 'V ROZVÁDZAČI'
              : 'PRED ROZVÁDZAČOM',
          internalDevice: merged,
        },
      },
      desc
    );
  };

  const handleAddRcd = (kind: RcdDeviceKind = 'RCCB') => {
    const nextIdx = project.rcds.length + 1;
    const poles: RcdPoles = kind === 'RCBO' ? '2P' : project.phaseCount === 3 ? '4P' : '2P';
    const mfg = project.mainBreaker.manufacturer;
    const defaultAmp: RcdRatedCurrent = kind === 'RCBO' ? 16 : 40;
    const newRcd: RcdConfig = {
      id: `rcd-${Date.now()}`,
      label: `FI${nextIdx}`,
      deviceKind: kind,
      poles,
      ratedCurrent: defaultAmp,
      sensitivity: 30,
      type: 'A',
      characteristic: kind === 'RCBO' ? 'B' : undefined,
      breakingCapacity: kind === 'RCBO' ? '10 kA' : undefined,
      manufacturer: mfg,
      model: suggestRcdModel(mfg, kind, poles, defaultAmp, 30, 'A', 'B'),
      phase: poles === '4P' ? 'L1,L2,L3' : 'L1',
      circuitName: kind === 'RCBO' ? `Samostatný okruh RCBO č. ${nextIdx}` : undefined,
      cableType: kind === 'RCBO' ? 'CYKY-J 3x2,5 mm²' : undefined,
      powerKw: kind === 'RCBO' ? 2.0 : undefined,
      notes: kind === 'RCBO' ? 'Kombinovaný ističochránič RCBO' : `Skupina č. ${nextIdx}`,
    };
    onProjectChange(
      { ...project, rcds: [...project.rcds, newRcd] },
      `Pridaný ${kind === 'RCBO' ? 'ističochránič RCBO' : 'prúdový chránič RCCB'} ${newRcd.label}`
    );
    setEditingRcdId(newRcd.id);
  };

  const handleDuplicateRcd = (rcdId: string) => {
    const source = project.rcds.find((r) => r.id === rcdId);
    if (!source) return;
    const nextIdx = project.rcds.length + 1;
    const copy: RcdConfig = {
      ...source,
      id: `rcd-copy-${Date.now()}`,
      label: `FI${nextIdx}`,
      notes: source.notes ? `${source.notes} (kópia)` : `Skupina č. ${nextIdx}`,
    };
    onProjectChange(
      { ...project, rcds: [...project.rcds, copy] },
      `Skopírovaný prúdový chránič ${source.label} -> ${copy.label}`
    );
    setEditingRcdId(copy.id);
  };

  const handleRemoveRcd = (rcdId: string) => {
    const target = project.rcds.find((r) => r.id === rcdId);
    onProjectChange(
      {
        ...project,
        rcds: project.rcds.filter((r) => r.id !== rcdId),
        circuits: project.circuits.map((c) => (c.rcdId === rcdId ? { ...c, rcdId: 'NONE' } : c)),
      },
      `Odstránený prúdový chránič ${target?.label ?? ''}`
    );
    if (editingRcdId === rcdId) setEditingRcdId(null);
  };

  const handleAddCircuit = () => {
    const nextIdx = project.circuits.length + 1;
    const mfg = project.mainBreaker.manufacturer;
    const defaultRcdId = project.rcds.find((r) => r.deviceKind === 'RCCB')?.id ?? project.rcds[0]?.id ?? 'NONE';
    const phases: PhaseAllocation[] = ['L1', 'L2', 'L3'];
    const phase: PhaseAllocation =
      project.phaseCount === 3 ? phases[(nextIdx - 1) % 3] : 'L1';

    const newCircuit: CircuitConfig = {
      id: `circ-${Date.now()}`,
      label: `FA${nextIdx}`,
      name: `Nový okruh č. ${nextIdx}`,
      category: 'Zásuvky',
      poles: '1P',
      ratedCurrent: 16,
      characteristic: 'B',
      breakingCapacity: '10 kA',
      rcdId: defaultRcdId,
      cable: 'CYKY-J 3x2,5 mm²',
      powerKw: 2.2,
      phase,
      cableLengthM: 18,
      installationMethod: 'B1 (v inštalačnej rúre v stene)',
      cosPhi: 0.95,
      manufacturer: mfg,
      model: suggestCircuitBreakerModel(mfg, '1P', 'B', 16),
    };

    onProjectChange(
      { ...project, circuits: [...project.circuits, newCircuit] },
      `Pridaný istič okruhu ${newCircuit.label}`
    );
    setEditingCircuitId(newCircuit.id);
  };

  const handleDuplicateCircuit = (circuitId: string) => {
    const source = project.circuits.find((c) => c.id === circuitId);
    if (!source) return;
    const nextIdx = project.circuits.length + 1;
    const copy: CircuitConfig = {
      ...source,
      id: `circ-copy-${Date.now()}`,
      label: `FA${nextIdx}`,
      name: `${source.name} (kópia)`,
    };
    onProjectChange(
      { ...project, circuits: [...project.circuits, copy] },
      `Skopírovaný okruh ${source.label} -> ${copy.label}`
    );
    setEditingCircuitId(copy.id);
  };

  const handleRemoveCircuit = (circuitId: string) => {
    const target = project.circuits.find((c) => c.id === circuitId);
    onProjectChange(
      {
        ...project,
        circuits: project.circuits.filter((c) => c.id !== circuitId),
      },
      `Odstránený okruh ${target?.label ?? ''}`
    );
    if (editingCircuitId === circuitId) setEditingCircuitId(null);
  };

  return (
    <div className="space-y-6">
      {/* STEP PROGRESS INDICATOR — DEEP NAVY HEADER + ELECTRIC BLUE STEP PILLS */}
      <div className="bg-[#0B1120] text-white rounded-2xl border border-slate-800 p-5 shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3.5">
          <div>
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#38BDF8]">
              Sprievodca návrhom rozvádzača • {project.name}
            </span>
            <h2 className="text-lg sm:text-xl font-extrabold text-white mt-0.5">
              KROK {activeStep} z 6 — {WIZARD_STEPS[activeStep - 1].title.toUpperCase()}
            </h2>
          </div>
          <div className="flex items-center gap-2 text-xs font-medium text-slate-300 bg-[#0F172A] px-3 py-1.5 rounded-xl border border-slate-800">
            <span>Postup návrhu:</span>
            <span className="font-mono font-bold text-[#38BDF8]">
              {Math.round((activeStep / 6) * 100)} %
            </span>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden mb-4">
          <div
            className="h-full bg-gradient-to-r from-[#0066FF] to-[#38BDF8] rounded-full transition-all duration-300"
            style={{ width: `${(activeStep / 6) * 100}%` }}
          />
        </div>

        {/* Step Buttons */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {WIZARD_STEPS.map((s) => {
            const isActive = activeStep === s.step;
            const isCompleted = activeStep > s.step;
            return (
              <button
                key={s.step}
                type="button"
                onClick={() => setActiveStep(s.step)}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-left text-xs font-bold transition-all border cursor-pointer ${
                  isActive
                    ? 'bg-[#0066FF] text-white border-[#0066FF] shadow-md shadow-[#0066FF]/25'
                    : isCompleted
                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/25'
                    : 'bg-[#0F172A] text-slate-300 border-slate-800 hover:bg-[#1E293B] hover:text-white'
                }`}
              >
                <span
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${
                    isActive
                      ? 'bg-white text-[#0066FF]'
                      : isCompleted
                      ? 'bg-emerald-500 text-white'
                      : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  {isCompleted ? <Check className="w-3 h-3" /> : s.step}
                </span>
                <span className="truncate">{s.title}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ===================================================================== */}
      {/* KROK 1 – ZÁKLADNÉ ÚDAJE                                               */}
      {/* ===================================================================== */}
      {activeStep === 1 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <h3 className="text-base font-bold text-slate-900">
              KROK 1 – ZÁKLADNÉ ÚDAJE O ROZVÁDZAČI
            </h3>
            <p className="text-sm text-slate-500 mt-0.5">
              Zadajte názov projektu, typ objektu, počet fáz a typ napájacej sústavy.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                Názov projektu / rozvádzača
              </label>
              <input
                type="text"
                value={project.name}
                onChange={(e) =>
                  onProjectChange({ ...project, name: e.target.value }, 'Zmena názvu projektu')
                }
                placeholder="Napr. Rozvádzač RD – Hlavný (RH)"
                className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 font-medium focus:bg-white focus:border-blue-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                Typ objektu
              </label>
              <select
                value={project.objectType}
                onChange={(e) =>
                  onProjectChange(
                    { ...project, objectType: e.target.value as ObjectType },
                    'Zmena typu objektu'
                  )
                }
                className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 font-medium focus:bg-white focus:border-blue-600 focus:outline-none"
              >
                {OBJECT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 1F vs 3F Selection */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
              Napájacia sústava (1F / 3F)
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() =>
                  onProjectChange(
                    applySupplySystemChange(project, '1f'),
                    'Prepnutie na jednofázovú sústavu 230 V'
                  )
                }
                className={`p-4 rounded-xl border-2 text-left transition-all flex items-center justify-between ${
                  project.supplySystem === '1f'
                    ? 'border-blue-600 bg-blue-50/70 text-slate-900'
                    : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <div>
                  <div className="text-sm font-bold text-slate-900">
                    Jednofázová sústava (1F • 230 V)
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    1 fáza (L1 + N + PE) • Bytové jadrá, garáže, chaty
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 font-mono text-xs font-bold text-blue-700 whitespace-nowrap shrink-0">
                  230 V
                </span>
              </button>

              <button
                type="button"
                onClick={() =>
                  onProjectChange(
                    applySupplySystemChange(project, '3f'),
                    'Prepnutie na trojfázovú sústavu 400 V'
                  )
                }
                className={`p-4 rounded-xl border-2 text-left transition-all flex items-center justify-between gap-2 ${
                  project.supplySystem === '3f'
                    ? 'border-blue-600 bg-blue-50/70 text-slate-900'
                    : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <div>
                  <div className="text-sm font-bold text-slate-900">
                    Trojfázová sústava (3F • 400 V)
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    3 fázy (L1, L2, L3 + N + PE) • Rodinné domy, väčšie byty, prevádzky
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 font-mono text-xs font-bold text-blue-700 whitespace-nowrap shrink-0">
                  400 V
                </span>
              </button>
            </div>
          </div>

          {/* Network System TN-C / TN-S / TN-C-S / TT */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
              Typ siete podľa STN 33 2000-3
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {NETWORK_SYSTEMS.map((net) => {
                const active = project.networkSystem === net;
                return (
                  <button
                    key={net}
                    type="button"
                    onClick={() =>
                      onProjectChange(
                        { ...project, networkSystem: net },
                        `Zmena sieťovej sústavy na ${net}`
                      )
                    }
                    className={`p-3.5 rounded-xl border-2 text-left transition-all ${
                      active
                        ? 'border-blue-600 bg-blue-50/70 text-slate-900'
                        : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <div className="font-mono text-base font-bold text-slate-900">{net}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {net === 'TN-C-S'
                        ? 'Rozdelenie PEN → PE + N'
                        : net === 'TN-S'
                        ? 'Oddelené PE a N (5-vodič)'
                        : net === 'TN-C'
                        ? 'Spoločný vodič PEN'
                        : 'Samostatné uzemnenie TT'}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ROZŠÍRENÉ NASTAVENIA toggle */}
          <div className="pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setShowBasicAdvanced((v) => !v)}
              className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-600 hover:text-blue-600 transition-colors"
            >
              <Settings className="w-4 h-4" />
              <span>Rozšírené nastavenia (Prívodný kábel, Krytie IP, Projektant)</span>
              {showBasicAdvanced ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </button>

            {showBasicAdvanced && (
              <div className="mt-4 p-4 rounded-xl bg-slate-50 border border-slate-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Prívodný kábel do rozvádzača
                  </label>
                  <input
                    type="text"
                    value={project.supplyCable}
                    onChange={(e) =>
                      onProjectChange({ ...project, supplyCable: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-sm text-slate-900 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Montáž rozvádzača
                  </label>
                  <select
                    value={project.enclosureMounting}
                    onChange={(e) =>
                      onProjectChange({
                        ...project,
                        enclosureMounting: e.target.value as SwitchboardProject['enclosureMounting'],
                      })
                    }
                    className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-sm text-slate-900"
                  >
                    <option value="Pod omietku (zapustený)">Pod omietku (zapustený)</option>
                    <option value="Na stenu (povrchový)">Na stenu (povrchový)</option>
                    <option value="Do sadrokartónu">Do sadrokartónu</option>
                    <option value="Stojanový / Pilierový">Stojanový / Pilierový</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Stupeň krytia IP
                  </label>
                  <select
                    value={project.ipRating}
                    onChange={(e) =>
                      onProjectChange({
                        ...project,
                        ipRating: e.target.value as SwitchboardProject['ipRating'],
                      })
                    }
                    className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-sm text-slate-900 font-mono"
                  >
                    <option value="IP20">IP20 (Suché vnútorné priestory)</option>
                    <option value="IP30">IP30 (Bežné domové rozvádzače)</option>
                    <option value="IP40">IP40 (Zvýšená ochrana pred prachom)</option>
                    <option value="IP54">IP54 (Vlhkosť / Garáž / Technická m.)</option>
                    <option value="IP65">IP65 (Exteriér / Prachotesné)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Zodpovedný projektant
                  </label>
                  <input
                    type="text"
                    value={project.designerName}
                    onChange={(e) =>
                      onProjectChange({ ...project, designerName: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-sm text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Číslo zákazky / projektu
                  </label>
                  <input
                    type="text"
                    value={project.projectNumber}
                    onChange={(e) =>
                      onProjectChange({ ...project, projectNumber: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-sm text-slate-900 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Mesto / Miesto stavby
                  </label>
                  <input
                    type="text"
                    value={project.locationCity || ''}
                    onChange={(e) =>
                      onProjectChange({ ...project, locationCity: e.target.value })
                    }
                    placeholder="Napr. Bratislava"
                    className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-sm text-slate-900"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* KROK 2 – HLAVNÉ PRVKY (DVA SAMOSTATNÉ PRVKY + ELEKTROMER + SPD)       */}
      {/* ===================================================================== */}
      {activeStep === 2 && (
        <div className="space-y-5">
          {/* Logical Chain Banner (Section 1.C) */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  KROK 2 – DVA SAMOSTATNÉ HLAVNÉ PRVKY A PORADIE ZAPOJENIA
                </h3>
                <p className="text-sm text-slate-500">
                  Samostatne nastavte hlavný istič pred elektromerom ({upstream.designation}) a hlavný prvok priamo v bytovom rozvádzači ({internalDev.designation}).
                </p>
              </div>
              <span className="px-3 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-xs font-semibold">
                STN EN 61439-3 / STN 33 2130
              </span>
            </div>

            {/* Visual Flow Chain */}
            <div className="flex flex-wrap items-center gap-1.5 p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700">
              <span className="px-2.5 py-1 rounded-lg bg-white border border-slate-200">
                Prívod {project.voltage}
              </span>
              <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
              <span
                className={`px-2.5 py-1 rounded-lg border font-mono ${
                  upstream.enabled
                    ? 'bg-amber-50 border-amber-300 text-amber-900'
                    : 'bg-slate-100 border-slate-200 text-slate-400 line-through'
                }`}
              >
                {upstream.designation}: Istič pred elektromerom ({upstream.poles} {upstream.characteristic}
                {upstream.ratedCurrent}A)
              </span>
              <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
              <span
                className={`px-2.5 py-1 rounded-lg border font-mono ${
                  meter.enabled
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                    : 'bg-slate-100 border-slate-200 text-slate-400 line-through'
                }`}
              >
                Elektromer (kWh)
              </span>
              <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
              <span
                className={`px-2.5 py-1 rounded-lg border font-mono ${
                  internalDev.enabled
                    ? 'bg-blue-50 border-blue-300 text-blue-900'
                    : 'bg-slate-100 border-slate-200 text-slate-400 line-through'
                }`}
              >
                {internalDev.designation}: {internalDev.deviceType} v rozvádzači ({internalDev.poles}{' '}
                {internalDev.ratedCurrent}A)
              </span>
              {project.mainBreaker.hasSurgeProtector && (
                <>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                  <span className="px-2.5 py-1 rounded-lg bg-purple-50 border border-purple-200 text-purple-900 font-mono">
                    FV1: SPD
                  </span>
                </>
              )}
              <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
              <span className="px-2.5 py-1 rounded-lg bg-white border border-slate-200">
                Chrániče ({project.rcds.length}) → Ističe ({project.circuits.length})
              </span>
            </div>
          </div>

          {/* SECTION A: HLAVNÝ ISTIČ PRED ELEKTROMEROM (QF0) */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="inline-flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-md bg-amber-100 text-amber-900 font-mono text-xs font-bold">
                    SEKCIA A • {upstream.designation}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-md text-xs font-semibold ${
                      upstream.enabled
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {upstream.enabled ? 'ZAPNUTÉ' : 'VYPNUTÉ'}
                  </span>
                </div>
                <h4 className="text-base font-bold text-slate-900">
                  HLAVNÝ ISTIČ PRED ELEKTROMEROM ({upstream.designation})
                </h4>
                <p className="text-sm font-mono font-semibold text-slate-700">
                  {upstream.poles} | {upstream.characteristic}
                  {upstream.ratedCurrent} A | {upstream.breakingCapacity} | {upstream.manufacturer}{' '}
                  {upstream.model} | Umiestnenie: {upstream.placement}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditingUpstream((v) => !v)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-colors"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  {editingUpstream ? 'HOTOVO' : 'UPRAVIŤ'}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    updateUpstreamBreaker(
                      { enabled: !upstream.enabled },
                      upstream.enabled
                        ? 'Vypnutý hlavný istič pred elektromerom QF0'
                        : 'Zapnutý hlavný istič pred elektromerom QF0'
                    )
                  }
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-colors ${
                    upstream.enabled
                      ? 'bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200'
                      : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200'
                  }`}
                >
                  {upstream.enabled ? 'VYPNÚŤ' : 'ZAPNÚŤ'}
                </button>
              </div>
            </div>

            {editingUpstream && (
              <div className="mt-5 pt-5 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Počet pólov (1P / 2P / 3P / 4P)
                  </label>
                  <select
                    value={upstream.poles}
                    onChange={(e) => updateUpstreamBreaker({ poles: e.target.value as PolesType })}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-sm font-mono font-semibold text-slate-900"
                  >
                    {(['1P', '2P', '3P', '4P'] as PolesType[]).map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Menovitý prúd (A)
                  </label>
                  <select
                    value={upstream.ratedCurrent}
                    onChange={(e) =>
                      updateUpstreamBreaker({
                        ratedCurrent: Number(e.target.value) as MainBreakerCurrent,
                      })
                    }
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-sm font-mono font-semibold text-slate-900"
                  >
                    {MAIN_BREAKER_CURRENTS.map((amp) => (
                      <option key={amp} value={amp}>
                        {amp} A
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Charakteristika (B / C / D)
                  </label>
                  <select
                    value={upstream.characteristic}
                    onChange={(e) =>
                      updateUpstreamBreaker({
                        characteristic: e.target.value as BreakerCharacteristic,
                      })
                    }
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-sm font-mono font-semibold text-slate-900"
                  >
                    {(['B', 'C', 'D'] as BreakerCharacteristic[]).map((ch) => (
                      <option key={ch} value={ch}>
                        Charakteristika {ch}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Vypínacia schopnosť
                  </label>
                  <select
                    value={upstream.breakingCapacity}
                    onChange={(e) =>
                      updateUpstreamBreaker({
                        breakingCapacity: e.target.value as BreakingCapacity,
                      })
                    }
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-sm font-mono font-semibold text-slate-900"
                  >
                    {(['6 kA', '10 kA', '15 kA', '25 kA'] as BreakingCapacity[]).map((cap) => (
                      <option key={cap} value={cap}>
                        {cap}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Výrobca</label>
                  <select
                    value={upstream.manufacturer}
                    onChange={(e) =>
                      updateUpstreamBreaker({ manufacturer: e.target.value as Manufacturer })
                    }
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-sm font-semibold text-slate-900"
                  >
                    {MANUFACTURERS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Typ / Model prístroja
                  </label>
                  <input
                    type="text"
                    value={upstream.model}
                    onChange={(e) => updateUpstreamBreaker({ model: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-sm font-mono text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Označenie v schéme
                  </label>
                  <input
                    type="text"
                    value={upstream.designation}
                    onChange={(e) => updateUpstreamBreaker({ designation: e.target.value })}
                    placeholder="QF0"
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-sm font-mono font-bold text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Umiestnenie hlavného ističa
                  </label>
                  <select
                    value={upstream.placement}
                    onChange={(e) =>
                      updateUpstreamBreaker({
                        placement: e.target.value as UpstreamBreakerPlacement,
                      })
                    }
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-sm font-semibold text-slate-900"
                  >
                    {UPSTREAM_PLACEMENTS.map((pl) => (
                      <option key={pl} value={pl}>
                        {pl}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* ELEKTROMER CARD */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="inline-flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-md bg-emerald-100 text-emerald-900 font-mono text-xs font-bold">
                    MERANIE • ELEKTROMER (kWh)
                  </span>
                </div>
                <h4 className="text-base font-bold text-slate-900">
                  ELEKTROMER ({meter.type})
                </h4>
                <p className="text-sm font-mono text-slate-600">
                  {meter.location} | {meter.tariff}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditingMeter((v) => !v)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-colors"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  {editingMeter ? 'HOTOVO' : 'UPRAVIŤ'}
                </button>
              </div>
            </div>

            {editingMeter && (
              <div className="mt-4 pt-4 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Zobraziť elektromer v schéme
                  </label>
                  <select
                    value={meter.enabled ? 'yes' : 'no'}
                    onChange={(e) =>
                      onProjectChange({
                        ...project,
                        mainBreaker: {
                          ...project.mainBreaker,
                          electricityMeter: { ...meter, enabled: e.target.value === 'yes' },
                        },
                      })
                    }
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-sm font-semibold text-slate-900"
                  >
                    <option value="yes">Áno (Zobraziť medzi QF0 a rozvádzačom)</option>
                    <option value="no">Nie (Skryť elektromer)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Typ elektromera
                  </label>
                  <select
                    value={meter.type}
                    onChange={(e) =>
                      onProjectChange({
                        ...project,
                        mainBreaker: {
                          ...project.mainBreaker,
                          electricityMeter: {
                            ...meter,
                            type: e.target.value as typeof meter.type,
                          },
                        },
                      })
                    }
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-sm font-semibold text-slate-900"
                  >
                    <option value="1-fázový elektromer">1-fázový elektromer</option>
                    <option value="3-fázový elektromer">3-fázový elektromer</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Tarifa</label>
                  <select
                    value={meter.tariff}
                    onChange={(e) =>
                      onProjectChange({
                        ...project,
                        mainBreaker: {
                          ...project.mainBreaker,
                          electricityMeter: {
                            ...meter,
                            tariff: e.target.value as typeof meter.tariff,
                          },
                        },
                      })
                    }
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-sm font-semibold text-slate-900"
                  >
                    <option value="Jednotarifný">Jednotarifný</option>
                    <option value="Dvojtarifný (VT/NT)">Dvojtarifný (VT/NT)</option>
                    <option value="IMS / Smart meter">IMS / Smart meter</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* SECTION B: HLAVNÝ PRVOK V BYTOVOM ROZVÁDZAČI (QS1 / QF1) */}
          <div className="bg-white rounded-2xl border-2 border-blue-200 p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="inline-flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-md bg-blue-100 text-blue-900 font-mono text-xs font-bold">
                    SEKCIA B • {internalDev.designation} V ROZVÁDZAČI
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-md text-xs font-semibold ${
                      internalDev.deviceType === 'Istič' || internalDev.hasOvercurrentProtection
                        ? 'bg-amber-100 text-amber-900'
                        : 'bg-cyan-100 text-cyan-900'
                    }`}
                  >
                    {internalDev.deviceType === 'Istič' || internalDev.hasOvercurrentProtection
                      ? 'S NADPRÚDOVOU OCHRANOU (ISTIČ)'
                      : 'SPÍNACÍ / ODPÁJACÍ PRVOK (BEZ NADPRÚDOVEJ OCHRANY)'}
                  </span>
                </div>
                <h4 className="text-base font-bold text-slate-900">
                  HLAVNÝ PRVOK V BYTOVOM ROZVÁDZAČI: {internalDev.deviceType.toUpperCase()} (
                  {internalDev.designation})
                </h4>
                <p className="text-sm font-mono font-semibold text-slate-700">
                  {internalDev.poles} |{' '}
                  {internalDev.deviceType === 'Istič' || internalDev.hasOvercurrentProtection
                    ? `Char. ${internalDev.characteristic || 'B'} ${internalDev.ratedCurrent} A (${
                        internalDev.breakingCapacity || '10 kA'
                      })`
                    : `${internalDev.ratedCurrent} A`}{' '}
                  | {internalDev.manufacturer} {internalDev.model} | {internalDev.modules} mod.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditingInternal((v) => !v)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  {editingInternal ? 'HOTOVO' : 'UPRAVIŤ'}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    updateInternalDevice(
                      { enabled: !internalDev.enabled },
                      internalDev.enabled
                        ? 'Odstránený hlavný prvok v bytovom rozvádzači'
                        : 'Pridaný hlavný prvok v bytovom rozvádzači'
                    )
                  }
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-colors ${
                    internalDev.enabled
                      ? 'bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200'
                      : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200'
                  }`}
                >
                  {internalDev.enabled ? 'ODSTRÁNIŤ' : 'PRIDAŤ'}
                </button>
              </div>
            </div>

            {/* Always visible quick selector for the 4 required types in Section 1.B */}
            <div className="mt-4 pt-4 border-t border-slate-100">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">
                Zvoľte typ hlavného prvku v bytovom rozvádzači:
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                {INTERNAL_DEVICE_TYPES.map((dt, idx) => {
                  const active = internalDev.deviceType === dt;
                  return (
                    <button
                      key={dt}
                      type="button"
                      onClick={() =>
                        updateInternalDevice(
                          {
                            enabled: true,
                            deviceType: dt,
                            hasOvercurrentProtection: dt === 'Istič',
                            designation: dt === 'Istič' ? 'QF1' : 'QS1',
                          },
                          `Zmena hlavného prvku v rozvádzači na: ${dt}`
                        )
                      }
                      className={`p-3 rounded-xl border-2 text-left transition-all ${
                        active
                          ? 'border-blue-600 bg-blue-50/80 text-slate-900'
                          : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <div className="text-xs font-bold text-slate-900">
                        {idx + 1}. {dt}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {dt === 'Hlavný vypínač'
                          ? 'Vypínač zaťaženia QS1 (bez nadprúdovej spúšte)'
                          : dt === 'Istič'
                          ? 'Hlavný istič QF1 s nadprúdovou ochranou'
                          : dt === 'Odpínač'
                          ? 'Odpínač QS1 na bezpečné odpojenie rozvádzača'
                          : 'Voliteľný spínací alebo ochranný prístroj'}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {editingInternal && (
              <div className="mt-5 pt-5 border-t border-slate-200 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Počet pólov (1P / 2P / 3P / 4P)
                    </label>
                    <select
                      value={internalDev.poles}
                      onChange={(e) =>
                        updateInternalDevice({ poles: e.target.value as PolesType })
                      }
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-sm font-mono font-semibold text-slate-900"
                    >
                      {(['1P', '2P', '3P', '4P'] as PolesType[]).map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Menovitý prúd (16 – 100 A)
                    </label>
                    <select
                      value={internalDev.ratedCurrent}
                      onChange={(e) =>
                        updateInternalDevice({
                          ratedCurrent: Number(e.target.value) as InternalMainDeviceCurrent,
                        })
                      }
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-sm font-mono font-semibold text-slate-900"
                    >
                      {INTERNAL_DEVICE_CURRENTS.map((amp) => (
                        <option key={amp} value={amp}>
                          {amp} A
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Výrobca</label>
                    <select
                      value={internalDev.manufacturer}
                      onChange={(e) =>
                        updateInternalDevice({
                          manufacturer: e.target.value as Manufacturer,
                        })
                      }
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-sm font-semibold text-slate-900"
                    >
                      {MANUFACTURERS.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Označenie (napr. QS1 alebo QF1)
                    </label>
                    <input
                      type="text"
                      value={internalDev.designation}
                      onChange={(e) => updateInternalDevice({ designation: e.target.value })}
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-sm font-mono font-bold text-slate-900"
                    />
                  </div>
                </div>

                {/* Overcurrent protection toggle + Topology position */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={internalDev.hasOvercurrentProtection}
                      onChange={(e) =>
                        updateInternalDevice({
                          hasOvercurrentProtection: e.target.checked,
                          designation: e.target.checked ? 'QF1' : 'QS1',
                        })
                      }
                      className="mt-1 w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <div>
                      <span className="block text-xs font-bold text-slate-900">
                        Zariadenie je zároveň nadprúdovou ochranou (ističová spúšť)
                      </span>
                      <span className="block text-xs text-slate-500 mt-0.5">
                        Ak nie je zaškrtnuté, prvok sa vykreslí ako čisto spínací/odpájací prvok (vypínač QS1) bez nadprúdovej charakteristiky.
                      </span>
                    </div>
                  </label>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Poloha prvku v poradí zapojenia v rozvádzači
                    </label>
                    <select
                      value={internalDev.topologyPosition}
                      onChange={(e) =>
                        updateInternalDevice({
                          topologyPosition: e.target.value as InternalDeviceTopologyPosition,
                        })
                      }
                      className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-xs font-semibold text-slate-900"
                    >
                      <option value="PRED_SPD_A_RCD">
                        Hneď za prívodom do rozvádzača (pred SPD a pred prúdovými chráničmi)
                      </option>
                      <option value="ZA_SPD_PRED_RCD">
                        Za prepäťovou ochranou SPD, pred prúdovými chráničmi FI
                      </option>
                    </select>
                  </div>
                </div>

                {/* Rozšírené nastavenia pre hlavný prvok v rozvádzači */}
                <div>
                  <button
                    type="button"
                    onClick={() => setShowInternalAdvanced((v) => !v)}
                    className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-600 hover:text-blue-600"
                  >
                    <Settings className="w-3.5 h-3.5" />
                    <span>Rozšírené nastavenia (Model, Počet modulov, Charakteristika)</span>
                    {showInternalAdvanced ? (
                      <ChevronUp className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5" />
                    )}
                  </button>

                  {showInternalAdvanced && (
                    <div className="mt-3 p-4 rounded-xl bg-slate-50 border border-slate-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Model prístroja
                        </label>
                        <input
                          type="text"
                          value={internalDev.model}
                          onChange={(e) => updateInternalDevice({ model: e.target.value })}
                          className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-sm font-mono text-slate-900"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Počet modulov na DIN lište
                        </label>
                        <select
                          value={internalDev.modules}
                          onChange={(e) =>
                            updateInternalDevice({ modules: Number(e.target.value) })
                          }
                          className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-sm font-mono text-slate-900"
                        >
                          {[1, 2, 3, 4, 6].map((m) => (
                            <option key={m} value={m}>
                              {m} mod.
                            </option>
                          ))}
                        </select>
                      </div>
                      {(internalDev.deviceType === 'Istič' ||
                        internalDev.hasOvercurrentProtection) && (
                        <>
                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">
                              Charakteristika
                            </label>
                            <select
                              value={internalDev.characteristic || 'B'}
                              onChange={(e) =>
                                updateInternalDevice({
                                  characteristic: e.target.value as BreakerCharacteristic,
                                })
                              }
                              className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-sm font-mono text-slate-900"
                            >
                              <option value="B">B</option>
                              <option value="C">C</option>
                              <option value="D">D</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">
                              Skratová odolnosť
                            </label>
                            <select
                              value={internalDev.breakingCapacity || '10 kA'}
                              onChange={(e) =>
                                updateInternalDevice({
                                  breakingCapacity: e.target.value as BreakingCapacity,
                                })
                              }
                              className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-sm font-mono text-slate-900"
                            >
                              <option value="6 kA">6 kA</option>
                              <option value="10 kA">10 kA</option>
                              <option value="15 kA">15 kA</option>
                            </select>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* PREPÄŤOVÁ OCHRANA (SPD FV1) */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-1">
                <span className="px-2.5 py-0.5 rounded-md bg-purple-100 text-purple-900 font-mono text-xs font-bold">
                  PREPÄŤOVÁ OCHRANA • FV1 (SPD)
                </span>
                <h4 className="text-base font-bold text-slate-900">
                  ZVODIČ PREPÄTIA ({project.mainBreaker.surgeProtectorType})
                </h4>
                <p className="text-sm font-mono text-slate-600">
                  {project.mainBreaker.hasSurgeProtector
                    ? `Osadený v rozvádzači | ${project.mainBreaker.surgeProtectorType} | ${
                        project.phaseCount === 3 ? '4 moduly' : '2 moduly'
                      }`
                    : 'Prepäťová ochrana nie je osadená'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditingSpd((v) => !v)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-colors"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  {editingSpd ? 'HOTOVO' : 'UPRAVIŤ'}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onProjectChange(
                      {
                        ...project,
                        mainBreaker: {
                          ...project.mainBreaker,
                          hasSurgeProtector: !project.mainBreaker.hasSurgeProtector,
                        },
                      },
                      'Zmena osadenia prepäťovej ochrany SPD'
                    )
                  }
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-colors ${
                    project.mainBreaker.hasSurgeProtector
                      ? 'bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200'
                      : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200'
                  }`}
                >
                  {project.mainBreaker.hasSurgeProtector ? 'ODSTRÁNIŤ' : 'PRIDAŤ SPD'}
                </button>
              </div>
            </div>

            {editingSpd && (
              <div className="mt-4 pt-4 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Typ zvodiča prepätia (SPD)
                  </label>
                  <select
                    value={project.mainBreaker.surgeProtectorType}
                    onChange={(e) =>
                      onProjectChange({
                        ...project,
                        mainBreaker: {
                          ...project.mainBreaker,
                          hasSurgeProtector: true,
                          surgeProtectorType: e.target
                            .value as SwitchboardProject['mainBreaker']['surgeProtectorType'],
                        },
                      })
                    }
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-sm font-semibold text-slate-900"
                  >
                    <option value="T1+T2 (B+C)">
                      T1+T2 (Trieda B+C – objekty s bleskozvodom / hlavný rozvádzač)
                    </option>
                    <option value="T2 (C)">
                      T2 (Trieda C – podružný / bytový rozvádzač)
                    </option>
                  </select>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* KROK 3 – PRÚDOVÉ CHRÁNIČE (RCCB & RCBO)                               */}
      {/* ===================================================================== */}
      {activeStep === 3 && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                KROK 3 – PRÚDOVÉ CHRÁNIČE ({project.rcds.length})
              </h3>
              <p className="text-sm text-slate-500">
                Pridajte skupinové prúdové chrániče (RCCB) alebo kombinované ističochrániče s nadprúdovou ochranou (RCBO).
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handleAddRcd('RCBO')}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 text-xs font-bold transition-colors"
              >
                <Plus className="w-4 h-4" />
                PRIDAŤ ISTIČOCHRÁNIČ (RCBO)
              </button>
              <button
                type="button"
                onClick={() => handleAddRcd('RCCB')}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold shadow-sm transition-colors"
              >
                <Plus className="w-4 h-4" />
                PRIDAŤ PRÚDOVÝ CHRÁNIČ (RCCB)
              </button>
            </div>
          </div>

          {project.rcds.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-3">
              <p className="text-sm text-slate-600">
                Zatiaľ nie sú pridané žiadne prúdové chrániče.
              </p>
              <div className="flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => handleAddRcd('RCCB')}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-bold"
                >
                  <Plus className="w-4 h-4" />
                  Pridať skupinový chránič FI1 (RCCB)
                </button>
                <button
                  type="button"
                  onClick={() => handleAddRcd('RCBO')}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-900 border border-slate-300 text-xs font-bold"
                >
                  <Plus className="w-4 h-4 text-[#0066FF]" />
                  Pridať ističochránič FI1 (RCBO)
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {project.rcds.map((rcd) => {
                const isEditing = editingRcdId === rcd.id;
                const isAdv = showRcdAdvancedId === rcd.id || isProMode;
                const assignedCircuits = project.circuits.filter((c) => c.rcdId === rcd.id);
                const isRcbo = rcd.deviceKind === 'RCBO';

                return (
                  <div
                    key={rcd.id}
                    className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm transition-all"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="space-y-1">
                        <div className="inline-flex items-center gap-2">
                          <span
                            className={`px-2.5 py-0.5 rounded-md font-mono text-xs font-bold ${
                              isRcbo
                                ? 'bg-amber-100 text-amber-900'
                                : 'bg-cyan-100 text-cyan-900'
                            }`}
                          >
                            {isRcbo
                              ? `ISTIČOCHRÁNIČ ${rcd.label} (RCBO)`
                              : `PRÚDOVÝ CHRÁNIČ ${rcd.label} (RCCB)`}
                          </span>
                          <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-mono text-xs font-semibold">
                            N({rcd.label})
                          </span>
                          {rcd.notes && (
                            <span className="text-xs font-medium text-slate-500">
                              • {rcd.notes}
                            </span>
                          )}
                        </div>
                        <div className="text-base font-mono font-bold text-slate-900">
                          {rcd.poles} |{' '}
                          {isRcbo ? `${rcd.characteristic || 'B'}${rcd.ratedCurrent} A` : `${rcd.ratedCurrent} A`}{' '}
                          | {rcd.sensitivity} mA | Typ {rcd.type}
                          {isRcbo && rcd.circuitName ? ` | ${rcd.circuitName}` : ''}
                        </div>
                        <div className="text-xs text-slate-500">
                          {isRcbo && assignedCircuits.length === 0 ? (
                            <span>
                              Samostatný chránený vývod ({rcd.cableType || 'CYKY-J 3x2,5 mm²'} • Fáza{' '}
                              {rcd.phase || 'L1'})
                            </span>
                          ) : (
                            <>
                              Priradené okruhy ({assignedCircuits.length}):{' '}
                              {assignedCircuits.length > 0
                                ? assignedCircuits.map((c) => `${c.label} (${c.name})`).join(', ')
                                : 'Žiadny priradený okruh'}
                            </>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingRcdId(isEditing ? null : rcd.id)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-colors"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          {isEditing ? 'HOTOVO' : 'UPRAVIŤ'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDuplicateRcd(rcd.id)}
                          title="Kopírovať chránič"
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          KOPÍROVAŤ
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveRcd(rcd.id)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          ODSTRÁNIŤ
                        </button>
                      </div>
                    </div>

                    {isEditing && (
                      <div className="mt-4 pt-4 border-t border-slate-200 space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">
                              Druh prístroja (RCCB / RCBO)
                            </label>
                            <select
                              value={rcd.deviceKind}
                              onChange={(e) => {
                                const nextKind = e.target.value as RcdDeviceKind;
                                const nextPoles: RcdPoles =
                                  nextKind === 'RCBO' ? '2P' : rcd.poles;
                                const nextAmp: RcdRatedCurrent =
                                  nextKind === 'RCBO' && rcd.ratedCurrent > 40
                                    ? 16
                                    : nextKind === 'RCCB' && rcd.ratedCurrent < 25
                                    ? 40
                                    : rcd.ratedCurrent;
                                onProjectChange({
                                  ...project,
                                  rcds: project.rcds.map((r) =>
                                    r.id === rcd.id
                                      ? {
                                          ...r,
                                          deviceKind: nextKind,
                                          poles: nextPoles,
                                          ratedCurrent: nextAmp,
                                          characteristic:
                                            nextKind === 'RCBO' ? r.characteristic || 'B' : undefined,
                                          circuitName:
                                            nextKind === 'RCBO'
                                              ? r.circuitName || 'Samostatný okruh RCBO'
                                              : r.circuitName,
                                          cableType:
                                            nextKind === 'RCBO'
                                              ? r.cableType || 'CYKY-J 3x2,5 mm²'
                                              : r.cableType,
                                          model: suggestRcdModel(
                                            r.manufacturer,
                                            nextKind,
                                            nextPoles,
                                            nextAmp,
                                            r.sensitivity,
                                            r.type,
                                            r.characteristic || 'B'
                                          ),
                                        }
                                      : r
                                  ),
                                });
                              }}
                              className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs font-bold text-slate-900"
                            >
                              <option value="RCCB">RCCB (Prúdový chránič)</option>
                              <option value="RCBO">RCBO (Ističochránič)</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">
                              Počet pólov
                            </label>
                            <select
                              value={rcd.poles}
                              onChange={(e) => {
                                const nextPoles = e.target.value as RcdPoles;
                                onProjectChange({
                                  ...project,
                                  rcds: project.rcds.map((r) =>
                                    r.id === rcd.id
                                      ? {
                                          ...r,
                                          poles: nextPoles,
                                          phase:
                                            nextPoles === '4P'
                                              ? 'L1,L2,L3'
                                              : r.phase === 'L1,L2,L3'
                                              ? 'L1'
                                              : r.phase || 'L1',
                                          model: suggestRcdModel(
                                            r.manufacturer,
                                            r.deviceKind,
                                            nextPoles,
                                            r.ratedCurrent,
                                            r.sensitivity,
                                            r.type,
                                            r.characteristic || 'B'
                                          ),
                                        }
                                      : r
                                  ),
                                });
                              }}
                              className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-sm font-mono font-semibold text-slate-900"
                            >
                              <option value="2P">2P (Jednofázový)</option>
                              <option value="4P">4P (Trojfázový)</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">
                              {isRcbo ? 'Char. a Prúd' : 'Menovitý prúd'}
                            </label>
                            <div className="flex gap-1.5">
                              {isRcbo && (
                                <select
                                  value={rcd.characteristic || 'B'}
                                  onChange={(e) => {
                                    const nextChar = e.target.value as BreakerCharacteristic;
                                    onProjectChange({
                                      ...project,
                                      rcds: project.rcds.map((r) =>
                                        r.id === rcd.id
                                          ? {
                                              ...r,
                                              characteristic: nextChar,
                                              model: suggestRcdModel(
                                                r.manufacturer,
                                                r.deviceKind,
                                                r.poles,
                                                r.ratedCurrent,
                                                r.sensitivity,
                                                r.type,
                                                nextChar
                                              ),
                                            }
                                          : r
                                      ),
                                    });
                                  }}
                                  className="w-16 px-2 py-2 rounded-xl bg-slate-50 border border-slate-300 text-sm font-mono font-bold text-slate-900"
                                >
                                  <option value="B">B</option>
                                  <option value="C">C</option>
                                  <option value="D">D</option>
                                </select>
                              )}
                              <select
                                value={rcd.ratedCurrent}
                                onChange={(e) => {
                                  const nextAmp = Number(e.target.value) as RcdRatedCurrent;
                                  onProjectChange({
                                    ...project,
                                    rcds: project.rcds.map((r) =>
                                      r.id === rcd.id
                                        ? {
                                            ...r,
                                            ratedCurrent: nextAmp,
                                            model: suggestRcdModel(
                                              r.manufacturer,
                                              r.deviceKind,
                                              r.poles,
                                              nextAmp,
                                              r.sensitivity,
                                              r.type,
                                              r.characteristic || 'B'
                                            ),
                                          }
                                        : r
                                    ),
                                  });
                                }}
                                className="flex-1 px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-sm font-mono font-semibold text-slate-900"
                              >
                                {(isRcbo ? RCBO_CURRENTS : RCCB_CURRENTS).map((a) => (
                                  <option key={a} value={a}>
                                    {a} A
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">
                              Citlivosť IΔn
                            </label>
                            <select
                              value={rcd.sensitivity}
                              onChange={(e) => {
                                const nextSens = Number(e.target.value) as RcdSensitivity;
                                onProjectChange({
                                  ...project,
                                  rcds: project.rcds.map((r) =>
                                    r.id === rcd.id
                                      ? {
                                          ...r,
                                          sensitivity: nextSens,
                                          model: suggestRcdModel(
                                            r.manufacturer,
                                            r.deviceKind,
                                            r.poles,
                                            r.ratedCurrent,
                                            nextSens,
                                            r.type,
                                            r.characteristic || 'B'
                                          ),
                                        }
                                      : r
                                  ),
                                });
                              }}
                              className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-sm font-mono font-semibold text-slate-900"
                            >
                              {RCD_SENSITIVITIES.map((s) => (
                                <option key={s} value={s}>
                                  {s} mA
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">
                              Typ chrániča
                            </label>
                            <select
                              value={rcd.type}
                              onChange={(e) => {
                                const nextType = e.target.value as RcdType;
                                onProjectChange({
                                  ...project,
                                  rcds: project.rcds.map((r) =>
                                    r.id === rcd.id
                                      ? {
                                          ...r,
                                          type: nextType,
                                          model: suggestRcdModel(
                                            r.manufacturer,
                                            r.deviceKind,
                                            r.poles,
                                            r.ratedCurrent,
                                            r.sensitivity,
                                            nextType,
                                            r.characteristic || 'B'
                                          ),
                                        }
                                      : r
                                  ),
                                });
                              }}
                              className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-sm font-mono font-semibold text-slate-900"
                            >
                              {RCD_TYPES.map((t) => (
                                <option key={t} value={t}>
                                  Typ {t}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        {isRcbo && (
                          <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200 grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                              <label className="block text-xs font-bold text-amber-900 mb-1">
                                Názov samostatného okruhu RCBO
                              </label>
                              <input
                                type="text"
                                value={rcd.circuitName || ''}
                                onChange={(e) =>
                                  onProjectChange({
                                    ...project,
                                    rcds: project.rcds.map((r) =>
                                      r.id === rcd.id
                                        ? { ...r, circuitName: e.target.value }
                                        : r
                                    ),
                                  })
                                }
                                placeholder="Napr. Chladnička a mraznička"
                                className="w-full px-3 py-2 rounded-lg bg-white border border-amber-300 text-xs font-medium text-slate-900"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-bold text-amber-900 mb-1">
                                Kábel vývodu RCBO
                              </label>
                              <input
                                type="text"
                                value={rcd.cableType || 'CYKY-J 3x2,5 mm²'}
                                onChange={(e) =>
                                  onProjectChange({
                                    ...project,
                                    rcds: project.rcds.map((r) =>
                                      r.id === rcd.id ? { ...r, cableType: e.target.value } : r
                                    ),
                                  })
                                }
                                className="w-full px-3 py-2 rounded-lg bg-white border border-amber-300 text-xs font-mono text-slate-900"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-bold text-amber-900 mb-1">
                                Fáza a Príkon (kW)
                              </label>
                              <div className="flex gap-1.5">
                                <select
                                  value={rcd.phase || 'L1'}
                                  onChange={(e) =>
                                    onProjectChange({
                                      ...project,
                                      rcds: project.rcds.map((r) =>
                                        r.id === rcd.id
                                          ? { ...r, phase: e.target.value as PhaseAllocation }
                                          : r
                                      ),
                                    })
                                  }
                                  className="w-24 px-2 py-2 rounded-lg bg-white border border-amber-300 text-xs font-mono font-bold text-slate-900"
                                >
                                  <option value="L1">L1</option>
                                  {project.phaseCount === 3 && <option value="L2">L2</option>}
                                  {project.phaseCount === 3 && <option value="L3">L3</option>}
                                  {project.phaseCount === 3 && rcd.poles === '4P' && (
                                    <option value="L1,L2,L3">L1,L2,L3</option>
                                  )}
                                </select>
                                <input
                                  type="number"
                                  step="0.1"
                                  value={rcd.powerKw ?? 1.5}
                                  onChange={(e) =>
                                    onProjectChange({
                                      ...project,
                                      rcds: project.rcds.map((r) =>
                                        r.id === rcd.id
                                          ? { ...r, powerKw: Number(e.target.value) || 0.5 }
                                          : r
                                      ),
                                    })
                                  }
                                  className="flex-1 px-2 py-2 rounded-lg bg-white border border-amber-300 text-xs font-mono text-slate-900"
                                />
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Priradenie okruhov pod tento chránič */}
                        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                          <div className="text-xs font-bold text-slate-700 mb-2">
                            Priradiť okruhy pod chránič {rcd.label}:
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {project.circuits.map((c) => {
                              const checked = c.rcdId === rcd.id;
                              return (
                                <button
                                  key={c.id}
                                  type="button"
                                  onClick={() =>
                                    onProjectChange({
                                      ...project,
                                      circuits: project.circuits.map((item) =>
                                        item.id === c.id
                                          ? { ...item, rcdId: checked ? 'NONE' : rcd.id }
                                          : item
                                      ),
                                    })
                                  }
                                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all flex items-center gap-1.5 ${
                                    checked
                                      ? 'bg-blue-600 text-white border-blue-600'
                                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                                  }`}
                                >
                                  <span className="font-mono font-bold">{c.label}</span>
                                  <span>{c.name}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Rozšírené nastavenia chrániča */}
                        <div>
                          <button
                            type="button"
                            onClick={() => setShowRcdAdvancedId(isAdv ? null : rcd.id)}
                            className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500 hover:text-blue-600"
                          >
                            <Settings className="w-3.5 h-3.5" />
                            <span>Rozšírené nastavenia (Označenie, Výrobca, Model, Poznámka)</span>
                          </button>

                          {isAdv && (
                            <div className="mt-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200 grid grid-cols-1 sm:grid-cols-4 gap-3">
                              <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1">
                                  Označenie
                                </label>
                                <input
                                  type="text"
                                  value={rcd.label}
                                  onChange={(e) =>
                                    onProjectChange({
                                      ...project,
                                      rcds: project.rcds.map((r) =>
                                        r.id === rcd.id ? { ...r, label: e.target.value } : r
                                      ),
                                    })
                                  }
                                  className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-xs font-mono text-slate-900"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1">
                                  Výrobca
                                </label>
                                <select
                                  value={rcd.manufacturer}
                                  onChange={(e) =>
                                    onProjectChange({
                                      ...project,
                                      rcds: project.rcds.map((r) =>
                                        r.id === rcd.id
                                          ? { ...r, manufacturer: e.target.value as Manufacturer }
                                          : r
                                      ),
                                    })
                                  }
                                  className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-xs text-slate-900"
                                >
                                  {MANUFACTURERS.map((m) => (
                                    <option key={m} value={m}>
                                      {m}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1">
                                  Model
                                </label>
                                <input
                                  type="text"
                                  value={rcd.model}
                                  onChange={(e) =>
                                    onProjectChange({
                                      ...project,
                                      rcds: project.rcds.map((r) =>
                                        r.id === rcd.id ? { ...r, model: e.target.value } : r
                                      ),
                                    })
                                  }
                                  className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-xs font-mono text-slate-900"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1">
                                  Popis skupiny
                                </label>
                                <input
                                  type="text"
                                  value={rcd.notes || ''}
                                  onChange={(e) =>
                                    onProjectChange({
                                      ...project,
                                      rcds: project.rcds.map((r) =>
                                        r.id === rcd.id ? { ...r, notes: e.target.value } : r
                                      ),
                                    })
                                  }
                                  className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-xs text-slate-900"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* KROK 4 – OKRUHY (KARTY ISTIČOV + VLOŽENIE ZOZNAMU OKRUHOV)            */}
      {/* ===================================================================== */}
      {activeStep === 4 && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                KROK 4 – OKRUHY A ISTIČE ({project.circuits.length})
              </h3>
              <p className="text-sm text-slate-500">
                Pridajte jednotlivé okruhy pomocou jednoduchých kariet alebo vložte celý textový zoznam okruhov naraz.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowAutoImportPanel((v) => !v)}
                className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                  showAutoImportPanel
                    ? 'bg-[#0B1120] text-white border-[#0B1120]'
                    : 'bg-blue-50 hover:bg-blue-100 text-[#0066FF] border-blue-200'
                }`}
              >
                <FileSpreadsheet className="w-4 h-4" />
                {showAutoImportPanel
                  ? 'SPÄŤ NA KARTY OKRUHOV'
                  : 'VLOŽIŤ ZOZNAM OKRUHOV (AUTO-IMPORT)'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAutoImportPanel(false);
                  handleAddCircuit();
                }}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0066FF] hover:bg-[#2563EB] text-white text-xs font-bold shadow-sm transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                PRIDAŤ OKRUH
              </button>
            </div>
          </div>

          {showAutoImportPanel ? (
            <div className="pt-1">
              <AutoCircuitImportView
                project={project}
                onProjectChange={(updated, desc) => {
                  onProjectChange(updated, desc);
                  setShowAutoImportPanel(false);
                }}
                onNavigate={() => setShowAutoImportPanel(false)}
              />
            </div>
          ) : (
            <div className="space-y-3">
              {project.circuits.map((c) => {
                const isEditing = editingCircuitId === c.id;
                const isAdv = showCircuitAdvancedId === c.id || isProMode;
                const parentRcd = project.rcds.find((r) => r.id === c.rcdId);

                return (
                  <div
                    key={c.id}
                    className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-sm transition-all"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div className="space-y-1">
                        <div className="inline-flex items-center gap-2">
                          <span className="px-2.5 py-0.5 rounded-md bg-blue-100 text-blue-900 font-mono text-xs font-bold">
                            ISTIČ {c.label}
                          </span>
                          <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-mono text-xs font-semibold">
                            Fáza {c.phase}
                          </span>
                          {parentRcd ? (
                            <span className="px-2 py-0.5 rounded-md bg-cyan-50 text-cyan-800 border border-cyan-200 font-mono text-xs font-semibold">
                              {parentRcd.label}
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 text-xs">
                              Bez chrániča
                            </span>
                          )}
                        </div>
                        <div className="text-base font-bold text-slate-900">
                          {c.characteristic}
                          {c.ratedCurrent} | {c.poles} | {c.name} | {c.cable.replace('CYKY-J ', '')}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingCircuitId(isEditing ? null : c.id)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-colors"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          {isEditing ? 'HOTOVO' : 'UPRAVIŤ'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDuplicateCircuit(c.id)}
                          title="Kopírovať okruh"
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          KOPÍROVAŤ
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveCircuit(c.id)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          ODSTRÁNIŤ
                        </button>
                      </div>
                    </div>

                    {isEditing && (
                      <div className="mt-4 pt-4 border-t border-slate-200 space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
                          <div className="lg:col-span-2">
                            <label className="block text-xs font-bold text-slate-700 mb-1">
                              Názov okruhu
                            </label>
                            <input
                              type="text"
                              value={c.name}
                              onChange={(e) =>
                                onProjectChange({
                                  ...project,
                                  circuits: project.circuits.map((item) =>
                                    item.id === c.id ? { ...item, name: e.target.value } : item
                                  ),
                                })
                              }
                              className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-sm font-medium text-slate-900"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">
                              Póly a Fáza
                            </label>
                            <div className="flex gap-1.5">
                              <select
                                value={c.poles}
                                onChange={(e) => {
                                  const nextPoles = e.target.value as PolesType;
                                  const nextPhase: PhaseAllocation =
                                    nextPoles === '3P' || nextPoles === '4P'
                                      ? 'L1,L2,L3'
                                      : c.phase === 'L1,L2,L3'
                                      ? 'L1'
                                      : c.phase;
                                  onProjectChange({
                                    ...project,
                                    circuits: project.circuits.map((item) =>
                                      item.id === c.id
                                        ? {
                                            ...item,
                                            poles: nextPoles,
                                            phase: nextPhase,
                                            model: suggestCircuitBreakerModel(
                                              item.manufacturer,
                                              nextPoles,
                                              item.characteristic,
                                              item.ratedCurrent
                                            ),
                                          }
                                        : item
                                    ),
                                  });
                                }}
                                className="w-16 px-2 py-2 rounded-xl bg-slate-50 border border-slate-300 text-sm font-mono font-semibold text-slate-900"
                              >
                                <option value="1P">1P</option>
                                <option value="2P">2P</option>
                                {project.phaseCount === 3 && <option value="3P">3P</option>}
                                {project.phaseCount === 3 && <option value="4P">4P</option>}
                              </select>
                              <select
                                value={c.phase}
                                onChange={(e) =>
                                  onProjectChange({
                                    ...project,
                                    circuits: project.circuits.map((item) =>
                                      item.id === c.id
                                        ? { ...item, phase: e.target.value as PhaseAllocation }
                                        : item
                                    ),
                                  })
                                }
                                className="flex-1 px-2 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs font-mono font-bold text-slate-900"
                              >
                                <option value="L1">L1</option>
                                {project.phaseCount === 3 && <option value="L2">L2</option>}
                                {project.phaseCount === 3 && <option value="L3">L3</option>}
                                {project.phaseCount === 3 && (
                                  <option value="L1,L2,L3">L1,L2,L3</option>
                                )}
                              </select>
                            </div>
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">
                              Char. a Prúd
                            </label>
                            <div className="flex gap-1.5">
                              <select
                                value={c.characteristic}
                                onChange={(e) =>
                                  onProjectChange({
                                    ...project,
                                    circuits: project.circuits.map((item) =>
                                      item.id === c.id
                                        ? {
                                            ...item,
                                            characteristic: e.target.value as BreakerCharacteristic,
                                          }
                                        : item
                                    ),
                                  })
                                }
                                className="w-16 px-2 py-2 rounded-xl bg-slate-50 border border-slate-300 text-sm font-mono font-bold text-slate-900"
                              >
                                <option value="B">B</option>
                                <option value="C">C</option>
                                <option value="D">D</option>
                              </select>
                              <select
                                value={c.ratedCurrent}
                                onChange={(e) =>
                                  onProjectChange({
                                    ...project,
                                    circuits: project.circuits.map((item) =>
                                      item.id === c.id
                                        ? {
                                            ...item,
                                            ratedCurrent: Number(
                                              e.target.value
                                            ) as CircuitConfig['ratedCurrent'],
                                          }
                                        : item
                                    ),
                                  })
                                }
                                className="flex-1 px-2 py-2 rounded-xl bg-slate-50 border border-slate-300 text-sm font-mono font-bold text-slate-900"
                              >
                                {[6, 10, 13, 16, 20, 25, 32, 40, 50, 63].map((amp) => (
                                  <option key={amp} value={amp}>
                                    {amp} A
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">
                              Kábel / Vodič
                            </label>
                            <select
                              value={c.cable}
                              onChange={(e) =>
                                onProjectChange({
                                  ...project,
                                  circuits: project.circuits.map((item) =>
                                    item.id === c.id ? { ...item, cable: e.target.value } : item
                                  ),
                                })
                              }
                              className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-sm font-mono text-slate-900"
                            >
                              <option value="CYKY-J 3x1,5 mm²">CYKY-J 3x1,5 mm²</option>
                              <option value="CYKY-J 3x2,5 mm²">CYKY-J 3x2,5 mm²</option>
                              <option value="CYKY-J 3x4 mm²">CYKY-J 3x4 mm²</option>
                              <option value="CYKY-J 3x6 mm²">CYKY-J 3x6 mm²</option>
                              <option value="CYKY-J 5x1,5 mm²">CYKY-J 5x1,5 mm²</option>
                              <option value="CYKY-J 5x2,5 mm²">CYKY-J 5x2,5 mm²</option>
                              <option value="CYKY-J 5x4 mm²">CYKY-J 5x4 mm²</option>
                              <option value="CYKY-J 5x6 mm²">CYKY-J 5x6 mm²</option>
                              <option value="CYKY-J 5x10 mm²">CYKY-J 5x10 mm²</option>
                              <option value="CHKE-R 3x1,5 mm²">CHKE-R 3x1,5 mm²</option>
                              <option value="CHKE-R 3x2,5 mm²">CHKE-R 3x2,5 mm²</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">
                              Prúdový chránič
                            </label>
                            <select
                              value={c.rcdId}
                              onChange={(e) =>
                                onProjectChange({
                                  ...project,
                                  circuits: project.circuits.map((item) =>
                                    item.id === c.id ? { ...item, rcdId: e.target.value } : item
                                  ),
                                })
                              }
                              className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-sm font-semibold text-slate-900"
                            >
                              <option value="NONE">Bez chrániča (priamo)</option>
                              {project.rcds.map((r) => (
                                <option key={r.id} value={r.id}>
                                  {r.label} ({r.ratedCurrent}A/{r.sensitivity}mA)
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        {/* Rozšírené nastavenia okruhu */}
                        <div>
                          <button
                            type="button"
                            onClick={() => setShowCircuitAdvancedId(isAdv ? null : c.id)}
                            className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500 hover:text-blue-600"
                          >
                            <Settings className="w-3.5 h-3.5" />
                            <span>
                              Rozšírené nastavenia (Príkon kW, Dĺžka kábla, Kategória, Vlastný kábel)
                            </span>
                          </button>

                          {isAdv && (
                            <div className="mt-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200 grid grid-cols-1 sm:grid-cols-5 gap-3">
                              <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1">
                                  Výpočtový príkon (kW)
                                </label>
                                <input
                                  type="number"
                                  step="0.1"
                                  value={c.powerKw}
                                  onChange={(e) =>
                                    onProjectChange({
                                      ...project,
                                      circuits: project.circuits.map((item) =>
                                        item.id === c.id
                                          ? { ...item, powerKw: Number(e.target.value) || 0.1 }
                                          : item
                                      ),
                                    })
                                  }
                                  className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-xs font-mono text-slate-900"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1">
                                  Dĺžka trasy (m)
                                </label>
                                <input
                                  type="number"
                                  value={c.cableLengthM || 18}
                                  onChange={(e) =>
                                    onProjectChange({
                                      ...project,
                                      circuits: project.circuits.map((item) =>
                                        item.id === c.id
                                          ? { ...item, cableLengthM: Number(e.target.value) || 10 }
                                          : item
                                      ),
                                    })
                                  }
                                  className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-xs font-mono text-slate-900"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1">
                                  Kategória
                                </label>
                                <select
                                  value={c.category}
                                  onChange={(e) =>
                                    onProjectChange({
                                      ...project,
                                      circuits: project.circuits.map((item) =>
                                        item.id === c.id
                                          ? { ...item, category: e.target.value as CircuitCategory }
                                          : item
                                      ),
                                    })
                                  }
                                  className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-xs text-slate-900"
                                >
                                  {CIRCUIT_CATEGORIES.map((cat) => (
                                    <option key={cat} value={cat}>
                                      {cat}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1">
                                  Vlastný popis kábla
                                </label>
                                <input
                                  type="text"
                                  value={c.cable}
                                  onChange={(e) =>
                                    onProjectChange({
                                      ...project,
                                      circuits: project.circuits.map((item) =>
                                        item.id === c.id ? { ...item, cable: e.target.value } : item
                                      ),
                                    })
                                  }
                                  className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-xs font-mono text-slate-900"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1">
                                  Označenie ističa
                                </label>
                                <input
                                  type="text"
                                  value={c.label}
                                  onChange={(e) =>
                                    onProjectChange({
                                      ...project,
                                      circuits: project.circuits.map((item) =>
                                        item.id === c.id ? { ...item, label: e.target.value } : item
                                      ),
                                    })
                                  }
                                  className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-xs font-mono text-slate-900"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* KROK 5 – ROZDELENIE FÁZ (L1 / L2 / L3)                                */}
      {/* ===================================================================== */}
      {activeStep === 5 && (
        <div className="space-y-5">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                KROK 5 – ROZDELENIE FÁZ L1 / L2 / L3
              </h3>
              <p className="text-sm text-slate-500">
                Automaticky vyvážte záťaž medzi jednotlivé fázy alebo manuálne priraďte fázu každému okruhu.
              </p>
            </div>
            {project.phaseCount === 3 && (
              <button
                type="button"
                onClick={() =>
                  onProjectChange(
                    balanceCircuitPhases(project),
                    'Automatické vyváženie fáz L1, L2, L3'
                  )
                }
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold shadow-sm transition-colors"
              >
                <Sparkles className="w-4 h-4" />
                AUTOMATICKY VYVÁŽIŤ FÁZY (L1 / L2 / L3)
              </button>
            )}
          </div>

          {/* Phase Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {(['L1', 'L2', 'L3'] as const).map((ph) => {
              const data = phaseLoad[ph];
              const isDisabled = project.phaseCount === 1 && ph !== 'L1';
              return (
                <div
                  key={ph}
                  className={`bg-white rounded-2xl border p-5 shadow-sm ${
                    isDisabled ? 'border-slate-100 opacity-50' : 'border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-base font-bold text-slate-900">
                      Fáza {ph}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 font-mono text-xs font-bold">
                      {data.utilizationPercent} % hl. ističa
                    </span>
                  </div>
                  <div className="text-2xl font-mono font-bold text-slate-900">
                    {data.currentA} A{' '}
                    <span className="text-sm font-normal text-slate-500">
                      ({data.powerKw} kW)
                    </span>
                  </div>
                  <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden mt-3">
                    <div
                      className={`h-full rounded-full transition-all ${
                        data.utilizationPercent > 95
                          ? 'bg-rose-500'
                          : data.utilizationPercent > 75
                          ? 'bg-amber-500'
                          : 'bg-emerald-500'
                      }`}
                      style={{ width: `${Math.min(100, data.utilizationPercent)}%` }}
                    />
                  </div>
                  <div className="text-xs text-slate-500 mt-2">
                    Počet zapojených obvodov: {data.count}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Per-circuit phase assignment list */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-2.5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
              Priradenie fáz jednotlivým okruhom
            </h4>
            {project.circuits.map((c) => {
              const is3P = c.poles === '3P' || c.poles === '4P';
              return (
                <div
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200"
                >
                  <div className="flex items-center gap-3">
                    <span className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 font-mono text-xs font-bold text-slate-900">
                      {c.label}
                    </span>
                    <div>
                      <div className="text-sm font-bold text-slate-900">{c.name}</div>
                      <div className="text-xs font-mono text-slate-500">
                        {c.poles} • {c.characteristic}
                        {c.ratedCurrent}A • {c.powerKw} kW
                      </div>
                    </div>
                  </div>

                  {project.phaseCount === 1 || is3P ? (
                    <span className="px-3 py-1.5 rounded-lg bg-blue-50 text-blue-800 border border-blue-200 font-mono text-xs font-bold">
                      {is3P ? 'L1, L2, L3 (3-fázový spotrebič)' : 'L1 (1F sústava)'}
                    </span>
                  ) : (
                    <div className="inline-flex rounded-xl bg-white p-1 border border-slate-200">
                      {(['L1', 'L2', 'L3'] as PhaseAllocation[]).map((ph) => (
                        <button
                          key={ph}
                          type="button"
                          onClick={() =>
                            onProjectChange({
                              ...project,
                              circuits: project.circuits.map((item) =>
                                item.id === c.id ? { ...item, phase: ph } : item
                              ),
                            })
                          }
                          className={`px-3.5 py-1.5 rounded-lg font-mono text-xs font-bold transition-all ${
                            c.phase === ph
                              ? 'bg-blue-600 text-white shadow-sm'
                              : 'text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          {ph}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* KROK 6 – VÝSLEDNÁ SCHÉMA, KONTROLA NÁVRHU A EXPORT PDF                */}
      {/* ===================================================================== */}
      {activeStep === 6 && (
        <div className="space-y-5">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                KROK 6 – VÝSLEDNÁ SCHÉMA A KONTROLA NÁVRHU
              </h3>
              <p className="text-sm text-slate-500">
                Vaša elektrická schéma je pripravená. Skontrolujte súlad s STN normami a stiahnite si PDF dokumentáciu.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={onOpenFullEditor}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-colors"
              >
                <Layers className="w-4 h-4 text-blue-600" />
                OTVORIŤ EDITOR SCHÉMY
              </button>
              <button
                type="button"
                onClick={onOpenExport}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold shadow-sm transition-colors"
              >
                <FileText className="w-4 h-4" />
                DOKUMENTÁCIA A EXPORT PDF
              </button>
            </div>
          </div>

          {/* Simple Status Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-center gap-3">
              <CheckCircle2 className="w-7 h-7 text-emerald-600 shrink-0" />
              <div>
                <div className="text-lg font-mono font-bold text-emerald-950">
                  {okCount} VYHOVUJE
                </div>
                <div className="text-xs text-emerald-800">
                  Overené pravidlá STN 33 2000-4-41
                </div>
              </div>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3">
              <AlertTriangle className="w-7 h-7 text-amber-600 shrink-0" />
              <div>
                <div className="text-lg font-mono font-bold text-amber-950">
                  {warningCount} UPOZORNENIA
                </div>
                <div className="text-xs text-amber-800">
                  Body na odborné overenie pri revízii
                </div>
              </div>
            </div>
            <div
              className={`rounded-2xl p-4 flex items-center gap-3 border ${
                errorCount > 0
                  ? 'bg-rose-50 border-rose-200'
                  : 'bg-slate-50 border-slate-200'
              }`}
            >
              <Shield
                className={`w-7 h-7 shrink-0 ${
                  errorCount > 0 ? 'text-rose-600' : 'text-slate-400'
                }`}
              />
              <div>
                <div
                  className={`text-lg font-mono font-bold ${
                    errorCount > 0 ? 'text-rose-950' : 'text-slate-800'
                  }`}
                >
                  {errorCount} KRITICKÉ CHYBY
                </div>
                <div className="text-xs text-slate-600">
                  {errorCount === 0
                    ? 'Žiadne kritické porušenia zapojenia'
                    : 'Vyžaduje úpravu pred realizáciou'}
                </div>
              </div>
            </div>
          </div>

          {/* Embedded Full Schematic Preview */}
          <div className="h-[680px]">
            <ElectricalSchemaCanvas
              project={project}
              displayMode={displayMode}
              onDisplayModeChange={onDisplayModeChange}
              onProjectChange={onProjectChange}
            />
          </div>
        </div>
      )}

      {/* BOTTOM WIZARD NAVIGATION BUTTONS */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex items-center justify-between">
        <button
          type="button"
          disabled={activeStep === 1}
          onClick={() => setActiveStep((s) => Math.max(1, s - 1))}
          className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${
            activeStep === 1
              ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
              : 'bg-slate-100 hover:bg-slate-200 text-slate-800'
          }`}
        >
          <ArrowLeft className="w-4 h-4" />
          Predchádzajúci krok
        </button>

        <div className="text-xs font-semibold text-slate-500">
          Krok {activeStep} z 6
        </div>

        {activeStep < 6 ? (
          <button
            type="button"
            onClick={() => setActiveStep((s) => Math.min(6, s + 1))}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold shadow-sm transition-all"
          >
            Ďalší krok: {WIZARD_STEPS[activeStep].title}
            <ArrowRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={onOpenExport}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold shadow-sm transition-all"
          >
            <FileText className="w-4 h-4" />
            Prejsť na PDF Export a Kusovník
          </button>
        )}
      </div>
    </div>
  );
};
