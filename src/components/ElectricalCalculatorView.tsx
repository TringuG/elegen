import React, { useState } from 'react';
import {
  SwitchboardProject,
  CableInstallationMethod,
} from '../types/electrical';
import { calculateCircuitParameters } from '../utils/electricalEngine';
import {
  Calculator,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Info,
  Sliders,
} from 'lucide-react';

interface Props {
  project: SwitchboardProject;
  onProjectChange: (updated: SwitchboardProject, actionDescription?: string) => void;
}

export const ElectricalCalculatorView: React.FC<Props> = ({
  project,
  onProjectChange,
}) => {
  const [selectedCircuitId, setSelectedCircuitId] = useState<string>(
    project.circuits[0]?.id || ''
  );

  const calcResults = calculateCircuitParameters(project);
  const selectedCalc =
    calcResults.find((r) => r.circuitId === selectedCircuitId) || calcResults[0] || null;
  const selectedCircuit =
    project.circuits.find((c) => c.id === (selectedCalc?.circuitId || '')) || null;

  const updateCircuitParam = (
    circuitId: string,
    field: 'cableLengthM' | 'installationMethod' | 'cosPhi' | 'powerKw' | 'cable',
    value: number | string
  ) => {
    const updatedCircuits = project.circuits.map((c) =>
      c.id === circuitId ? { ...c, [field]: value } : c
    );
    onProjectChange(
      { ...project, circuits: updatedCircuits },
      'Úprava výpočtových parametrov okruhu'
    );
  };

  return (
    <div className="space-y-6">
      {/* Deep Navy Header & Upstream Supply Impedance Setting */}
      <div className="bg-[#0B1120] text-white rounded-2xl p-6 border border-slate-800 shadow-md flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-[#0066FF]/20 border border-[#0066FF]/40 flex items-center justify-center text-[#38BDF8] shrink-0">
            <Calculator className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-white">
              Elektrotechnický výpočtový modul (STN 33 2000-5-523 / STN 33 2000-4-41)
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Výpočet prevádzkového prúdu Ib, prúdovej zaťažiteľnosti Iz, úbytku napätia ΔU, impedancie poruchovej slučky Zs a skratového prúdu Ik.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 bg-[#0F172A] border border-slate-800 rounded-xl px-4 py-2.5 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-medium">Predradená impedancia siete Zq:</span>
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
              className="w-20 px-2.5 py-1 rounded-lg bg-[#1E293B] border border-slate-700 font-mono text-white font-bold"
            />
            <span className="font-mono text-slate-400">Ω</span>
          </div>

          <div className="h-4 w-px bg-slate-800" />

          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-medium">Dĺžka prívodu od RE:</span>
            <input
              type="number"
              min={1}
              max={200}
              value={project.mainBreaker.supplyLineLengthM ?? 15}
              onChange={(e) =>
                onProjectChange(
                  {
                    ...project,
                    mainBreaker: {
                      ...project.mainBreaker,
                      supplyLineLengthM: Math.max(1, Number(e.target.value) || 15),
                    },
                  },
                  'Zmena dĺžky hlavného domového vedenia'
                )
              }
              className="w-16 px-2.5 py-1 rounded-lg bg-[#1E293B] border border-slate-700 font-mono text-white font-bold"
            />
            <span className="font-mono text-slate-400">m</span>
          </div>
        </div>
      </div>

      {/* Interactive Inspector for Selected Circuit + Formula Breakdown */}
      {selectedCalc && selectedCircuit && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Parameter Sliders & Inputs */}
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-[#0066FF]" />
                <span className="text-xs font-extrabold uppercase tracking-wider text-slate-900">
                  Vstupné veličiny okruhu {selectedCalc.label}
                </span>
              </div>
              <span className="font-mono text-xs text-[#0066FF] font-bold">
                {selectedCalc.name}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs">
              <label className="space-y-1">
                <span className="text-slate-600 font-bold">Inštalovaný výkon P (kW)</span>
                <input
                  type="number"
                  step={0.1}
                  min={0.05}
                  max={50}
                  value={selectedCircuit.powerKw}
                  onChange={(e) =>
                    updateCircuitParam(
                      selectedCircuit.id,
                      'powerKw',
                      Math.max(0.05, Number(e.target.value) || 0.1)
                    )
                  }
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 font-mono font-bold text-slate-900 focus:bg-white focus:border-[#0066FF] focus:outline-none"
                />
              </label>

              <label className="space-y-1">
                <span className="text-slate-600 font-bold">Dĺžka trasy kábla L (m)</span>
                <input
                  type="number"
                  min={1}
                  max={300}
                  value={selectedCircuit.cableLengthM ?? 18}
                  onChange={(e) =>
                    updateCircuitParam(
                      selectedCircuit.id,
                      'cableLengthM',
                      Math.max(1, Number(e.target.value) || 10)
                    )
                  }
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 font-mono font-bold text-slate-900 focus:bg-white focus:border-[#0066FF] focus:outline-none"
                />
              </label>

              <label className="space-y-1">
                <span className="text-slate-600 font-bold">Účinník cos φ</span>
                <input
                  type="number"
                  step={0.02}
                  min={0.5}
                  max={1.0}
                  value={selectedCircuit.cosPhi ?? 0.95}
                  onChange={(e) =>
                    updateCircuitParam(
                      selectedCircuit.id,
                      'cosPhi',
                      Math.min(1, Math.max(0.5, Number(e.target.value) || 0.95))
                    )
                  }
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 font-mono font-bold text-slate-900 focus:bg-white focus:border-[#0066FF] focus:outline-none"
                />
              </label>

              <label className="space-y-1">
                <span className="text-slate-600 font-bold">Typ a prierez kábla</span>
                <select
                  value={selectedCircuit.cable}
                  onChange={(e) =>
                    updateCircuitParam(selectedCircuit.id, 'cable', e.target.value)
                  }
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 font-mono font-bold text-slate-900 focus:bg-white focus:border-[#0066FF] focus:outline-none"
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
                </select>
              </label>

              <label className="col-span-2 space-y-1">
                <span className="text-slate-600 font-bold">
                  Referenčný spôsob uloženia kábla (STN 33 2000-5-523)
                </span>
                <select
                  value={
                    selectedCircuit.installationMethod ||
                    'B1 (v inštalačnej rúre v stene)'
                  }
                  onChange={(e) =>
                    updateCircuitParam(
                      selectedCircuit.id,
                      'installationMethod',
                      e.target.value as CableInstallationMethod
                    )
                  }
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 font-semibold focus:bg-white focus:border-[#0066FF] focus:outline-none"
                >
                  <option value="A1 (v tepelnej izolácii)">
                    A1 – V tepelne izolovanej stene (najnižšia zaťažiteľnosť Iz)
                  </option>
                  <option value="B1 (v inštalačnej rúre v stene)">
                    B1 – V elektroinštalačnej rúre v murive
                  </option>
                  <option value="C (pod omietkou / na stene)">
                    C – Priamo pod omietkou alebo na povrchu steny
                  </option>
                  <option value="E (voľne na vzduchu / žľab)">
                    E – Na perforovanom káblovom žľabe / voľne vo vzduchu
                  </option>
                </select>
              </label>
            </div>
          </div>

          {/* Right: 4 Engineering Check Cards */}
          <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Check 1: Ib <= In <= Iz */}
            <div
              className={`p-5 rounded-2xl border shadow-sm ${
                selectedCalc.overloadProtectionOk
                  ? 'bg-white border-emerald-200'
                  : 'bg-red-50/60 border-red-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono uppercase tracking-wider text-slate-500 font-bold">
                  1. Podmienka istenia (Ib ≤ In ≤ Iz)
                </span>
                {selectedCalc.overloadProtectionOk ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                ) : (
                  <XCircle className="w-4 h-4 text-red-600" />
                )}
              </div>
              <div className="mt-2 font-mono text-base font-extrabold text-slate-900">
                Ib = {selectedCalc.designCurrentIb} A ≤ In ={' '}
                {selectedCalc.breakerCurrentIn} A ≤ Iz ={' '}
                {selectedCalc.currentCarryingCapacityIz} A
              </div>
              <p className="text-[11px] text-slate-600 mt-1.5 leading-relaxed">
                Výpočtový prúd Ib = P / ({selectedCalc.poles === '3P' ? '√3 × 400V' : '230V'}{' '}
                × cos φ). Dovolená prúdová zaťažiteľnosť vodiča Cu {selectedCalc.crossSectionMm2}{' '}
                mm² pri uložení {selectedCalc.installationMethod.split(' ')[0]} je{' '}
                <strong>{selectedCalc.currentCarryingCapacityIz} A</strong>.
              </p>
            </div>

            {/* Check 2: Voltage Drop dU */}
            <div
              className={`p-5 rounded-2xl border shadow-sm ${
                selectedCalc.voltageDropOk
                  ? 'bg-white border-emerald-200'
                  : 'bg-amber-50/70 border-amber-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono uppercase tracking-wider text-slate-500 font-bold">
                  2. Úbytok napätia ΔU (max. {selectedCalc.maxAllowedDropPercent} %)
                </span>
                {selectedCalc.voltageDropOk ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                )}
              </div>
              <div className="mt-2 font-mono text-base font-extrabold text-slate-900">
                ΔU = {selectedCalc.voltageDropPercent} % ({selectedCalc.voltageDropVolts} V)
              </div>
              <p className="text-[11px] text-slate-600 mt-1.5 leading-relaxed">
                Pri dĺžke trasy <strong>{selectedCalc.lengthM} m</strong> a priereze{' '}
                <strong>{selectedCalc.crossSectionMm2} mm²</strong> (γCu = 56 m/Ω·mm²) je
                úbytok napätia {selectedCalc.voltageDropPercent} % z menovitého napätia{' '}
                {selectedCalc.voltageV} V.
              </p>
            </div>

            {/* Check 3: Loop Impedance Zs & Ik */}
            <div
              className={`p-5 rounded-2xl border shadow-sm ${
                selectedCalc.disconnectConditionOk
                  ? 'bg-white border-emerald-200'
                  : 'bg-red-50/60 border-red-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono uppercase tracking-wider text-slate-500 font-bold">
                  3. Impedancia slučky Zs (odpojenie do 0,4s)
                </span>
                {selectedCalc.disconnectConditionOk ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                ) : (
                  <XCircle className="w-4 h-4 text-red-600" />
                )}
              </div>
              <div className="mt-2 font-mono text-base font-extrabold text-slate-900">
                Zs = {selectedCalc.loopImpedanceZsOhm} Ω ≤ Zs,max ={' '}
                {selectedCalc.maxAllowedZsOhm} Ω
              </div>
              <p className="text-[11px] text-slate-600 mt-1.5 leading-relaxed">
                Min. skratový prúd na konci vedenia{' '}
                <strong>Ik,min = {selectedCalc.minShortCircuitCurrentIkA} A</strong> (skúšobný
                vypínací prúd elektromagnetickej spúšte ističa{' '}
                {selectedCalc.breakerChar}
                {selectedCalc.breakerCurrentIn}A je Ia = {selectedCalc.tripCurrentIa} A).
              </p>
            </div>

            {/* Check 4: Selectivity with Main Breaker */}
            <div className="p-5 rounded-2xl border bg-white border-slate-200 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono uppercase tracking-wider text-slate-500 font-bold">
                  4. Selektivita s hl. ističom ({project.mainBreaker.characteristic}
                  {project.mainBreaker.ratedCurrent}A)
                </span>
                <Info className="w-4 h-4 text-[#0066FF]" />
              </div>
              <div className="mt-2 font-mono text-sm font-extrabold text-[#0066FF]">
                {selectedCalc.selectivityWithMain}
              </div>
              <p className="text-[11px] text-slate-600 mt-1.5 leading-relaxed">
                V oblasti preťaženia platí odstup menovitých prúdov In,hl / In,okr ={' '}
                {(project.mainBreaker.ratedCurrent / selectedCalc.breakerCurrentIn).toFixed(2)}.
                Pri veľkých skratových prúdoch overte tabuľku selektivity výrobcu{' '}
                {project.mainBreaker.manufacturer}.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Full Summary Table of All Circuits — Crisp White Card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="text-base font-extrabold text-slate-900">
            Súhrnná výpočtová tabuľka všetkých okruhov rozvádzača ({calcResults.length})
          </h3>
          <span className="text-xs text-slate-500 font-medium">
            Kliknutím na riadok otvoríte detailný prepočet okruhu hore
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 font-mono text-[11px] uppercase bg-slate-50">
                <th className="py-3 px-3">Ozn.</th>
                <th className="py-3 px-3">Názov okruhu</th>
                <th className="py-3 px-3">Istič In</th>
                <th className="py-3 px-3">Kábel &amp; Uloženie</th>
                <th className="py-3 px-3">Dĺžka</th>
                <th className="py-3 px-3">Príkon P</th>
                <th className="py-3 px-3">Prúd Ib / Iz</th>
                <th className="py-3 px-3">Úbytok ΔU</th>
                <th className="py-3 px-3">Slučka Zs / Max</th>
                <th className="py-3 px-3">Skrat Ik,min</th>
                <th className="py-3 px-3">Posúdenie STN</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {calcResults.map((r) => {
                const isSelected = r.circuitId === (selectedCalc?.circuitId || '');
                const allOk =
                  r.overloadProtectionOk && r.voltageDropOk && r.disconnectConditionOk;
                return (
                  <tr
                    key={r.circuitId}
                    onClick={() => setSelectedCircuitId(r.circuitId)}
                    className={`cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-blue-50/70'
                        : 'hover:bg-slate-50'
                    }`}
                  >
                    <td className="py-3 px-3 font-mono font-bold text-[#0066FF]">
                      {r.label}
                    </td>
                    <td className="py-3 px-3 font-bold text-slate-900">{r.name}</td>
                    <td className="py-3 px-3 font-mono text-slate-800 font-semibold">
                      {r.poles} {r.breakerChar}
                      {r.breakerCurrentIn}A
                    </td>
                    <td className="py-3 px-3 font-mono text-slate-700">
                      {r.cableText}{' '}
                      <span className="text-[10px] text-slate-500">
                        ({r.installationMethod.split(' ')[0]})
                      </span>
                    </td>
                    <td className="py-3 px-3 font-mono text-slate-700">{r.lengthM} m</td>
                    <td className="py-3 px-3 font-mono text-slate-700">
                      {r.powerKw.toFixed(2)} kW
                    </td>
                    <td className="py-3 px-3 font-mono">
                      <span
                        className={
                          r.overloadProtectionOk
                            ? 'text-slate-900 font-semibold'
                            : 'text-red-600 font-bold'
                        }
                      >
                        {r.designCurrentIb} A
                      </span>{' '}
                      <span className="text-slate-400">/ {r.currentCarryingCapacityIz} A</span>
                    </td>
                    <td className="py-3 px-3 font-mono">
                      <span
                        className={
                          r.voltageDropOk
                            ? 'text-emerald-700 font-bold'
                            : 'text-amber-700 font-bold'
                        }
                      >
                        {r.voltageDropPercent} %
                      </span>
                    </td>
                    <td className="py-3 px-3 font-mono">
                      <span
                        className={
                          r.disconnectConditionOk
                            ? 'text-slate-900 font-semibold'
                            : 'text-red-600 font-bold'
                        }
                      >
                        {r.loopImpedanceZsOhm} Ω
                      </span>{' '}
                      <span className="text-slate-400">/ {r.maxAllowedZsOhm} Ω</span>
                    </td>
                    <td className="py-3 px-3 font-mono text-slate-700">
                      {r.minShortCircuitCurrentIkA} A
                    </td>
                    <td className="py-3 px-3">
                      {allOk ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-mono text-[10px] font-bold">
                          <CheckCircle2 className="w-3 h-3" /> VYHOVUJE
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-red-50 text-red-700 border border-red-200 font-mono text-[10px] font-bold">
                          <AlertTriangle className="w-3 h-3" /> SKONTROLOVAŤ
                        </span>
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
  );
};
