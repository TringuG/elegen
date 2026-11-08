import React, { useState } from 'react';
import { Sparkles, Scale, AlertTriangle, CheckCircle2, ArrowRight } from 'lucide-react';
import {
  BreakerCharacteristic,
  MainBreakerCurrent,
  Manufacturer,
  NavigationSection,
  NetworkSystemType,
  ObjectType,
  PhaseAllocation,
  SwitchboardProject,
} from '../types/electrical';
import {
  MAIN_BREAKER_CURRENTS,
  MANUFACTURERS,
  SmartDesignerInput,
  SmartDesignerProposal,
  balanceCircuitPhases,
  calculatePhaseLoad,
  generateSmartSwitchboardProposal,
} from '../utils/electricalEngine';
import { BasicAndMainSettingsForm } from './BasicAndMainSettingsForm';
import { RcdManagerForm } from './RcdManagerForm';
import { CircuitManagerForm } from './CircuitManagerForm';

interface SmartDesignerAndPhaseBalancingViewProps {
  project: SwitchboardProject;
  onChange: (updated: SwitchboardProject, actionLabel?: string) => void;
  onNavigate: (section: NavigationSection) => void;
}

type DesignerSubTab = 'smart-wizard' | 'phase-balancing' | 'manual-config';

export const SmartDesignerAndPhaseBalancingView: React.FC<
  SmartDesignerAndPhaseBalancingViewProps
> = ({ project, onChange, onNavigate }) => {
  const [subTab, setSubTab] = useState<DesignerSubTab>('smart-wizard');
  const [manualStep, setManualStep] = useState<'basic' | 'rcds' | 'circuits'>('basic');

  const [wizardInput, setWizardInput] = useState<SmartDesignerInput>({
    projectName: project.name,
    objectType: project.objectType,
    roomCount: 5,
    lightCircuitCount: 3,
    socketCircuitCount: 4,
    mainBreakerCurrent: project.mainBreaker.ratedCurrent,
    mainBreakerChar: project.mainBreaker.characteristic,
    mainBreakerLocation:
      project.mainBreaker.location === 'V ROZVÁDZAČI' ? 'V ROZVÁDZAČI' : 'PRED ROZVÁDZAČOM',
    networkSystem: project.networkSystem === 'TN-C' ? 'TN-C-S' : project.networkSystem,
    supplySystem: project.supplySystem,
    preferredManufacturer: project.mainBreaker.manufacturer,
    appliances: {
      inductionCooktop: true,
      electricOven: true,
      dishwasher: true,
      washingMachine: true,
      dryer: true,
      boilerWaterHeater: false,
      heatPumpOrBoiler: true,
      airConditioning: false,
      evWallbox11kW: false,
      outdoorAndGarage: true,
    },
    protections: {
      hasSpd: true,
      spdType: 'T1+T2 (B+C)',
      useRcboForFridgeAndCritical: true,
      useTypeBRcdForEv: true,
      useAfddForBedrooms: false,
    },
  });

  const [lastProposal, setLastProposal] = useState<SmartDesignerProposal | null>(null);

  const phaseLoad = calculatePhaseLoad(project);

  const handleRunSmartDesigner = () => {
    const proposal = generateSmartSwitchboardProposal(wizardInput);
    setLastProposal(proposal);
    onChange(
      proposal.project,
      `AI Smart Designer: vygenerovaný návrh (${proposal.project.rcds.length}× FI, ${proposal.project.circuits.length}× FA)`
    );
  };

  const handlePhaseAssign = (circuitId: string, newPhase: PhaseAllocation) => {
    const updatedCircuits = project.circuits.map((c) =>
      c.id === circuitId ? { ...c, phase: newPhase } : c
    );
    onChange(
      { ...project, circuits: updatedCircuits },
      `Manuálna zmena fázy okruhu na ${newPhase}`
    );
  };

  const handleRcdPhaseAssign = (rcdId: string, newPhase: PhaseAllocation) => {
    const updatedRcds = project.rcds.map((r) =>
      r.id === rcdId ? { ...r, phase: newPhase } : r
    );
    onChange(
      { ...project, rcds: updatedRcds },
      `Zmena fázy 2P chrániča na ${newPhase}`
    );
  };

  const handleAutoBalance = () => {
    const balanced = balanceCircuitPhases(project);
    onChange(balanced, 'Automatické vyváženie fáz L1 / L2 / L3');
  };

  return (
    <div className="space-y-5">
      {/* Prepínač pod-sekcií Návrhu rozvádzača */}
      <div className="bg-[#0B1120] border border-[#1E293B] rounded-2xl p-5 shadow-md text-white flex flex-wrap items-center justify-between gap-4">
        <div
          role="tablist"
          aria-label="Režimy návrhu rozvádzača"
          className="flex flex-wrap items-center gap-1.5 p-1 bg-[#162033] rounded-xl border border-[#1E293B]"
        >
          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'smart-wizard'}
            onClick={() => setSubTab('smart-wizard')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
              subTab === 'smart-wizard'
                ? 'bg-[#0066FF] text-white shadow-sm'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            1. AI Smart Designer (Sprievodca návrhom)
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'phase-balancing'}
            onClick={() => setSubTab('phase-balancing')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
              subTab === 'phase-balancing'
                ? 'bg-[#0066FF] text-white shadow-sm'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <Scale className="w-3.5 h-3.5" />
            2. Rozdelenie fáz L1 / L2 / L3 (Symetria: {phaseLoad.asymmetryPercent} %)
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'manual-config'}
            onClick={() => setSubTab('manual-config')}
            className={`px-3.5 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
              subTab === 'manual-config'
                ? 'bg-[#0066FF] text-white shadow-sm'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            3. Detailná konfigurácia prvkov ({project.rcds.length}× FI, {project.circuits.length}× FA)
          </button>
        </div>

        <button
          type="button"
          onClick={() => onNavigate('schema-editor')}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-[#0066FF] hover:bg-[#0052CC] rounded-xl transition-colors cursor-pointer shadow-sm"
        >
          Prejsť do Editora schémy
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* =================================================================== */}
      {/* TAB 1: AI SMART DESIGNER                                            */}
      {/* =================================================================== */}
      {subTab === 'smart-wizard' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Vstupné parametre sprievodcu */}
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-lg p-5 space-y-5">
            <div className="border-b border-slate-100 pb-3">
              <h2 className="text-base font-semibold text-slate-900">
                AI Smart Designer – Inteligentný návrh rozvádzača podľa STN 33 2130
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Zadajte parametre objektu, počet miestností a spotrebiče. Systém navrhne rozdelenie okruhov, ochranné prvky a vyváži fázy L1/L2/L3.
              </p>
            </div>

            {/* Základné vstupy objektu */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Názov rozvádzača
                </label>
                <input
                  type="text"
                  value={wizardInput.projectName}
                  onChange={(e) =>
                    setWizardInput({ ...wizardInput, projectName: e.target.value })
                  }
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-md text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Typ objektu
                </label>
                <select
                  aria-label="Typ objektu v Smart Designeri"
                  value={wizardInput.objectType}
                  onChange={(e) =>
                    setWizardInput({
                      ...wizardInput,
                      objectType: e.target.value as ObjectType,
                    })
                  }
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-md text-slate-900"
                >
                  <option value="Rodinný dom">Rodinný dom</option>
                  <option value="Byt">Byt</option>
                  <option value="Garáž">Garáž</option>
                  <option value="Prevádzka">Prevádzka</option>
                  <option value="Iné">Iné</option>
                </select>
              </div>
            </div>

            {/* Počet miestností, svetelných a zásuvkových okruhov */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label
                  htmlFor="smart-rooms"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Počet miestností
                </label>
                <input
                  id="smart-rooms"
                  type="number"
                  min={1}
                  max={25}
                  value={wizardInput.roomCount}
                  onChange={(e) => {
                    const rooms = Math.max(1, Number(e.target.value) || 1);
                    setWizardInput({
                      ...wizardInput,
                      roomCount: rooms,
                      lightCircuitCount: Math.max(2, Math.ceil(rooms / 2)),
                      socketCircuitCount: Math.max(2, rooms - 1),
                    });
                  }}
                  className="w-full px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-300 rounded-md text-slate-900 tabular-nums"
                />
              </div>

              <div>
                <label
                  htmlFor="smart-lights"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Počet svetelných okruhov (B10)
                </label>
                <input
                  id="smart-lights"
                  type="number"
                  min={1}
                  max={16}
                  value={wizardInput.lightCircuitCount}
                  onChange={(e) =>
                    setWizardInput({
                      ...wizardInput,
                      lightCircuitCount: Math.max(1, Number(e.target.value) || 1),
                    })
                  }
                  className="w-full px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-300 rounded-md text-slate-900 tabular-nums"
                />
              </div>

              <div>
                <label
                  htmlFor="smart-sockets"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Počet zásuvkových okruhov (B16)
                </label>
                <input
                  id="smart-sockets"
                  type="number"
                  min={1}
                  max={24}
                  value={wizardInput.socketCircuitCount}
                  onChange={(e) =>
                    setWizardInput({
                      ...wizardInput,
                      socketCircuitCount: Math.max(1, Number(e.target.value) || 1),
                    })
                  }
                  className="w-full px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-300 rounded-md text-slate-900 tabular-nums"
                />
              </div>
            </div>

            {/* Hlavný istič, Sieť a Výrobca */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Sústava &amp; Sieť
                </label>
                <select
                  aria-label="Typ siete v Smart Designeri"
                  value={`${wizardInput.supplySystem}-${wizardInput.networkSystem}`}
                  onChange={(e) => {
                    const [sys, net] = e.target.value.split('-') as [
                      '1f' | '3f',
                      NetworkSystemType
                    ];
                    setWizardInput({
                      ...wizardInput,
                      supplySystem: sys,
                      networkSystem: net || 'TN-C-S',
                    });
                  }}
                  className="w-full px-2.5 py-2 text-xs font-mono bg-slate-50 border border-slate-300 rounded-md text-slate-900"
                >
                  <option value="3f-TN-C-S">3f 400V / TN-C-S</option>
                  <option value="3f-TN-S">3f 400V / TN-S</option>
                  <option value="3f-TT">3f 400V / TT</option>
                  <option value="1f-TN-C-S">1f 230V / TN-C-S</option>
                  <option value="1f-TN-S">1f 230V / TN-S</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Hlavný istič In
                </label>
                <select
                  aria-label="Hlavný istič v Smart Designeri"
                  value={wizardInput.mainBreakerCurrent}
                  onChange={(e) =>
                    setWizardInput({
                      ...wizardInput,
                      mainBreakerCurrent: Number(e.target.value) as MainBreakerCurrent,
                    })
                  }
                  className="w-full px-2.5 py-2 text-xs font-mono bg-slate-50 border border-slate-300 rounded-md text-slate-900"
                >
                  {MAIN_BREAKER_CURRENTS.map((amp) => (
                    <option key={amp} value={amp}>
                      {wizardInput.mainBreakerChar}
                      {amp} A
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Umiestnenie Hl. ističa
                </label>
                <select
                  aria-label="Umiestnenie hlavného ističa v Smart Designeri"
                  value={wizardInput.mainBreakerLocation}
                  onChange={(e) =>
                    setWizardInput({
                      ...wizardInput,
                      mainBreakerLocation: e.target.value as
                        | 'PRED ROZVÁDZAČOM'
                        | 'V ROZVÁDZAČI',
                    })
                  }
                  className="w-full px-2.5 py-2 text-xs font-mono bg-slate-50 border border-slate-300 rounded-md text-slate-900"
                >
                  <option value="PRED ROZVÁDZAČOM">PRED ROZVÁDZAČOM (v RE)</option>
                  <option value="V ROZVÁDZAČI">V ROZVÁDZAČI</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Preferovaný výrobca
                </label>
                <select
                  aria-label="Preferovaný výrobca v Smart Designeri"
                  value={wizardInput.preferredManufacturer}
                  onChange={(e) =>
                    setWizardInput({
                      ...wizardInput,
                      preferredManufacturer: e.target.value as Manufacturer,
                    })
                  }
                  className="w-full px-2.5 py-2 text-xs bg-slate-50 border border-slate-300 rounded-md text-slate-900"
                >
                  {MANUFACTURERS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Výkonné spotrebiče */}
            <div>
              <label className="block text-xs font-semibold text-slate-800 mb-2">
                Výkonné spotrebiče (samostatne istené okruhy podľa STN 33 2130):
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {[
                  { key: 'inductionCooktop', label: 'Indukčná varná doska (400 V / 7,2 kW)' },
                  { key: 'electricOven', label: 'Elektrická rúra na pečenie (230 V / 3,2 kW)' },
                  { key: 'dishwasher', label: 'Umývačka riadu (230 V / 2,2 kW)' },
                  { key: 'washingMachine', label: 'Práčka v kúpeľni/práčovni (230 V / 2,2 kW)' },
                  { key: 'dryer', label: 'Sušička bielizne (230 V / 1,8 kW)' },
                  { key: 'boilerWaterHeater', label: 'Elektrický bojler TÚV (230 V / 2,2 kW)' },
                  { key: 'heatPumpOrBoiler', label: 'Tepelné čerpadlo / Elektrokotol (400 V / 6,5 kW)' },
                  { key: 'airConditioning', label: 'Klimatizácia (230 V / 1,6 kW, char. C)' },
                  { key: 'evWallbox11kW', label: 'Nabíjačka elektromobilu Wallbox (400 V / 11 kW)' },
                  { key: 'outdoorAndGarage', label: 'Exteriér / terasa / záhradné zásuvky (230 V)' },
                ].map((item) => {
                  const k = item.key as keyof SmartDesignerInput['appliances'];
                  return (
                    <label
                      key={item.key}
                      className="flex items-center gap-2.5 p-2.5 bg-slate-50 border border-slate-200 rounded-md cursor-pointer hover:bg-slate-100/80"
                    >
                      <input
                        type="checkbox"
                        checked={wizardInput.appliances[k]}
                        onChange={(e) =>
                          setWizardInput({
                            ...wizardInput,
                            appliances: {
                              ...wizardInput.appliances,
                              [k]: e.target.checked,
                            },
                          })
                        }
                        className="w-4 h-4 accent-blue-600 rounded"
                      />
                      <span className="text-slate-800 font-medium">{item.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Požadované ochranné prvky */}
            <div>
              <label className="block text-xs font-semibold text-slate-800 mb-2">
                Požadované ochranné prvky:
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <label className="flex items-center gap-2.5 p-2.5 bg-slate-50 border border-slate-200 rounded-md cursor-pointer">
                  <input
                    type="checkbox"
                    checked={wizardInput.protections.hasSpd}
                    onChange={(e) =>
                      setWizardInput({
                        ...wizardInput,
                        protections: {
                          ...wizardInput.protections,
                          hasSpd: e.target.checked,
                        },
                      })
                    }
                    className="w-4 h-4 accent-blue-600 rounded"
                  />
                  <span className="text-slate-800 font-medium">
                    Zvodič prepätia SPD ({wizardInput.protections.spdType})
                  </span>
                </label>

                <label className="flex items-center gap-2.5 p-2.5 bg-slate-50 border border-slate-200 rounded-md cursor-pointer">
                  <input
                    type="checkbox"
                    checked={wizardInput.protections.useRcboForFridgeAndCritical}
                    onChange={(e) =>
                      setWizardInput({
                        ...wizardInput,
                        protections: {
                          ...wizardInput.protections,
                          useRcboForFridgeAndCritical: e.target.checked,
                        },
                      })
                    }
                    className="w-4 h-4 accent-blue-600 rounded"
                  />
                  <span className="text-slate-800 font-medium">
                    Samostatný RCBO pre chladničku, mrazničku a alarm
                  </span>
                </label>

                <label className="flex items-center gap-2.5 p-2.5 bg-slate-50 border border-slate-200 rounded-md cursor-pointer">
                  <input
                    type="checkbox"
                    checked={wizardInput.protections.useTypeBRcdForEv}
                    onChange={(e) =>
                      setWizardInput({
                        ...wizardInput,
                        protections: {
                          ...wizardInput.protections,
                          useTypeBRcdForEv: e.target.checked,
                        },
                      })
                    }
                    className="w-4 h-4 accent-blue-600 rounded"
                  />
                  <span className="text-slate-800 font-medium">
                    Prúdový chránič typu B pre EV Wallbox (ochrana DC prúdov)
                  </span>
                </label>

                <label className="flex items-center gap-2.5 p-2.5 bg-slate-50 border border-slate-200 rounded-md cursor-pointer">
                  <input
                    type="checkbox"
                    checked={wizardInput.protections.useAfddForBedrooms}
                    onChange={(e) =>
                      setWizardInput({
                        ...wizardInput,
                        protections: {
                          ...wizardInput.protections,
                          useAfddForBedrooms: e.target.checked,
                        },
                      })
                    }
                    className="w-4 h-4 accent-blue-600 rounded"
                  />
                  <span className="text-slate-800 font-medium">
                    Oblúková ochrana AFDD pre spálne a detské izby
                  </span>
                </label>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 flex items-center justify-end">
              <button
                type="button"
                onClick={handleRunSmartDesigner}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors cursor-pointer"
              >
                <Sparkles className="w-4 h-4" />
                Navrhnúť rozvádzač, prúdové chrániče a rozdelenie fáz
              </button>
            </div>
          </div>

          {/* Pravý stĺpec: Výstup návrhu + Povinné predpoklady, neistoty a odborné overenie */}
          <div className="lg:col-span-5 space-y-4">
            <div className="bg-amber-50 border border-amber-300 rounded-lg p-4 text-xs text-amber-950">
              <div className="flex items-center gap-2 font-bold text-amber-900">
                <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                <span>POVINNÉ UPOZORNENIE A HRANICA ZODPOVEDNOSTI SYSTÉMU</span>
              </div>
              <p className="mt-1.5 leading-relaxed">
                Automatizovaný návrh slúži výlučne ako projekčný podklad.{' '}
                <strong>
                  Systém ani AI nesmú a nemôžu samy schváliť bezpečnosť elektrického návrhu.
                </strong>{' '}
                Každý návrh podlieha autorizácii elektroprojektantom (§ 23 vyhl. MPSVR SR č. 508/2009 Z. z.) a východiskovej revízii (§ 24) na mieste stavby.
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4 text-xs">
              <div className="border-b border-slate-100 pb-3">
                <h3 className="text-sm font-bold text-slate-900">
                  Inžiniersky rozbor návrhu: Predpoklady, neistoty a požiadavky na overenie
                </h3>
                <p className="text-slate-500 mt-0.5">
                  Aktívny projekt: {project.name} ({project.rcds.length}× FI,{' '}
                  {project.circuits.length}× FA, inštalovaný príkon {phaseLoad.totalInstalledKw} kW)
                </p>
              </div>

              <div>
                <div className="font-semibold text-slate-900 mb-1.5">
                  1. Použité predpoklady výpočtu a návrhu:
                </div>
                <ul className="space-y-1.5 text-slate-600 list-disc pl-4">
                  {(
                    lastProposal?.assumptions || [
                      'Teplota okolia do +30 °C, medené káble CYKY-J uložené v stene (spôsob uloženia B1/C podľa STN 33 2000-5-523).',
                      'Rozdelenie svetelných a zásuvkových okruhov pod minimálne dva samostatné prúdové chrániče (FI1, FI2).',
                      'Predpokladaná vstupná impedancia nadradenej distribučnej siete Zq = 0,25 Ω.',
                    ]
                  ).map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </div>

              <div>
                <div className="font-semibold text-amber-800 mb-1.5">
                  2. Technické neistoty (vstupné neznáme stavby):
                </div>
                <ul className="space-y-1.5 text-slate-600 list-disc pl-4">
                  {(
                    lastProposal?.uncertainties || [
                      'Skutočné dĺžky káblových trás a prípadný prechod tepelnou izoláciou (spôsob uloženia A1) ovplyvňujú úbytok napätia ΔU a zaťažiteľnosť Iz.',
                      'Skutočná hodnota skratového prúdu Ik a impedancie slučky Zs v mieste pripojenia závisí od distribučnej siete.',
                    ]
                  ).map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </div>

              <div>
                <div className="font-semibold text-red-800 mb-1.5">
                  3. Požiadavky na povinné odborné overenie projektantom / revíznym technikom:
                </div>
                <ul className="space-y-1.5 text-slate-700 list-disc pl-4">
                  {(
                    lastProposal?.mandatoryHumanChecks || [
                      'Overiť skutočné dĺžky trás, spôsob uloženia káblov a korekčné súčinitele v sekcii 6. Výpočty.',
                      'Overiť selektivitu s hlavným ističom v RE podľa podmienok distribučnej spoločnosti.',
                      'Vykonať kusovú skúšku rozvádzača (STN EN 61439-3) a východiskovú revíziu s meraním Zs a vybavovacích časov chráničov RCD (STN 33 2000-6).',
                    ]
                  ).map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 2: PHASE BALANCING (ROZDELENIE ZÁŤAŽE L1, L2, L3)               */}
      {/* =================================================================== */}
      {subTab === 'phase-balancing' && (
        <div className="space-y-5">
          <div className="bg-white border border-slate-200 rounded-lg p-5">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  Rozdelenie záťaže medzi fázy L1, L2 a L3 (Phase Balancing)
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Prehľad prúdov, príkonu, percentuálneho vyťaženia voči hlavnému ističu ({project.mainBreaker.ratedCurrent} A) a manuálne / automatické priradenie fáz
                </p>
              </div>

              <button
                type="button"
                onClick={handleAutoBalance}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-md hover:bg-blue-700 cursor-pointer"
              >
                <Scale className="w-3.5 h-3.5" />
                Automaticky vyvážiť fázy L1 / L2 / L3
              </button>
            </div>

            {/* Karty fáz L1, L2, L3 */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
              {(
                [
                  { key: 'L1', label: 'Fáza L1 (Čierna)', data: phaseLoad.L1, color: 'bg-slate-900' },
                  { key: 'L2', label: 'Fáza L2 (Hnedá)', data: phaseLoad.L2, color: 'bg-amber-800' },
                  { key: 'L3', label: 'Fáza L3 (Šedá)', data: phaseLoad.L3, color: 'bg-slate-600' },
                ] as const
              ).map((ph) => {
                const isOver = ph.data.utilizationPercent > 100;
                return (
                  <div
                    key={ph.key}
                    className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900">{ph.label}</span>
                      <span className="text-xs font-mono text-slate-500">
                        {ph.data.count} okruhov
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 pt-1 font-mono tabular-nums">
                      <div>
                        <div className="text-[11px] text-slate-500">Inštalovaný P</div>
                        <div className="text-sm font-bold text-slate-900">{ph.data.powerKw} kW</div>
                      </div>
                      <div>
                        <div className="text-[11px] text-slate-500">Prúd fázy I</div>
                        <div className="text-sm font-bold text-slate-900">{ph.data.currentA} A</div>
                      </div>
                      <div>
                        <div className="text-[11px] text-slate-500">Vyťaženie (β)</div>
                        <div
                          className={`text-sm font-bold ${
                            isOver ? 'text-red-600' : 'text-blue-700'
                          }`}
                        >
                          {ph.data.utilizationPercent} %
                        </div>
                      </div>
                    </div>

                    {/* Progress bar vyťaženia fázy */}
                    <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all ${
                          isOver ? 'bg-red-600' : ph.color
                        }`}
                        style={{
                          width: `${Math.min(100, Math.max(4, ph.data.utilizationPercent))}%`,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Stav symetrie */}
            <div
              className={`mt-4 p-3 rounded-md border flex items-center justify-between gap-3 text-xs ${
                phaseLoad.asymmetryPercent > 25
                  ? 'bg-amber-50 border-amber-300 text-amber-950'
                  : 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
              }`}
            >
              <div className="flex items-center gap-2">
                {phaseLoad.asymmetryPercent > 25 ? (
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                )}
                <span>
                  <strong>Nesymetria zaťaženia fáz: {phaseLoad.asymmetryPercent} %</strong> —{' '}
                  {phaseLoad.asymmetryPercent > 25
                    ? 'Rozdiel zaťaženia medzi fázami presahuje odporúčaných 25 %. Kliknite na „Automaticky vyvážiť fázy“ alebo upravte priradenie v tabuľke nižšie.'
                    : 'Rozdelenie záťaže medzi L1, L2 a L3 je rovnomerné a vyhovuje STN 33 2130.'}
                </span>
              </div>
              <span className="font-mono shrink-0">
                Súdobosť β = {phaseLoad.simultaneityFactor} · Pp = {phaseLoad.simultaneousKw} kW
              </span>
            </div>

            {/* Matica manuálneho priradenia fáz okruhom */}
            <div className="mt-5 overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                    <th className="py-2 px-3">Ozn.</th>
                    <th className="py-2 px-3">Názov okruhu</th>
                    <th className="py-2 px-3">Chránič</th>
                    <th className="py-2 px-3">Istič</th>
                    <th className="py-2 px-3 text-right">Príkon</th>
                    <th className="py-2 px-3 text-right">Prúd Ib</th>
                    <th className="py-2 px-3 text-center">Priradenie fázy (L1 / L2 / L3)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {project.rcds
                    .filter((r) => r.deviceKind === 'RCBO')
                    .map((rcbo) => {
                      const kw = rcbo.powerKw ?? 2.0;
                      const ib = ((kw * 1000) / (230 * 0.92)).toFixed(1);
                      return (
                        <tr key={rcbo.id} className="bg-blue-50/30">
                          <td className="py-2 px-3 font-mono font-bold text-blue-800">
                            {rcbo.label}
                          </td>
                          <td className="py-2 px-3 font-medium text-slate-900">
                            {rcbo.circuitName || 'Samostatný okruh s RCBO'}
                          </td>
                          <td className="py-2 px-3 font-mono text-slate-600">RCBO (vlastný)</td>
                          <td className="py-2 px-3 font-mono">
                            {rcbo.poles} {rcbo.characteristic || 'B'}
                            {rcbo.ratedCurrent}A
                          </td>
                          <td className="py-2 px-3 font-mono text-right tabular-nums">
                            {kw} kW
                          </td>
                          <td className="py-2 px-3 font-mono text-right tabular-nums">{ib} A</td>
                          <td className="py-2 px-3 text-center">
                            {rcbo.poles === '4P' ? (
                              <span className="font-mono text-slate-500">L1, L2, L3 (3f)</span>
                            ) : (
                              <div className="inline-flex gap-1">
                                {(['L1', 'L2', 'L3'] as PhaseAllocation[]).map((ph) => (
                                  <button
                                    key={ph}
                                    type="button"
                                    disabled={project.phaseCount === 1 && ph !== 'L1'}
                                    onClick={() => handleRcdPhaseAssign(rcbo.id, ph)}
                                    className={`px-2.5 py-1 font-mono font-semibold rounded border cursor-pointer disabled:opacity-40 ${
                                      (rcbo.phase || 'L1') === ph
                                        ? 'bg-slate-900 text-white border-slate-900'
                                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                                    }`}
                                  >
                                    {ph}
                                  </button>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}

                  {project.circuits.map((c) => {
                    const is3P = c.poles === '3P' || c.poles === '4P';
                    const ib = is3P
                      ? ((c.powerKw * 1000) / (Math.sqrt(3) * 400 * 0.92)).toFixed(1)
                      : ((c.powerKw * 1000) / (230 * 0.92)).toFixed(1);
                    const rcdObj = project.rcds.find((r) => r.id === c.rcdId);

                    return (
                      <tr key={c.id} className="hover:bg-slate-50">
                        <td className="py-2 px-3 font-mono font-bold text-slate-900">{c.label}</td>
                        <td className="py-2 px-3 font-medium text-slate-900">{c.name}</td>
                        <td className="py-2 px-3 font-mono text-slate-600">
                          {rcdObj ? rcdObj.label : 'Bez RCD'}
                        </td>
                        <td className="py-2 px-3 font-mono">
                          {c.poles} {c.characteristic}
                          {c.ratedCurrent}A
                        </td>
                        <td className="py-2 px-3 font-mono text-right tabular-nums">
                          {c.powerKw} kW
                        </td>
                        <td className="py-2 px-3 font-mono text-right tabular-nums">
                          {ib} A {is3P ? '/ fáza' : ''}
                        </td>
                        <td className="py-2 px-3 text-center">
                          {is3P ? (
                            <span className="font-mono text-slate-600 font-semibold">
                              L1, L2, L3 (Symetrický 3f)
                            </span>
                          ) : (
                            <div className="inline-flex gap-1">
                              {(['L1', 'L2', 'L3'] as PhaseAllocation[]).map((ph) => (
                                <button
                                  key={ph}
                                  type="button"
                                  disabled={project.phaseCount === 1 && ph !== 'L1'}
                                  onClick={() => handlePhaseAssign(c.id, ph)}
                                  className={`px-2.5 py-1 font-mono font-semibold rounded border cursor-pointer disabled:opacity-40 ${
                                    c.phase === ph
                                      ? 'bg-blue-600 text-white border-blue-600'
                                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                                  }`}
                                >
                                  {ph}
                                </button>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 3: DETAILNÁ KONFIGURÁCIA PRVKOV (ZACHOVANÉ PÔVODNÉ FORMULÁRE)   */}
      {/* =================================================================== */}
      {subTab === 'manual-config' && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2 p-1 bg-slate-200/80 rounded-lg border border-slate-300/80 max-w-2xl">
            <button
              type="button"
              onClick={() => setManualStep('basic')}
              className={`py-2 px-3 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                manualStep === 'basic'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              1. Základné údaje &amp; Hlavný istič
            </button>
            <button
              type="button"
              onClick={() => setManualStep('rcds')}
              className={`py-2 px-3 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                manualStep === 'rcds'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              2. Prúdové chrániče ({project.rcds.length})
            </button>
            <button
              type="button"
              onClick={() => setManualStep('circuits')}
              className={`py-2 px-3 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                manualStep === 'circuits'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              3. Vývody a obvody ({project.circuits.length})
            </button>
          </div>

          {manualStep === 'basic' && (
            <BasicAndMainSettingsForm
              project={project}
              onChange={(u) => onChange(u, 'Úprava základných nastavení / hlavného ističa')}
            />
          )}
          {manualStep === 'rcds' && (
            <RcdManagerForm
              project={project}
              onChange={(u) => onChange(u, 'Úprava prúdových chráničov RCCB/RCBO')}
            />
          )}
          {manualStep === 'circuits' && (
            <CircuitManagerForm
              project={project}
              onChange={(u) => onChange(u, 'Úprava koncových obvodov FA')}
            />
          )}
        </div>
      )}
    </div>
  );
};
