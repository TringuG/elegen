export type ObjectType =
  | 'Rodinný dom'
  | 'Byt'
  | 'Garáž'
  | 'Garáž / Dielňa'
  | 'Prevádzka'
  | 'Komerčná prevádzka'
  | 'Chata / Rekreačný objekt'
  | 'Iné';
export type SupplySystemType = '1f' | '3f';
export type VoltageType = '230 V' | '400 V';
export type NetworkSystemType = 'TN-C' | 'TN-S' | 'TN-C-S' | 'TT';
export type PolesType = '1P' | '2P' | '3P' | '4P';
export type MainBreakerCurrent = 10 | 16 | 20 | 25 | 32 | 40 | 50 | 63;
export type InternalMainDeviceCurrent = 16 | 20 | 25 | 32 | 40 | 50 | 63 | 80 | 100;
export type BreakerCharacteristic = 'B' | 'C' | 'D';
export type BreakingCapacity = '6 kA' | '10 kA' | '15 kA' | '25 kA';
export type MainBreakerLocation =
  | 'PRED ROZVÁDZAČOM'
  | 'V ROZVÁDZAČI'
  | 'Pred elektromerom'
  | 'Pri elektromere'
  | 'Podľa skutočného zapojenia';

export type UpstreamBreakerPlacement =
  | 'Pred elektromerom'
  | 'Pri elektromere'
  | 'Podľa skutočného zapojenia';

export type InternalMainDeviceType =
  | 'Hlavný vypínač'
  | 'Istič'
  | 'Odpínač'
  | 'Iný hlavný spínací alebo ochranný prvok';

export type InternalDeviceTopologyPosition =
  | 'PRED_SPD_A_RCD' // Hneď za prívodom do rozvádzača, pred SPD a chráničmi (štandard)
  | 'ZA_SPD_PRED_RCD' // Za prepäťovou ochranou, pred prúdovými chráničmi
  | 'PRED_ELEKTROMEROM'; // Špeciálne usporiadanie podľa skutočného zapojenia

export interface ElectricityMeterConfig {
  enabled: boolean;
  designation: string; // napr. kWh / WH1
  type: '1-fázový elektromer' | '3-fázový elektromer';
  tariff: 'Jednotarifný' | 'Dvojtarifný (VT/NT)' | 'IMS / Smart meter';
  location: 'V elektromerovom rozvádzači (RE)' | 'V bytovom rozvádzači' | 'Na hranici pozemku';
}

export interface InternalMainDeviceConfig {
  enabled: boolean;
  deviceType: InternalMainDeviceType;
  designation: string; // napr. QS1 alebo QF1
  poles: PolesType;
  ratedCurrent: InternalMainDeviceCurrent;
  manufacturer: Manufacturer;
  model: string;
  catalogNumber?: string;
  modules: number;
  hasOvercurrentProtection: boolean; // Ak je Hlavný vypínač, predvolene false!
  characteristic?: BreakerCharacteristic; // Iba ak hasOvercurrentProtection === true alebo deviceType === 'Istič'
  breakingCapacity?: BreakingCapacity;
  topologyPosition: InternalDeviceTopologyPosition;
}

export type Manufacturer =
  | 'Eaton'
  | 'Schneider Electric'
  | 'OEZ'
  | 'Hager'
  | 'ABB'
  | 'Legrand'
  | 'Schrack Technik';

export type RcdDeviceKind = 'RCCB' | 'RCBO';
export type RcdPoles = '2P' | '4P';
export type RcdRatedCurrent = 10 | 16 | 20 | 25 | 32 | 40 | 63 | 80;
export type RcdSensitivity = 10 | 30 | 100 | 300;
export type RcdType = 'AC' | 'A' | 'F' | 'B';

export type PhaseAllocation = 'L1' | 'L2' | 'L3' | 'L1,L2,L3';

export type CircuitCategory =
  | 'Osvetlenie'
  | 'Zásuvky'
  | 'Kuchyňa / Spotrebiče'
  | 'Kúpeľňa / Práčovňa'
  | 'Technológia / Kúrenie'
  | 'Exteriér / Garáž / EV'
  | 'Rezerva';

export type CableInstallationMethod =
  | 'A1 (v tepelnej izolácii)'
  | 'B1 (v inštalačnej rúre v stene)'
  | 'C (pod omietkou / na stene)'
  | 'E (voľne na vzduchu / žľab)';

export interface MainBreakerConfig {
  // A. HLAVNÝ ISTIČ PRED ELEKTROMEROM (QF0)
  enabled?: boolean; // Zapnuté / vypnuté (default true)
  designation?: string; // napr. QF0
  placement?: UpstreamBreakerPlacement;
  poles: PolesType;
  ratedCurrent: MainBreakerCurrent;
  characteristic: BreakerCharacteristic;
  breakingCapacity: BreakingCapacity;
  manufacturer: Manufacturer;
  model: string;
  catalogNumber?: string;
  location: MainBreakerLocation;

  // B. HLAVNÝ PRVOK V BYTOVOM ROZVÁDZAČI (QS1 / QF1) + ELEKTROMER
  hasInternalMainSwitch: boolean;
  internalSwitchCurrent: 40 | 63 | 80 | 100;
  internalDevice?: InternalMainDeviceConfig;
  electricityMeter?: ElectricityMeterConfig;

  // Prepäťová ochrana (SPD)
  hasSurgeProtector: boolean;
  surgeProtectorType: 'T1+T2 (B+C)' | 'T2 (C)';
  supplyTransformerImpedanceOhm?: number; // Zq pre skratové výpočty
  supplyLineLengthM?: number; // Dĺžka prívodu od RE
}

export interface RcdConfig {
  id: string;
  label: string; // e.g., FI1, FI2, FI3
  deviceKind: RcdDeviceKind; // RCCB vs RCBO
  poles: RcdPoles; // 2P or 4P
  ratedCurrent: RcdRatedCurrent; // 25, 40, 63, 80 (or 10, 16, 20, 32 for RCBO)
  sensitivity: RcdSensitivity; // 10, 30, 100, 300 mA
  type: RcdType; // AC, A, F, B
  selective?: boolean; // Typ S (selektívny)
  manufacturer: Manufacturer;
  model: string;
  catalogNumber?: string;
  characteristic?: BreakerCharacteristic;
  breakingCapacity?: BreakingCapacity;
  phase?: PhaseAllocation;
  circuitName?: string;
  cableType?: string;
  cableLengthM?: number;
  powerKw?: number;
  notes?: string;
}

export interface CircuitConfig {
  id: string;
  label: string; // FA1, FA2 alebo QF1, QF2...
  name: string;
  category: CircuitCategory;
  rcdId: string | 'NONE';
  poles: PolesType;
  ratedCurrent: 6 | 10 | 13 | 16 | 20 | 25 | 32 | 40 | 50 | 63;
  characteristic: BreakerCharacteristic;
  breakingCapacity: BreakingCapacity;
  phase: PhaseAllocation;
  cable: string;
  cableLengthM?: number;
  installationMethod?: CableInstallationMethod;
  cosPhi?: number;
  powerKw: number;
  manufacturer: Manufacturer;
  model: string;
  catalogNumber?: string;
  hasAfdd?: boolean;
}

export interface ProjectHistoryEntry {
  id: string;
  timestamp: string;
  action: string;
  author: string;
  snapshot?: string;
}

export interface VerificationChecklistState {
  shortCircuitMeasuredOrCalculated: boolean;
  voltageDropVerified: boolean;
  selectivityVerified: boolean;
  thermalDissipationVerified: boolean;
  onSiteRevisionRequiredAcknowledged: boolean;
}

export interface PieceVerificationChecks {
  ipRatingChecked: boolean;
  clearanceAndCreepageOk: boolean;
  peContinuityOk: boolean;
  measuredPeResistanceOhm: number; // napr. 0.03 Ohm (max 0.1 Ohm)
  componentsInstallationOk: boolean;
  tighteningTorquesVerified: boolean;
  internalWiringAndCrossSectionsOk: boolean;
  wireColorCodingStnOk: boolean; // L1 hnedá/čierna, L2 čierna, L3 sivá, N modrá, PE zel-žltá
  externalTerminalsChecked: boolean;
  mechanicalOperationOk: boolean; // dvierka, páčky, západky
  insulationResistanceOk: boolean;
  testVoltageV: number; // 500 V DC
  measuredInsulationResistanceMohm: number; // napr. > 50 MOhm (min. 1.0 MOhm)
  electricalFunctionAndRcdTestOk: boolean;
  measuredRcdTripTimeMs: number; // napr. 22 ms (max 300 ms)
  overallPieceVerificationResult: 'VYHOVUJE' | 'NEVYHOVUJE';
}

export interface SwitchboardManufacturerInfo {
  manufacturerName: string;
  manufacturerStreet: string;
  manufacturerCity: string;
  manufacturerIco: string;
  manufacturerDic?: string;
  manufacturerPhone?: string;
  manufacturerEmail?: string;
  technicianName: string;
  technicianCertificateNumber?: string; // Číslo osvedčenia elektrotechnika (§ 22 / § 23 / § 24)
  serialNumber: string; // Výrobné číslo
  productionYear: number;
  typeDesignation: string; // Typové označenie rozvádzača, napr. DBO-RD-01
  testedDate: string;
  measurementDeviceModel: string; // napr. Metrel MI 3152 EurotestXC
  measurementDeviceSerial: string;
  calibrationValidUntil: string;
  enclosureProtectionClass: 'Trieda I (s PE svorkou)' | 'Trieda II (dvojitá izolácia / celoplast)';
  ratedDiversityFactor: number; // RDF napr. 0.8
  ambientTempRange: string; // napr. -5 °C až +40 °C
  ratedShortCircuitIcnKa: number; // napr. 6 kA alebo 10 kA
  manufacturerLogoUrl?: string; // Base64 Data URL alebo URL adresa firemného loga
  logoDisplayMode?: 'text_only' | 'logo_only' | 'both'; // Zobrazenie na výrobnom štítku
  logoHeightMm?: number; // Výška loga na štítku (napr. 12 až 24 mm)
  boardTitle?: string; // Nadpis štítku napr. ROZVODNICA PRE LAICKÚ OBSLUHU (DBO)
  standardTitle?: string; // Norma na štítku napr. ZHODA PODĽA STN EN 61439-1:2021 / STN EN 61439-3:2012
  customRatedVoltageUn?: string; // Vlastný text pre Menovité napätie (Un)
  customRatedCurrentInA?: string; // Vlastný text pre Menovitý prúd rozvádzača (InA)
  customNetworkCode?: string; // Vlastný text pre Druh siete / Sústava
  customIpRating?: string; // Vlastný text pre Stupeň ochrany krytom (IP)
  footerWarningText?: string; // Upozornenie v pätičke štítku
  countryOriginCode?: string; // Kód krajiny napr. SK
  notes?: string;
  verificationChecks?: PieceVerificationChecks;
}

export interface SavedNameplatePreset {
  id: string;
  presetName: string;
  savedAt: string;
  labelSize: 'compact' | 'standard' | 'large';
  info: SwitchboardManufacturerInfo;
}

export interface SwitchboardProject {
  id: string;
  name: string;
  objectType: ObjectType;
  supplySystem: SupplySystemType;
  voltage: VoltageType;
  networkSystem: NetworkSystemType;
  phaseCount: 1 | 3;
  supplyCable: string;
  designerName: string;
  projectNumber: string;
  projectDate: string;
  locationCity?: string;
  enclosureMounting:
    | 'Pod omietku (zapustený)'
    | 'Na omietku (povrchový)'
    | 'Na stenu (povrchový)'
    | 'Do sadrokartónu'
    | 'Stojanový / Pilierový';
  ipRating: 'IP20' | 'IP30' | 'IP40' | 'IP54' | 'IP65';
  mainBreaker: MainBreakerConfig;
  rcds: RcdConfig[];
  circuits: CircuitConfig[];
  history?: ProjectHistoryEntry[];
  verificationChecklist?: VerificationChecklistState;
  manufacturingInfo?: SwitchboardManufacturerInfo;
  notes?: string;
}

export type SchemaDisplayMode = 'single-line' | 'multi-line' | 'wiring-diagram';
export type SchemaOrientation = 'portrait' | 'landscape';
export type SchemaColorMode = 'stn-color' | 'cad-mono';

export interface PhaseLoadSummary {
  L1: { currentA: number; powerKw: number; count: number; utilizationPercent: number };
  L2: { currentA: number; powerKw: number; count: number; utilizationPercent: number };
  L3: { currentA: number; powerKw: number; count: number; utilizationPercent: number };
  totalInstalledKw: number;
  simultaneityFactor: number;
  simultaneousKw: number;
  estimatedMaxCurrentA: number;
  asymmetryPercent: number;
}

export interface StnValidationIssue {
  id: string;
  severity: 'error' | 'warning' | 'ok';
  category:
    | 'Zapojenie & Sieť'
    | 'Chrániče & Selektivita'
    | 'Káble & Istenie'
    | 'Fázová symetria'
    | 'Meranie & Overenie';
  code: string;
  title: string;
  message: string;
  verificationRequirement?: string;
}

export interface BomItem {
  code: string;
  designation: string;
  category: string;
  description: string;
  manufacturer: string;
  model: string;
  catalogNumber: string;
  modules: number;
  quantity: number;
}

export interface CatalogProduct {
  id: string;
  manufacturer: Manufacturer;
  catalogNumber: string;
  model: string;
  name: string;
  deviceType:
    | 'MCB (Istič)'
    | 'RCCB (Prúdový chránič)'
    | 'RCBO (Ističochránič)'
    | 'SPD (Prepäťová ochrana)'
    | 'Hlavný vypínač'
    | 'AFDD (Oblúková ochrana)';
  poles: PolesType;
  ratedCurrent: number;
  characteristic?: BreakerCharacteristic;
  breakingCapacity?: BreakingCapacity;
  rcdSensitivity?: RcdSensitivity;
  rcdType?: RcdType;
  modules: number;
  voltage: string;
  standard: string;
  powerLossW: number;
  maxTerminalCrossSectionMm2: string;
  datasheetSummary: string;
}

export interface CircuitCalculationResult {
  circuitId: string;
  label: string;
  name: string;
  poles: PolesType;
  phase: PhaseAllocation;
  powerKw: number;
  voltageV: number;
  cosPhi: number;
  designCurrentIb: number;
  breakerCurrentIn: number;
  breakerChar: BreakerCharacteristic;
  cableText: string;
  crossSectionMm2: number;
  lengthM: number;
  installationMethod: CableInstallationMethod;
  currentCarryingCapacityIz: number;
  voltageDropVolts: number;
  voltageDropPercent: number;
  maxAllowedDropPercent: number;
  loopImpedanceZsOhm: number;
  maxAllowedZsOhm: number;
  minShortCircuitCurrentIkA: number;
  tripCurrentIa: number;
  overloadProtectionOk: boolean;
  voltageDropOk: boolean;
  disconnectConditionOk: boolean;
  selectivityWithMain: 'Úplná' | 'Čiastočná (do Ik)' | 'Neistá – vyžaduje graf I²t';
}

export type NavigationSection =
  | 'dashboard' // 1. Moje projekty
  | 'new-project'
  | 'smart-designer' // 2. Nový rozvádzač (6-krokový sprievodca)
  | 'schema-editor' // 3. Editor schémy
  | 'manufacturing' // 4. Výroba rozvádzača & Štítok (Kusová skúška, Štítok, DoC, Oteplenie)
  | 'component-library' // 5. Komponenty
  | 'documentation' // 6. Dokumentácia a export
  | 'advanced-settings' // ROZŠÍRENÉ NASTAVENIA
  | 'auto-import'
  | 'board-3d'
  | 'calculations'
  | 'validation'
  | 'settings';
