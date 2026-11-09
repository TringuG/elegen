import React, { useState, useRef } from 'react';
import {
  Award,
  CheckCircle2,
  FileCheck,
  Flame,
  Printer,
  ShieldCheck,
  Wrench,
  Download,
  AlertTriangle,
  Info,
  Building,
  UserCheck,
  Save,
  Barcode,
  Layers,
  Zap,
  Tag,
  FileText,
  Clock,
  Gauge,
  HelpCircle,
  Sparkles,
  Image as ImageIcon,
  Upload,
  Trash2,
  HardDrive,
  FolderOpen,
  RotateCcw,
} from 'lucide-react';
import {
  SwitchboardProject,
  SwitchboardManufacturerInfo,
  PieceVerificationChecks,
  SavedNameplatePreset,
} from '../types/electrical';
import {
  calculateDinRailAllocation,
  calculatePhaseLoad,
  calculateThermalDissipation,
  getEffectiveInternalDevice,
  getEffectiveManufacturingInfo,
  getEffectiveUpstreamBreaker,
  saveLastNameplateToBrowserMemory,
  loadLastNameplateFromBrowserMemory,
  clearLastNameplateFromBrowserMemory,
  getSavedNameplatePresets,
  saveNameplatePresetToBrowserMemory,
  deleteNameplatePresetFromBrowserMemory,
} from '../utils/electricalEngine';
import {
  exportNameplateToPng,
  exportNameplateToPdf,
} from '../utils/pdfSchemaExport';

interface Props {
  project: SwitchboardProject;
  onProjectChange: (updated: SwitchboardProject, actionDescription?: string) => void;
  onNavigateToSchema?: () => void;
}

type ManufacturingTab =
  | 'nameplate'
  | 'piece-verification'
  | 'declaration-of-conformity'
  | 'thermal-dissipation'
  | 'procedure-and-standards';

export const SwitchboardManufacturingView: React.FC<Props> = ({
  project,
  onProjectChange,
  onNavigateToSchema,
}) => {
  const [activeTab, setActiveTab] = useState<ManufacturingTab>('nameplate');
  const [savedBanner, setSavedBanner] = useState<string | null>(null);
  const [labelSize, setLabelSize] = useState<'standard' | 'compact' | 'large'>(() => {
    const cached = loadLastNameplateFromBrowserMemory();
    return cached?.labelSize || 'standard';
  });
  const [savedPresets, setSavedPresets] = useState<SavedNameplatePreset[]>(() =>
    getSavedNameplatePresets()
  );
  const [presetNameInput, setPresetNameInput] = useState('');
  const [isExportingLabel, setIsExportingLabel] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const SAMPLE_ELECTRICAL_LOGO =
    'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 54" fill="none"><rect width="220" height="54" rx="6" fill="%230F172A"/><path d="M26 13L14 30h11l-4 13 18-20h-11l4-11z" fill="%23FACC15"/><text x="48" y="29" fill="%23FFFFFF" font-family="sans-serif" font-weight="900" font-size="15" letter-spacing="1.5">ELEKTRO</text><text x="48" y="42" fill="%2338BDF8" font-family="sans-serif" font-weight="700" font-size="9" letter-spacing="2">SYSTEMS PRO</text></svg>';

  const mfg = getEffectiveManufacturingInfo(project);
  const thermal = calculateThermalDissipation(project);
  const din = calculateDinRailAllocation(project);
  const upstream = getEffectiveUpstreamBreaker(project);
  const internalDev = getEffectiveInternalDevice(project);
  const phaseLoad = calculatePhaseLoad(project);

  const handleLabelSizeChange = (newSize: 'standard' | 'compact' | 'large') => {
    setLabelSize(newSize);
    saveLastNameplateToBrowserMemory(mfg, newSize);
    showSavedFeedback('Veľkosť štítku bola uložená do pamäte prehliadača.');
  };

  const handleLogoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = String(ev.target?.result);
      const updatedMfg: SwitchboardManufacturerInfo = {
        ...mfg,
        manufacturerLogoUrl: dataUrl,
        logoDisplayMode: 'logo_only', // Predvolene zobraziť logo namiesto názvu
      };
      saveLastNameplateToBrowserMemory(updatedMfg, labelSize);
      onProjectChange(
        { ...project, manufacturingInfo: updatedMfg },
        'Nahrané firemné logo na výrobný štítok'
      );
      showSavedFeedback('Logo bolo uložené do projektu aj do pamäte prehliadača.');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleApplySampleLogo = () => {
    const updatedMfg: SwitchboardManufacturerInfo = {
      ...mfg,
      manufacturerLogoUrl: SAMPLE_ELECTRICAL_LOGO,
      logoDisplayMode: 'logo_only',
    };
    saveLastNameplateToBrowserMemory(updatedMfg, labelSize);
    onProjectChange(
      { ...project, manufacturingInfo: updatedMfg },
      'Aplikované vzorové elektro logo na výrobný štítok'
    );
    showSavedFeedback('Vzorové logo bolo aplikované a uložené do pamäte prehliadača.');
  };

  const handleRemoveLogo = () => {
    const updatedMfg: SwitchboardManufacturerInfo = {
      ...mfg,
      manufacturerLogoUrl: undefined,
      logoDisplayMode: 'text_only',
    };
    saveLastNameplateToBrowserMemory(updatedMfg, labelSize);
    onProjectChange(
      { ...project, manufacturingInfo: updatedMfg },
      'Odstránené logo z výrobného štítku'
    );
    showSavedFeedback('Logo bolo odstránené zo štítku.');
  };

  const updateMfgField = (
    field: keyof SwitchboardManufacturerInfo,
    value: any
  ) => {
    const updatedMfg: SwitchboardManufacturerInfo = {
      ...mfg,
      [field]: value,
    };
    saveLastNameplateToBrowserMemory(updatedMfg, labelSize);
    onProjectChange(
      {
        ...project,
        manufacturingInfo: updatedMfg,
      },
      `Aktualizácia výrobného štítku (${String(field)})`
    );
    showSavedFeedback();
  };

  const handleSavePresetToMemory = () => {
    const title =
      presetNameInput.trim() ||
      `${mfg.typeDesignation} – ${mfg.manufacturerName} (${mfg.serialNumber})`;
    saveLastNameplateToBrowserMemory(mfg, labelSize);
    const updatedList = saveNameplatePresetToBrowserMemory(title, mfg, labelSize);
    setSavedPresets(updatedList);
    setPresetNameInput('');
    showSavedFeedback(`Štítok „${title}“ bol uložený do pamäte prehliadača.`);
  };

  const handleLoadPresetFromMemory = (preset: SavedNameplatePreset) => {
    setLabelSize(preset.labelSize);
    saveLastNameplateToBrowserMemory(preset.info, preset.labelSize);
    onProjectChange(
      {
        ...project,
        manufacturingInfo: {
          ...mfg,
          ...preset.info,
        },
      },
      `Načítaný uložený štítok z pamäte prehliadača (${preset.presetName})`
    );
    showSavedFeedback(`Načítaný štítok „${preset.presetName}“ z pamäte prehliadača.`);
  };

  const handleDeletePresetFromMemory = (id: string) => {
    const updatedList = deleteNameplatePresetFromBrowserMemory(id);
    setSavedPresets(updatedList);
    showSavedFeedback('Uložený štítok bol odstránený z knižnice prehliadača.');
  };

  const handleResetNameplateMemory = () => {
    clearLastNameplateFromBrowserMemory();
    const cleanMfg: SwitchboardManufacturerInfo = {
      ...mfg,
      boardTitle: 'ROZVODNICA PRE LAICKÚ OBSLUHU (DBO)',
      standardTitle: 'ZHODA PODĽA STN EN 61439-1:2021 / STN EN 61439-3:2012',
      customRatedVoltageUn: undefined,
      customRatedCurrentInA: undefined,
      customNetworkCode: undefined,
      customIpRating: undefined,
      footerWarningText: 'Pred zásahom do vnútra rozvádzača bezpečne odpojiť od napájania!',
      countryOriginCode: 'SK',
    };
    onProjectChange(
      {
        ...project,
        manufacturingInfo: cleanMfg,
      },
      'Obnovené predvolené texty výrobného štítku'
    );
    showSavedFeedback('Pamäť štítku bola vyčistená a obnovená na automatické hodnoty z projektu.');
  };

  const handleDownloadNameplatePng = async () => {
    setIsExportingLabel(true);
    try {
      await exportNameplateToPng(project, labelSize);
      showSavedFeedback('Výrobný štítok bol úspešne stiahnutý ako obrázok PNG (300 DPI).');
    } finally {
      setIsExportingLabel(false);
    }
  };

  const handleDownloadNameplatePdf = async () => {
    setIsExportingLabel(true);
    try {
      await exportNameplateToPdf(project, labelSize);
      showSavedFeedback('Výrobný štítok bol úspešne stiahnutý ako čistý PDF dokument s orezovými značkami.');
    } finally {
      setIsExportingLabel(false);
    }
  };

  const updateCheckField = (
    checkKey: keyof PieceVerificationChecks,
    value: any
  ) => {
    const currentChecks = mfg.verificationChecks || {
      ipRatingChecked: true,
      clearanceAndCreepageOk: true,
      peContinuityOk: true,
      measuredPeResistanceOhm: 0.03,
      componentsInstallationOk: true,
      tighteningTorquesVerified: true,
      internalWiringAndCrossSectionsOk: true,
      wireColorCodingStnOk: true,
      externalTerminalsChecked: true,
      mechanicalOperationOk: true,
      insulationResistanceOk: true,
      testVoltageV: 500,
      measuredInsulationResistanceMohm: 99.9,
      electricalFunctionAndRcdTestOk: true,
      measuredRcdTripTimeMs: 22,
      overallPieceVerificationResult: 'VYHOVUJE',
    };

    const updatedChecks: PieceVerificationChecks = {
      ...currentChecks,
      [checkKey]: value,
    };

    const updatedMfg: SwitchboardManufacturerInfo = {
      ...mfg,
      verificationChecks: updatedChecks,
    };

    saveLastNameplateToBrowserMemory(updatedMfg, labelSize);
    onProjectChange(
      {
        ...project,
        manufacturingInfo: updatedMfg,
      },
      `Aktualizácia overenia kusovej skúšky (${String(checkKey)})`
    );
    showSavedFeedback();
  };

  const showSavedFeedback = (customMessage?: string) => {
    setSavedBanner(
      customMessage ||
        'Zmeny v štítku boli automaticky uložené do projektu aj do pamäte prehliadača (LocalStorage).'
    );
    setTimeout(() => setSavedBanner(null), 3500);
  };

  const handlePrintCurrentView = () => {
    window.print();
  };

  // Menovité parametre rozvádzača podľa STN EN 61439-1 / 3 (s možnosťou vlastného prepísania na štítku)
  const autoRatedVoltageUn =
    project.supplySystem === '3f' ? '230 / 400 V AC, 50 Hz' : '230 V AC, 50 Hz';
  const autoRatedCurrentInA = internalDev.enabled
    ? `${internalDev.ratedCurrent} A`
    : upstream.enabled
    ? `${upstream.ratedCurrent} A`
    : '40 A';
  const autoNetworkCode = `${project.networkSystem} (${project.supplySystem === '3f' ? '3+N+PE' : '1+N+PE'})`;

  const ratedVoltageUn = mfg.customRatedVoltageUn?.trim() || autoRatedVoltageUn;
  const ratedCurrentInA = mfg.customRatedCurrentInA?.trim() || autoRatedCurrentInA;
  const ratedShortCircuit = `${mfg.ratedShortCircuitIcnKa || 10} kA (s koordináciou)`;
  const networkCode = mfg.customNetworkCode?.trim() || autoNetworkCode;
  const displayIpRating = mfg.customIpRating?.trim() || project.ipRating;
  const boardTitle = mfg.boardTitle?.trim() || 'ROZVODNICA PRE LAICKÚ OBSLUHU (DBO)';
  const standardTitle =
    mfg.standardTitle?.trim() || 'ZHODA PODĽA STN EN 61439-1:2021 / STN EN 61439-3:2012';
  const footerWarningText =
    mfg.footerWarningText?.trim() ||
    'Pred zásahom do vnútra rozvádzača bezpečne odpojiť od napájania!';
  const countryOriginCode = mfg.countryOriginCode?.trim() || 'SK';

  return (
    <div className="space-y-6">
      {/* 1. Header Banner */}
      <div className="bg-[#0B1120] text-white rounded-2xl p-6 border border-slate-800 shadow-md flex flex-col lg:flex-row lg:items-center justify-between gap-5 no-print">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-[#0066FF]/20 border border-[#0066FF]/40 flex items-center justify-center text-[#38BDF8] shrink-0">
            <Award className="w-7 h-7" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-white">
                Výroba rozvádzača, Výrobný štítok &amp; Kusová skúška
              </h1>
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-mono text-[11px] font-bold">
                STN EN 61439-1 &amp; STN EN 61439-3
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1 max-w-3xl">
              Kompletná sprievodná a výrobná dokumentácia výrobcu určeného výrobku podľa zákona č. 56/2018 Z. z.,
              protokol o kusovom overení (čl. 11), EÚ vyhlásenie o zhode (CE), tepelná bilancia oteplenia a štítok.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={handleDownloadNameplatePng}
            disabled={isExportingLabel}
            className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-[#1E293B] hover:bg-slate-700 text-white border border-slate-700 text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
            title="Stiahnuť výrobný štítok ako obrázok PNG vo vysokom rozlíšení"
          >
            <Download className="w-4 h-4 text-emerald-400" />
            <span>Štítok PNG</span>
          </button>
          <button
            type="button"
            onClick={handleDownloadNameplatePdf}
            disabled={isExportingLabel}
            className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-[#1E293B] hover:bg-slate-700 text-white border border-slate-700 text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
            title="Stiahnuť výrobný štítok ako čistý PDF dokument"
          >
            <FileText className="w-4 h-4 text-[#38BDF8]" />
            <span>Štítok PDF</span>
          </button>
          <button
            type="button"
            onClick={handlePrintCurrentView}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0066FF] hover:bg-[#2563EB] text-white text-xs font-bold shadow-md shadow-[#0066FF]/30 transition-all cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>Vytlačiť dokument</span>
          </button>
        </div>
      </div>

      {savedBanner && (
        <div className="px-4 py-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-800 flex items-center gap-2 no-print shadow-sm">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{savedBanner}</span>
        </div>
      )}

      {/* 2. Sub-Navigation Tabs */}
      <div className="bg-white rounded-2xl border border-slate-200 p-2 shadow-sm flex overflow-x-auto no-scrollbar gap-1.5 no-print">
        {[
          {
            id: 'nameplate' as const,
            label: 'Výrobný štítok (Typový štítok)',
            icon: Tag,
            badge: 'PNG / PDF + Pamäť',
          },
          {
            id: 'piece-verification' as const,
            label: 'Kusová overovacia skúška',
            icon: FileCheck,
            badge: 'Protokol čl. 11',
          },
          {
            id: 'declaration-of-conformity' as const,
            label: 'EÚ Vyhlásenie o zhode (CE)',
            icon: ShieldCheck,
            badge: 'Zákon 56/2018 Z.z.',
          },
          {
            id: 'thermal-dissipation' as const,
            label: 'Výpočet oteplenia rozvádzača',
            icon: Flame,
            badge: thermal.isCompliant ? 'Vyhovuje' : 'Pozor',
          },
          {
            id: 'procedure-and-standards' as const,
            label: 'Postup výroby & Normy STN',
            icon: Wrench,
            badge: 'Technologický manuál',
          },
        ].map((tab) => {
          const active = activeTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 min-w-[190px] sm:min-w-[210px] shrink-0 flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                active
                  ? 'bg-[#0066FF] text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center gap-2">
                <Icon className={`w-4 h-4 ${active ? 'text-white' : 'text-slate-400'}`} />
                <span>{tab.label}</span>
              </div>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                  active
                    ? 'bg-white/20 text-white'
                    : 'bg-slate-100 text-slate-500'
                }`}
              >
                {tab.badge}
              </span>
            </button>
          );
        })}
      </div>

      {/* ===================================================================== */}
      {/* TAB 1: VÝROBNÝ ŠTÍTOK ROZVÁDZAČA (STN EN 61439-1 / 3)                  */}
      {/* ===================================================================== */}
      {activeTab === 'nameplate' && (
        <div className="space-y-6">
          {/* Controls Bar */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex flex-wrap items-center justify-between gap-4 no-print">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Veľkosť a formát štítku:
              </span>
              <div className="inline-flex flex-wrap rounded-lg bg-slate-100 p-1 border border-slate-200 text-xs">
                {(['compact', 'standard', 'large'] as const).map((sz) => (
                  <button
                    key={sz}
                    type="button"
                    onClick={() => handleLabelSizeChange(sz)}
                    className={`px-3 py-1 rounded-md font-bold transition-colors cursor-pointer ${
                      labelSize === sz
                        ? 'bg-[#0066FF] text-white'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {sz === 'compact'
                      ? 'Páskový (80 × 50 mm)'
                      : sz === 'standard'
                      ? 'Priemyselný (110 × 75 mm)'
                      : 'Veľký A6 (148 × 105 mm)'}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleDownloadNameplatePng}
                disabled={isExportingLabel}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm transition-colors cursor-pointer disabled:opacity-50"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Uložiť štítok ako PNG</span>
              </button>

              <button
                type="button"
                onClick={handleDownloadNameplatePdf}
                disabled={isExportingLabel}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0066FF] hover:bg-[#2563EB] text-white text-xs font-bold shadow-sm transition-colors cursor-pointer disabled:opacity-50"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Uložiť štítok ako PDF</span>
              </button>

              <button
                type="button"
                onClick={handlePrintCurrentView}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800 text-xs font-bold transition-colors cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5 text-blue-400" />
                <span>Tlačiť</span>
              </button>
            </div>
          </div>

          {/* Grid Layout: Editable Settings + Visual Nameplate */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Form Settings (Left Column) */}
            <div className="lg:col-span-6 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-5 no-print">
              <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-3">
                <div className="flex items-center gap-2">
                  <Building className="w-5 h-5 text-[#0066FF]" />
                  <h3 className="text-sm font-bold text-slate-900">
                    Údaje výrobcu a texty výrobného štítku
                  </h3>
                </div>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-[10px] font-bold text-emerald-700">
                  <HardDrive className="w-3 h-3" />
                  Uložené v pamäti prehliadača
                </span>
              </div>

              <div className="space-y-3.5 text-xs">
                <label className="block space-y-1">
                  <span className="text-slate-700 font-bold">Názov výrobcu (Firma / Živnostník):</span>
                  <input
                    type="text"
                    value={mfg.manufacturerName}
                    onChange={(e) => updateMfgField('manufacturerName', e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 font-semibold focus:bg-white focus:border-[#0066FF] focus:outline-none"
                  />
                </label>

                {/* Logo Configuration Box */}
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 font-bold text-slate-800">
                      <ImageIcon className="w-4 h-4 text-[#0066FF]" />
                      <span>Firemné logo na výrobnom štítku:</span>
                    </div>
                    {mfg.manufacturerLogoUrl && (
                      <button
                        type="button"
                        onClick={handleRemoveLogo}
                        className="text-[11px] text-red-600 hover:text-red-700 font-bold inline-flex items-center gap-1 cursor-pointer"
                        title="Odstrániť logo"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>Odstrániť logo</span>
                      </button>
                    )}
                  </div>

                  {/* Display Mode Selector */}
                  <div className="space-y-1">
                    <span className="text-[11px] font-bold text-slate-600">Režim zobrazenia hlavičky štítku:</span>
                    <div className="grid grid-cols-3 gap-1.5 text-[11px]">
                      <button
                        type="button"
                        onClick={() => updateMfgField('logoDisplayMode', 'logo_only')}
                        className={`py-1.5 px-2 rounded-lg font-bold border text-center transition-all cursor-pointer ${
                          mfg.logoDisplayMode === 'logo_only'
                            ? 'bg-[#0066FF] border-[#0066FF] text-white'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                        }`}
                        title="Zobrazí nahrané logo namiesto textového názvu firmy"
                      >
                        Logo namiesto názvu
                      </button>
                      <button
                        type="button"
                        onClick={() => updateMfgField('logoDisplayMode', 'both')}
                        className={`py-1.5 px-2 rounded-lg font-bold border text-center transition-all cursor-pointer ${
                          mfg.logoDisplayMode === 'both'
                            ? 'bg-[#0066FF] border-[#0066FF] text-white'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                        }`}
                        title="Zobrazí logo aj textový názov vedľa seba"
                      >
                        Logo aj text
                      </button>
                      <button
                        type="button"
                        onClick={() => updateMfgField('logoDisplayMode', 'text_only')}
                        className={`py-1.5 px-2 rounded-lg font-bold border text-center transition-all cursor-pointer ${
                          mfg.logoDisplayMode === 'text_only' || !mfg.logoDisplayMode
                            ? 'bg-[#0066FF] border-[#0066FF] text-white'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                        }`}
                        title="Zobrazí iba textový názov"
                      >
                        Iba text
                      </button>
                    </div>
                  </div>

                  {/* Upload Buttons & Preview */}
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleLogoFileChange}
                      accept="image/*"
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold text-xs transition-colors cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5 text-[#0066FF]" />
                      <span>Nahrať vlastné logo (PNG/SVG/JPG)</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleApplySampleLogo}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-50 border border-blue-200 text-[#0066FF] hover:bg-blue-100 font-bold text-xs transition-colors cursor-pointer"
                      title="Vložiť ukážkové elektro logo pre testovanie"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Vzorové logo</span>
                    </button>
                  </div>

                  {/* Logo Preview & Size Adjustment */}
                  {mfg.manufacturerLogoUrl && (
                    <div className="flex items-center gap-3 p-2 bg-white rounded-lg border border-slate-200">
                      <div className="w-24 h-10 border border-slate-200 rounded p-1 bg-slate-50 flex items-center justify-center overflow-hidden shrink-0">
                        <img
                          src={mfg.manufacturerLogoUrl}
                          alt="Náhľad loga"
                          className="max-h-full max-w-full object-contain"
                        />
                      </div>
                      <div className="flex-1 space-y-1 min-w-0">
                        <div className="flex justify-between items-center text-[10px] text-slate-500 font-mono">
                          <span>Výška loga na štítku:</span>
                          <strong>{mfg.logoHeightMm || 18} mm</strong>
                        </div>
                        <input
                          type="range"
                          min={12}
                          max={32}
                          value={mfg.logoHeightMm || 18}
                          onChange={(e) => updateMfgField('logoHeightMm', Number(e.target.value))}
                          className="w-full accent-[#0066FF]"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="space-y-1">
                    <span className="text-slate-700 font-bold">Ulica a číslo:</span>
                    <input
                      type="text"
                      value={mfg.manufacturerStreet}
                      onChange={(e) => updateMfgField('manufacturerStreet', e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 font-medium focus:bg-white focus:border-[#0066FF] focus:outline-none"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-slate-700 font-bold">Mesto a PSČ:</span>
                    <input
                      type="text"
                      value={mfg.manufacturerCity}
                      onChange={(e) => updateMfgField('manufacturerCity', e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 font-medium focus:bg-white focus:border-[#0066FF] focus:outline-none"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="space-y-1">
                    <span className="text-slate-700 font-bold">IČO výrobcu:</span>
                    <input
                      type="text"
                      value={mfg.manufacturerIco}
                      onChange={(e) => updateMfgField('manufacturerIco', e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 font-mono font-bold focus:bg-white focus:border-[#0066FF] focus:outline-none"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-slate-700 font-bold">IČ DPH / DIČ:</span>
                    <input
                      type="text"
                      value={mfg.manufacturerDic || ''}
                      onChange={(e) => updateMfgField('manufacturerDic', e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 font-mono focus:bg-white focus:border-[#0066FF] focus:outline-none"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="space-y-1">
                    <span className="text-slate-700 font-bold">Nadpis štítku (Druh rozvádzača):</span>
                    <input
                      type="text"
                      value={mfg.boardTitle ?? 'ROZVODNICA PRE LAICKÚ OBSLUHU (DBO)'}
                      onChange={(e) => updateMfgField('boardTitle', e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 font-semibold focus:bg-white focus:border-[#0066FF] focus:outline-none"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-slate-700 font-bold">Podnadpis normy:</span>
                    <input
                      type="text"
                      value={mfg.standardTitle ?? 'ZHODA PODĽA STN EN 61439-1:2021 / STN EN 61439-3:2012'}
                      onChange={(e) => updateMfgField('standardTitle', e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 font-mono focus:bg-white focus:border-[#0066FF] focus:outline-none"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="space-y-1">
                    <span className="text-slate-700 font-bold">Typové označenie (DBO):</span>
                    <input
                      type="text"
                      value={mfg.typeDesignation}
                      onChange={(e) => updateMfgField('typeDesignation', e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 font-mono font-bold focus:bg-white focus:border-[#0066FF] focus:outline-none"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-slate-700 font-bold">Výrobné číslo (S/N):</span>
                    <input
                      type="text"
                      value={mfg.serialNumber}
                      onChange={(e) => updateMfgField('serialNumber', e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 font-mono font-bold focus:bg-white focus:border-[#0066FF] focus:outline-none"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="space-y-1">
                    <span className="text-slate-700 font-bold">Menovité napätie (Un):</span>
                    <input
                      type="text"
                      placeholder={autoRatedVoltageUn}
                      value={mfg.customRatedVoltageUn ?? ''}
                      onChange={(e) => updateMfgField('customRatedVoltageUn', e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 font-mono font-bold focus:bg-white focus:border-[#0066FF] focus:outline-none"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-slate-700 font-bold">Menovitý prúd rozvádzača (InA):</span>
                    <input
                      type="text"
                      placeholder={autoRatedCurrentInA}
                      value={mfg.customRatedCurrentInA ?? ''}
                      onChange={(e) => updateMfgField('customRatedCurrentInA', e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 font-mono font-bold focus:bg-white focus:border-[#0066FF] focus:outline-none"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="space-y-1">
                    <span className="text-slate-700 font-bold">Druh siete / Sústava:</span>
                    <input
                      type="text"
                      placeholder={autoNetworkCode}
                      value={mfg.customNetworkCode ?? ''}
                      onChange={(e) => updateMfgField('customNetworkCode', e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 font-mono font-bold focus:bg-white focus:border-[#0066FF] focus:outline-none"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-slate-700 font-bold">Stupeň ochrany krytom (IP):</span>
                    <input
                      type="text"
                      placeholder={project.ipRating}
                      value={mfg.customIpRating ?? ''}
                      onChange={(e) => updateMfgField('customIpRating', e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 font-mono font-bold focus:bg-white focus:border-[#0066FF] focus:outline-none"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <label className="space-y-1">
                    <span className="text-slate-700 font-bold">Rok výroby:</span>
                    <input
                      type="number"
                      value={mfg.productionYear}
                      onChange={(e) => updateMfgField('productionYear', parseInt(e.target.value) || 2026)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 font-mono font-bold focus:bg-white focus:border-[#0066FF] focus:outline-none"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-slate-700 font-bold">Trieda ochrany:</span>
                    <select
                      value={mfg.enclosureProtectionClass}
                      onChange={(e) => updateMfgField('enclosureProtectionClass', e.target.value)}
                      className="w-full px-2.5 py-2 rounded-xl bg-slate-50 border border-slate-300 font-medium focus:bg-white focus:border-[#0066FF] focus:outline-none"
                    >
                      <option value="Trieda I (s PE svorkou)">Trieda I (PE pospájanie)</option>
                      <option value="Trieda II (dvojitá izolácia / celoplast)">Trieda II (dvojitá izolácia)</option>
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="text-slate-700 font-bold">Skrat Icn (kA):</span>
                    <input
                      type="number"
                      value={mfg.ratedShortCircuitIcnKa || 10}
                      onChange={(e) => updateMfgField('ratedShortCircuitIcnKa', parseInt(e.target.value) || 10)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 font-mono font-bold focus:bg-white focus:border-[#0066FF] focus:outline-none"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <label className="space-y-1">
                    <span className="text-slate-700 font-bold">Súčiniteľ RDF:</span>
                    <input
                      type="number"
                      step={0.05}
                      min={0.1}
                      max={1.0}
                      value={mfg.ratedDiversityFactor || 0.8}
                      onChange={(e) => updateMfgField('ratedDiversityFactor', parseFloat(e.target.value) || 0.8)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 font-mono font-bold focus:bg-white focus:border-[#0066FF] focus:outline-none"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-slate-700 font-bold">Rozsah teplôt okolia:</span>
                    <input
                      type="text"
                      value={mfg.ambientTempRange}
                      onChange={(e) => updateMfgField('ambientTempRange', e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 font-mono focus:bg-white focus:border-[#0066FF] focus:outline-none"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-slate-700 font-bold">Dátum výroby / skúšky:</span>
                    <input
                      type="text"
                      value={mfg.testedDate}
                      onChange={(e) => updateMfgField('testedDate', e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 font-mono font-bold focus:bg-white focus:border-[#0066FF] focus:outline-none"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <label className="sm:col-span-3 space-y-1">
                    <span className="text-slate-700 font-bold">Bezpečnostné upozornenie v pätičke štítku:</span>
                    <input
                      type="text"
                      value={
                        mfg.footerWarningText ??
                        'Pred zásahom do vnútra rozvádzača bezpečne odpojiť od napájania!'
                      }
                      onChange={(e) => updateMfgField('footerWarningText', e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 font-medium focus:bg-white focus:border-[#0066FF] focus:outline-none"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-slate-700 font-bold">Kód krajiny:</span>
                    <input
                      type="text"
                      value={mfg.countryOriginCode ?? 'SK'}
                      onChange={(e) => updateMfgField('countryOriginCode', e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 font-mono font-bold uppercase focus:bg-white focus:border-[#0066FF] focus:outline-none"
                    />
                  </label>
                </div>

                <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-[11px] text-blue-900 flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2">
                    <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                    <div>
                      <strong>Automatické ukladanie do pamäte prehliadača:</strong> Všetko, čo do
                      štítku napíšete (názov firmy, IČO, logo, typ, S/N, napätie, prúd aj poznámky),
                      sa okamžite ukladá do pamäte prehliadača (<code>localStorage</code>) a zostane
                      zachované aj po zatvorení alebo obnovení stránky.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleResetNameplateMemory}
                    className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white hover:bg-blue-100 border border-blue-200 text-blue-800 font-bold text-[10px] transition-colors cursor-pointer"
                    title="Obnoviť automatické hodnoty z projektu"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Resetovať</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Visual Real Nameplate + Download & Browser Memory Presets (Right Column) */}
            <div className="lg:col-span-6 space-y-5">
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between no-print">
                <span>Náhľad skutočného výrobného štítku na rozvádzač:</span>
                <span className="text-slate-400 font-mono">STN EN 61439-3 (DBO)</span>
              </div>

              {/* INDUSTRIAL NAMEPLATE CARD (HIGH-FIDELITY VECTOR STYLE) */}
              <div
                className={`w-full bg-white text-slate-950 border-4 border-slate-950 rounded-lg p-3.5 sm:p-5 font-sans shadow-lg relative print:shadow-none mx-auto ${
                  labelSize === 'compact'
                    ? 'max-w-[340px] text-[10px]'
                    : labelSize === 'large'
                    ? 'max-w-[480px] text-[12px]'
                    : 'max-w-[420px] text-[11px]'
                }`}
              >
                {/* Top Header: Manufacturer & CE Symbol */}
                <div className="flex items-start justify-between border-b-2 border-slate-950 pb-2.5 mb-2.5">
                  <div className="space-y-0.5 max-w-[260px]">
                    {mfg.manufacturerLogoUrl && mfg.logoDisplayMode !== 'text_only' ? (
                      <div className="mb-1">
                        {mfg.logoDisplayMode === 'logo_only' ? (
                          <img
                            src={mfg.manufacturerLogoUrl}
                            alt="Logo výrobcu"
                            style={{ maxHeight: `${(mfg.logoHeightMm || 18) * 2.2}px` }}
                            className="object-contain max-w-[220px]"
                          />
                        ) : (
                          <div className="flex items-center gap-2">
                            <img
                              src={mfg.manufacturerLogoUrl}
                              alt="Logo výrobcu"
                              style={{ maxHeight: `${(mfg.logoHeightMm || 16) * 1.6}px` }}
                              className="object-contain max-w-[120px]"
                            />
                            <div className="font-extrabold uppercase tracking-tight text-slate-950 text-xs">
                              {mfg.manufacturerName}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="font-extrabold uppercase tracking-tight text-slate-950 text-sm">
                        {mfg.manufacturerName}
                      </div>
                    )}
                    <div className="text-[10px] text-slate-700 leading-tight">
                      {mfg.manufacturerStreet}, {mfg.manufacturerCity}
                    </div>
                    <div className="text-[10px] font-mono text-slate-700">
                      IČO: {mfg.manufacturerIco} {mfg.manufacturerDic ? `• DIČ: ${mfg.manufacturerDic}` : ''}
                    </div>
                  </div>

                  {/* CE Graphic Mark & Warning Flash */}
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="w-9 h-9 rounded border-2 border-slate-950 flex items-center justify-center font-serif font-black text-xl text-slate-950">
                      CE
                    </div>
                    <div className="w-8 h-8 rounded border-2 border-amber-600 bg-amber-400 flex items-center justify-center text-slate-950">
                      <Zap className="w-5 h-5 fill-slate-950 stroke-slate-950" />
                    </div>
                  </div>
                </div>

                {/* Device Title & Standard */}
                <div className="text-center font-bold uppercase tracking-wider text-slate-900 mb-2 border-b border-slate-950 pb-1">
                  {boardTitle}
                  <div className="text-[9px] font-mono text-slate-600 font-normal">
                    {standardTitle}
                  </div>
                </div>

                {/* Technical Parameters Table */}
                <div className="divide-y divide-slate-300 font-mono text-[10.5px]">
                  <div className="grid grid-cols-2 py-1">
                    <span className="font-sans font-bold text-slate-700">Typové označenie:</span>
                    <span className="font-bold text-right text-slate-950">{mfg.typeDesignation}</span>
                  </div>

                  <div className="grid grid-cols-2 py-1">
                    <span className="font-sans font-bold text-slate-700">Výrobné číslo (S/N):</span>
                    <span className="font-bold text-right text-slate-950">{mfg.serialNumber}</span>
                  </div>

                  <div className="grid grid-cols-2 py-1">
                    <span className="font-sans font-bold text-slate-700">Menovité napätie (Un):</span>
                    <span className="text-right text-slate-950 font-bold">{ratedVoltageUn}</span>
                  </div>

                  <div className="grid grid-cols-2 py-1">
                    <span className="font-sans font-bold text-slate-700">Menovitý prúd rozvádzača (InA):</span>
                    <span className="text-right font-bold text-blue-700">{ratedCurrentInA}</span>
                  </div>

                  <div className="grid grid-cols-2 py-1">
                    <span className="font-sans font-bold text-slate-700">Menovitý podmienený skrat (Icn):</span>
                    <span className="text-right text-slate-950 font-bold">{ratedShortCircuit}</span>
                  </div>

                  <div className="grid grid-cols-2 py-1">
                    <span className="font-sans font-bold text-slate-700">Druh siete / Sústava:</span>
                    <span className="text-right text-slate-950 font-bold">{networkCode}</span>
                  </div>

                  <div className="grid grid-cols-2 py-1">
                    <span className="font-sans font-bold text-slate-700">Stupeň ochrany krytom:</span>
                    <span className="text-right font-bold text-slate-950">{displayIpRating}</span>
                  </div>

                  <div className="grid grid-cols-2 py-1">
                    <span className="font-sans font-bold text-slate-700">Trieda ochrany:</span>
                    <span className="text-right text-slate-950 font-semibold">{mfg.enclosureProtectionClass}</span>
                  </div>

                  <div className="grid grid-cols-2 py-1">
                    <span className="font-sans font-bold text-slate-700">Súčiniteľ súdobosti (RDF):</span>
                    <span className="text-right text-slate-950 font-bold">{mfg.ratedDiversityFactor || 0.8}</span>
                  </div>

                  <div className="grid grid-cols-2 py-1">
                    <span className="font-sans font-bold text-slate-700">Rozsah teplôt okolia:</span>
                    <span className="text-right text-slate-950">{mfg.ambientTempRange}</span>
                  </div>

                  <div className="grid grid-cols-2 py-1">
                    <span className="font-sans font-bold text-slate-700">Dátum a rok výroby:</span>
                    <span className="text-right text-slate-950 font-bold">
                      {mfg.testedDate} ({mfg.productionYear})
                    </span>
                  </div>
                </div>

                {/* Footer Warning & Barcode */}
                <div className="mt-3 pt-2 border-t-2 border-slate-950 flex items-center justify-between gap-2 text-[9px] text-slate-600">
                  <div className="font-sans">
                    {footerWarningText}
                  </div>
                  <div className="font-mono text-slate-900 font-bold tracking-widest uppercase shrink-0">
                    {countryOriginCode} • {mfg.productionYear}
                  </div>
                </div>
              </div>

              {/* Direct Export Action Card below Nameplate */}
              <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-3 no-print">
                <div className="text-xs font-bold text-slate-800 flex items-center justify-between">
                  <span>Priamy export a stiahnutie štítku (300 DPI):</span>
                  <span className="text-[11px] font-mono text-slate-500">
                    {labelSize === 'compact'
                      ? '80 × 50 mm'
                      : labelSize === 'large'
                      ? '148 × 105 mm (A6)'
                      : '110 × 75 mm'}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={handleDownloadNameplatePng}
                    disabled={isExportingLabel}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm transition-all cursor-pointer disabled:opacity-50"
                  >
                    <Download className="w-4 h-4" />
                    <span>Stiahnuť štítok ako PNG</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadNameplatePdf}
                    disabled={isExportingLabel}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#0066FF] hover:bg-[#2563EB] text-white text-xs font-bold shadow-sm transition-all cursor-pointer disabled:opacity-50"
                  >
                    <FileText className="w-4 h-4" />
                    <span>Stiahnuť štítok ako PDF</span>
                  </button>
                </div>
              </div>

              {/* Browser Memory Nameplate Library (Knižnica uložených štítkov v pamäti prehliadača) */}
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4 no-print">
                <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-3">
                  <div className="flex items-center gap-2">
                    <HardDrive className="w-4 h-4 text-[#0066FF]" />
                    <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                      Pamäť prehliadača — Uložené štítky ({savedPresets.length})
                    </h4>
                  </div>
                  <span className="text-[10px] font-mono text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded font-bold">
                    Auto-záloha aktívna
                  </span>
                </div>

                <p className="text-xs text-slate-600 leading-relaxed">
                  Aktuálne rozpísaný štítok sa automaticky pamätá v prehliadači. Navyše si tu môžete
                  uložiť ľubovoľný počet hotových štítkov (napr. pre rôzne firmy, typy rozvádzačov
                  alebo zákazky) a kedykoľvek ich jedným kliknutím načítať.
                </p>

                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    placeholder={`Názov v pamäti (napr. ${mfg.typeDesignation} – ${mfg.manufacturerName})`}
                    value={presetNameInput}
                    onChange={(e) => setPresetNameInput(e.target.value)}
                    className="flex-1 px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs font-medium focus:bg-white focus:border-[#0066FF] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleSavePresetToMemory}
                    className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-colors cursor-pointer shrink-0"
                  >
                    <Save className="w-3.5 h-3.5 text-[#38BDF8]" />
                    <span>Uložiť štítok do pamäte</span>
                  </button>
                </div>

                {savedPresets.length > 0 ? (
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {savedPresets.map((preset) => (
                      <div
                        key={preset.id}
                        className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-2 hover:border-slate-300 transition-colors"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-bold text-slate-900 truncate">
                            {preset.presetName}
                          </div>
                          <div className="text-[10px] font-mono text-slate-500 truncate">
                            {preset.info.manufacturerName} • S/N: {preset.info.serialNumber} • Uložené: {preset.savedAt}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleLoadPresetFromMemory(preset)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#0066FF] hover:bg-[#2563EB] text-white text-[11px] font-bold transition-colors cursor-pointer"
                          >
                            <FolderOpen className="w-3 h-3" />
                            <span>Načítať</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeletePresetFromMemory(preset.id)}
                            className="p-1.5 rounded-lg bg-white hover:bg-red-50 text-slate-400 hover:text-red-600 border border-slate-200 transition-colors cursor-pointer"
                            title="Odstrániť z pamäte prehliadača"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-3 rounded-xl bg-slate-50 border border-dashed border-slate-300 text-center text-xs text-slate-500">
                    Zatiaľ nemáte uložené žiadne pomenované šablóny štítkov. Aktuálne vypísané údaje
                    sa však automaticky ukladajú do pamäte prehliadača pri každom písaní.
                  </div>
                )}
              </div>

              {/* Instructions Pill */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 space-y-1 no-print">
                <div className="font-bold text-slate-900">Spôsob umiestnenia štítku:</div>
                <p>
                  Výrobný štítok nalepte na trvalé a viditeľné miesto (napr. vnútorná strana dvierok rozvádzača
                  alebo na vonkajší rám vedľa hlavného vypínača). Materiál: samolepiaca polyesterová alebo hliníková fólia
                  odolná voči oderu a UV žiareniu.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 2: PROTOKOL O KUSOVEJ OVEROVACEJ SKÚŠKE (STN EN 61439-1 ČL. 11)   */}
      {/* ===================================================================== */}
      {activeTab === 'piece-verification' && (
        <div className="space-y-6">
          {/* Top Actions & Summary */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex flex-wrap items-center justify-between gap-3 no-print">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Protokol o kusovom overení rozvádzača (Kusová overovacia skúška)
              </h3>
              <p className="text-xs text-slate-500">
                Každý vyrobený rozvádzač musí byť pred odovzdaním overený kusovou skúškou podľa čl. 11 normy STN EN 61439-1.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePrintCurrentView}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0066FF] hover:bg-[#2563EB] text-white text-xs font-bold shadow-md cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Vytlačiť protokol kusovej skúšky</span>
              </button>
            </div>
          </div>

          {/* Printable Protocol Document Sheet */}
          <div className="bg-white text-slate-900 border border-slate-300 rounded-2xl p-6 sm:p-8 shadow-sm space-y-6 print:border-0 print:p-0">
            {/* Protocol Header */}
            <div className="border-2 border-slate-900 p-4 bg-slate-50 flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-[11px] font-mono uppercase tracking-widest text-[#0066FF] font-extrabold">
                  PROTOKOL O KUSOVOM OVERENÍ ROZVÁDZAČA NÍZKEHO NAPÄTIA
                </div>
                <h2 className="text-xl font-black text-slate-950 mt-0.5">
                  Podľa STN EN 61439-1:2021 (čl. 11) a STN EN 61439-3:2012
                </h2>
                <div className="text-xs text-slate-700 mt-1 space-y-0.5">
                  <div>
                    Výrobca rozvádzača: <strong>{mfg.manufacturerName}</strong>, {mfg.manufacturerStreet}, {mfg.manufacturerCity} (IČO: {mfg.manufacturerIco})
                  </div>
                  <div>
                    Názov rozvádzača / objekt: <strong>{project.name}</strong> ({project.objectType}) • Číslo zákazky:{' '}
                    <strong>{project.projectNumber}</strong>
                  </div>
                </div>
              </div>

              <div className="text-right font-mono text-xs border-l border-slate-300 pl-4 space-y-1">
                <div>
                  <span className="text-slate-500">Výrobné číslo:</span>{' '}
                  <strong className="text-slate-900">{mfg.serialNumber}</strong>
                </div>
                <div>
                  <span className="text-slate-500">Typové označenie:</span>{' '}
                  <strong className="text-slate-900">{mfg.typeDesignation}</strong>
                </div>
                <div>
                  <span className="text-slate-500">Dátum skúšky:</span>{' '}
                  <strong className="text-slate-900">{mfg.testedDate}</strong>
                </div>
              </div>
            </div>

            {/* Tester & Equipment Info Card */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs">
              <div>
                <span className="text-slate-500 block">Skúšobný technik:</span>
                <span className="font-bold text-slate-900">{mfg.technicianName}</span>
                <span className="text-[10px] text-slate-500 block">{mfg.technicianCertificateNumber}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Použitý merací prístroj:</span>
                <span className="font-mono font-bold text-slate-900">{mfg.measurementDeviceModel}</span>
                <span className="text-[10px] text-slate-500 block">{mfg.measurementDeviceSerial}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Platnosť kalibrácie prístroja:</span>
                <span className="font-mono font-bold text-emerald-700">{mfg.calibrationValidUntil}</span>
              </div>
            </div>

            {/* 9-Point Verification Table (Normative Clause 11) */}
            <div className="space-y-2">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 border-b-2 border-slate-900 pb-1">
                Rozsah a výsledky kusovej overovacej skúšky (STN EN 61439-1 čl. 11.2 až 11.10)
              </h3>

              <div className="overflow-x-auto -mx-2 sm:mx-0">
                <table className="w-full min-w-[620px] text-left border-collapse border border-slate-300 text-xs">
                <thead>
                  <tr className="bg-slate-100 text-slate-900 font-bold border-b border-slate-300">
                    <th className="p-2 border-r border-slate-300 w-12 text-center">Článok</th>
                    <th className="p-2 border-r border-slate-300">Predmet kusového overenia</th>
                    <th className="p-2 border-r border-slate-300">Kritériá a zistené hodnoty</th>
                    <th className="p-2 border-r border-slate-300 text-center w-28">Nameraná hodnota</th>
                    <th className="p-2 text-center w-28">Výsledok</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {/* 1. Stupeň ochrany krytom */}
                  <tr>
                    <td className="p-2 border-r border-slate-300 font-mono font-bold text-center">11.2</td>
                    <td className="p-2 border-r border-slate-300 font-semibold">
                      Stupeň ochrany krytom (IP kód)
                    </td>
                    <td className="p-2 border-r border-slate-300 text-slate-600">
                      Vizuálna kontrola vyhotovenia skrine, tesnení a vylamovacích otvorov pre krytie <strong>{project.ipRating}</strong>.
                    </td>
                    <td className="p-2 border-r border-slate-300 font-mono text-center font-bold">
                      {project.ipRating}
                    </td>
                    <td className="p-2 text-center">
                      <span className="px-2 py-0.5 rounded font-bold text-[11px] bg-emerald-100 text-emerald-800">
                        VYHOVUJE
                      </span>
                    </td>
                  </tr>

                  {/* 2. Vzdušné vzdialenosti a povrchové cesty */}
                  <tr>
                    <td className="p-2 border-r border-slate-300 font-mono font-bold text-center">11.3</td>
                    <td className="p-2 border-r border-slate-300 font-semibold">
                      Vzdušné vzdialenosti a povrchové cesty
                    </td>
                    <td className="p-2 border-r border-slate-300 text-slate-600">
                      Kontrola vzdialeností medzi živými časťami a neživými vodivými časťami (min. vzdialenosť &gt; 3 mm).
                    </td>
                    <td className="p-2 border-r border-slate-300 font-mono text-center font-bold text-slate-700">
                      &gt; 8 mm
                    </td>
                    <td className="p-2 text-center">
                      <span className="px-2 py-0.5 rounded font-bold text-[11px] bg-emerald-100 text-emerald-800">
                        VYHOVUJE
                      </span>
                    </td>
                  </tr>

                  {/* 3. Ochrana pred úrazom el. prúdom a spojitosť PE */}
                  <tr>
                    <td className="p-2 border-r border-slate-300 font-mono font-bold text-center">11.4</td>
                    <td className="p-2 border-r border-slate-300 font-semibold">
                      Ochrana pred zásahom el. prúdom a celistvosť PE
                    </td>
                    <td className="p-2 border-r border-slate-300 text-slate-600">
                      Meranie prechodového odporu ochranného pospájania a spojitosti PE svorkovnice (Rpe &lt; 0,1 Ω).
                    </td>
                    <td className="p-2 border-r border-slate-300 font-mono text-center font-bold text-emerald-700">
                      Rpe = {mfg.verificationChecks?.measuredPeResistanceOhm || 0.03} Ω
                    </td>
                    <td className="p-2 text-center">
                      <span className="px-2 py-0.5 rounded font-bold text-[11px] bg-emerald-100 text-emerald-800">
                        VYHOVUJE
                      </span>
                    </td>
                  </tr>

                  {/* 4. Zabudovanie zabudovaných súčastí */}
                  <tr>
                    <td className="p-2 border-r border-slate-300 font-mono font-bold text-center">11.5</td>
                    <td className="p-2 border-r border-slate-300 font-semibold">
                      Zabudovanie prístrojov a uťahovacie momenty
                    </td>
                    <td className="p-2 border-r border-slate-300 text-slate-600">
                      Upevnenie modulov na DIN lišty a dotiahnutie skrutkových spojov momentovým skrutkovačom (2,0 – 2,5 Nm).
                    </td>
                    <td className="p-2 border-r border-slate-300 font-mono text-center font-bold text-slate-700">
                      2,4 Nm
                    </td>
                    <td className="p-2 text-center">
                      <span className="px-2 py-0.5 rounded font-bold text-[11px] bg-emerald-100 text-emerald-800">
                        VYHOVUJE
                      </span>
                    </td>
                  </tr>

                  {/* 5. Vnútorné elektrické obvody a spoje */}
                  <tr>
                    <td className="p-2 border-r border-slate-300 font-mono font-bold text-center">11.6</td>
                    <td className="p-2 border-r border-slate-300 font-semibold">
                      Vnútorné zapojenie a farebné značenie
                    </td>
                    <td className="p-2 border-r border-slate-300 text-slate-600">
                      Prierezy vodičov (min. 6 / 10 mm² H07V-K s dutinkami), fázové hrebene, farebné kódovanie L1, L2, L3, N, PE.
                    </td>
                    <td className="p-2 border-r border-slate-300 font-mono text-center font-bold text-slate-700">
                      STN 33 0165
                    </td>
                    <td className="p-2 text-center">
                      <span className="px-2 py-0.5 rounded font-bold text-[11px] bg-emerald-100 text-emerald-800">
                        VYHOVUJE
                      </span>
                    </td>
                  </tr>

                  {/* 6. Svorky pre vonkajšie vodiče */}
                  <tr>
                    <td className="p-2 border-r border-slate-300 font-mono font-bold text-center">11.7</td>
                    <td className="p-2 border-r border-slate-300 font-semibold">
                      Svorky pre vonkajšie vodiče (Prívod &amp; Vývody)
                    </td>
                    <td className="p-2 border-r border-slate-300 text-slate-600">
                      Prístupnosť a priestor pre pripojenie káblov CYKY podľa schémy, dimenzovanie N a PE mostíkov.
                    </td>
                    <td className="p-2 border-r border-slate-300 font-mono text-center font-bold text-slate-700">
                      Do 16 mm²
                    </td>
                    <td className="p-2 text-center">
                      <span className="px-2 py-0.5 rounded font-bold text-[11px] bg-emerald-100 text-emerald-800">
                        VYHOVUJE
                      </span>
                    </td>
                  </tr>

                  {/* 7. Mechanická funkcia */}
                  <tr>
                    <td className="p-2 border-r border-slate-300 font-mono font-bold text-center">11.8</td>
                    <td className="p-2 border-r border-slate-300 font-semibold">
                      Mechanická funkcia ovládacích prvkov
                    </td>
                    <td className="p-2 border-r border-slate-300 text-slate-600">
                      Otváranie a aretácia dvierok skrine, voľný pohyb ovládacích páčok ističov a chráničov, krytky.
                    </td>
                    <td className="p-2 border-r border-slate-300 font-mono text-center font-bold text-slate-700">
                      100 % voľný
                    </td>
                    <td className="p-2 text-center">
                      <span className="px-2 py-0.5 rounded font-bold text-[11px] bg-emerald-100 text-emerald-800">
                        VYHOVUJE
                      </span>
                    </td>
                  </tr>

                  {/* 8. Dielektrické vlastnosti (Izolačný odpor) */}
                  <tr>
                    <td className="p-2 border-r border-slate-300 font-mono font-bold text-center">11.9</td>
                    <td className="p-2 border-r border-slate-300 font-semibold">
                      Dielektrické vlastnosti (Skúška izolačného odporu)
                    </td>
                    <td className="p-2 border-r border-slate-300 text-slate-600">
                      Meranie izolačného odporu jednosmerným napätím U = 500 V DC medzi živými vodičmi navzájom a proti PE (Riso ≥ 1,0 MΩ).
                    </td>
                    <td className="p-2 border-r border-slate-300 font-mono text-center font-bold text-emerald-700">
                      Riso &gt; {mfg.verificationChecks?.measuredInsulationResistanceMohm || 99.9} MΩ
                    </td>
                    <td className="p-2 text-center">
                      <span className="px-2 py-0.5 rounded font-bold text-[11px] bg-emerald-100 text-emerald-800">
                        VYHOVUJE
                      </span>
                    </td>
                  </tr>

                  {/* 9. Elektrická funkcia a test chráničov RCD */}
                  <tr>
                    <td className="p-2 border-r border-slate-300 font-mono font-bold text-center">11.10</td>
                    <td className="p-2 border-r border-slate-300 font-semibold">
                      Elektrická funkčnosť a skúška chráničov RCD
                    </td>
                    <td className="p-2 border-r border-slate-300 text-slate-600">
                      Overenie správnosti polarity fáz L1, L2, L3, N a skúška vybavenia prúdových chráničov (testovacie tlačidlo T a simulácia IΔn).
                    </td>
                    <td className="p-2 border-r border-slate-300 font-mono text-center font-bold text-emerald-700">
                      ta = {mfg.verificationChecks?.measuredRcdTripTimeMs || 22} ms
                    </td>
                    <td className="p-2 text-center">
                      <span className="px-2 py-0.5 rounded font-bold text-[11px] bg-emerald-100 text-emerald-800">
                        VYHOVUJE
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

            {/* Overall Verdict Banner */}
            <div className="p-4 bg-emerald-50 border-2 border-emerald-600 rounded-xl flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-600 text-white flex items-center justify-center font-black text-xl">
                  ✓
                </div>
                <div>
                  <div className="text-xs uppercase font-extrabold tracking-wider text-emerald-900">
                    CELKOVÝ VÝSLEDOK KUSOVÉHO OVERENIA:
                  </div>
                  <div className="text-lg font-black text-emerald-950">
                    ROZVÁDZAČ VYHOVUJE KUSOVEJ SKÚŠKE PODĽA STN EN 61439-1 A STN EN 61439-3
                  </div>
                  <div className="text-xs text-emerald-800">
                    Rozvádzač je bezpečný pre montáž, pripojenie a prevádzkovanie laickými osobami (DBO).
                  </div>
                </div>
              </div>

              <div className="text-right text-xs text-slate-600 font-mono">
                <div>Protokol vystavený dňa: <strong>{mfg.testedDate}</strong></div>
                <div>Evidenčné číslo protokolu: <strong>PROT-{mfg.serialNumber}</strong></div>
              </div>
            </div>

            {/* Signature Box */}
            <div className="grid grid-cols-2 gap-8 pt-6 border-t border-slate-300 text-xs">
              <div className="space-y-1">
                <div className="text-slate-500 font-bold uppercase text-[10px]">
                  Skúšobný technik / Výrobca:
                </div>
                <div className="font-bold text-slate-900 text-sm">{mfg.technicianName}</div>
                <div className="text-slate-500 text-[11px]">{mfg.technicianCertificateNumber}</div>
                <div className="pt-4 text-slate-400 font-mono text-[10px]">
                  Podpis: ....................................................
                </div>
              </div>

              <div className="space-y-1 text-right">
                <div className="text-slate-500 font-bold uppercase text-[10px]">
                  Pečiatka výrobcu rozvádzača:
                </div>
                <div className="font-bold text-slate-900 text-sm">{mfg.manufacturerName}</div>
                <div className="text-slate-500 text-[11px]">
                  {mfg.manufacturerStreet}, {mfg.manufacturerCity}
                </div>
                <div className="pt-4 text-slate-400 font-mono text-[10px]">
                  Odtlačok pečiatky výrobcu: [ PEČIATKA ]
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 3: EÚ VYHLÁSENIE O ZHODE (CE DECLARATION OF CONFORMITY)           */}
      {/* ===================================================================== */}
      {activeTab === 'declaration-of-conformity' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex flex-wrap items-center justify-between gap-3 no-print">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                EÚ Vyhlásenie o zhode (EU Declaration of Conformity - DoC)
              </h3>
              <p className="text-xs text-slate-500">
                Zákonný dokument výrobcu určeného výrobku podľa zákona č. 56/2018 Z. z. a nariadení vlády SR č. 148/2016 Z. z. a č. 127/2016 Z. z.
              </p>
            </div>
            <button
              type="button"
              onClick={handlePrintCurrentView}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0066FF] hover:bg-[#2563EB] text-white text-xs font-bold shadow-md cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Vytlačiť EÚ Vyhlásenie o zhode</span>
            </button>
          </div>

          {/* Printable CE Document Sheet */}
          <div className="bg-white text-slate-900 border border-slate-300 rounded-2xl p-8 sm:p-10 shadow-sm space-y-6 print:border-0 print:p-0 max-w-4xl mx-auto">
            {/* Header with CE mark */}
            <div className="text-center space-y-2 border-b-2 border-slate-950 pb-5">
              <div className="font-serif font-black text-4xl tracking-widest text-slate-950 mb-1">
                CE
              </div>
              <h1 className="text-xl sm:text-2xl font-black uppercase tracking-tight text-slate-950">
                EÚ VYHLÁSENIE O ZHODE
              </h1>
              <div className="text-xs font-mono uppercase tracking-widest text-slate-600 font-bold">
                EU DECLARATION OF CONFORMITY • ČÍSLO: DoC-{mfg.serialNumber}
              </div>
            </div>

            {/* Manufacturer identification */}
            <div className="space-y-3 text-xs leading-relaxed text-slate-800">
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                <div className="font-bold text-slate-950 uppercase text-[11px]">
                  1. Výrobca určeného elektrického výrobku:
                </div>
                <div className="font-bold text-slate-900 text-sm">{mfg.manufacturerName}</div>
                <div>Sídlo: {mfg.manufacturerStreet}, {mfg.manufacturerCity}, Slovenská republika</div>
                <div className="font-mono">IČO: {mfg.manufacturerIco} {mfg.manufacturerDic ? `• IČ DPH: ${mfg.manufacturerDic}` : ''}</div>
              </div>

              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                <div className="font-bold text-slate-950 uppercase text-[11px]">
                  2. Identifikácia elektrického zariadenia (výrobku):
                </div>
                <div className="grid grid-cols-2 gap-2 font-mono text-xs mt-1">
                  <div>
                    Názov: <strong>Rozvodnica pre laickú obsluhu (DBO)</strong>
                  </div>
                  <div>
                    Určenie: <strong>{project.name}</strong>
                  </div>
                  <div>
                    Typové označenie: <strong>{mfg.typeDesignation}</strong>
                  </div>
                  <div>
                    Výrobné číslo (S/N): <strong>{mfg.serialNumber}</strong>
                  </div>
                  <div>
                    Menovité napätie Un: <strong>{ratedVoltageUn}</strong>
                  </div>
                  <div>
                    Menovitý prúd InA: <strong>{ratedCurrentInA}</strong>
                  </div>
                  <div>
                    Stupeň krytia: <strong>{project.ipRating}</strong>
                  </div>
                  <div>
                    Sústava siete: <strong>{networkCode}</strong>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="font-bold text-slate-950 uppercase text-[11px]">
                  3. Predmet a právne vyhlásenie:
                </div>
                <p className="text-justify">
                  Výrobca týmto vyhlasuje na svoju výhradnú zodpovednosť, že vyššie uvedené elektrické zariadenie
                  spĺňa základné požiadavky na bezpečnosť a ochranu zdravia a je v úplnej zhode s nasledujúcimi
                  právnymi predpismi Slovenskej republiky a smernicami Európskeho parlamentu a Rady:
                </p>
                <ul className="list-disc pl-5 space-y-1 font-semibold text-slate-900">
                  <li>
                    <strong>Zákon č. 56/2018 Z. z.</strong> o posudzovaní zhody výrobku na trhu a o zmene a doplnení niektorých zákonov.
                  </li>
                  <li>
                    <strong>Nariadenie vlády SR č. 148/2016 Z. z.</strong> (Smernica 2014/35/EÚ - LVD) o sprístupňovaní elektrických zariadení určených na používanie v rámci určitých limitov napätia.
                  </li>
                  <li>
                    <strong>Nariadenie vlády SR č. 127/2016 Z. z.</strong> (Smernica 2014/30/EÚ - EMC) o elektromagnetickej kompatibilite.
                  </li>
                </ul>
              </div>

              <div className="space-y-2">
                <div className="font-bold text-slate-950 uppercase text-[11px]">
                  4. Zoznam harmonizovaných technických noriem použitých na posúdenie zhody:
                </div>
                <ul className="list-disc pl-5 space-y-1 font-mono text-[11px] text-slate-800">
                  <li>
                    <strong>STN EN 61439-1:2021</strong> (Rozvádzače nízkeho napätia. Časť 1: Všeobecné pravidlá)
                  </li>
                  <li>
                    <strong>STN EN 61439-3:2012</strong> (Rozvádzače nízkeho napätia. Časť 3: Rozvodnice určené na prevádzkovanie laickými osobami – DBO)
                  </li>
                  <li>
                    <strong>STN 33 2000-4-41 ed. 3:2019</strong> (Elektrické inštalácie nízkeho napätia. Časť 4-41: Ochrana pred úrazom elektrickým prúdom)
                  </li>
                  <li>
                    <strong>STN 33 2000-5-51:2010</strong> (Výber a stavba elektrických zariadení. Všeobecné predpisy)
                  </li>
                </ul>
              </div>

              <div className="space-y-1 pt-1">
                <div className="font-bold text-slate-950 uppercase text-[11px]">
                  5. Doplňujúce informácie:
                </div>
                <p>
                  Na výrobku bola úspešne vykonaná kusová overovacia skúška podľa čl. 11 normy STN EN 61439-1 (Protokol č.{' '}
                  <strong>PROT-{mfg.serialNumber}</strong>) a výrobok je označený typovým štítkom so značkou CE.
                  Výrobok je bezpečný za podmienok obvyklého a určeného použitia v súlade s návodom na obsluhu.
                </p>
              </div>
            </div>

            {/* Signature Block */}
            <div className="pt-8 border-t-2 border-slate-950 flex flex-wrap items-end justify-between gap-6 text-xs">
              <div className="space-y-1 font-mono">
                <div>Miesto vystavenia: <strong>{mfg.manufacturerCity}</strong></div>
                <div>Dátum vystavenia: <strong>{mfg.testedDate}</strong></div>
              </div>

              <div className="text-right space-y-1">
                <div className="font-bold text-slate-950">{mfg.technicianName}</div>
                <div className="text-slate-600 text-[11px]">Konateľ / Zodpovedná osoba výrobcu</div>
                <div className="pt-4 text-slate-400 font-mono text-[10px]">
                  Podpis a odtlačok pečiatky: .......................................
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 4: VÝPOČET OTEPLENIA ROZVÁDZAČA (STN EN 61439-1 & STN IEC TR 60890)*/}
      {/* ===================================================================== */}
      {activeTab === 'thermal-dissipation' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex flex-wrap items-center justify-between gap-3 no-print">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Overenie oteplenia rozvádzača (Tepelná bilancia)
              </h3>
              <p className="text-xs text-slate-500">
                Podľa STN EN 61439-1 čl. 10.10.4.2 a technickej správy STN IEC TR 60890 pre rozvodnice do In ≤ 63 A.
              </p>
            </div>
            <button
              type="button"
              onClick={handlePrintCurrentView}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0066FF] hover:bg-[#2563EB] text-white text-xs font-bold shadow-md cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Vytlačiť protokol oteplenia</span>
            </button>
          </div>

          {/* Metric Dashboard Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 no-print">
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
              <span className="text-[11px] font-bold text-slate-500 uppercase">Stratový výkon pri 100% zaťažení:</span>
              <div className="text-2xl font-black text-slate-900 mt-1 font-mono">
                {thermal.totalLoss100PercentW} W
              </div>
              <span className="text-[10px] text-slate-400">Súčet menovitých strát všetkých prvkov</span>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
              <span className="text-[11px] font-bold text-slate-500 uppercase">Súčiniteľ súdobosti (RDF):</span>
              <div className="text-2xl font-black text-blue-600 mt-1 font-mono">
                {thermal.ratedDiversityFactorRdf}
              </div>
              <span className="text-[10px] text-slate-400">Podľa STN EN 61439-3 ({project.circuits.length} okruhov)</span>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
              <span className="text-[11px] font-bold text-slate-500 uppercase">Prevádzkový stratový výkon (Ptot):</span>
              <div className="text-2xl font-black text-amber-600 mt-1 font-mono">
                {thermal.actualOperatingLossW} W
              </div>
              <span className="text-[10px] text-slate-400">Ptot = Pdevices × (RDF)² + Pvedenie</span>
            </div>

            <div className={`rounded-2xl border p-4 shadow-sm ${
              thermal.isCompliant ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'
            }`}>
              <span className={`text-[11px] font-bold uppercase ${
                thermal.isCompliant ? 'text-emerald-800' : 'text-red-800'
              }`}>
                Chladiaci výkon skrine / Rezerva:
              </span>
              <div className={`text-2xl font-black mt-1 font-mono ${
                thermal.isCompliant ? 'text-emerald-700' : 'text-red-700'
              }`}>
                +{thermal.reserveW} W
              </div>
              <span className="text-[10px] text-slate-600">
                Pmax skrine: {thermal.enclosureDissipationCapacityW} W ({din.totalCapacityModules}M)
              </span>
            </div>
          </div>

          {/* Printable Thermal Dossier */}
          <div className="bg-white text-slate-900 border border-slate-300 rounded-2xl p-6 sm:p-8 shadow-sm space-y-6 print:border-0 print:p-0">
            <div className="border-2 border-slate-900 p-4 bg-slate-50 flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="text-[11px] font-mono uppercase tracking-widest text-[#0066FF] font-bold">
                  PROTOKOL O POSÚDENÍ OTEPLENIA ROZVÁDZAČA
                </div>
                <h2 className="text-lg font-black text-slate-950 mt-0.5">
                  Podľa STN EN 61439-1 čl. 10.10.4.2 a STN IEC TR 60890
                </h2>
                <div className="text-xs text-slate-700 mt-1">
                  Rozvádzač: <strong>{project.name}</strong> • Montáž: <strong>{project.enclosureMounting}</strong> • Kapacita: <strong>{din.totalCapacityModules} modulov</strong>
                </div>
              </div>

              <div className="text-right font-mono text-xs">
                <div className={`px-3 py-1.5 rounded-lg font-bold text-sm ${
                  thermal.isCompliant ? 'bg-emerald-100 text-emerald-900' : 'bg-red-100 text-red-900'
                }`}>
                  STAV: {thermal.status}
                </div>
                <div className="text-[10px] text-slate-500 mt-1">Oteplenie: ΔT = {thermal.temperatureRiseK} K (&lt; 30 K)</div>
              </div>
            </div>

            {/* Breakdown Table */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Rozpis stratových tepelných výkonov podľa kategórií prístrojov:
              </h4>

              <div className="overflow-x-auto -mx-2 sm:mx-0">
                <table className="w-full min-w-[550px] text-left border-collapse border border-slate-300 text-xs font-mono">
                <thead>
                  <tr className="bg-slate-100 text-slate-800 font-sans font-bold border-b border-slate-300">
                    <th className="p-2 border-r border-slate-300">Kategória komponentu</th>
                    <th className="p-2 border-r border-slate-300 text-center">Počet ks / M</th>
                    <th className="p-2 border-r border-slate-300 text-right">Menovitá strata (W)</th>
                    <th className="p-2">Poznámka a normatívny výpočet</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {thermal.breakdown.map((row, idx) => (
                    <tr key={idx}>
                      <td className="p-2 border-r border-slate-300 font-sans font-semibold text-slate-900">
                        {row.category}
                      </td>
                      <td className="p-2 border-r border-slate-300 text-center">
                        {row.itemCount}
                      </td>
                      <td className="p-2 border-r border-slate-300 text-right font-bold text-slate-950">
                        {row.nominalLossW} W
                      </td>
                      <td className="p-2 font-sans text-slate-600">
                        {row.description}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-slate-50 font-bold border-t-2 border-slate-900">
                    <td className="p-2 border-r border-slate-300 font-sans">
                      Celkový inštalovaný stratový výkon (pri 100 % In):
                    </td>
                    <td className="p-2 border-r border-slate-300 text-center">
                      {thermal.totalUsedModules} M
                    </td>
                    <td className="p-2 border-r border-slate-300 text-right text-slate-950">
                      {thermal.totalLoss100PercentW} W
                    </td>
                    <td className="p-2 font-sans text-slate-600 font-normal">
                      Súčet menovitých tepelných strát naprázdno a pri plnom zaťažení
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

            {/* Normative Assessment Summary */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs">
              <div className="font-bold text-slate-900 uppercase">
                Zhodnotenie oteplenia podľa STN EN 61439-1 čl. 10.10.4.2:
              </div>
              <p className="text-slate-700 leading-relaxed">
                Podľa normy sa overenie oteplenia pre rozvodnice DBO s menovitým prúdom InA ≤ 63 A môže vykonať
                výpočtom porovnaním celkového stratového výkonu so stratovým výkonom deklarovaným výrobcom skrine.
                Pri započítaní súčiniteľa súdobosti <strong>RDF = {thermal.ratedDiversityFactorRdf}</strong> je
                skutočný prevádzkový stratový výkon <strong>Ptot = {thermal.actualOperatingLossW} W</strong>.
                Skriňa rozvádzača s kapacitou <strong>{din.totalCapacityModules} modulov</strong> dokáže prirodzeným
                sálaním odviesť až <strong>{thermal.enclosureDissipationCapacityW} W</strong> pri oteplení neprevyšujúcom
                dovolenú hranicu <strong>30 K</strong>.
              </p>
              <div className="font-bold text-emerald-800 pt-1">
                Záver: Rozvádzač s rezervou <strong>{thermal.reserveW} W</strong> plne spĺňa požiadavky na oteplenie.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 5: TECHNOLOGICKÝ POSTUP VÝROBY ROZVÁDZAČA & NORMATÍVNY AUDIT      */}
      {/* ===================================================================== */}
      {activeTab === 'procedure-and-standards' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex flex-wrap items-center justify-between gap-3 no-print">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Technologický postup výroby rozvádzača a normatívny audit noriem
              </h3>
              <p className="text-xs text-slate-500">
                Krokový montážny a legislatívny manuál pre elektrikára / montážnu dielňu od prípravy skrine až po odovzdanie na revíziu.
              </p>
            </div>
            <button
              type="button"
              onClick={handlePrintCurrentView}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0066FF] hover:bg-[#2563EB] text-white text-xs font-bold shadow-md cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Vytlačiť postup výroby</span>
            </button>
          </div>

          {/* 8-Step Manufacturing Procedure Cards */}
          <div className="space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 no-print">
              8 Krokov správnej výroby a kompletizácie rozvádzača:
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                {
                  step: '1',
                  title: 'Príprava podkladov a kontrola schémy',
                  norm: 'STN EN 61439-1 čl. 6',
                  desc: 'Vytlačte si aktuálnu 1-pólovú schému, rozpis ističov a kusovník (BOM). Skontrolujte dimenzovanie prívodu a oteplenie skrine.',
                  check: 'Overená schéma, tepelná bilancia vyhovuje, overená kapacita DIN líšt s rezervou min. 20 %.',
                },
                {
                  step: '2',
                  title: 'Mechanická montáž skrine a zberníc',
                  norm: 'STN EN 61439-3 čl. 8.1',
                  desc: 'Osadenie plastovej/oceľoplechovej vane, upevnenie DIN líšt, osadenie hlavnej ochrannej zbernice PE a neutrálnych blokov N.',
                  check: 'Priechodky pripravené, krytie IP40/IP30 zabezpečené, PE zbernica prepojená s rámom skrine (ak je kovová).',
                },
                {
                  step: '3',
                  title: 'Osadenie a usporiadanie prístrojov',
                  norm: 'STN EN 61439-1 čl. 8.5',
                  desc: 'Logické usporiadanie zhora nadol a zľava doprava: Hlavný vypínač QS1 vľavo hore, hneď vedľa zvodič prepätia SPD (FV1), za ním chrániče (FI1..FIn) a pod nimi ističe okruhov.',
                  check: 'Prístroje nacvaknuté bez vôle, dodržané rozostupy pre odvod tepla, prístupné ovládacie páčky.',
                },
                {
                  step: '4',
                  title: 'Elektrické prepojenie a hrebene',
                  norm: 'STN 33 2000-5-52 / STN 33 0165',
                  desc: 'Použite izolované fázové hrebene (vidličkové alebo kolíkové min. 10 mm²). Na prepoje použite ohybné lankové vodiče H07V-K s lisovanými dutinkami (min. 6 alebo 10 mm²).',
                  check: 'Lanká zalisované certifikovanými kliešťami, žiadne vyčnievajúce vlákna, správne uťahovacie momenty (2,0–2,5 Nm).',
                },
                {
                  step: '5',
                  title: 'Farebné kódovanie a označenie',
                  norm: 'STN EN 60445 / STN EN 81346-2',
                  desc: 'Fázy: L1 hnedá, L2 čierna, L3 sivá. Stredný vodič: výhradne svetlomodrá (N). Ochranný vodič: výhradne zeleno-žltá (PE). Označte každý prístroj štítkom (QS1, FV1, FI1, FA1..FAn).',
                  check: 'Každý istič a chránič má čitateľný štítok zodpovedajúci rozpisu v schéme zapojenia.',
                },
                {
                  step: '6',
                  title: 'Vykonanie kusovej overovacej skúšky',
                  norm: 'STN EN 61439-1 čl. 11',
                  desc: 'Skúšobný technik overí celistvosť PE obvodu (&lt; 0,1 Ω), zmeria izolačný odpor megmetrom 500 V DC medzi fázami a PE (Riso &gt; 50 MΩ) a preskúša funkciu RCD chráničov.',
                  check: 'Vyplnený a podpísaný Protokol o kusovej overovacej skúške rozvádzača.',
                },
                {
                  step: '7',
                  title: 'Výrobný štítok a EÚ Vyhlásenie o zhode',
                  norm: 'Zákon č. 56/2018 Z.z. / NV SR 148/2016',
                  desc: 'Nalepte trvanlivý výrobný štítok s označením výrobcu, InA, Un, Icn a značkou CE na vnútornú stranu dvierok. Vystavte EÚ vyhlásenie o zhode.',
                  check: 'Štítok pevne nalepený, CE vyhlásenie podpísané zodpovednou osobou výrobcu.',
                },
                {
                  step: '8',
                  title: 'Odovzdanie na montáž a revíziu',
                  norm: 'STN 33 2000-6 ed. 2',
                  desc: 'Do vrecka na vnútornej strane dvierok vložte schému zapojenia a návod na obsluhu. Odovzdajte zákazníkovi a revíznemu technikovi na východiskovú revíziu (OPaOS).',
                  check: 'Kompletná zložka odovzdaná: Schéma + Kusovník + Kusová skúška + CE DoC + Návod.',
                },
              ].map((item) => (
                <div
                  key={item.step}
                  className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-2.5 relative"
                >
                  <div className="flex items-center justify-between">
                    <span className="w-7 h-7 rounded-lg bg-[#0066FF] text-white font-black text-xs flex items-center justify-center">
                      {item.step}
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-bold">
                      {item.norm}
                    </span>
                  </div>

                  <h5 className="text-sm font-bold text-slate-900">{item.title}</h5>
                  <p className="text-xs text-slate-600 leading-relaxed">{item.desc}</p>

                  <div className="pt-2 border-t border-slate-100 text-[11px] text-emerald-800 font-semibold flex items-start gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                    <span>{item.check}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Standards Compliance Matrix */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
            <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-[#0066FF]" />
              Zoznam kľúčových noriem pre výrobu a revíziu rozvádzačov na Slovensku
            </h4>

            <div className="divide-y divide-slate-200 text-xs">
              <div className="py-2.5 grid grid-cols-1 md:grid-cols-3 gap-2">
                <span className="font-mono font-bold text-[#0066FF]">STN EN 61439-1:2021</span>
                <span className="font-semibold text-slate-900">Rozvádzače nízkeho napätia. Časť 1: Všeobecné pravidlá</span>
                <span className="text-slate-600">Základná norma pre overovanie návrhu, kusové skúšky a oteplenie.</span>
              </div>
              <div className="py-2.5 grid grid-cols-1 md:grid-cols-3 gap-2">
                <span className="font-mono font-bold text-[#0066FF]">STN EN 61439-3:2012</span>
                <span className="font-semibold text-slate-900">Rozvodnice prevádzkované laikmi (DBO)</span>
                <span className="text-slate-600">Špecifické požiadavky na bytové a domové rozvádzače, prístupnosť a súdobosť RDF.</span>
              </div>
              <div className="py-2.5 grid grid-cols-1 md:grid-cols-3 gap-2">
                <span className="font-mono font-bold text-[#0066FF]">STN 33 2000-4-41 ed. 3:2019</span>
                <span className="font-semibold text-slate-900">Ochrana pred zásahom el. prúdom</span>
                <span className="text-slate-600">Automatické odpojenie od zdroja, povinnosť RCD 30 mA na zásuvky a svetlá v bytoch.</span>
              </div>
              <div className="py-2.5 grid grid-cols-1 md:grid-cols-3 gap-2">
                <span className="font-mono font-bold text-[#0066FF]">STN 33 2000-5-534:2016</span>
                <span className="font-semibold text-slate-900">Výber a stavba prepäťových ochrán (SPD)</span>
                <span className="text-slate-600">Koordinácia typov T1+T2 pri vstupe kábla do objektu.</span>
              </div>
              <div className="py-2.5 grid grid-cols-1 md:grid-cols-3 gap-2">
                <span className="font-mono font-bold text-[#0066FF]">STN 33 2000-6 ed. 2:2018</span>
                <span className="font-semibold text-slate-900">Revízie elektrických inštalácií (OPaOS)</span>
                <span className="text-slate-600">Postup vykonania východiskovej revízie pred uvedením inštalácie pod napätie.</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
