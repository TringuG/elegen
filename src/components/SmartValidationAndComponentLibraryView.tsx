import React, { useState } from 'react';
import {
  SwitchboardProject,
  CatalogProduct,
  Manufacturer,
  MainBreakerCurrent,
  BreakerCharacteristic,
  PolesType,
  BreakingCapacity,
} from '../types/electrical';
import {
  validateStnCompliance,
  INITIAL_COMPONENT_LIBRARY,
} from '../utils/electricalEngine';
import {
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Search,
  Edit3,
  Plus,
  ExternalLink,
  CheckSquare,
  Square,
  Package,
  Save,
  SlidersHorizontal,
  Info,
  X,
} from 'lucide-react';

interface Props {
  mode: 'validation' | 'component-library';
  project: SwitchboardProject;
  onProjectChange: (updated: SwitchboardProject, actionDescription?: string) => void;
}

export const SmartValidationAndComponentLibraryView: React.FC<Props> = ({
  mode,
  project,
  onProjectChange,
}) => {
  const [catalog, setCatalog] = useState<CatalogProduct[]>(() => {
    try {
      const saved = localStorage.getItem('elektro_pro_component_library_v1');
      if (saved) {
        const parsed = JSON.parse(saved) as CatalogProduct[];
        if (Array.isArray(parsed)) {
          const existingIds = new Set(parsed.map((p) => p.id));
          const missingDefaults = INITIAL_COMPONENT_LIBRARY.filter((p) => !existingIds.has(p.id));
          return [...parsed, ...missingDefaults];
        }
      }
    } catch {
      // ignore
    }
    return INITIAL_COMPONENT_LIBRARY;
  });

  const [selectedManufacturer, setSelectedManufacturer] = useState<string>('ALL');
  const [selectedDeviceType, setSelectedDeviceType] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [editingProduct, setEditingProduct] = useState<CatalogProduct | null>(null);
  const [selectedDatasheetProduct, setSelectedDatasheetProduct] =
    useState<CatalogProduct | null>(null);
  const [insertFeedback, setInsertFeedback] = useState<string | null>(null);

  const saveCatalog = (updated: CatalogProduct[]) => {
    setCatalog(updated);
    try {
      localStorage.setItem('elektro_pro_component_library_v1', JSON.stringify(updated));
    } catch {
      // ignore
    }
  };

  if (mode === 'validation') {
    const messages = validateStnCompliance(project);
    const redItems = messages.filter((m) => m.severity === 'error');
    const orangeItems = messages.filter((m) => m.severity === 'warning');
    const greenItems = messages.filter((m) => m.severity === 'ok');

    const checklist = project.verificationChecklist || {
      shortCircuitMeasuredOrCalculated: false,
      voltageDropVerified: false,
      selectivityVerified: false,
      thermalDissipationVerified: false,
      onSiteRevisionRequiredAcknowledged: false,
    };

    const allChecklistConfirmed =
      checklist.shortCircuitMeasuredOrCalculated &&
      checklist.voltageDropVerified &&
      checklist.selectivityVerified &&
      checklist.thermalDissipationVerified &&
      checklist.onSiteRevisionRequiredAcknowledged;

    const toggleChecklist = (key: keyof typeof checklist) => {
      onProjectChange(
        {
          ...project,
          verificationChecklist: {
            ...checklist,
            [key]: !checklist[key],
          },
        },
        'Aktualizovaný kontrolný zoznam projektanta'
      );
    };

    return (
      <div className="space-y-6">
        {/* Deep Navy Structural Banner */}
        <div className="bg-[#0B1120] text-white rounded-2xl p-6 border border-slate-800 shadow-md flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-[#0066FF]/20 border border-[#0066FF]/40 flex items-center justify-center text-[#38BDF8] shrink-0">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-extrabold tracking-tight text-white">
                  Kontrola súladu s normami STN EN 61439 &amp; STN 33 2000-4-41
                </h1>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Automatický inžiniersky audit istenia, prúdových chráničov, prierezov vodičov, selektivity a fázovej symetrie.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <div className="px-3.5 py-2 rounded-xl bg-red-500/15 border border-red-500/40 text-red-300 font-mono text-xs font-bold flex items-center gap-1.5">
              <XCircle className="w-4 h-4 text-red-400" />
              <span>{redItems.length} Chýb</span>
            </div>
            <div className="px-3.5 py-2 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-300 font-mono text-xs font-bold flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <span>{orangeItems.length} Upozornení</span>
            </div>
            <div className="px-3.5 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 font-mono text-xs font-bold flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>{greenItems.length} Vyhovuje</span>
            </div>
          </div>
        </div>

        {/* Traffic-Light Sections on Crisp Light Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* RED: Critical Errors */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <XCircle className="w-5 h-5 text-red-600" />
                <h2 className="text-sm font-extrabold uppercase tracking-wider text-red-700">
                  Kritické chyby ({redItems.length})
                </h2>
              </div>
              <span className="px-2 py-0.5 rounded bg-red-50 text-red-700 border border-red-200 font-mono text-[11px] font-bold">
                STOP
              </span>
            </div>

            {redItems.length === 0 ? (
              <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-200 text-xs text-emerald-800 font-medium">
                Žiadne kritické porušenia pravidiel istenia alebo zapojenia neboli zistené.
              </div>
            ) : (
              <div className="space-y-3">
                {redItems.map((item) => (
                  <div
                    key={item.id}
                    className="p-3.5 rounded-xl bg-red-50/70 border border-red-200 space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[11px] font-bold text-red-700 bg-white px-2 py-0.5 rounded border border-red-200">
                        {item.code}
                      </span>
                      <span className="text-[11px] font-semibold text-red-600">
                        {item.category}
                      </span>
                    </div>
                    <div className="text-xs font-bold text-slate-900">{item.title}</div>
                    <p className="text-xs text-slate-700 leading-relaxed">{item.message}</p>
                    {item.verificationRequirement && (
                      <div className="pt-1 text-[11px] font-semibold text-red-800">
                        Požadovaný zásah: {item.verificationRequirement}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ORANGE: Warnings & Verification Points */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
                <h2 className="text-sm font-extrabold uppercase tracking-wider text-amber-700">
                  Upozornenia a overenie ({orangeItems.length})
                </h2>
              </div>
              <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 font-mono text-[11px] font-bold">
                OVERIŤ
              </span>
            </div>

            {orangeItems.length === 0 ? (
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600">
                Žiadne dodatočné varovania.
              </div>
            ) : (
              <div className="space-y-3 max-h-[560px] overflow-y-auto pr-1">
                {orangeItems.map((item) => (
                  <div
                    key={item.id}
                    className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200 space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[11px] font-bold text-amber-900 bg-white px-2 py-0.5 rounded border border-amber-200">
                        {item.code}
                      </span>
                      <span className="text-[11px] font-semibold text-amber-700">
                        {item.category}
                      </span>
                    </div>
                    <div className="text-xs font-bold text-slate-900">{item.title}</div>
                    <p className="text-xs text-slate-700 leading-relaxed">{item.message}</p>
                    {item.verificationRequirement && (
                      <div className="pt-1 text-[11px] font-semibold text-amber-900">
                        Odborné overenie: {item.verificationRequirement}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* GREEN: Confirmed Rules */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <h2 className="text-sm font-extrabold uppercase tracking-wider text-emerald-700">
                  Potvrdené kontroly ({greenItems.length})
                </h2>
              </div>
              <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 font-mono text-[11px] font-bold">
                OK
              </span>
            </div>

            <div className="space-y-3 max-h-[560px] overflow-y-auto pr-1">
              {greenItems.map((item) => (
                <div
                  key={item.id}
                  className="p-3.5 rounded-xl bg-emerald-50/60 border border-emerald-200 space-y-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[11px] font-bold text-emerald-800 bg-white px-2 py-0.5 rounded border border-emerald-200">
                      {item.code}
                    </span>
                    <span className="text-[11px] font-semibold text-emerald-700">
                      {item.category}
                    </span>
                  </div>
                  <div className="text-xs font-bold text-slate-900">{item.title}</div>
                  <p className="text-xs text-slate-600 leading-relaxed">{item.message}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Mandatory Engineer Verification Checklist */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-base font-extrabold text-slate-900">
                Kontrolný zoznam projektanta a revízneho technika (STN 33 2000-6)
              </h3>
              <p className="text-xs text-slate-500">
                Softvérový návrh nenahrádza povinné meranie impedancie poruchovej slučky a východiskovú odbornú prehliadku na stavbe.
              </p>
            </div>
            <span
              className={`px-3 py-1 rounded-lg text-xs font-bold ${
                allChecklistConfirmed
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-blue-50 text-[#0066FF] border border-blue-200'
              }`}
            >
              {allChecklistConfirmed
                ? 'Všetky kontrolné body potvrdené'
                : 'Potvrďte kontrolné body pred tlačou'}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[
              {
                key: 'shortCircuitMeasuredOrCalculated' as const,
                label:
                  'Skratová odolnosť Icn / Icu prístrojov bola overená voči predpokladanému skratovému prúdu Ik v mieste inštalácie.',
              },
              {
                key: 'voltageDropVerified' as const,
                label:
                  'Skutočné trasy a dĺžky káblov boli overené pre dodržanie dovoleného úbytku napätia ΔU ≤ 3 % (svetlá) / 5 % (ostatné).',
              },
              {
                key: 'selectivityVerified' as const,
                label:
                  'Selektivita medzi hlavným ističom pred elektromerom QF0 a podradenými ističmi bola posúdená podľa vypínacích charakteristík.',
              },
              {
                key: 'thermalDissipationVerified' as const,
                label:
                  'Otepľovanie rozvádzača (stratový výkon Pv) a minimálne 20 % modulová rezerva v skrini vyhovujú STN EN 61439-3.',
              },
              {
                key: 'onSiteRevisionRequiredAcknowledged' as const,
                label:
                  'Beriem na vedomie, že pred uvedením do prevádzky musí byť vykonaná východisková revízia podľa STN 33 2000-6.',
              },
            ].map((item) => {
              const checked = checklist[item.key];
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => toggleChecklist(item.key)}
                  className={`flex items-start gap-3 p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                    checked
                      ? 'bg-blue-50/60 border-[#0066FF] text-slate-900'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {checked ? (
                    <CheckSquare className="w-4 h-4 text-[#0066FF] shrink-0 mt-0.5" />
                  ) : (
                    <Square className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                  )}
                  <span className="text-xs font-medium leading-relaxed">{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ===========================================================================
  // SCREEN 10: COMPONENT LIBRARY (KNIŽNICA KOMPONENTOV) — LIGHT TECHNICAL DESIGN
  // ===========================================================================
  const filteredCatalog = catalog.filter((item) => {
    if (selectedManufacturer !== 'ALL' && item.manufacturer !== selectedManufacturer) return false;
    if (selectedDeviceType !== 'ALL' && item.deviceType !== selectedDeviceType) return false;
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      return (
        item.model.toLowerCase().includes(q) ||
        item.catalogNumber.toLowerCase().includes(q) ||
        item.name.toLowerCase().includes(q) ||
        item.manufacturer.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleInsertIntoProject = (product: CatalogProduct) => {
    if (product.deviceType === 'MCB (Istič)' || product.deviceType === 'AFDD (Oblúková ochrana)') {
      const nextNum = project.circuits.length + 1;
      const defaultRcd =
        project.rcds.find((r) => r.deviceKind === 'RCCB')?.id || project.rcds[0]?.id || 'NONE';
      const newCircuit = {
        id: `c-lib-${Date.now()}`,
        label: `FA${nextNum}`,
        name: `${product.name}`,
        category: 'Zásuvky' as const,
        rcdId: defaultRcd,
        poles: product.poles,
        ratedCurrent: (product.ratedCurrent as 6 | 10 | 13 | 16 | 20 | 25 | 32 | 40 | 50 | 63) || 16,
        characteristic: product.characteristic || 'B',
        breakingCapacity: product.breakingCapacity || '10 kA',
        phase: (product.poles === '3P' || product.poles === '4P' ? 'L1,L2,L3' : 'L1') as
          | 'L1'
          | 'L2'
          | 'L3'
          | 'L1,L2,L3',
        cable:
          product.poles === '3P'
            ? 'CYKY-J 5x2,5 mm²'
            : product.ratedCurrent <= 10
            ? 'CYKY-J 3x1,5 mm²'
            : 'CYKY-J 3x2,5 mm²',
        cableLengthM: 18,
        powerKw: product.poles === '3P' ? 5.5 : product.ratedCurrent <= 10 ? 0.6 : 2.2,
        manufacturer: product.manufacturer,
        model: product.model,
        catalogNumber: product.catalogNumber,
        hasAfdd: product.deviceType === 'AFDD (Oblúková ochrana)',
      };
      onProjectChange(
        {
          ...project,
          circuits: [...project.circuits, newCircuit],
        },
        `Pridaný prístroj z knižnice: ${product.manufacturer} ${product.model} (okruh ${newCircuit.label})`
      );
      setInsertFeedback(
        `Pridaný okruh ${newCircuit.label}: ${product.manufacturer} ${product.model}`
      );
    } else if (
      product.deviceType === 'RCCB (Prúdový chránič)' ||
      product.deviceType === 'RCBO (Ističochránič)'
    ) {
      const nextNum = project.rcds.length + 1;
      const isRcbo = product.deviceType === 'RCBO (Ističochránič)';
      const newRcd = {
        id: `rcd-lib-${Date.now()}`,
        label: `FI${nextNum}`,
        deviceKind: (isRcbo ? 'RCBO' : 'RCCB') as 'RCCB' | 'RCBO',
        poles: (product.poles === '4P' ? '4P' : '2P') as '2P' | '4P',
        ratedCurrent: (product.ratedCurrent as 10 | 16 | 20 | 25 | 32 | 40 | 63 | 80) || 40,
        sensitivity: product.rcdSensitivity || 30,
        type: product.rcdType || 'A',
        manufacturer: product.manufacturer,
        model: product.model,
        catalogNumber: product.catalogNumber,
        characteristic: isRcbo ? product.characteristic || 'B' : undefined,
        breakingCapacity: isRcbo ? product.breakingCapacity || '10 kA' : undefined,
        phase: (product.poles === '4P' ? 'L1,L2,L3' : 'L1') as 'L1' | 'L1,L2,L3',
        circuitName: isRcbo ? `Samostatný okruh (${product.model})` : undefined,
        cableType: isRcbo ? 'CYKY-J 3x2,5 mm²' : undefined,
        powerKw: isRcbo ? 2.0 : undefined,
        notes: `${product.name}`,
      };
      onProjectChange(
        {
          ...project,
          rcds: [...project.rcds, newRcd],
        },
        `Pridaný chránič z knižnice: ${product.manufacturer} ${product.model} (${newRcd.label})`
      );
      setInsertFeedback(
        `Pridaný chránič ${newRcd.label}: ${product.manufacturer} ${product.model}`
      );
    } else if (product.deviceType === 'Hlavný vypínač') {
      const currentInternal = project.mainBreaker.internalDevice;
      onProjectChange(
        {
          ...project,
          mainBreaker: {
            ...project.mainBreaker,
            hasInternalMainSwitch: true,
            internalSwitchCurrent:
              (product.ratedCurrent as 40 | 63 | 80 | 100) || 40,
            internalDevice: {
              enabled: true,
              deviceType: 'Hlavný vypínač',
              designation: currentInternal?.designation || 'QS1',
              poles: product.poles,
              ratedCurrent:
                (product.ratedCurrent as 16 | 20 | 25 | 32 | 40 | 50 | 63 | 80 | 100) || 40,
              manufacturer: product.manufacturer,
              model: product.model,
              catalogNumber: product.catalogNumber,
              modules: product.modules,
              hasOvercurrentProtection: false,
              topologyPosition: currentInternal?.topologyPosition || 'PRED_SPD_A_RCD',
            },
          },
        },
        `Nastavený hlavný vypínač v rozvádzači QS1: ${product.manufacturer} ${product.model}`
      );
      setInsertFeedback(
        `Nastavený hlavný vypínač QS1: ${product.manufacturer} ${product.model}`
      );
    } else if (product.deviceType === 'SPD (Prepäťová ochrana)') {
      onProjectChange(
        {
          ...project,
          mainBreaker: {
            ...project.mainBreaker,
            hasSurgeProtector: true,
            surgeProtectorType: product.model.includes('T1') ? 'T1+T2 (B+C)' : 'T2 (C)',
          },
        },
        `Aktivovaný zvodič prepätia SPD: ${product.manufacturer} ${product.model}`
      );
      setInsertFeedback(`Nastavený zvodič prepätia SPD: ${product.manufacturer} ${product.model}`);
    }

    setTimeout(() => setInsertFeedback(null), 3200);
  };

  const handleCreateNewCatalogItem = () => {
    const newItem: CatalogProduct = {
      id: `cat-custom-${Date.now()}`,
      manufacturer: 'Eaton',
      catalogNumber: 'CUSTOM-001',
      model: 'PL7-B16/1-CUSTOM',
      name: 'Vlastný modulárny prístroj',
      deviceType: 'MCB (Istič)',
      poles: '1P',
      ratedCurrent: 16,
      characteristic: 'B',
      breakingCapacity: '10 kA',
      modules: 1,
      voltage: '230/400 V AC',
      standard: 'STN EN 60898-1',
      powerLossW: 2.2,
      maxTerminalCrossSectionMm2: '25 mm²',
      datasheetSummary: 'Používateľský prístroj pridaný do lokálnej databázy komponentov.',
    };
    setEditingProduct(newItem);
  };

  const handleSaveEditedProduct = () => {
    if (!editingProduct) return;
    const exists = catalog.some((c) => c.id === editingProduct.id);
    const updated = exists
      ? catalog.map((c) => (c.id === editingProduct.id ? editingProduct : c))
      : [editingProduct, ...catalog];
    saveCatalog(updated);
    setEditingProduct(null);
  };

  return (
    <div className="space-y-6">
      {/* Top Deep Navy Header */}
      <div className="bg-[#0B1120] text-white rounded-2xl p-6 border border-slate-800 shadow-md flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-[#0066FF]/20 border border-[#0066FF]/40 flex items-center justify-center text-[#38BDF8] shrink-0">
            <Package className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-extrabold tracking-tight text-white">
                Knižnica komponentov a katalóg prístrojov
              </h1>
              <span className="px-2 py-0.5 rounded bg-[#0066FF] text-white font-mono text-xs font-bold">
                {catalog.length} položiek
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Overená databáza ističov (MCB), prúdových chráničov (RCCB/RCBO), hlavných vypínačov, SPD a AFDD s priamym vložením do schémy.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {insertFeedback && (
            <div className="px-3.5 py-2 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-xs font-bold text-emerald-300 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>{insertFeedback}</span>
            </div>
          )}
          <button
            type="button"
            onClick={handleCreateNewCatalogItem}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0066FF] hover:bg-[#2563EB] text-white text-xs font-bold shadow-sm transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Pridať vlastný komponent</span>
          </button>
        </div>
      </div>

      {/* Filter Bar — Crisp White Card */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
          {/* Search Input */}
          <div className="md:col-span-5 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Hľadať model (napr. PL7-B16, PF7, iC60N, LTN, OFI)..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-xs font-medium text-slate-900 focus:bg-white focus:border-[#0066FF] focus:outline-none"
            />
          </div>

          {/* Manufacturer Filter */}
          <div className="md:col-span-4 flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-slate-400 shrink-0" />
            <select
              value={selectedManufacturer}
              onChange={(e) => setSelectedManufacturer(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-xs font-bold text-slate-800 focus:bg-white focus:border-[#0066FF] focus:outline-none"
            >
              <option value="ALL">Všetci výrobcovia (Eaton, Schneider, OEZ, Hager, ABB...)</option>
              <option value="Eaton">Eaton</option>
              <option value="Schneider Electric">Schneider Electric</option>
              <option value="OEZ">OEZ</option>
              <option value="Hager">Hager</option>
              <option value="ABB">ABB</option>
              <option value="Legrand">Legrand</option>
              <option value="Schrack Technik">Schrack Technik</option>
            </select>
          </div>

          {/* Device Type Filter */}
          <div className="md:col-span-3">
            <select
              value={selectedDeviceType}
              onChange={(e) => setSelectedDeviceType(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-xs font-bold text-slate-800 focus:bg-white focus:border-[#0066FF] focus:outline-none"
            >
              <option value="ALL">Všetky kategórie prístrojov</option>
              <option value="MCB (Istič)">MCB (Ističe)</option>
              <option value="RCCB (Prúdový chránič)">RCCB (Prúdové chrániče)</option>
              <option value="RCBO (Ističochránič)">RCBO (Ističochrániče)</option>
              <option value="Hlavný vypínač">Hlavné vypínače (IS / SBN)</option>
              <option value="SPD (Prepäťová ochrana)">SPD (Zvodiče prepätia)</option>
              <option value="AFDD (Oblúková ochrana)">AFDD (Oblúkové ochrany)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Edit / Create Modal Card */}
      {editingProduct && (
        <div className="bg-white rounded-2xl border-2 border-[#0066FF] p-6 shadow-lg space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-base font-extrabold text-slate-900">
              Úprava / Pridanie katalógového prístroja
            </h3>
            <button
              type="button"
              onClick={() => setEditingProduct(null)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Výrobca</label>
              <select
                value={editingProduct.manufacturer}
                onChange={(e) =>
                  setEditingProduct({
                    ...editingProduct,
                    manufacturer: e.target.value as Manufacturer,
                  })
                }
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 font-semibold"
              >
                {[
                  'Eaton',
                  'Schneider Electric',
                  'OEZ',
                  'Hager',
                  'ABB',
                  'Legrand',
                  'Schrack Technik',
                ].map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Typ prístroja</label>
              <select
                value={editingProduct.deviceType}
                onChange={(e) =>
                  setEditingProduct({
                    ...editingProduct,
                    deviceType: e.target.value as CatalogProduct['deviceType'],
                  })
                }
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 font-semibold"
              >
                <option value="MCB (Istič)">MCB (Istič)</option>
                <option value="RCCB (Prúdový chránič)">RCCB (Prúdový chránič)</option>
                <option value="RCBO (Ističochránič)">RCBO (Ističochránič)</option>
                <option value="Hlavný vypínač">Hlavný vypínač</option>
                <option value="SPD (Prepäťová ochrana)">SPD (Prepäťová ochrana)</option>
                <option value="AFDD (Oblúková ochrana)">AFDD (Oblúková ochrana)</option>
              </select>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Modelové označenie</label>
              <input
                type="text"
                value={editingProduct.model}
                onChange={(e) =>
                  setEditingProduct({ ...editingProduct, model: e.target.value })
                }
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 font-mono text-slate-900 font-bold"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Katalógové číslo</label>
              <input
                type="text"
                value={editingProduct.catalogNumber}
                onChange={(e) =>
                  setEditingProduct({ ...editingProduct, catalogNumber: e.target.value })
                }
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 font-mono text-slate-900"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Počet pólov</label>
              <select
                value={editingProduct.poles}
                onChange={(e) =>
                  setEditingProduct({
                    ...editingProduct,
                    poles: e.target.value as PolesType,
                  })
                }
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 font-mono text-slate-900"
              >
                {(['1P', '2P', '3P', '4P'] as PolesType[]).map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Menovitý prúd In (A)</label>
              <input
                type="number"
                value={editingProduct.ratedCurrent}
                onChange={(e) =>
                  setEditingProduct({
                    ...editingProduct,
                    ratedCurrent: Number(e.target.value) as MainBreakerCurrent,
                  })
                }
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 font-mono text-slate-900"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Charakteristika</label>
              <select
                value={editingProduct.characteristic || 'B'}
                onChange={(e) =>
                  setEditingProduct({
                    ...editingProduct,
                    characteristic: e.target.value as BreakerCharacteristic,
                  })
                }
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 font-mono text-slate-900"
              >
                <option value="B">B</option>
                <option value="C">C</option>
                <option value="D">D</option>
              </select>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Skratová odolnosť</label>
              <select
                value={editingProduct.breakingCapacity || '10 kA'}
                onChange={(e) =>
                  setEditingProduct({
                    ...editingProduct,
                    breakingCapacity: e.target.value as BreakingCapacity,
                  })
                }
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 font-mono text-slate-900"
              >
                <option value="6 kA">6 kA</option>
                <option value="10 kA">10 kA</option>
                <option value="15 kA">15 kA</option>
                <option value="25 kA">25 kA</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setEditingProduct(null)}
              className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-bold cursor-pointer"
            >
              Zrušiť
            </button>
            <button
              type="button"
              onClick={handleSaveEditedProduct}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0066FF] hover:bg-[#2563EB] text-white text-xs font-bold cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              Uložiť do knižnice
            </button>
          </div>
        </div>
      )}

      {/* Selected Datasheet Inspector Drawer */}
      {selectedDatasheetProduct && (
        <div className="bg-blue-50/70 rounded-2xl border border-[#0066FF]/40 p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Info className="w-4 h-4 text-[#0066FF]" />
              <span className="text-xs font-bold uppercase tracking-wider text-[#0066FF]">
                Technický list prístroja • {selectedDatasheetProduct.manufacturer}
              </span>
            </div>
            <h4 className="text-base font-extrabold text-slate-900">
              {selectedDatasheetProduct.model} — {selectedDatasheetProduct.name}
            </h4>
            <p className="text-xs text-slate-700">{selectedDatasheetProduct.datasheetSummary}</p>
            <div className="flex flex-wrap items-center gap-3 pt-1 font-mono text-xs text-slate-600">
              <span>Kat. č.: <strong>{selectedDatasheetProduct.catalogNumber}</strong></span>
              <span>Norma: <strong>{selectedDatasheetProduct.standard}</strong></span>
              <span>Stratový výkon Pv: <strong>{selectedDatasheetProduct.powerLossW} W</strong></span>
              <span>Max. prierez svoriek: <strong>{selectedDatasheetProduct.maxTerminalCrossSectionMm2}</strong></span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => handleInsertIntoProject(selectedDatasheetProduct)}
              className="px-4 py-2 rounded-xl bg-[#0066FF] hover:bg-[#2563EB] text-white text-xs font-bold cursor-pointer"
            >
              + Vložiť do rozvádzača
            </button>
            <button
              type="button"
              onClick={() => setSelectedDatasheetProduct(null)}
              className="px-3 py-2 rounded-xl bg-white border border-slate-300 text-slate-700 text-xs font-bold cursor-pointer"
            >
              Zavrieť
            </button>
          </div>
        </div>
      )}

      {/* Main Catalog Table — Crisp White Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <th className="py-3.5 px-4">Výrobca</th>
                <th className="py-3.5 px-4">Model / Kat. č.</th>
                <th className="py-3.5 px-4">Kategória</th>
                <th className="py-3.5 px-4">Parametre</th>
                <th className="py-3.5 px-4">Moduly / Pv</th>
                <th className="py-3.5 px-4 text-right">Akcia</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs">
              {filteredCatalog.map((item) => (
                <tr
                  key={item.id}
                  className="hover:bg-blue-50/30 transition-colors"
                >
                  <td className="py-3.5 px-4 font-bold text-slate-900">
                    {item.manufacturer}
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="font-mono font-bold text-[#0066FF]">{item.model}</div>
                    <div className="font-mono text-[11px] text-slate-500">
                      Kat. č.: {item.catalogNumber}
                    </div>
                  </td>
                  <td className="py-3.5 px-4">
                    <span className="px-2.5 py-1 rounded-md bg-slate-100 border border-slate-200 text-slate-800 font-semibold text-[11px]">
                      {item.deviceType}
                    </span>
                    <div className="text-[11px] text-slate-500 mt-1">{item.name}</div>
                  </td>
                  <td className="py-3.5 px-4 font-mono text-slate-800">
                    <span className="font-bold">{item.poles}</span> •{' '}
                    <span className="font-bold">
                      {item.characteristic ? `${item.characteristic}` : ''}
                      {item.ratedCurrent} A
                    </span>
                    {item.rcdSensitivity && (
                      <span className="ml-1 text-blue-700 font-bold">
                        • {item.rcdSensitivity}mA (Typ {item.rcdType})
                      </span>
                    )}
                    {item.breakingCapacity && (
                      <div className="text-[11px] text-slate-500">
                        Icn: {item.breakingCapacity} • {item.standard}
                      </div>
                    )}
                  </td>
                  <td className="py-3.5 px-4 font-mono text-slate-700">
                    <div>{item.modules} mod.</div>
                    <div className="text-[11px] text-slate-500">Pv = {item.powerLossW} W</div>
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <div className="inline-flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => setSelectedDatasheetProduct(item)}
                        title="Zobraziť technický list"
                        className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingProduct(item)}
                        title="Upraviť parametre"
                        className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleInsertIntoProject(item)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#0066FF] hover:bg-[#2563EB] text-white font-bold text-xs shadow-xs transition-colors cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Vložiť do schémy</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
