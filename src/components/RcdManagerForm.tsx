import React from 'react';
import { Plus, Trash2, Copy } from 'lucide-react';
import {
  BreakerCharacteristic,
  Manufacturer,
  PhaseAllocation,
  RcdConfig,
  RcdDeviceKind,
  RcdPoles,
  RcdRatedCurrent,
  RcdSensitivity,
  RcdType,
  SwitchboardProject,
} from '../types/electrical';
import {
  MANUFACTURERS,
  RCCB_CURRENTS,
  RCBO_CURRENTS,
  RCD_SENSITIVITIES,
  RCD_TYPES,
  suggestRcdModel,
} from '../utils/electricalEngine';

interface RcdManagerFormProps {
  project: SwitchboardProject;
  onChange: (updated: SwitchboardProject) => void;
}

export const RcdManagerForm: React.FC<RcdManagerFormProps> = ({ project, onChange }) => {
  const addRcd = (kind: RcdDeviceKind) => {
    const nextNumber = project.rcds.length + 1;
    const defaultPoles: RcdPoles =
      project.phaseCount === 1 ? '2P' : kind === 'RCCB' ? '4P' : '2P';
    const defaultCurrent: RcdRatedCurrent = kind === 'RCCB' ? 40 : 16;
    const defaultManufacturer = project.mainBreaker.manufacturer;

    const newRcd: RcdConfig = {
      id: `rcd-${Date.now()}-${nextNumber}`,
      label: `FI${nextNumber}`,
      deviceKind: kind,
      poles: defaultPoles,
      ratedCurrent: defaultCurrent,
      sensitivity: 30,
      type: 'A',
      manufacturer: defaultManufacturer,
      characteristic: kind === 'RCBO' ? 'B' : undefined,
      breakingCapacity: kind === 'RCBO' ? '10 kA' : undefined,
      phase: defaultPoles === '4P' ? 'L1,L2,L3' : 'L1',
      circuitName:
        kind === 'RCBO' ? `Samostatný obvod s RCBO (${nextNumber})` : undefined,
      cableType: kind === 'RCBO' ? 'CYKY-J 3x2,5 mm²' : undefined,
      powerKw: kind === 'RCBO' ? 2.0 : undefined,
      model: suggestRcdModel(
        defaultManufacturer,
        kind,
        defaultPoles,
        defaultCurrent,
        30,
        'A',
        'B'
      ),
      notes:
        kind === 'RCCB'
          ? `Skupina ${nextNumber} – prúdový chránič RCCB`
          : `Kombinovaný chránič s nadprúdovou ochranou (RCBO)`,
    };

    onChange({
      ...project,
      rcds: [...project.rcds, newRcd],
    });
  };

  const updateRcd = (id: string, patch: Partial<RcdConfig>, autoModel = true) => {
    const updatedRcds = project.rcds.map((rcd) => {
      if (rcd.id !== id) return rcd;
      const merged: RcdConfig = { ...rcd, ...patch };

      // Keep phase consistent with poles
      if (merged.poles === '4P') {
        merged.phase = 'L1,L2,L3';
      } else if (merged.poles === '2P' && merged.phase === 'L1,L2,L3') {
        merged.phase = 'L1';
      }

      // If switching between RCCB and RCBO, adjust defaults sensibly
      if (patch.deviceKind === 'RCBO' && !merged.characteristic) {
        merged.characteristic = 'B';
        merged.breakingCapacity = '10 kA';
        if (!merged.circuitName) {
          merged.circuitName = 'Samostatne chránený vývod (RCBO)';
        }
        if (!merged.cableType) {
          merged.cableType = merged.poles === '4P' ? 'CYKY-J 5x2,5 mm²' : 'CYKY-J 3x2,5 mm²';
        }
        if (merged.powerKw === undefined) {
          merged.powerKw = 2.0;
        }
      }

      if (autoModel && !('model' in patch)) {
        merged.model = suggestRcdModel(
          merged.manufacturer,
          merged.deviceKind,
          merged.poles,
          merged.ratedCurrent,
          merged.sensitivity,
          merged.type,
          merged.characteristic || 'B'
        );
      }
      return merged;
    });

    onChange({
      ...project,
      rcds: updatedRcds,
    });
  };

  const duplicateRcd = (rcd: RcdConfig) => {
    const nextNumber = project.rcds.length + 1;
    const copy: RcdConfig = {
      ...rcd,
      id: `rcd-${Date.now()}-${nextNumber}`,
      label: `FI${nextNumber}`,
    };
    onChange({
      ...project,
      rcds: [...project.rcds, copy],
    });
  };

  const removeRcd = (id: string) => {
    const remainingRcds = project.rcds.filter((r) => r.id !== id);
    const fallbackRcdId = remainingRcds.find((r) => r.deviceKind === 'RCCB')?.id || 'NONE';
    const updatedCircuits = project.circuits.map((c) =>
      c.rcdId === id ? { ...c, rcdId: fallbackRcdId } : c
    );
    onChange({
      ...project,
      rcds: remainingRcds,
      circuits: updatedCircuits,
    });
  };

  return (
    <div className="space-y-5">
      {/* Hlavička a vysvetlenie rozdielu RCCB vs RCBO */}
      <div className="bg-white border border-slate-200 rounded-lg p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              3. Prúdové chrániče ({project.rcds.length} ks)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Konfigurácia prúdových chráničov RCCB (EN 61008) a kombinovaných ističochráničov RCBO (EN 61009)
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => addRcd('RCCB')}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Pridať RCCB (Chránič)
            </button>
            <button
              type="button"
              onClick={() => addRcd('RCBO')}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-800 bg-slate-100 border border-slate-300 rounded-md hover:bg-slate-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Pridať RCBO (S ističom)
            </button>
          </div>
        </div>

        {/* Odborné rozlíšenie RCCB vs RCBO */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4 text-xs">
          <div className="p-3 bg-slate-50 rounded-md border border-slate-200">
            <div className="font-semibold text-slate-900">
              RCCB – Prúdový chránič (bez nadprúdovej ochrany)
            </div>
            <p className="text-slate-600 mt-1 leading-relaxed">
              Chráni skupinu viacerých ističov (FA1, FA2...) pred reziduálnym (unikajúcim) prúdom. Musí byť predradený alebo zaistený proti preťaženiu (In: 25 A / 40 A / 63 A / 80 A).
            </p>
          </div>
          <div className="p-3 bg-slate-50 rounded-md border border-slate-200">
            <div className="font-semibold text-slate-900">
              RCBO – Kombinovaný chránič s nadprúdovou ochranou
            </div>
            <p className="text-slate-600 mt-1 leading-relaxed">
              Spája prúdový chránič a istič (char. B/C/D) v jednom prístroji. Ideálny pre samostatné kritické okruhy (chladnička, kotol, kúpeľňa, server), kde porucha neodpojí zvyšok domu.
            </p>
          </div>
        </div>
      </div>

      {/* Zoznam chráničov */}
      {project.rcds.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-lg p-8 text-center">
          <p className="text-sm font-medium text-slate-800">
            V rozvádzači zatiaľ nie je pridaný žiadny prúdový chránič
          </p>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            Podľa STN 33 2000-4-41 musia byť zásuvkové obvody do 32 A a svetelné obvody v bytových stavbách vybavené doplnkovou ochranou prúdovým chráničom s IΔn ≤ 30 mA.
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <button
              type="button"
              onClick={() => addRcd('RCCB')}
              className="px-4 py-2 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
            >
              Pridať skupinový chránič RCCB (FI1)
            </button>
            <button
              type="button"
              onClick={() => addRcd('RCBO')}
              className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 border border-slate-300 rounded-md hover:bg-slate-200"
            >
              Pridať kombinovaný chránič RCBO
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {project.rcds.map((rcd, idx) => {
            const isRcbo = rcd.deviceKind === 'RCBO';
            const assignedCount = project.circuits.filter((c) => c.rcdId === rcd.id).length;
            const currentChoices = isRcbo
              ? Array.from(new Set([...RCBO_CURRENTS, ...RCCB_CURRENTS])).sort((a, b) => a - b)
              : RCCB_CURRENTS;

            return (
              <div
                key={rcd.id}
                className="bg-white border border-slate-200 rounded-lg p-4 transition-colors"
              >
                {/* Horný riadok karty chrániča */}
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="text-sm font-mono font-bold text-slate-900">
                      {idx + 1}. {rcd.label}
                    </span>
                    <span className="text-xs text-slate-400">·</span>
                    <span className="text-xs font-mono text-blue-700 font-medium">
                      {isRcbo
                        ? `RCBO (${rcd.characteristic || 'B'}${rcd.ratedCurrent} A / ${rcd.sensitivity} mA)`
                        : `RCCB (${rcd.ratedCurrent} A / ${rcd.sensitivity} mA)`}
                    </span>
                    <span className="text-xs text-slate-400">·</span>
                    <span className="text-xs text-slate-500">
                      {isRcbo
                        ? rcd.circuitName || 'Samostatný vývod'
                        : `Priradené vývody: ${assignedCount}`}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => duplicateRcd(rcd)}
                      aria-label={`Duplikovať chránič ${rcd.label}`}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-600 bg-slate-50 border border-slate-200 rounded hover:bg-slate-100"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      Duplikovať
                    </button>
                    <button
                      type="button"
                      onClick={() => removeRcd(rcd.id)}
                      aria-label={`Odstrániť chránič ${rcd.label}`}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded hover:bg-red-100"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Odstrániť
                    </button>
                  </div>
                </div>

                {/* Prepínač druhu prístroja: RCCB vs RCBO + Označenie */}
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 mb-3">
                  <div className="sm:col-span-3">
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Označenie
                    </label>
                    <input
                      type="text"
                      aria-label={`Označenie chrániča ${rcd.label}`}
                      value={rcd.label}
                      onChange={(e) => updateRcd(rcd.id, { label: e.target.value }, false)}
                      className="w-full px-3 py-1.5 text-xs font-mono font-bold bg-slate-50 border border-slate-300 rounded-md text-slate-900"
                    />
                  </div>

                  <div className="sm:col-span-6">
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Druh chrániča (RCCB vs RCBO)
                    </label>
                    <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-md border border-slate-200">
                      <button
                        type="button"
                        onClick={() =>
                          updateRcd(rcd.id, {
                            deviceKind: 'RCCB',
                            ratedCurrent:
                              rcd.ratedCurrent < 25 ? 40 : rcd.ratedCurrent,
                          })
                        }
                        className={`py-1.5 px-2 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                          rcd.deviceKind === 'RCCB'
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        RCCB (Chránič)
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          updateRcd(rcd.id, {
                            deviceKind: 'RCBO',
                            characteristic: rcd.characteristic || 'B',
                          })
                        }
                        className={`py-1.5 px-2 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                          rcd.deviceKind === 'RCBO'
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        RCBO (S ističom)
                      </button>
                    </div>
                  </div>

                  <div className="sm:col-span-3">
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Počet pólov
                    </label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {(['2P', '4P'] as RcdPoles[]).map((p) => {
                        const active = rcd.poles === p;
                        return (
                          <button
                            key={p}
                            type="button"
                            onClick={() => updateRcd(rcd.id, { poles: p })}
                            className={`py-1.5 text-xs font-mono font-semibold rounded-md border transition-colors ${
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
                </div>

                {/* Parametre: Menovitý prúd, Citlivosť, Typ AC/A/F/B */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                  {/* Menovitý prúd 25 A / 40 A / 63 A / 80 A */}
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Menovitý prúd In (A)
                    </label>
                    <div className="grid grid-cols-4 gap-1">
                      {currentChoices.map((amp) => {
                        const active = rcd.ratedCurrent === amp;
                        return (
                          <button
                            key={amp}
                            type="button"
                            onClick={() => updateRcd(rcd.id, { ratedCurrent: amp })}
                            className={`py-1.5 text-xs font-mono font-semibold rounded border transition-colors tabular-nums ${
                              active
                                ? 'bg-blue-600 text-white border-blue-600'
                                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            {amp}A
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Citlivosť 10 mA / 30 mA / 100 mA / 300 mA */}
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Citlivosť IΔn (mA)
                    </label>
                    <div className="grid grid-cols-4 gap-1">
                      {RCD_SENSITIVITIES.map((sens) => {
                        const active = rcd.sensitivity === sens;
                        return (
                          <button
                            key={sens}
                            type="button"
                            onClick={() => updateRcd(rcd.id, { sensitivity: sens })}
                            className={`py-1.5 text-xs font-mono font-semibold rounded border transition-colors tabular-nums ${
                              active
                                ? 'bg-blue-600 text-white border-blue-600'
                                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            {sens}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Typ AC / A / F / B */}
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Typ chrániča (AC / A / F / B)
                    </label>
                    <div className="grid grid-cols-4 gap-1">
                      {RCD_TYPES.map((t) => {
                        const active = rcd.type === t;
                        return (
                          <button
                            key={t}
                            type="button"
                            onClick={() => updateRcd(rcd.id, { type: t })}
                            className={`py-1.5 text-xs font-mono font-semibold rounded border transition-colors ${
                              active
                                ? 'bg-slate-900 text-white border-slate-900'
                                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            {t}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Rozširujúce parametre pre RCBO (Nadprúdová charakteristika B/C/D, názov chráneného obvodu, kábel) */}
                {isRcbo && (
                  <div className="p-3 mb-3 bg-blue-50/60 border border-blue-200 rounded-md grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Nadprúdová char. (RCBO)
                      </label>
                      <div className="grid grid-cols-3 gap-1">
                        {(['B', 'C', 'D'] as BreakerCharacteristic[]).map((ch) => (
                          <button
                            key={ch}
                            type="button"
                            onClick={() => updateRcd(rcd.id, { characteristic: ch })}
                            className={`py-1 text-xs font-mono font-semibold rounded border ${
                              (rcd.characteristic || 'B') === ch
                                ? 'bg-blue-600 text-white border-blue-600'
                                : 'bg-white text-slate-700 border-slate-300'
                            }`}
                          >
                            {ch}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Názov obvodu chráneného týmto RCBO
                      </label>
                      <input
                        type="text"
                        value={rcd.circuitName || ''}
                        onChange={(e) =>
                          updateRcd(rcd.id, { circuitName: e.target.value }, false)
                        }
                        placeholder="napr. Chladnička a mraznička / Kúpeľňa"
                        className="w-full px-2.5 py-1 text-xs bg-white border border-slate-300 rounded text-slate-900"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Kábel vývodu RCBO
                      </label>
                      <input
                        type="text"
                        value={rcd.cableType || 'CYKY-J 3x2,5 mm²'}
                        onChange={(e) =>
                          updateRcd(rcd.id, { cableType: e.target.value }, false)
                        }
                        className="w-full px-2.5 py-1 text-xs font-mono bg-white border border-slate-300 rounded text-slate-900"
                      />
                    </div>
                  </div>
                )}

                {/* Spodný riadok: Výrobca, Model, Fáza (ak 2P v 3f sústave) */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Výrobca
                    </label>
                    <select
                      aria-label={`Výrobca chrániča ${rcd.label}`}
                      value={rcd.manufacturer}
                      onChange={(e) =>
                        updateRcd(rcd.id, {
                          manufacturer: e.target.value as Manufacturer,
                        })
                      }
                      className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-md text-slate-900"
                    >
                      {MANUFACTURERS.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Typové označenie (Model)
                    </label>
                    <input
                      type="text"
                      aria-label={`Model chrániča ${rcd.label}`}
                      value={rcd.model}
                      onChange={(e) => updateRcd(rcd.id, { model: e.target.value }, false)}
                      className="w-full px-3 py-1.5 text-xs font-mono bg-slate-50 border border-slate-300 rounded-md text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Pripojená fáza
                    </label>
                    {rcd.poles === '4P' ? (
                      <div className="px-3 py-1.5 text-xs font-mono bg-slate-100 border border-slate-200 rounded-md text-slate-600">
                        L1, L2, L3 + N (3-fázový)
                      </div>
                    ) : project.phaseCount === 1 ? (
                      <div className="px-3 py-1.5 text-xs font-mono bg-slate-100 border border-slate-200 rounded-md text-slate-600">
                        L1 + N (1-fázová sústava)
                      </div>
                    ) : (
                      <select
                        aria-label={`Fáza pre 2P chránič ${rcd.label}`}
                        value={rcd.phase === 'L1,L2,L3' ? 'L1' : rcd.phase || 'L1'}
                        onChange={(e) =>
                          updateRcd(
                            rcd.id,
                            { phase: e.target.value as PhaseAllocation },
                            false
                          )
                        }
                        className="w-full px-3 py-1.5 text-xs font-mono bg-slate-50 border border-slate-300 rounded-md text-slate-900"
                      >
                        <option value="L1">Fáza L1 + N</option>
                        <option value="L2">Fáza L2 + N</option>
                        <option value="L3">Fáza L3 + N</option>
                      </select>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
