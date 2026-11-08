import React, { useState, useRef } from 'react';
import {
  BreakerCharacteristic,
  CircuitCategory,
  NavigationSection,
  PhaseAllocation,
  PolesType,
  SwitchboardProject,
} from '../types/electrical';
import {
  FieldStatus,
  ParsedCircuitDraft,
  ParsedHeaderMetadata,
  SAMPLE_IMPORT_EXCEL_TSV,
  SAMPLE_IMPORT_TEXT_PROMPT,
  SAMPLE_IMPORT_UNSTRUCTURED,
  applyImportedCircuitsToProject,
  parseCircuitListText,
} from '../utils/autoCircuitImportEngine';
import {
  FileSpreadsheet,
  Upload,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Plus,
  Trash2,
  ArrowRight,
  ClipboardPaste,
  HelpCircle,
} from 'lucide-react';

interface Props {
  project: SwitchboardProject;
  onProjectChange: (updated: SwitchboardProject, actionDescription?: string) => void;
  onNavigate: (section: NavigationSection) => void;
}

const CATEGORIES: CircuitCategory[] = [
  'Osvetlenie',
  'Zásuvky',
  'Kuchyňa / Spotrebiče',
  'Kúpeľňa / Práčovňa',
  'Technológia / Kúrenie',
  'Exteriér / Garáž / EV',
  'Rezerva',
];

const MCB_CURRENTS = [6, 10, 13, 16, 20, 25, 32, 40, 50, 63] as const;

export const AutoCircuitImportView: React.FC<Props> = ({
  project,
  onProjectChange,
  onNavigate,
}) => {
  const [rawText, setRawText] = useState<string>(SAMPLE_IMPORT_TEXT_PROMPT);
  const [initialParsed] = useState(() => parseCircuitListText(SAMPLE_IMPORT_TEXT_PROMPT));

  const [headerMeta, setHeaderMeta] = useState<ParsedHeaderMetadata>(initialParsed.header);
  const [drafts, setDrafts] = useState<ParsedCircuitDraft[]>(initialParsed.circuits);
  const [parseWarnings, setParseWarnings] = useState<string[]>(initialParsed.warnings);
  const [replaceExistingCircuits, setReplaceExistingCircuits] = useState<boolean>(true);
  const [applyHeaderMetadata, setApplyHeaderMetadata] = useState<boolean>(true);
  const [autoBalancePhases, setAutoBalancePhases] = useState<boolean>(true);
  const [importSuccessBanner, setImportSuccessBanner] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleAnalyzeText = (textToParse: string = rawText) => {
    const res = parseCircuitListText(textToParse);
    setHeaderMeta(res.header);
    setDrafts(res.circuits);
    setParseWarnings(res.warnings);
    setImportSuccessBanner(null);
  };

  const handleLoadSample = (sampleText: string) => {
    setRawText(sampleText);
    handleAnalyzeText(sampleText);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = String(ev.target?.result || '');
      if (content.trim()) {
        setRawText(content);
        handleAnalyzeText(content);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const updateDraft = (id: string, patch: Partial<ParsedCircuitDraft>) => {
    setDrafts((prev) =>
      prev.map((d) => {
        if (d.id !== id) return d;
        const updated: ParsedCircuitDraft = { ...d, ...patch };
        if (patch.poles === '3P' || patch.poles === '4P') {
          updated.isThreePhase = true;
          updated.phase = 'L1,L2,L3';
          updated.polesStatus = 'recognized';
        } else if (patch.poles === '1P' || patch.poles === '2P') {
          updated.isThreePhase = false;
          if (updated.phase === 'L1,L2,L3') updated.phase = 'L1';
          updated.polesStatus = 'recognized';
        }
        if (patch.ratedCurrent !== undefined) updated.ratedCurrentStatus = 'recognized';
        if (patch.characteristic !== undefined) updated.characteristicStatus = 'recognized';
        if (patch.crossSectionMm2 !== undefined && patch.crossSectionMm2 !== null) {
          updated.crossSectionStatus = 'recognized';
          const cores = updated.isThreePhase ? 5 : 3;
          updated.cableType = `CYKY-J ${cores}x${String(patch.crossSectionMm2).replace(
            '.',
            ','
          )} mm²`;
          updated.cableStatus = 'recognized';
        }
        if (patch.rcdAssignment !== undefined) updated.rcdStatus = 'recognized';
        if (patch.powerKw !== undefined) updated.powerStatus = 'recognized';
        return updated;
      })
    );
  };

  const handleAddEmptyRow = () => {
    const nextIdx = drafts.length + 1;
    const newRow: ParsedCircuitDraft = {
      id: `imp-manual-${Date.now()}`,
      rawLine: 'Manuálne pridaný riadok',
      designation: `QF${nextIdx}`,
      name: `Nový okruh č. ${nextIdx}`,
      category: 'Zásuvky',
      categoryStatus: 'recognized',
      poles: '1P',
      polesStatus: 'recognized',
      characteristic: 'B',
      characteristicStatus: 'recognized',
      ratedCurrent: 16,
      ratedCurrentStatus: 'recognized',
      crossSectionMm2: 2.5,
      crossSectionStatus: 'recognized',
      cableType: 'CYKY-J 3x2,5 mm²',
      cableStatus: 'recognized',
      isThreePhase: false,
      phase: 'L1',
      phaseStatus: 'recognized',
      rcdAssignment: 'FI1',
      rcdStatus: 'recognized',
      powerKw: 2.0,
      powerStatus: 'recognized',
    };
    setDrafts((prev) => [...prev, newRow]);
  };

  const handleDeleteRow = (id: string) => {
    setDrafts((prev) => prev.filter((d) => d.id !== id));
  };

  const handleExecuteImport = (targetSection: NavigationSection) => {
    if (drafts.length === 0) return;
    const updatedProject = applyImportedCircuitsToProject(project, drafts, headerMeta, {
      applyHeaderMetadata,
      replaceExistingCircuits,
      autoBalancePhases,
    });
    onProjectChange(
      updatedProject,
      `Auto Circuit Import: importovaných ${drafts.length} okruhov (${
        replaceExistingCircuits ? 'nahradenie' : 'doplnenie'
      })`
    );
    setImportSuccessBanner(
      `Úspešne naimportovaných ${drafts.length} okruhov do rozvádzača "${updatedProject.name}".`
    );
    onNavigate(targetSection);
  };

  const renderStatusBadge = (status: FieldStatus, label: string) => {
    if (status === 'recognized') {
      return (
        <span
          title="Hodnota priamo rozpoznaná zo vstupného textu"
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-50 text-emerald-700 border border-emerald-200"
        >
          ✓ {label}
        </span>
      );
    }
    if (status === 'suggested') {
      return (
        <span
          title="Predpokladaná hodnota podľa typu spotrebiča – odporúčame skontrolovať"
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-50 text-amber-800 border border-amber-200"
        >
          ? {label} (odhad)
        </span>
      );
    }
    return (
      <span
        title="Údaj chýbal vo vstupe – skontrolujte a doplňte"
        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-red-50 text-red-700 border border-red-200"
      >
        ! {label} (doplniť)
      </span>
    );
  };

  const totalInferredFields = drafts.reduce(
    (acc, d) =>
      acc +
      (d.ratedCurrentStatus !== 'recognized' ? 1 : 0) +
      (d.characteristicStatus !== 'recognized' ? 1 : 0) +
      (d.crossSectionStatus !== 'recognized' ? 1 : 0),
    0
  );

  return (
    <div className="space-y-6">
      {/* Top Deep Navy Banner */}
      <div className="bg-[#0B1120] text-white rounded-2xl p-6 border border-slate-800 shadow-md flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-[#0066FF]/20 border border-[#0066FF]/40 flex items-center justify-center text-[#38BDF8] shrink-0">
            <ClipboardPaste className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-extrabold tracking-tight text-white">
                Inteligentný import a zadávanie zoznamu elektrických okruhov
              </h1>
              <span className="px-2 py-0.5 rounded bg-[#0066FF] text-white font-mono text-[11px] font-bold uppercase">
                AUTO PARSER
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Vložte textový zoznam okruhov, skopírujte riadky z Excelu alebo nahrajte CSV/TXT. Systém rozpozná ističe, prierezy vodičov, 1F/3F spotrebiče a chrániče.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.csv,.tsv"
            onChange={handleFileUpload}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#1E293B] hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 transition-colors cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5 text-[#38BDF8]" />
            Nahrať CSV / TXT
          </button>
          <button
            type="button"
            onClick={() => handleLoadSample(SAMPLE_IMPORT_TEXT_PROMPT)}
            className="px-3 py-2 rounded-xl bg-[#1E293B] hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors cursor-pointer"
          >
            Vzor 1: Štandardný zoznam RD
          </button>
          <button
            type="button"
            onClick={() => handleLoadSample(SAMPLE_IMPORT_EXCEL_TSV)}
            className="px-3 py-2 rounded-xl bg-[#1E293B] hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors cursor-pointer"
          >
            Vzor 2: Kópia z Excelu
          </button>
          <button
            type="button"
            onClick={() => handleLoadSample(SAMPLE_IMPORT_UNSTRUCTURED)}
            className="px-3 py-2 rounded-xl bg-[#1E293B] hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors cursor-pointer"
          >
            Vzor 3: Neúplný zápis
          </button>
        </div>
      </div>

      {importSuccessBanner && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{importSuccessBanner}</span>
        </div>
      )}

      {/* STEP 1: Input Textarea + Header Metadata Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Big Text Field "VLOŽ ZOZNAM OKRUHOV" */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-xs font-extrabold uppercase tracking-wider text-[#0066FF] flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4" />
              VLOŽ ZOZNAM OKRUHOV (TEXT / EXCEL / CSV)
            </label>
            <span className="text-[11px] text-slate-500 font-mono">
              1 riadok = 1 elektrický okruh alebo parameter rozvádzača
            </span>
          </div>

          <textarea
            value={rawText}
            onChange={(e) => {
              setRawText(e.target.value);
              handleAnalyzeText(e.target.value);
            }}
            rows={11}
            placeholder={`Rodinný dom\nHlavný istič: 3x25 A\nSústava: TN-C-S\n\n1. Svetlá prízemie – B10 – 1,5 mm²\n2. Zásuvky obývačka – B16 – 2,5 mm²\n3. Varná doska – 3P B16 – 5x2,5 mm²`}
            className="w-full p-4 rounded-xl bg-slate-50 border border-slate-300 text-xs font-mono text-slate-900 focus:bg-white focus:border-[#0066FF] focus:outline-none leading-relaxed"
          />

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
              <HelpCircle className="w-3.5 h-3.5 text-[#0066FF] shrink-0" />
              <span>
                Neznáme alebo chýbajúce údaje sú v tabuľke nižšie označené ako{' '}
                <strong className="text-amber-700">? (odhad)</strong> – nikdy ich potichu neschvaľujeme bez vašej kontroly.
              </span>
            </div>
            <button
              type="button"
              onClick={() => handleAnalyzeText(rawText)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0066FF] hover:bg-[#2563EB] text-white font-bold text-xs shadow-sm transition-colors cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Znovu analyzovať zoznam
            </button>
          </div>
        </div>

        {/* Right: Recognized Header Parameters & Import Settings */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col justify-between space-y-5">
          <div className="space-y-4">
            <div className="border-b border-slate-100 pb-3">
              <h3 className="text-sm font-extrabold text-slate-900">
                Rozpoznané hlavné parametre a nastavenia importu
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Ak vstupný text obsahoval hlavičku (typ objektu, hlavný istič, sústavu), aplikujú sa pri importe.
              </p>
            </div>

            {/* Header Metadata Grid */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">
                  Typ objektu v texte
                </div>
                <div className="font-bold text-slate-900 mt-0.5">
                  {headerMeta.objectType?.value || `${project.objectType} (z projektu)`}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">
                  Hlavný istič v texte
                </div>
                <div className="font-mono font-bold text-[#0066FF] mt-0.5">
                  {headerMeta.mainBreakerCurrent?.value
                    ? `${headerMeta.mainBreakerPoles?.value || project.mainBreaker.poles} ${
                        headerMeta.mainBreakerChar?.value || project.mainBreaker.characteristic
                      }${headerMeta.mainBreakerCurrent.value} A`
                    : `${project.mainBreaker.poles} ${project.mainBreaker.characteristic}${project.mainBreaker.ratedCurrent} A (z projektu)`}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">
                  Sieťová sústava
                </div>
                <div className="font-mono font-bold text-slate-900 mt-0.5">
                  {headerMeta.networkSystem?.value || `${project.networkSystem} (z projektu)`}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">
                  Rozpoznané okruhy
                </div>
                <div className="font-mono font-bold text-emerald-600 mt-0.5">
                  {drafts.length} okruhov ({drafts.filter((d) => d.isThreePhase).length}× 3F,{' '}
                  {drafts.filter((d) => !d.isThreePhase).length}× 1F)
                </div>
              </div>
            </div>

            {/* Import Options */}
            <div className="space-y-2.5 pt-2 border-t border-slate-100 text-xs">
              <div className="font-bold text-slate-700">Režim vloženia do projektu:</div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setReplaceExistingCircuits(true)}
                  className={`py-2 px-3 rounded-xl border text-left font-semibold transition-all cursor-pointer ${
                    replaceExistingCircuits
                      ? 'bg-blue-50 border-[#0066FF] text-[#0066FF]'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  Nahradiť existujúce okruhy ({project.circuits.length})
                </button>
                <button
                  type="button"
                  onClick={() => setReplaceExistingCircuits(false)}
                  className={`py-2 px-3 rounded-xl border text-left font-semibold transition-all cursor-pointer ${
                    !replaceExistingCircuits
                      ? 'bg-blue-50 border-[#0066FF] text-[#0066FF]'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  Pridať k existujúcim okruhom
                </button>
              </div>

              <label className="flex items-center gap-2.5 pt-1 cursor-pointer text-slate-700 font-medium">
                <input
                  type="checkbox"
                  checked={applyHeaderMetadata}
                  onChange={(e) => setApplyHeaderMetadata(e.target.checked)}
                  className="rounded border-slate-300 text-[#0066FF] focus:ring-[#0066FF]"
                />
                <span>
                  Aplikovať rozpoznané parametre hlavičky (typ objektu, hlavný istič, sústava) a vytvoriť skupiny FI1–FI3
                </span>
              </label>

              <label className="flex items-center gap-2.5 cursor-pointer text-slate-700 font-medium">
                <input
                  type="checkbox"
                  checked={autoBalancePhases}
                  onChange={(e) => setAutoBalancePhases(e.target.checked)}
                  className="rounded border-slate-300 text-[#0066FF] focus:ring-[#0066FF]"
                />
                <span>
                  Automaticky rovnomerne rozložiť jednofázové okruhy medzi fázy L1, L2, L3
                </span>
              </label>
            </div>
          </div>

          {/* Summary Status Bar */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs">
            <div className="space-y-0.5">
              <div className="text-slate-700 font-bold">
                Stav kontroly pred importom:
              </div>
              <div className="text-[11px] text-slate-500">
                {totalInferredFields > 0
                  ? `${totalInferredFields} parametrov bolo doplnených odhadom – skontrolujte žlté polia.`
                  : 'Všetky kľúčové parametre boli explicitne zadané.'}
              </div>
            </div>
            {parseWarnings.length > 0 || totalInferredFields > 0 ? (
              <span className="px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 font-mono font-bold">
                {parseWarnings.length + totalInferredFields} na kontrolu
              </span>
            ) : (
              <span className="px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 font-mono font-bold">
                Pripravené
              </span>
            )}
          </div>
        </div>
      </div>

      {/* STEP 2: Interactive Preview Table Before Import */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <h3 className="text-base font-extrabold text-slate-900">
              Náhľad a úprava rozpoznaných okruhov pred importom ({drafts.length})
            </h3>
            <p className="text-xs text-slate-500">
              Skontrolujte a upravte názov, kategóriu, istič (B/C/D, prúd, póly), prierez vodiča, prúdový chránič a fázu L1/L2/L3.
            </p>
          </div>
          <button
            type="button"
            onClick={handleAddEmptyRow}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 text-[#0066FF]" />
            Pridať okruh ručne
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-500 bg-slate-50">
                <th className="py-3 px-2.5">#</th>
                <th className="py-3 px-2.5 min-w-[190px]">Názov okruhu</th>
                <th className="py-3 px-2.5 min-w-[150px]">Kategória</th>
                <th className="py-3 px-2.5">Póly</th>
                <th className="py-3 px-2.5">Char.</th>
                <th className="py-3 px-2.5">Istič In (A)</th>
                <th className="py-3 px-2.5">Prierez (mm²)</th>
                <th className="py-3 px-2.5 min-w-[130px]">Typ kábla</th>
                <th className="py-3 px-2.5">Chránič RCD</th>
                <th className="py-3 px-2.5">Fáza</th>
                <th className="py-3 px-2.5">Príkon (kW)</th>
                <th className="py-3 px-2.5">Rozpoznanie &amp; Kontrola</th>
                <th className="py-3 px-2.5 text-right">Akcia</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {drafts.map((d, idx) => (
                <tr key={d.id} className="hover:bg-blue-50/30 transition-colors align-top">
                  <td className="py-2.5 px-2.5 font-mono font-bold text-[#0066FF]">
                    FA{idx + 1}
                  </td>

                  {/* Name */}
                  <td className="py-2 px-2.5">
                    <input
                      type="text"
                      value={d.name}
                      onChange={(e) => updateDraft(d.id, { name: e.target.value })}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-300 text-slate-900 font-semibold text-xs focus:bg-white focus:border-[#0066FF] focus:outline-none"
                    />
                  </td>

                  {/* Category */}
                  <td className="py-2 px-2.5">
                    <select
                      value={d.category}
                      onChange={(e) =>
                        updateDraft(d.id, { category: e.target.value as CircuitCategory })
                      }
                      className="w-full px-2 py-1.5 rounded-lg bg-slate-50 border border-slate-300 text-slate-800 text-xs focus:bg-white focus:border-[#0066FF] focus:outline-none"
                    >
                      {CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  </td>

                  {/* Poles */}
                  <td className="py-2 px-2.5">
                    <select
                      value={d.poles}
                      onChange={(e) =>
                        updateDraft(d.id, { poles: e.target.value as PolesType })
                      }
                      className="px-2 py-1.5 rounded-lg bg-slate-50 border border-slate-300 font-mono font-bold text-slate-900 text-xs"
                    >
                      <option value="1P">1P (230V)</option>
                      <option value="2P">2P</option>
                      <option value="3P">3P (400V)</option>
                      <option value="4P">4P</option>
                    </select>
                  </td>

                  {/* Characteristic */}
                  <td className="py-2 px-2.5">
                    <select
                      value={d.characteristic}
                      onChange={(e) =>
                        updateDraft(d.id, {
                          characteristic: e.target.value as BreakerCharacteristic,
                        })
                      }
                      className={`px-2 py-1.5 rounded-lg border font-mono font-bold text-xs ${
                        d.characteristicStatus === 'recognized'
                          ? 'bg-slate-50 border-slate-300 text-slate-900'
                          : 'bg-amber-50 border-amber-300 text-amber-900'
                      }`}
                    >
                      <option value="B">B</option>
                      <option value="C">C</option>
                      <option value="D">D</option>
                    </select>
                  </td>

                  {/* Rated Current */}
                  <td className="py-2 px-2.5">
                    <select
                      value={d.ratedCurrent}
                      onChange={(e) =>
                        updateDraft(d.id, {
                          ratedCurrent: Number(e.target.value) as ParsedCircuitDraft['ratedCurrent'],
                        })
                      }
                      className={`px-2 py-1.5 rounded-lg border font-mono font-bold text-xs ${
                        d.ratedCurrentStatus === 'recognized'
                          ? 'bg-slate-50 border-slate-300 text-slate-900'
                          : 'bg-amber-50 border-amber-300 text-amber-900'
                      }`}
                    >
                      {MCB_CURRENTS.map((amp) => (
                        <option key={amp} value={amp}>
                          {amp} A
                        </option>
                      ))}
                    </select>
                  </td>

                  {/* Cross Section mm2 */}
                  <td className="py-2 px-2.5">
                    <select
                      value={d.crossSectionMm2 ?? 2.5}
                      onChange={(e) =>
                        updateDraft(d.id, { crossSectionMm2: Number(e.target.value) })
                      }
                      className={`px-2 py-1.5 rounded-lg border font-mono font-bold text-xs ${
                        d.crossSectionStatus === 'recognized'
                          ? 'bg-slate-50 border-slate-300 text-slate-900'
                          : 'bg-amber-50 border-amber-300 text-amber-900'
                      }`}
                    >
                      {[1.5, 2.5, 4, 6, 10, 16].map((mm) => (
                        <option key={mm} value={mm}>
                          {String(mm).replace('.', ',')} mm²
                        </option>
                      ))}
                    </select>
                  </td>

                  {/* Cable Type */}
                  <td className="py-2 px-2.5">
                    <input
                      type="text"
                      value={d.cableType}
                      onChange={(e) => updateDraft(d.id, { cableType: e.target.value })}
                      className="w-full px-2 py-1.5 rounded-lg bg-slate-50 border border-slate-300 font-mono text-[11px] text-slate-800"
                    />
                  </td>

                  {/* RCD assignment */}
                  <td className="py-2 px-2.5">
                    <select
                      value={d.rcdAssignment}
                      onChange={(e) =>
                        updateDraft(d.id, {
                          rcdAssignment: e.target.value as ParsedCircuitDraft['rcdAssignment'],
                        })
                      }
                      className="px-2 py-1.5 rounded-lg bg-slate-50 border border-slate-300 text-xs text-slate-800 font-semibold"
                    >
                      <option value="FI1">FI1 (Skupina 1)</option>
                      <option value="FI2">FI2 (Skupina 2)</option>
                      <option value="FI3">FI3 (Skupina 3)</option>
                      <option value="RCBO">Samostatný RCBO</option>
                      <option value="NONE">Bez RCD</option>
                    </select>
                  </td>

                  {/* Phase L1/L2/L3 */}
                  <td className="py-2 px-2.5">
                    <select
                      value={d.phase}
                      disabled={d.isThreePhase}
                      onChange={(e) =>
                        updateDraft(d.id, { phase: e.target.value as PhaseAllocation })
                      }
                      className="px-2 py-1.5 rounded-lg bg-slate-50 border border-slate-300 font-mono font-bold text-xs text-slate-900 disabled:opacity-60"
                    >
                      {d.isThreePhase ? (
                        <option value="L1,L2,L3">L1,L2,L3</option>
                      ) : (
                        <>
                          <option value="L1">L1</option>
                          <option value="L2">L2</option>
                          <option value="L3">L3</option>
                        </>
                      )}
                    </select>
                  </td>

                  {/* Power kW */}
                  <td className="py-2 px-2.5">
                    <input
                      type="number"
                      step={0.1}
                      min={0.05}
                      max={50}
                      value={d.powerKw ?? 1.5}
                      onChange={(e) =>
                        updateDraft(d.id, {
                          powerKw: Math.max(0.05, Number(e.target.value) || 0.5),
                        })
                      }
                      className="w-16 px-2 py-1.5 rounded-lg bg-slate-50 border border-slate-300 font-mono text-xs text-slate-900"
                    />
                  </td>

                  {/* Status & Warnings */}
                  <td className="py-2 px-2.5 space-y-1 max-w-[230px]">
                    <div className="flex flex-wrap gap-1">
                      {renderStatusBadge(
                        d.ratedCurrentStatus,
                        `${d.characteristic}${d.ratedCurrent}A`
                      )}
                      {renderStatusBadge(
                        d.crossSectionStatus,
                        `${String(d.crossSectionMm2 ?? 2.5).replace('.', ',')}mm²`
                      )}
                    </div>
                  </td>

                  {/* Delete */}
                  <td className="py-2 px-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => handleDeleteRow(d.id)}
                      title="Vymazať okruh zo zoznamu"
                      className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Bottom Action Bar: Execute Import & Generate Schema */}
        <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-4">
          <div className="text-xs text-slate-600">
            Po kliknutí na tlačidlo importu sa vytvoria okruhy, priradia prúdové chrániče, vyvážia fázy L1–L3 a automaticky sa prekreslí schéma.
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => handleExecuteImport('smart-designer')}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs transition-colors cursor-pointer"
            >
              Naimportovať a pokračovať v sprievodcovi
            </button>

            <button
              type="button"
              onClick={() => handleExecuteImport('schema-editor')}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#0066FF] hover:bg-[#2563EB] text-white font-bold text-xs shadow-lg shadow-[#0066FF]/25 transition-all cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              Importovať {drafts.length} okruhov a vygenerovať schému
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
