import React from 'react';
import { Plus, Trash2, Scale } from 'lucide-react';
import {
  BreakerCharacteristic,
  CircuitCategory,
  CircuitConfig,
  PhaseAllocation,
  PolesType,
  SwitchboardProject,
} from '../types/electrical';
import {
  balanceCircuitPhases,
  calculatePhaseLoad,
  suggestCircuitBreakerModel,
} from '../utils/electricalEngine';

interface CircuitManagerFormProps {
  project: SwitchboardProject;
  onChange: (updated: SwitchboardProject) => void;
}

const CIRCUIT_CURRENTS: CircuitConfig['ratedCurrent'][] = [6, 10, 13, 16, 20, 25, 32, 40, 50, 63];
const CABLE_OPTIONS = [
  'CYKY-J 3x1,5 mm²',
  'CYKY-J 3x2,5 mm²',
  'CYKY-J 3x4 mm²',
  'CYKY-J 5x1,5 mm²',
  'CYKY-J 5x2,5 mm²',
  'CYKY-J 5x4 mm²',
  'CYKY-J 5x6 mm²',
  'CYKY-J 5x10 mm²',
];
const CATEGORIES: CircuitCategory[] = [
  'Osvetlenie',
  'Zásuvky',
  'Kuchyňa / Spotrebiče',
  'Kúpeľňa / Práčovňa',
  'Technológia / Kúrenie',
  'Exteriér / Garáž / EV',
  'Rezerva',
];

export const CircuitManagerForm: React.FC<CircuitManagerFormProps> = ({ project, onChange }) => {
  const phaseLoad = calculatePhaseLoad(project);

  const addQuickCircuit = (preset: 'light' | 'socket' | 'cooktop' | 'heating' | 'ev') => {
    const nextIdx = project.circuits.length + 1;
    const defaultRcd =
      project.rcds.find((r) => r.deviceKind === 'RCCB')?.id ||
      project.rcds[0]?.id ||
      'NONE';
    const mfg = project.mainBreaker.manufacturer;
    const is3f = project.phaseCount === 3;
    const phases: PhaseAllocation[] = ['L1', 'L2', 'L3'];
    const autoSinglePhase = is3f ? phases[(nextIdx - 1) % 3] : 'L1';

    let newCircuit: CircuitConfig;

    if (preset === 'light') {
      newCircuit = {
        id: `c-${Date.now()}-${nextIdx}`,
        label: `FA${nextIdx}`,
        name: `Svetelný obvod č. ${nextIdx}`,
        category: 'Osvetlenie',
        rcdId: defaultRcd,
        poles: '1P',
        ratedCurrent: 10,
        characteristic: 'B',
        breakingCapacity: '10 kA',
        phase: autoSinglePhase,
        cable: 'CYKY-J 3x1,5 mm²',
        powerKw: 0.35,
        manufacturer: mfg,
        model: suggestCircuitBreakerModel(mfg, '1P', 'B', 10),
      };
    } else if (preset === 'cooktop' && is3f) {
      newCircuit = {
        id: `c-${Date.now()}-${nextIdx}`,
        label: `FA${nextIdx}`,
        name: 'Indukčná varná doska (400 V)',
        category: 'Kuchyňa / Spotrebiče',
        rcdId: defaultRcd,
        poles: '3P',
        ratedCurrent: 16,
        characteristic: 'B',
        breakingCapacity: '10 kA',
        phase: 'L1,L2,L3',
        cable: 'CYKY-J 5x2,5 mm²',
        powerKw: 7.2,
        manufacturer: mfg,
        model: suggestCircuitBreakerModel(mfg, '3P', 'B', 16),
      };
    } else if (preset === 'heating') {
      newCircuit = {
        id: `c-${Date.now()}-${nextIdx}`,
        label: `FA${nextIdx}`,
        name: is3f ? 'Tepelné čerpadlo / Elektrokotol' : 'Bojler TÚV 230 V',
        category: 'Technológia / Kúrenie',
        rcdId: defaultRcd,
        poles: is3f ? '3P' : '1P',
        ratedCurrent: 16,
        characteristic: 'B',
        breakingCapacity: '10 kA',
        phase: is3f ? 'L1,L2,L3' : 'L1',
        cable: is3f ? 'CYKY-J 5x2,5 mm²' : 'CYKY-J 3x2,5 mm²',
        powerKw: is3f ? 6.0 : 2.2,
        manufacturer: mfg,
        model: suggestCircuitBreakerModel(mfg, is3f ? '3P' : '1P', 'B', 16),
      };
    } else if (preset === 'ev' && is3f) {
      newCircuit = {
        id: `c-${Date.now()}-${nextIdx}`,
        label: `FA${nextIdx}`,
        name: 'Wallbox EV / 400 V zásuvka',
        category: 'Exteriér / Garáž / EV',
        rcdId: defaultRcd,
        poles: '3P',
        ratedCurrent: 16,
        characteristic: 'C',
        breakingCapacity: '10 kA',
        phase: 'L1,L2,L3',
        cable: 'CYKY-J 5x4 mm²',
        powerKw: 11.0,
        manufacturer: mfg,
        model: suggestCircuitBreakerModel(mfg, '3P', 'C', 16),
      };
    } else {
      newCircuit = {
        id: `c-${Date.now()}-${nextIdx}`,
        label: `FA${nextIdx}`,
        name: `Zásuvkový obvod č. ${nextIdx}`,
        category: 'Zásuvky',
        rcdId: defaultRcd,
        poles: '1P',
        ratedCurrent: 16,
        characteristic: 'B',
        breakingCapacity: '10 kA',
        phase: autoSinglePhase,
        cable: 'CYKY-J 3x2,5 mm²',
        powerKw: 2.2,
        manufacturer: mfg,
        model: suggestCircuitBreakerModel(mfg, '1P', 'B', 16),
      };
    }

    onChange({
      ...project,
      circuits: [...project.circuits, newCircuit],
    });
  };

  const updateCircuit = (id: string, patch: Partial<CircuitConfig>) => {
    const updated = project.circuits.map((c) => {
      if (c.id !== id) return c;
      const next: CircuitConfig = { ...c, ...patch };
      if (patch.poles) {
        if (patch.poles === '3P' || patch.poles === '4P') {
          next.phase = 'L1,L2,L3';
          if (next.cable.includes('3x')) {
            next.cable = next.cable.replace('3x', '5x');
          }
        } else if (next.phase === 'L1,L2,L3') {
          next.phase = 'L1';
          if (next.cable.includes('5x')) {
            next.cable = next.cable.replace('5x', '3x');
          }
        }
      }
      next.model = suggestCircuitBreakerModel(
        next.manufacturer,
        next.poles,
        next.characteristic,
        next.ratedCurrent
      );
      return next;
    });
    onChange({ ...project, circuits: updated });
  };

  const removeCircuit = (id: string) => {
    const filtered = project.circuits
      .filter((c) => c.id !== id)
      .map((c, idx) => ({ ...c, label: `FA${idx + 1}` }));
    onChange({ ...project, circuits: filtered });
  };

  return (
    <div className="space-y-5">
      {/* Horný panel pridávania obvodov a fázovej symetrie */}
      <div className="bg-white border border-slate-200 rounded-lg p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              4. Vývody a koncové obvody rozvádzača ({project.circuits.length} ks)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Koncové ističe FA1..FA{project.circuits.length || 'n'} priradené k prúdovým chráničom FI1..FIn
            </p>
          </div>

          {project.phaseCount === 3 && (
            <button
              type="button"
              onClick={() => onChange(balanceCircuitPhases(project))}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-800 bg-slate-100 border border-slate-300 rounded-md hover:bg-slate-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Scale className="w-3.5 h-3.5" />
              Automaticky vyvážiť fázy L1/L2/L3
            </button>
          )}
        </div>

        {/* Rýchle pridanie typických obvodov */}
        <div className="mt-4">
          <div className="text-xs font-medium text-slate-600 mb-2">
            Rýchle pridanie typického obvodu podľa STN 33 2130:
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => addQuickCircuit('socket')}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Zásuvkový obvod (B16 / 2,5 mm²)
            </button>
            <button
              type="button"
              onClick={() => addQuickCircuit('light')}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 border border-slate-300 rounded-md hover:bg-slate-200 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Osvetlenie (B10 / 1,5 mm²)
            </button>
            {project.phaseCount === 3 && (
              <button
                type="button"
                onClick={() => addQuickCircuit('cooktop')}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 border border-slate-300 rounded-md hover:bg-slate-200 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Varná doska 400V (3P B16)
              </button>
            )}
            <button
              type="button"
              onClick={() => addQuickCircuit('heating')}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 border border-slate-300 rounded-md hover:bg-slate-200 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Kúrenie / Bojler
            </button>
            {project.phaseCount === 3 && (
              <button
                type="button"
                onClick={() => addQuickCircuit('ev')}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 border border-slate-300 rounded-md hover:bg-slate-200 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Wallbox EV / 400V zásuvka
              </button>
            )}
          </div>
        </div>

        {/* Prehľad zaťaženia fáz L1, L2, L3 */}
        <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-3 gap-3 text-xs font-mono tabular-nums">
          <div className="p-2.5 bg-slate-50 border border-slate-200 rounded">
            <div className="text-slate-500">Fáza L1</div>
            <div className="text-sm font-bold text-slate-900 mt-0.5">
              {phaseLoad.L1.powerKw} kW · {phaseLoad.L1.currentA} A
            </div>
          </div>
          {project.phaseCount === 3 ? (
            <>
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded">
                <div className="text-slate-500">Fáza L2</div>
                <div className="text-sm font-bold text-slate-900 mt-0.5">
                  {phaseLoad.L2.powerKw} kW · {phaseLoad.L2.currentA} A
                </div>
              </div>
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded">
                <div className="text-slate-500">Fáza L3</div>
                <div className="text-sm font-bold text-slate-900 mt-0.5">
                  {phaseLoad.L3.powerKw} kW · {phaseLoad.L3.currentA} A
                </div>
              </div>
            </>
          ) : (
            <div className="col-span-2 p-2.5 bg-slate-50 border border-slate-200 rounded flex items-center justify-between">
              <div>
                <div className="text-slate-500">Súdobý príkon (β = {phaseLoad.simultaneityFactor})</div>
                <div className="text-sm font-bold text-slate-900 mt-0.5">
                  {phaseLoad.simultaneousKw} kW (výpočtový prúd {phaseLoad.estimatedMaxCurrentA} A)
                </div>
              </div>
              <span className="text-slate-500">1×230 V</span>
            </div>
          )}
        </div>
      </div>

      {/* Zoznam koncových obvodov */}
      <div className="space-y-3">
        {project.circuits.map((c) => (
          <div
            key={c.id}
            className="bg-white border border-slate-200 rounded-lg p-3.5 transition-colors"
          >
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
              {/* Označenie a Názov obvodu */}
              <div className="sm:col-span-1">
                <label className="block text-xs font-medium text-slate-600 mb-1">Ozn.</label>
                <input
                  type="text"
                  aria-label={`Označenie obvodu ${c.label}`}
                  value={c.label}
                  onChange={(e) => updateCircuit(c.id, { label: e.target.value })}
                  className="w-full px-2 py-1.5 text-xs font-mono font-bold bg-slate-50 border border-slate-300 rounded text-slate-900"
                />
              </div>

              <div className="sm:col-span-4">
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Názov obvodu / Miestnosť
                </label>
                <input
                  type="text"
                  aria-label={`Názov obvodu ${c.label}`}
                  value={c.name}
                  onChange={(e) => updateCircuit(c.id, { name: e.target.value })}
                  className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded text-slate-900"
                />
              </div>

              {/* Priradený chránič */}
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Prúdový chránič
                </label>
                <select
                  aria-label={`Prúdový chránič pre ${c.label}`}
                  value={c.rcdId}
                  onChange={(e) => updateCircuit(c.id, { rcdId: e.target.value })}
                  className="w-full px-2 py-1.5 text-xs font-mono bg-slate-50 border border-slate-300 rounded text-slate-900"
                >
                  {project.rcds.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label} ({r.deviceKind} {r.ratedCurrent}A)
                    </option>
                  ))}
                  <option value="NONE">Bez chrániča (priamo)</option>
                </select>
              </div>

              {/* Póly, Charakteristika, Prúd */}
              <div className="sm:col-span-1">
                <label className="block text-xs font-medium text-slate-600 mb-1">Póly</label>
                <select
                  aria-label={`Počet pólov pre ${c.label}`}
                  value={c.poles}
                  onChange={(e) => updateCircuit(c.id, { poles: e.target.value as PolesType })}
                  className="w-full px-1.5 py-1.5 text-xs font-mono bg-slate-50 border border-slate-300 rounded text-slate-900"
                >
                  <option value="1P">1P</option>
                  <option value="2P">2P</option>
                  {project.phaseCount === 3 && <option value="3P">3P</option>}
                  {project.phaseCount === 3 && <option value="4P">4P</option>}
                </select>
              </div>

              <div className="sm:col-span-1">
                <label className="block text-xs font-medium text-slate-600 mb-1">Char.</label>
                <select
                  aria-label={`Charakteristika pre ${c.label}`}
                  value={c.characteristic}
                  onChange={(e) =>
                    updateCircuit(c.id, {
                      characteristic: e.target.value as BreakerCharacteristic,
                    })
                  }
                  className="w-full px-1.5 py-1.5 text-xs font-mono bg-slate-50 border border-slate-300 rounded text-slate-900"
                >
                  <option value="B">B</option>
                  <option value="C">C</option>
                  <option value="D">D</option>
                </select>
              </div>

              <div className="sm:col-span-1">
                <label className="block text-xs font-medium text-slate-600 mb-1">In (A)</label>
                <select
                  aria-label={`Menovitý prúd pre ${c.label}`}
                  value={c.ratedCurrent}
                  onChange={(e) =>
                    updateCircuit(c.id, {
                      ratedCurrent: Number(e.target.value) as CircuitConfig['ratedCurrent'],
                    })
                  }
                  className="w-full px-1.5 py-1.5 text-xs font-mono bg-slate-50 border border-slate-300 rounded text-slate-900"
                >
                  {CIRCUIT_CURRENTS.map((amp) => (
                    <option key={amp} value={amp}>
                      {amp}A
                    </option>
                  ))}
                </select>
              </div>

              {/* Fáza & Odstránenie */}
              <div className="sm:col-span-1">
                <label className="block text-xs font-medium text-slate-600 mb-1">Fáza</label>
                <select
                  aria-label={`Fáza pre ${c.label}`}
                  disabled={project.phaseCount === 1 || c.poles === '3P' || c.poles === '4P'}
                  value={c.phase}
                  onChange={(e) =>
                    updateCircuit(c.id, { phase: e.target.value as PhaseAllocation })
                  }
                  className="w-full px-1.5 py-1.5 text-xs font-mono bg-slate-50 border border-slate-300 rounded text-slate-900 disabled:opacity-60"
                >
                  <option value="L1">L1</option>
                  {project.phaseCount === 3 && <option value="L2">L2</option>}
                  {project.phaseCount === 3 && <option value="L3">L3</option>}
                  {project.phaseCount === 3 && <option value="L1,L2,L3">L1-3</option>}
                </select>
              </div>

              <div className="sm:col-span-1 flex justify-end">
                <button
                  type="button"
                  onClick={() => removeCircuit(c.id)}
                  aria-label={`Odstrániť vývod ${c.label}`}
                  className="p-2 text-red-600 bg-red-50 border border-red-200 rounded hover:bg-red-100"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Druhý kompaktný riadok pre kábel, kategóriu a príkon */}
            <div className="mt-2 pt-2 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-slate-500 shrink-0">Kábel:</span>
                <select
                  aria-label={`Kábel pre ${c.label}`}
                  value={c.cable}
                  onChange={(e) => updateCircuit(c.id, { cable: e.target.value })}
                  className="flex-1 px-2 py-1 font-mono bg-slate-50 border border-slate-200 rounded text-slate-800"
                >
                  {CABLE_OPTIONS.map((cb) => (
                    <option key={cb} value={cb}>
                      {cb}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-slate-500 shrink-0">Kategória:</span>
                <select
                  aria-label={`Kategória pre ${c.label}`}
                  value={c.category}
                  onChange={(e) =>
                    updateCircuit(c.id, { category: e.target.value as CircuitCategory })
                  }
                  className="flex-1 px-2 py-1 bg-slate-50 border border-slate-200 rounded text-slate-800"
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-slate-500 shrink-0">Príkon (kW):</span>
                <input
                  type="number"
                  step="0.1"
                  min="0.05"
                  max="50"
                  aria-label={`Príkon v kW pre ${c.label}`}
                  value={c.powerKw}
                  onChange={(e) =>
                    updateCircuit(c.id, { powerKw: Math.max(0.05, Number(e.target.value) || 0.1) })
                  }
                  className="w-24 px-2 py-1 font-mono bg-slate-50 border border-slate-200 rounded text-slate-800 tabular-nums"
                />
                <span className="text-slate-400 font-mono truncate">{c.model}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
