import React from 'react';
import {
  BreakerCharacteristic,
  BreakingCapacity,
  MainBreakerCurrent,
  MainBreakerLocation,
  Manufacturer,
  NetworkSystemType,
  ObjectType,
  PolesType,
  SwitchboardProject,
} from '../types/electrical';
import {
  MAIN_BREAKER_CURRENTS,
  MANUFACTURERS,
  applySupplySystemChange,
  suggestMainBreakerModel,
} from '../utils/electricalEngine';

interface BasicAndMainSettingsFormProps {
  project: SwitchboardProject;
  onChange: (updated: SwitchboardProject) => void;
}

const OBJECT_TYPES: ObjectType[] = ['Rodinný dom', 'Byt', 'Garáž', 'Prevádzka', 'Iné'];
const NETWORK_SYSTEMS: NetworkSystemType[] = ['TN-C', 'TN-S', 'TN-C-S', 'TT'];
const POLES_OPTIONS: PolesType[] = ['1P', '2P', '3P', '4P'];
const CHAR_OPTIONS: BreakerCharacteristic[] = ['B', 'C', 'D'];
const CAPACITY_OPTIONS: BreakingCapacity[] = ['6 kA', '10 kA', '15 kA', '25 kA'];

export const BasicAndMainSettingsForm: React.FC<BasicAndMainSettingsFormProps> = ({
  project,
  onChange,
}) => {
  const handleSystemSwitch = (sys: '1f' | '3f') => {
    onChange(applySupplySystemChange(project, sys));
  };

  const updateMainBreaker = (patch: Partial<SwitchboardProject['mainBreaker']>, autoModel = true) => {
    const nextMain = { ...project.mainBreaker, ...patch };
    if (autoModel && !('model' in patch)) {
      nextMain.model = suggestMainBreakerModel(
        nextMain.manufacturer,
        nextMain.poles,
        nextMain.characteristic,
        nextMain.ratedCurrent,
        nextMain.breakingCapacity
      );
    }
    onChange({
      ...project,
      mainBreaker: nextMain,
    });
  };

  return (
    <div className="space-y-6">
      {/* SEKCA 1: ZÁKLADNÉ ÚDAJE ROZVÁDZAČA */}
      <section className="bg-white border border-slate-200 rounded-lg p-5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">1. Základné údaje rozvádzača</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Parametre odberného miesta, napäťovej sústavy a siete podľa STN 33 2000-1
            </p>
          </div>
          <span className="text-xs font-mono text-slate-500">
            {project.supplySystem === '3f' ? '3×230/400 V ~ 50 Hz' : '1×230 V ~ 50 Hz'}
          </span>
        </div>

        <div className="space-y-4">
          {/* Názov rozvádzača */}
          <div>
            <label
              htmlFor="switchboard-name"
              className="block text-xs font-medium text-slate-700 mb-1"
            >
              Názov rozvádzača
            </label>
            <input
              id="switchboard-name"
              type="text"
              value={project.name}
              onChange={(e) => onChange({ ...project, name: e.target.value })}
              placeholder="napr. RH – Hlavný domový rozvádzač"
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white"
            />
          </div>

          {/* Typ objektu */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Typ objektu
            </label>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
              {OBJECT_TYPES.map((type) => {
                const active = project.objectType === type;
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => onChange({ ...project, objectType: type })}
                    className={`px-2.5 py-2 text-xs font-medium rounded-md border transition-colors whitespace-nowrap truncate ${
                      active
                        ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {type}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Jednofázová / Trojfázová sústava, Napätie, Počet fáz */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
            <div className="sm:col-span-5">
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Napájacia sústava
              </label>
              <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-md border border-slate-200">
                <button
                  type="button"
                  onClick={() => handleSystemSwitch('1f')}
                  className={`py-1.5 px-2 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                    project.supplySystem === '1f'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Jednofázová
                </button>
                <button
                  type="button"
                  onClick={() => handleSystemSwitch('3f')}
                  className={`py-1.5 px-2 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                    project.supplySystem === '3f'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Trojfázová
                </button>
              </div>
            </div>

            <div className="sm:col-span-4">
              <label
                htmlFor="voltage-select"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Menovité napätie
              </label>
              <select
                id="voltage-select"
                value={project.voltage}
                onChange={(e) => {
                  const val = e.target.value as '230 V' | '400 V';
                  handleSystemSwitch(val === '230 V' ? '1f' : '3f');
                }}
                className="w-full px-2.5 py-2 text-xs font-mono font-medium bg-slate-50 border border-slate-300 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="230 V">230 V (1f AC)</option>
                <option value="400 V">400 V (3f AC)</option>
              </select>
            </div>

            <div className="sm:col-span-3">
              <label
                htmlFor="phase-count-select"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Počet fáz
              </label>
              <select
                id="phase-count-select"
                value={project.phaseCount}
                onChange={(e) => {
                  const count = Number(e.target.value) as 1 | 3;
                  handleSystemSwitch(count === 1 ? '1f' : '3f');
                }}
                className="w-full px-2.5 py-2 text-xs font-mono font-medium bg-slate-50 border border-slate-300 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value={1}>1 fáza (L1)</option>
                <option value={3}>3 fázy (L1-3)</option>
              </select>
            </div>
          </div>

          {/* Sieťová sústava TN-C / TN-S / TN-C-S / TT */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-slate-700">
                Sieťová sústava (STN 33 2000-1)
              </label>
              <span className="text-xs text-slate-500 font-mono">
                {project.networkSystem === 'TN-C-S' && 'Prívod PEN → bod rozdelenia PE + N'}
                {project.networkSystem === 'TN-S' && 'Samostatné vodiče PE a N od prívodu'}
                {project.networkSystem === 'TN-C' && 'Spoločný vodič PEN (bez RCD)'}
                {project.networkSystem === 'TT' && 'Vlastné uzemnenie RA + prúdový chránič'}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {NETWORK_SYSTEMS.map((net) => {
                const active = project.networkSystem === net;
                return (
                  <button
                    key={net}
                    type="button"
                    onClick={() => onChange({ ...project, networkSystem: net })}
                    className={`py-2 px-3 text-xs font-mono font-semibold rounded-md border transition-colors ${
                      active
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {net}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Prívodný kábel, Krytie a Projektant */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
            <div>
              <label
                htmlFor="supply-cable"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Prívodný kábel
              </label>
              <input
                id="supply-cable"
                type="text"
                value={project.supplyCable}
                onChange={(e) => onChange({ ...project, supplyCable: e.target.value })}
                className="w-full px-3 py-1.5 text-xs font-mono bg-slate-50 border border-slate-300 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div>
              <label
                htmlFor="ip-rating"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Krytie rozvádzača
              </label>
              <select
                id="ip-rating"
                value={project.ipRating}
                onChange={(e) =>
                  onChange({
                    ...project,
                    ipRating: e.target.value as SwitchboardProject['ipRating'],
                  })
                }
                className="w-full px-3 py-1.5 text-xs font-mono bg-slate-50 border border-slate-300 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="IP30">IP30 / IK07 (interiér)</option>
                <option value="IP40">IP40 / IK07 (s dvierkami)</option>
                <option value="IP54">IP54 (zvýšené krytie)</option>
                <option value="IP65">IP65 (vlhké / garáž / exteriér)</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="project-number"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Číslo zákazky / Výkresu
              </label>
              <input
                id="project-number"
                type="text"
                value={project.projectNumber}
                onChange={(e) => onChange({ ...project, projectNumber: e.target.value })}
                className="w-full px-3 py-1.5 text-xs font-mono bg-slate-50 border border-slate-300 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
          </div>
        </div>
      </section>

      {/* SEKCIA 2: HLAVNÝ ISTIČ */}
      <section className="bg-white border border-slate-200 rounded-lg p-5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">2. Hlavný istič (QM0)</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Parametre hlavného nadprúdového istenia a jednoznačné umiestnenie podľa zapojenia
            </p>
          </div>
          <span className="text-xs font-mono font-semibold text-blue-700">
            {project.mainBreaker.poles} {project.mainBreaker.characteristic}
            {project.mainBreaker.ratedCurrent} A ({project.mainBreaker.breakingCapacity})
          </span>
        </div>

        <div className="space-y-4">
          {/* UMIESTNENIE HLAVNÉHO ISTIČA: PRED ROZVÁDZAČOM vs V ROZVÁDZAČI */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg">
            <label className="block text-xs font-semibold text-slate-800 mb-2">
              Umiestnenie hlavného ističa podľa skutočného zapojenia:
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {(
                ['PRED ROZVÁDZAČOM', 'V ROZVÁDZAČI'] as MainBreakerLocation[]
              ).map((loc) => {
                const isSelected = project.mainBreaker.location === loc;
                return (
                  <button
                    key={loc}
                    type="button"
                    onClick={() => updateMainBreaker({ location: loc }, false)}
                    className={`p-3 rounded-md border text-left transition-all ${
                      isSelected
                        ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                        : 'bg-white text-slate-800 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="text-xs font-mono font-bold tracking-tight">
                      HLAVNÝ ISTIČ {loc}
                    </div>
                    <div
                      className={`text-xs mt-1 ${
                        isSelected ? 'text-blue-100' : 'text-slate-500'
                      }`}
                    >
                      {loc === 'PRED ROZVÁDZAČOM'
                        ? 'Umiestnený v elektromerovom rozvádzači (RE). V schéme kreslený pred hranicou rozvádzača.'
                        : 'Osadený priamo na DIN lište č. 1 vo vnútri riešeného rozvádzača.'}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Počet pólov a Charakteristika */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Počet pólov hlavného ističa
              </label>
              <div className="grid grid-cols-4 gap-1.5">
                {POLES_OPTIONS.map((p) => {
                  const active = project.mainBreaker.poles === p;
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => updateMainBreaker({ poles: p })}
                      className={`py-2 text-xs font-mono font-semibold rounded-md border transition-colors ${
                        active
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {p}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Vypínacia charakteristika
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {CHAR_OPTIONS.map((ch) => {
                  const active = project.mainBreaker.characteristic === ch;
                  return (
                    <button
                      key={ch}
                      type="button"
                      onClick={() => updateMainBreaker({ characteristic: ch })}
                      className={`py-2 text-xs font-mono font-semibold rounded-md border transition-colors ${
                        active
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      Char. {ch}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Menovitý prúd: 10 A, 16 A, 20 A, 25 A, 32 A, 40 A, 50 A, 63 A */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Menovitý prúd In (A)
            </label>
            <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5">
              {MAIN_BREAKER_CURRENTS.map((amp) => {
                const active = project.mainBreaker.ratedCurrent === amp;
                return (
                  <button
                    key={amp}
                    type="button"
                    onClick={() => updateMainBreaker({ ratedCurrent: amp })}
                    className={`py-2 text-xs font-mono font-semibold rounded-md border transition-colors tabular-nums ${
                      active
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {amp} A
                  </button>
                );
              })}
            </div>
          </div>

          {/* Skratová vypínacia schopnosť, Výrobca a Model */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label
                htmlFor="main-breaking-capacity"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Skratová odolnosť (Icn)
              </label>
              <select
                id="main-breaking-capacity"
                value={project.mainBreaker.breakingCapacity}
                onChange={(e) =>
                  updateMainBreaker({
                    breakingCapacity: e.target.value as BreakingCapacity,
                  })
                }
                className="w-full px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-300 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                {CAPACITY_OPTIONS.map((cap) => (
                  <option key={cap} value={cap}>
                    {cap}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="main-manufacturer"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Výrobca prístroja
              </label>
              <select
                id="main-manufacturer"
                value={project.mainBreaker.manufacturer}
                onChange={(e) =>
                  updateMainBreaker({
                    manufacturer: e.target.value as Manufacturer,
                  })
                }
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                {MANUFACTURERS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="main-model"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Model / Typové označenie
              </label>
              <input
                id="main-model"
                type="text"
                value={project.mainBreaker.model}
                onChange={(e) => updateMainBreaker({ model: e.target.value }, false)}
                className="w-full px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-300 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
          </div>

          {/* Doplnková vstupná výbava rozvádzača: Hlavný vypínač QS1 a Zvodič prepätia SPD */}
          <div className="pt-2 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-md border border-slate-200">
              <div>
                <div className="text-xs font-medium text-slate-800">
                  Hlavný vypínač v rozvádzači (QS1)
                </div>
                <div className="text-xs text-slate-500">
                  Vypínač zaťaženia na vstupe rozvádzača
                </div>
              </div>
              <div className="flex items-center gap-2">
                {project.mainBreaker.hasInternalMainSwitch && (
                  <select
                    aria-label="Menovitý prúd hlavného vypínača"
                    value={project.mainBreaker.internalSwitchCurrent}
                    onChange={(e) =>
                      updateMainBreaker(
                        {
                          internalSwitchCurrent: Number(e.target.value) as 40 | 63 | 80 | 100,
                        },
                        false
                      )
                    }
                    className="px-2 py-1 text-xs font-mono bg-white border border-slate-300 rounded"
                  >
                    <option value={40}>40 A</option>
                    <option value={63}>63 A</option>
                    <option value={80}>80 A</option>
                    <option value={100}>100 A</option>
                  </select>
                )}
                <input
                  type="checkbox"
                  aria-label="Osadiť hlavný vypínač v rozvádzači"
                  checked={project.mainBreaker.hasInternalMainSwitch}
                  onChange={(e) =>
                    updateMainBreaker({ hasInternalMainSwitch: e.target.checked }, false)
                  }
                  className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
                />
              </div>
            </div>

            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-md border border-slate-200">
              <div>
                <div className="text-xs font-medium text-slate-800">
                  Zvodič prepätia SPD (FV1)
                </div>
                <div className="text-xs text-slate-500">
                  Ochrana pred prepätím podľa STN EN 62305
                </div>
              </div>
              <div className="flex items-center gap-2">
                {project.mainBreaker.hasSurgeProtector && (
                  <select
                    aria-label="Typ zvodiča prepätia SPD"
                    value={project.mainBreaker.surgeProtectorType}
                    onChange={(e) =>
                      updateMainBreaker(
                        {
                          surgeProtectorType: e.target.value as 'T1+T2 (B+C)' | 'T2 (C)',
                        },
                        false
                      )
                    }
                    className="px-2 py-1 text-xs font-mono bg-white border border-slate-300 rounded"
                  >
                    <option value="T1+T2 (B+C)">T1+T2</option>
                    <option value="T2 (C)">T2</option>
                  </select>
                )}
                <input
                  type="checkbox"
                  aria-label="Osadiť zvodič prepätia SPD"
                  checked={project.mainBreaker.hasSurgeProtector}
                  onChange={(e) =>
                    updateMainBreaker({ hasSurgeProtector: e.target.checked }, false)
                  }
                  className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
                />
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
