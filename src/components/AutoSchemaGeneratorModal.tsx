import React, { useState } from 'react';
import {
  Wand2,
  Sparkles,
  Zap,
  Home,
  Building2,
  Car,
  Flame,
  CheckCircle2,
  X,
  Layers,
  ShieldCheck,
  Cpu,
  ArrowRight,
} from 'lucide-react';
import {
  SwitchboardProject,
  Manufacturer,
  MainBreakerCurrent,
  ObjectType,
} from '../types/electrical';
import {
  PROJECT_TEMPLATES,
  balanceCircuitPhases,
  generateSmartSwitchboardProposal,
  SmartDesignerInput,
} from '../utils/electricalEngine';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onGenerateProject: (generatedProject: SwitchboardProject, description: string) => void;
}

export const AutoSchemaGeneratorModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onGenerateProject,
}) => {
  const [selectedTemplateKey, setSelectedTemplateKey] = useState<string>('rodinny_dom_3f');
  const [customizerMode, setCustomizerMode] = useState<boolean>(false);

  // Customizer state
  const [customObjectType, setCustomObjectType] = useState<ObjectType>('Rodinný dom');
  const [customSupply, setCustomSupply] = useState<'3f' | '1f'>('3f');
  const [customMainCurrent, setCustomMainCurrent] = useState<MainBreakerCurrent>(25);
  const [customManufacturer, setCustomManufacturer] = useState<Manufacturer>('Eaton');
  const [includeCooktop, setIncludeCooktop] = useState<boolean>(true);
  const [includeHeatPump, setIncludeHeatPump] = useState<boolean>(true);
  const [includeWallbox, setIncludeWallbox] = useState<boolean>(false);
  const [includeOutdoor, setIncludeOutdoor] = useState<boolean>(true);
  const [includeSpd, setIncludeSpd] = useState<boolean>(true);

  if (!isOpen) return null;

  const quickPresets = [
    {
      key: 'rodinny_dom_3f',
      title: 'Rodinný dom – Kompletný rozvádzač',
      badge: 'Najobľúbenejšia šablóna • 3F 400 V',
      icon: Home,
      specs: 'QF0 3P B25A • QS1 4P 40A • SPD T1+T2 • 3× RCD • 9 okruhov',
      desc: 'Kompletný domový rozvádzač: varná doska 400 V, rúra, umývačka, práčka, sušička, kúpeľňa, zásuvky a LED osvetlenie.',
    },
    {
      key: 'test2_byt_3f_viac_fi',
      title: 'Moderný 3-izbový byt (3-fázový)',
      badge: '3F 400 V • Rozdelené RCD',
      icon: Building2,
      specs: 'QF0 3P B25A • QS1 4P 40A • 3× FI • Varná doska + kuchyňa',
      desc: 'Rozdelenie záťaže na samostatné prúdové chrániče (kuchyňa, kúpeľňa a obytné izby), plná selektivita istenia.',
    },
    {
      key: 'byt_1f_230v',
      title: 'Mestský byt / Garsónka (1-fázový)',
      badge: '1F 230 V • Kompaktný',
      icon: Building2,
      specs: 'QF0 1P B25A • QS1 2P 40A • 1× FI 30 mA • 5 okruhov',
      desc: 'Jednoduchý a bezpečný 1-fázový bytový rozvádzač so zásuvkovými a svetelnými obvodmi a prúdovým chráničom FI1.',
    },
    {
      key: 'garaz_dielna_ev',
      title: 'Garáž / Dielňa s Wallboxom EV 11 kW',
      badge: '3F 400 V • Zásuvky 400V + EV',
      icon: Car,
      specs: 'QF0 3P C32A • QS1 40A • Wallbox 11kW • Zásuvka 400V 16A',
      desc: 'Priemyselná odolnosť: samostatná 3-fázová zásuvka 400 V na zváračku/kompresor a vyhradený okruh pre Wallbox elektromobilu.',
    },
  ];

  const handleApplyPreset = (templateKey: string) => {
    let projectToUse: SwitchboardProject;

    if (templateKey === 'garaz_dielna_ev') {
      const base = PROJECT_TEMPLATES['test5_qf0_a_istic_qf1'] || PROJECT_TEMPLATES['rodinny_dom_3f'];
      projectToUse = {
        ...base,
        id: `proj-${Date.now()}`,
        name: 'RG – Garáž a dielňa s Wallboxom EV 11 kW',
        objectType: 'Garáž / Dielňa',
        projectNumber: `RG-${new Date().getFullYear()}-${Math.floor(Math.random() * 900 + 100)}`,
        projectDate: new Date().toLocaleDateString('sk-SK'),
      };
    } else if (PROJECT_TEMPLATES[templateKey]) {
      const base = PROJECT_TEMPLATES[templateKey];
      projectToUse = {
        ...base,
        id: `proj-${Date.now()}`,
        projectNumber: `ESG-${new Date().getFullYear()}-${Math.floor(Math.random() * 900 + 100)}`,
        projectDate: new Date().toLocaleDateString('sk-SK'),
      };
    } else {
      projectToUse = PROJECT_TEMPLATES['rodinny_dom_3f'];
    }

    const balanced = balanceCircuitPhases(projectToUse);
    onGenerateProject(
      balanced,
      `Automaticky vygenerovaná schéma rozvádzača z rýchlej šablóny (${balanced.name})`
    );
    onClose();
  };

  const handleRunCustomGenerator = () => {
    const input: SmartDesignerInput = {
      projectName: `Rozvádzač ${customObjectType} – ${customSupply.toUpperCase()}`,
      objectType: customObjectType,
      roomCount: 5,
      lightCircuitCount: customSupply === '3f' ? 3 : 2,
      socketCircuitCount: customSupply === '3f' ? 5 : 3,
      mainBreakerCurrent: customMainCurrent,
      mainBreakerChar: 'B',
      mainBreakerLocation: 'PRED ROZVÁDZAČOM',
      networkSystem: 'TN-C-S',
      supplySystem: customSupply,
      preferredManufacturer: customManufacturer,
      appliances: {
        inductionCooktop: includeCooktop,
        electricOven: true,
        dishwasher: true,
        washingMachine: true,
        dryer: true,
        boilerWaterHeater: false,
        heatPumpOrBoiler: includeHeatPump,
        airConditioning: false,
        evWallbox11kW: includeWallbox,
        outdoorAndGarage: includeOutdoor,
      },
      protections: {
        hasSpd: includeSpd,
        spdType: 'T1+T2 (B+C)',
        useRcboForFridgeAndCritical: true,
        useTypeBRcdForEv: includeWallbox,
        useAfddForBedrooms: false,
      },
    };

    const proposal = generateSmartSwitchboardProposal(input);
    const balanced = balanceCircuitPhases(proposal.project);
    onGenerateProject(
      balanced,
      `Automaticky vygenerovaný návrh rozvádzača (${balanced.circuits.length} okruhov, ${balanced.rcds.length} chráničov)`
    );
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-3xl w-full overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-[#0B1120] text-white p-6 border-b border-slate-800 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-[#0066FF] flex items-center justify-center text-white shadow-lg shadow-[#0066FF]/40">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-extrabold text-white">
                  Automatické vytvorenie elektrickej schémy
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-mono text-[10px] font-bold">
                  1-KLIKOM
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Okamžite vygeneruje kompletnú schému rozvádzača s fázovým vyvážením, prístrojmi a kabelážou podľa STN.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Selector Toggle */}
        <div className="px-6 pt-4 pb-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
          <div className="text-xs font-bold text-slate-600 uppercase tracking-wider">
            Vyberte spôsob vytvorenia:
          </div>
          <div className="inline-flex rounded-xl bg-slate-200 p-1 text-xs">
            <button
              type="button"
              onClick={() => setCustomizerMode(false)}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                !customizerMode
                  ? 'bg-[#0066FF] text-white shadow-sm'
                  : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              Rýchle šablóny (1 klik)
            </button>
            <button
              type="button"
              onClick={() => setCustomizerMode(true)}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                customizerMode
                  ? 'bg-[#0066FF] text-white shadow-sm'
                  : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              Rýchly sprievodca na mieru
            </button>
          </div>
        </div>

        {/* Body Content */}
        <div className="p-6 overflow-y-auto space-y-4">
          {!customizerMode ? (
            <div className="space-y-3">
              <div className="text-xs text-slate-500 font-medium">
                Kliknite na pripravený vzor rozvádzača a schéma sa okamžite vytvorí a otvorí vo výkrese:
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {quickPresets.map((preset) => {
                  const Icon = preset.icon;
                  return (
                    <div
                      key={preset.key}
                      onClick={() => handleApplyPreset(preset.key)}
                      className="group bg-white hover:bg-blue-50/50 border-2 border-slate-200 hover:border-[#0066FF] rounded-2xl p-4 transition-all cursor-pointer shadow-sm hover:shadow-md flex flex-col justify-between space-y-2.5 relative"
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <div className="w-8 h-8 rounded-lg bg-blue-100 text-[#0066FF] flex items-center justify-center group-hover:bg-[#0066FF] group-hover:text-white transition-colors">
                            <Icon className="w-4 h-4" />
                          </div>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-bold group-hover:bg-blue-100 group-hover:text-blue-900">
                            {preset.badge}
                          </span>
                        </div>
                        <h4 className="text-sm font-extrabold text-slate-900 group-hover:text-[#0066FF] transition-colors">
                          {preset.title}
                        </h4>
                        <p className="text-xs text-slate-600 leading-relaxed">
                          {preset.desc}
                        </p>
                      </div>

                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 font-mono">
                        <span className="truncate pr-2">{preset.specs}</span>
                        <ArrowRight className="w-4 h-4 text-[#0066FF] shrink-0 transform group-hover:translate-x-1 transition-transform" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* Customizer form */
            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="space-y-1.5">
                  <span className="font-bold text-slate-700 uppercase tracking-wider">
                    Typ objektu:
                  </span>
                  <select
                    value={customObjectType}
                    onChange={(e) => setCustomObjectType(e.target.value as ObjectType)}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-300 font-semibold focus:bg-white focus:border-[#0066FF] focus:outline-none"
                  >
                    <option value="Rodinný dom">Rodinný dom</option>
                    <option value="Byt">Byt</option>
                    <option value="Garáž / Dielňa">Garáž / Dielňa</option>
                    <option value="Komerčná prevádzka">Komerčná prevádzka / Kancelárie</option>
                    <option value="Chata / Rekreačný objekt">Chata / Rekreačný objekt</option>
                  </select>
                </label>

                <label className="space-y-1.5">
                  <span className="font-bold text-slate-700 uppercase tracking-wider">
                    Sústava napájania:
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setCustomSupply('3f')}
                      className={`py-2 rounded-xl border font-bold text-center cursor-pointer ${
                        customSupply === '3f'
                          ? 'bg-[#0066FF] border-[#0066FF] text-white'
                          : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      3-fázová (400 V)
                    </button>
                    <button
                      type="button"
                      onClick={() => setCustomSupply('1f')}
                      className={`py-2 rounded-xl border font-bold text-center cursor-pointer ${
                        customSupply === '1f'
                          ? 'bg-[#0066FF] border-[#0066FF] text-white'
                          : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      1-fázová (230 V)
                    </button>
                  </div>
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="space-y-1.5">
                  <span className="font-bold text-slate-700 uppercase tracking-wider">
                    Hlavný istič pred elektromerom (QF0):
                  </span>
                  <select
                    value={customMainCurrent}
                    onChange={(e) => setCustomMainCurrent(Number(e.target.value) as MainBreakerCurrent)}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-300 font-mono font-bold focus:bg-white focus:border-[#0066FF] focus:outline-none"
                  >
                    {[16, 20, 25, 32, 40, 50, 63].map((cur) => (
                      <option key={cur} value={cur}>
                        {cur} A (Charakteristika B)
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1.5">
                  <span className="font-bold text-slate-700 uppercase tracking-wider">
                    Preferovaný výrobca prístrojov:
                  </span>
                  <select
                    value={customManufacturer}
                    onChange={(e) => setCustomManufacturer(e.target.value as Manufacturer)}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-300 font-bold focus:bg-white focus:border-[#0066FF] focus:outline-none"
                  >
                    <option value="Eaton">Eaton (PL7 / PF7)</option>
                    <option value="Schneider Electric">Schneider Electric (Acti9 / Resi9)</option>
                    <option value="OEZ">OEZ Letohrad (Minia)</option>
                    <option value="Hager">Hager (katalóg DBO)</option>
                    <option value="Legrand">Legrand (TX3 / DX3)</option>
                  </select>
                </label>
              </div>

              {/* Appliances Checkboxes */}
              <div className="space-y-2 pt-2">
                <span className="font-bold text-slate-700 uppercase tracking-wider">
                  Vyberte spotrebiče na automatické zaradenie:
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {[
                    { label: 'Indukčná varná doska 400V', checked: includeCooktop, setter: setIncludeCooktop },
                    { label: 'Tepelné čerpadlo / Kotol', checked: includeHeatPump, setter: setIncludeHeatPump },
                    { label: 'Nabíjacia stanica EV 11 kW', checked: includeWallbox, setter: setIncludeWallbox },
                    { label: 'Exteriér a záhrada / Terasa', checked: includeOutdoor, setter: setIncludeOutdoor },
                    { label: 'Prepäťová ochrana SPD T1+T2', checked: includeSpd, setter: setIncludeSpd },
                  ].map((app, i) => (
                    <label
                      key={i}
                      className={`flex items-center gap-2 p-2.5 rounded-xl border transition-all cursor-pointer font-medium ${
                        app.checked
                          ? 'bg-blue-50 border-[#0066FF] text-[#0066FF] font-bold'
                          : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={app.checked}
                        onChange={(e) => app.setter(e.target.checked)}
                        className="rounded text-[#0066FF] focus:ring-[#0066FF]"
                      />
                      <span className="text-[11px]">{app.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="pt-4 flex justify-end">
                <button
                  type="button"
                  onClick={handleRunCustomGenerator}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#0066FF] hover:bg-[#2563EB] text-white font-bold text-xs shadow-lg shadow-[#0066FF]/30 transition-all cursor-pointer"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Vygenerovať schému a prejsť do editora výkresu</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer info */}
        <div className="bg-slate-50 p-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Automatická kontrola selektivity a vyváženia fáz podľa STN EN 61439-3</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 font-bold cursor-pointer"
          >
            Zavrieť
          </button>
        </div>
      </div>
    </div>
  );
};
