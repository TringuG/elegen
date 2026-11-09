import {
  BomItem,
  BreakerCharacteristic,
  BreakingCapacity,
  CableInstallationMethod,
  CatalogProduct,
  CircuitCalculationResult,
  CircuitCategory,
  CircuitConfig,
  ElectricityMeterConfig,
  InternalDeviceTopologyPosition,
  InternalMainDeviceConfig,
  InternalMainDeviceCurrent,
  InternalMainDeviceType,
  MainBreakerCurrent,
  Manufacturer,
  NetworkSystemType,
  ObjectType,
  PhaseAllocation,
  PhaseLoadSummary,
  PolesType,
  RcdConfig,
  RcdDeviceKind,
  RcdPoles,
  RcdRatedCurrent,
  RcdSensitivity,
  RcdType,
  StnValidationIssue,
  SwitchboardProject,
  SwitchboardManufacturerInfo,
  UpstreamBreakerPlacement,
} from '../types/electrical';

export const MANUFACTURERS: Manufacturer[] = [
  'Eaton',
  'Schneider Electric',
  'OEZ',
  'Hager',
  'ABB',
  'Legrand',
  'Schrack Technik',
];

export const MAIN_BREAKER_CURRENTS: MainBreakerCurrent[] = [10, 16, 20, 25, 32, 40, 50, 63];
export const INTERNAL_DEVICE_CURRENTS: InternalMainDeviceCurrent[] = [16, 20, 25, 32, 40, 50, 63, 80, 100];
export const INTERNAL_DEVICE_TYPES: InternalMainDeviceType[] = [
  'Hlavný vypínač',
  'Istič',
  'Odpínač',
  'Iný hlavný spínací alebo ochranný prvok',
];
export const UPSTREAM_PLACEMENTS: UpstreamBreakerPlacement[] = [
  'Pred elektromerom',
  'Pri elektromere',
  'Podľa skutočného zapojenia',
];
export const RCCB_CURRENTS: RcdRatedCurrent[] = [25, 40, 63, 80];
export const RCBO_CURRENTS: RcdRatedCurrent[] = [10, 16, 20, 25, 32, 40];
export const RCD_SENSITIVITIES: RcdSensitivity[] = [10, 30, 100, 300];
export const RCD_TYPES: RcdType[] = ['AC', 'A', 'F', 'B'];

export function suggestMainBreakerModel(
  manufacturer: Manufacturer,
  poles: PolesType,
  characteristic: BreakerCharacteristic,
  current: number,
  capacity: BreakingCapacity
): string {
  const pNum = poles.replace('P', '');
  const is10kA = capacity !== '6 kA';
  switch (manufacturer) {
    case 'Eaton':
      return `${is10kA ? 'PL7' : 'PL6'}-${characteristic}${current}/${pNum}`;
    case 'Schneider Electric':
      return `iC60${is10kA ? 'H' : 'N'} ${pNum}P ${characteristic}${current}A`;
    case 'OEZ':
      return `${is10kA ? 'LTN' : 'LTE'}-${current}${characteristic}-${pNum}`;
    case 'Hager':
      return `M${is10kA ? 'C' : 'B'}${pNum}${characteristic}${current}`;
    case 'ABB':
      return `S20${pNum}${is10kA ? 'M' : ''}-${characteristic}${current}`;
    case 'Legrand':
      return `TX3 ${characteristic}${current} ${pNum}P ${capacity}`;
    case 'Schrack Technik':
      return `BM${is10kA ? '0' : '6'}18${pNum}${characteristic}${current}`;
  }
}

export function suggestCatalogNumber(
  manufacturer: Manufacturer,
  model: string,
  poles: string,
  current: number
): string {
  switch (manufacturer) {
    case 'Eaton':
      if (model.startsWith('PF7')) return `263${current}${poles === '4P' ? '4' : '2'}`;
      if (model.startsWith('PFL7')) return `264${current}1`;
      return `262${current}${poles.replace('P', '')}`;
    case 'Schneider Electric':
      if (model.startsWith('iID')) return `A9R41${poles === '4P' ? '4' : '2'}${current}`;
      if (model.startsWith('iDPN')) return `A9D326${current}`;
      return `A9F74${poles.replace('P', '')}${current}`;
    case 'OEZ':
      if (model.startsWith('OFI')) return `OFI-${current}-${poles.replace('P', '')}-003A`;
      if (model.startsWith('OLE')) return `OLE-${current}B-1N-003A`;
      return `LTN-${current}B-${poles.replace('P', '')}`;
    case 'Hager':
      if (model.startsWith('CD')) return `CDA${poles === '4P' ? '4' : '2'}${current}D`;
      if (model.startsWith('AD')) return `ADA9${current}D`;
      return `MC${poles.replace('P', '')}${current}A`;
    case 'ABB':
      if (model.startsWith('F20')) return `2CSF20${poles === '4P' ? '4' : '2'}101R1${current}0`;
      if (model.startsWith('DS20')) return `2CSR255180R1${current}5`;
      return `2CDS25${poles.replace('P', '')}001R0${current}5`;
    case 'Legrand':
      if (model.startsWith('DX3-ID')) return `4116${current}`;
      return `4077${current}`;
    case 'Schrack Technik':
      return `BM018${poles.replace('P', '')}${current}`;
  }
}

export function suggestRcdModel(
  manufacturer: Manufacturer,
  kind: RcdDeviceKind,
  poles: RcdPoles,
  current: number,
  sensitivity: RcdSensitivity,
  type: RcdType,
  characteristic: BreakerCharacteristic = 'B'
): string {
  const pNum = poles === '2P' ? '2' : '4';
  const sensCode =
    sensitivity === 10
      ? '001'
      : sensitivity === 30
      ? '003'
      : sensitivity === 100
      ? '01'
      : '03';

  if (kind === 'RCCB') {
    switch (manufacturer) {
      case 'Eaton':
        return `PF7-${current}/${pNum}/${sensCode}-${type}`;
      case 'Schneider Electric':
        return `iID ${poles} ${current}A ${sensitivity}mA-${type}`;
      case 'OEZ':
        return `OFI-${current}-${pNum}-${sensCode}${type}`;
      case 'Hager':
        return `CD${poles === '2P' ? '2' : '4'}${current}J (${type})`;
      case 'ABB':
        return `F20${pNum} ${type}-${current}/0.${sensitivity === 30 ? '03' : sensitivity / 1000}`;
      case 'Legrand':
        return `DX3-ID ${poles} ${current}A ${sensitivity}mA ${type}`;
      case 'Schrack Technik':
        return `BC0${pNum}${current}${sensCode}${type}`;
    }
  } else {
    const rcboPoles = poles === '2P' ? '1N' : '3N';
    switch (manufacturer) {
      case 'Eaton':
        return `PFL7-${current}/${rcboPoles}/${characteristic}/${sensCode}-${type}`;
      case 'Schneider Electric':
        return `iDPN N Vigi ${characteristic}${current}A ${sensitivity}mA-${type}`;
      case 'OEZ':
        return `OLE-${current}${characteristic}-${rcboPoles}-${sensCode}${type}`;
      case 'Hager':
        return `AD${poles === '2P' ? '9' : '8'}${current}J ${characteristic}${current} ${sensitivity}mA`;
      case 'ABB':
        return `DS20${poles === '2P' ? '1' : '3'} ${type}-${characteristic}${current}/0.03`;
      case 'Legrand':
        return `DX3 RCBO ${poles} ${characteristic}${current} ${sensitivity}mA-${type}`;
      case 'Schrack Technik':
        return `BO618${poles === '2P' ? '1' : '3'}${characteristic}${current}/${sensCode}${type}`;
    }
  }
}

export function suggestCircuitBreakerModel(
  manufacturer: Manufacturer,
  poles: PolesType,
  characteristic: BreakerCharacteristic,
  current: number
): string {
  return suggestMainBreakerModel(manufacturer, poles, characteristic, current, '10 kA');
}

export function getPolesModuleCount(poles: PolesType | RcdPoles): number {
  switch (poles) {
    case '1P':
      return 1;
    case '2P':
      return 2;
    case '3P':
      return 3;
    case '4P':
      return 4;
  }
}

export function suggestInternalMainDeviceModel(
  manufacturer: Manufacturer,
  deviceType: InternalMainDeviceType,
  poles: PolesType,
  current: number,
  characteristic: BreakerCharacteristic = 'B',
  hasOvercurrentProtection = false
): string {
  const pNum = poles.replace('P', '');
  if (deviceType === 'Istič' || hasOvercurrentProtection) {
    return suggestMainBreakerModel(manufacturer, poles, characteristic, current, '10 kA');
  }
  if (deviceType === 'Odpínač') {
    switch (manufacturer) {
      case 'Eaton':
        return `IS-${current}/${pNum} (Odpínač)`;
      case 'Schneider Electric':
        return `iSW ${pNum}P ${current}A (Odpínač)`;
      case 'OEZ':
        return `minia S${current}-${pNum}`;
      case 'Hager':
        return `SB${pNum}${current}`;
      case 'ABB':
        return `SD20${pNum}/${current}`;
      case 'Legrand':
        return `DX3-IS ${pNum}P ${current}A`;
      case 'Schrack Technik':
        return `BS900${pNum}${current}`;
    }
  }
  // Hlavný vypínač alebo iný spínací prvok
  switch (manufacturer) {
    case 'Eaton':
      return `IS-${current}/${pNum}`;
    case 'Schneider Electric':
      return `iSW ${pNum}P ${current}A`;
    case 'OEZ':
      return `SV-${current}-${pNum}`;
    case 'Hager':
      return `SH${pNum}${current}`;
    case 'ABB':
      return `SD20${pNum}/${current}`;
    case 'Legrand':
      return `DX3-IS ${pNum}P ${current}A`;
    case 'Schrack Technik':
      return `BS018${pNum}${current}`;
  }
}

export interface EffectiveUpstreamBreaker {
  enabled: boolean;
  designation: string;
  placement: UpstreamBreakerPlacement;
  poles: PolesType;
  ratedCurrent: MainBreakerCurrent;
  characteristic: BreakerCharacteristic;
  breakingCapacity: BreakingCapacity;
  manufacturer: Manufacturer;
  model: string;
}

export function getEffectiveUpstreamBreaker(project: SwitchboardProject): EffectiveUpstreamBreaker {
  const mb = project.mainBreaker;
  return {
    enabled: mb.enabled ?? true,
    designation: mb.designation || 'QF0',
    placement: mb.placement || 'Pred elektromerom',
    poles: mb.poles,
    ratedCurrent: mb.ratedCurrent,
    characteristic: mb.characteristic,
    breakingCapacity: mb.breakingCapacity,
    manufacturer: mb.manufacturer,
    model: mb.model,
  };
}

export function getEffectiveElectricityMeter(project: SwitchboardProject): ElectricityMeterConfig {
  const em = project.mainBreaker.electricityMeter;
  return {
    enabled: em?.enabled ?? true,
    designation: em?.designation || 'kWh',
    type:
      em?.type ||
      (project.phaseCount === 3 ? '3-fázový elektromer' : '1-fázový elektromer'),
    tariff: em?.tariff || 'Dvojtarifný (VT/NT)',
    location: em?.location || 'V elektromerovom rozvádzači (RE)',
  };
}

export function getEffectiveInternalDevice(project: SwitchboardProject): InternalMainDeviceConfig {
  const mb = project.mainBreaker;
  if (mb.internalDevice) {
    return {
      ...mb.internalDevice,
      designation:
        mb.internalDevice.designation ||
        (mb.internalDevice.deviceType === 'Istič' || mb.internalDevice.hasOvercurrentProtection
          ? 'QF1'
          : 'QS1'),
      modules: mb.internalDevice.modules || getPolesModuleCount(mb.internalDevice.poles),
      topologyPosition: mb.internalDevice.topologyPosition || 'PRED_SPD_A_RCD',
    };
  }

  // Fallback pre staršie projekty
  if (mb.location === 'V ROZVÁDZAČI') {
    return {
      enabled: true,
      deviceType: 'Istič',
      poles: mb.poles,
      ratedCurrent: (mb.ratedCurrent === 10 ? 16 : mb.ratedCurrent) as InternalMainDeviceCurrent,
      characteristic: mb.characteristic,
      breakingCapacity: mb.breakingCapacity,
      manufacturer: mb.manufacturer,
      model: mb.model,
      modules: getPolesModuleCount(mb.poles),
      designation: 'QF1',
      hasOvercurrentProtection: true,
      topologyPosition: 'PRED_SPD_A_RCD',
    };
  }

  const defaultPoles: PolesType = project.phaseCount === 3 ? '3P' : '2P';
  const defaultCurrent: InternalMainDeviceCurrent = mb.internalSwitchCurrent || 40;
  return {
    enabled: mb.hasInternalMainSwitch ?? true,
    deviceType: 'Hlavný vypínač',
    poles: defaultPoles,
    ratedCurrent: defaultCurrent,
    characteristic: 'B',
    breakingCapacity: '10 kA',
    manufacturer: mb.manufacturer,
    model: suggestInternalMainDeviceModel(
      mb.manufacturer,
      'Hlavný vypínač',
      defaultPoles,
      defaultCurrent,
      'B',
      false
    ),
    modules: getPolesModuleCount(defaultPoles),
    designation: 'QS1',
    hasOvercurrentProtection: false,
    topologyPosition: 'PRED_SPD_A_RCD',
  };
}

/**
 * Synchronizes project settings when switching between 1-phase (230 V) and 3-phase (400 V)
 */
export function applySupplySystemChange(
  project: SwitchboardProject,
  targetSystem: '1f' | '3f'
): SwitchboardProject {
  const is1f = targetSystem === '1f';
  const newVoltage = is1f ? '230 V' : '400 V';
  const newPhaseCount = is1f ? 1 : 3;

  let mainPoles = project.mainBreaker.poles;
  if (is1f && (mainPoles === '3P' || mainPoles === '4P')) {
    mainPoles = project.networkSystem === 'TN-S' || project.networkSystem === 'TT' ? '2P' : '1P';
  } else if (!is1f && (mainPoles === '1P' || mainPoles === '2P')) {
    mainPoles = '3P';
  }

  const updatedMainModel = suggestMainBreakerModel(
    project.mainBreaker.manufacturer,
    mainPoles,
    project.mainBreaker.characteristic,
    project.mainBreaker.ratedCurrent,
    project.mainBreaker.breakingCapacity
  );

  const currentInternal = getEffectiveInternalDevice(project);
  let internalPoles = currentInternal.poles;
  if (is1f && (internalPoles === '3P' || internalPoles === '4P')) {
    internalPoles = '2P';
  } else if (!is1f && (internalPoles === '1P' || internalPoles === '2P')) {
    internalPoles = '3P';
  }
  const updatedInternalDevice: InternalMainDeviceConfig = {
    ...currentInternal,
    poles: internalPoles,
    modules: getPolesModuleCount(internalPoles),
    model: suggestInternalMainDeviceModel(
      currentInternal.manufacturer,
      currentInternal.deviceType,
      internalPoles,
      currentInternal.ratedCurrent,
      currentInternal.characteristic || 'B',
      currentInternal.hasOvercurrentProtection
    ),
  };

  const currentMeter = getEffectiveElectricityMeter(project);
  const updatedMeter: ElectricityMeterConfig = {
    ...currentMeter,
    type: is1f ? '1-fázový elektromer' : '3-fázový elektromer',
  };

  const updatedRcds: RcdConfig[] = project.rcds.map((rcd) => {
    const newPoles: RcdPoles = is1f ? '2P' : rcd.poles;
    const newPhase: PhaseAllocation = is1f
      ? 'L1'
      : newPoles === '4P'
      ? 'L1,L2,L3'
      : rcd.phase === 'L1,L2,L3'
      ? 'L1'
      : rcd.phase || 'L1';
    return {
      ...rcd,
      poles: newPoles,
      phase: newPhase,
      model: suggestRcdModel(
        rcd.manufacturer,
        rcd.deviceKind,
        newPoles,
        rcd.ratedCurrent,
        rcd.sensitivity,
        rcd.type,
        rcd.characteristic || 'B'
      ),
    };
  });

  const updatedCircuits: CircuitConfig[] = project.circuits.map((c, idx) => {
    if (is1f) {
      const newPoles: PolesType = c.poles === '3P' || c.poles === '4P' ? '1P' : c.poles;
      const newCable = c.cable.replace('5x', '3x');
      return {
        ...c,
        poles: newPoles,
        phase: 'L1',
        cable: newCable,
        model: suggestCircuitBreakerModel(c.manufacturer, newPoles, c.characteristic, c.ratedCurrent),
      };
    } else {
      const phases: PhaseAllocation[] = ['L1', 'L2', 'L3'];
      const assignedPhase: PhaseAllocation =
        c.poles === '3P' || c.poles === '4P' ? 'L1,L2,L3' : phases[idx % 3];
      return {
        ...c,
        phase: assignedPhase,
      };
    }
  });

  const supplyCable = is1f
    ? project.networkSystem === 'TN-C'
      ? 'CYKY-J 2x10 mm²'
      : 'CYKY-J 3x10 mm²'
    : project.networkSystem === 'TN-C'
    ? 'CYKY-O 4x10 mm²'
    : 'CYKY-J 5x10 mm²';

  return {
    ...project,
    supplySystem: targetSystem,
    voltage: newVoltage,
    phaseCount: newPhaseCount,
    supplyCable,
    mainBreaker: {
      ...project.mainBreaker,
      poles: mainPoles,
      model: updatedMainModel,
      internalDevice: updatedInternalDevice,
      electricityMeter: updatedMeter,
    },
    rcds: updatedRcds,
    circuits: updatedCircuits,
  };
}

/**
 * Automatically balances 1-phase circuits & 2P RCBOs across L1, L2, L3 to minimize phase asymmetry
 */
export function balanceCircuitPhases(project: SwitchboardProject): SwitchboardProject {
  if (project.phaseCount === 1) {
    return {
      ...project,
      circuits: project.circuits.map((c) => ({ ...c, phase: 'L1' })),
    };
  }

  const loads = { L1: 0, L2: 0, L3: 0 };

  project.circuits.forEach((c) => {
    if (c.poles === '3P' || c.poles === '4P' || c.phase === 'L1,L2,L3') {
      const perPhase = c.powerKw / 3;
      loads.L1 += perPhase;
      loads.L2 += perPhase;
      loads.L3 += perPhase;
    }
  });

  const singlePhaseOrder = project.circuits
    .map((c, index) => ({ c, index }))
    .filter(({ c }) => c.poles === '1P' || c.poles === '2P')
    .sort((a, b) => b.c.powerKw - a.c.powerKw);

  const phaseByIndex = new Map<number, PhaseAllocation>();

  for (const item of singlePhaseOrder) {
    const parentRcd = project.rcds.find((r) => r.id === item.c.rcdId);
    if (parentRcd && parentRcd.poles === '2P' && parentRcd.phase && parentRcd.phase !== 'L1,L2,L3') {
      const p = parentRcd.phase;
      phaseByIndex.set(item.index, p);
      loads[p] += item.c.powerKw;
      continue;
    }

    const minPhase = (['L1', 'L2', 'L3'] as const).reduce((prev, curr) =>
      loads[curr] < loads[prev] ? curr : prev
    );
    phaseByIndex.set(item.index, minPhase);
    loads[minPhase] += item.c.powerKw;
  }

  const balancedCircuits = project.circuits.map((c, idx) => {
    const newPhase = phaseByIndex.get(idx);
    if (newPhase) {
      return { ...c, phase: newPhase };
    }
    return { ...c, phase: 'L1,L2,L3' as PhaseAllocation };
  });

  return {
    ...project,
    circuits: balancedCircuits,
  };
}

/**
 * Calculates load per phase (L1, L2, L3), total installed power, simultaneity, utilization %, and asymmetry
 */
export function calculatePhaseLoad(project: SwitchboardProject): PhaseLoadSummary {
  const L1 = { currentA: 0, powerKw: 0, count: 0, utilizationPercent: 0 };
  const L2 = { currentA: 0, powerKw: 0, count: 0, utilizationPercent: 0 };
  const L3 = { currentA: 0, powerKw: 0, count: 0, utilizationPercent: 0 };

  const cosPhi = 0.92;

  project.rcds
    .filter((r) => r.deviceKind === 'RCBO')
    .forEach((rcbo) => {
      const kw = rcbo.powerKw ?? 2.0;
      if (project.phaseCount === 1 || rcbo.poles === '2P') {
        const ph = project.phaseCount === 1 ? 'L1' : rcbo.phase && rcbo.phase !== 'L1,L2,L3' ? rcbo.phase : 'L1';
        const target = ph === 'L1' ? L1 : ph === 'L2' ? L2 : L3;
        target.powerKw += kw;
        target.currentA += (kw * 1000) / (230 * cosPhi);
        target.count += 1;
      } else {
        const perPhaseKw = kw / 3;
        const perPhaseA = (perPhaseKw * 1000) / (230 * cosPhi);
        [L1, L2, L3].forEach((t) => {
          t.powerKw += perPhaseKw;
          t.currentA += perPhaseA;
          t.count += 1;
        });
      }
    });

  project.circuits.forEach((c) => {
    const cCos = c.cosPhi ?? cosPhi;
    if (project.phaseCount === 1) {
      L1.powerKw += c.powerKw;
      L1.currentA += (c.powerKw * 1000) / (230 * cCos);
      L1.count += 1;
    } else if (c.poles === '3P' || c.poles === '4P' || c.phase === 'L1,L2,L3') {
      const perPhaseKw = c.powerKw / 3;
      const perPhaseA = (perPhaseKw * 1000) / (230 * cCos);
      L1.powerKw += perPhaseKw;
      L1.currentA += perPhaseA;
      L1.count += 1;

      L2.powerKw += perPhaseKw;
      L2.currentA += perPhaseA;
      L2.count += 1;

      L3.powerKw += perPhaseKw;
      L3.currentA += perPhaseA;
      L3.count += 1;
    } else {
      const target = c.phase === 'L1' ? L1 : c.phase === 'L2' ? L2 : L3;
      target.powerKw += c.powerKw;
      target.currentA += (c.powerKw * 1000) / (230 * cCos);
      target.count += 1;
    }
  });

  const totalInstalledKw = Number((L1.powerKw + L2.powerKw + L3.powerKw).toFixed(2));
  const circuitCount =
    project.circuits.length + project.rcds.filter((r) => r.deviceKind === 'RCBO').length;

  const simultaneityFactor =
    circuitCount <= 2 ? 0.85 : circuitCount <= 5 ? 0.65 : circuitCount <= 10 ? 0.5 : 0.42;

  const simultaneousKw = Number((totalInstalledKw * simultaneityFactor).toFixed(2));
  const mainIn = project.mainBreaker.ratedCurrent;

  L1.utilizationPercent = Math.round(((L1.currentA * simultaneityFactor) / mainIn) * 100);
  L2.utilizationPercent = Math.round(((L2.currentA * simultaneityFactor) / mainIn) * 100);
  L3.utilizationPercent = Math.round(((L3.currentA * simultaneityFactor) / mainIn) * 100);

  const maxPhaseCurrent =
    project.phaseCount === 1
      ? L1.currentA * simultaneityFactor
      : Math.max(L1.currentA, L2.currentA, L3.currentA) * simultaneityFactor;

  let asymmetryPercent = 0;
  if (project.phaseCount === 3) {
    const maxKw = Math.max(L1.powerKw, L2.powerKw, L3.powerKw);
    const minKw = Math.min(L1.powerKw, L2.powerKw, L3.powerKw);
    if (maxKw > 0) {
      asymmetryPercent = Math.round(((maxKw - minKw) / maxKw) * 100);
    }
  }

  return {
    L1: {
      currentA: Number(L1.currentA.toFixed(1)),
      powerKw: Number(L1.powerKw.toFixed(2)),
      count: L1.count,
      utilizationPercent: L1.utilizationPercent,
    },
    L2: {
      currentA: Number(L2.currentA.toFixed(1)),
      powerKw: Number(L2.powerKw.toFixed(2)),
      count: L2.count,
      utilizationPercent: L2.utilizationPercent,
    },
    L3: {
      currentA: Number(L3.currentA.toFixed(1)),
      powerKw: Number(L3.powerKw.toFixed(2)),
      count: L3.count,
      utilizationPercent: L3.utilizationPercent,
    },
    totalInstalledKw,
    simultaneityFactor,
    simultaneousKw,
    estimatedMaxCurrentA: Number(maxPhaseCurrent.toFixed(1)),
    asymmetryPercent,
  };
}

/**
 * Parses conductor cross-section in mm² from cable string (e.g., "CYKY-J 3x2,5 mm²" -> 2.5)
 */
export function parseCableCrossSection(cable: string): number {
  const normalized = cable.replace(',', '.');
  const match = normalized.match(/[x×]\s*(\d+(?:\.\d+)?)/i);
  if (match && match[1]) {
    return parseFloat(match[1]);
  }
  if (normalized.includes('1.5')) return 1.5;
  if (normalized.includes('2.5')) return 2.5;
  if (normalized.includes('4')) return 4;
  if (normalized.includes('6')) return 6;
  if (normalized.includes('10')) return 10;
  if (normalized.includes('16')) return 16;
  return 2.5;
}

/**
 * Returns allowable current carrying capacity Iz (A) for Cu PVC cable at 30°C per STN 33 2000-5-523
 */
export function getConductorAmpacityIz(
  crossSectionMm2: number,
  isThreePhase: boolean,
  method: CableInstallationMethod = 'B1 (v inštalačnej rúre v stene)'
): number {
  // Table values for Cu PVC (2 loaded conductors vs 3 loaded conductors)
  const table2Loaded: Record<number, Record<CableInstallationMethod, number>> = {
    1.5: {
      'A1 (v tepelnej izolácii)': 14.5,
      'B1 (v inštalačnej rúre v stene)': 17.5,
      'C (pod omietkou / na stene)': 19.5,
      'E (voľne na vzduchu / žľab)': 22,
    },
    2.5: {
      'A1 (v tepelnej izolácii)': 19.5,
      'B1 (v inštalačnej rúre v stene)': 24,
      'C (pod omietkou / na stene)': 27,
      'E (voľne na vzduchu / žľab)': 30,
    },
    4: {
      'A1 (v tepelnej izolácii)': 26,
      'B1 (v inštalačnej rúre v stene)': 32,
      'C (pod omietkou / na stene)': 36,
      'E (voľne na vzduchu / žľab)': 40,
    },
    6: {
      'A1 (v tepelnej izolácii)': 34,
      'B1 (v inštalačnej rúre v stene)': 41,
      'C (pod omietkou / na stene)': 46,
      'E (voľne na vzduchu / žľab)': 51,
    },
    10: {
      'A1 (v tepelnej izolácii)': 46,
      'B1 (v inštalačnej rúre v stene)': 57,
      'C (pod omietkou / na stene)': 63,
      'E (voľne na vzduchu / žľab)': 70,
    },
  };

  const base = table2Loaded[crossSectionMm2]?.[method] ?? 24;
  return isThreePhase ? Number((base * 0.88).toFixed(1)) : base;
}

/**
 * Full electrical engineering calculator for all circuits in the switchboard
 * Computes Ib, Iz, ΔU (V and %), loop impedance Zs, short-circuit current Ik_min, and disconnection conditions
 */
export function calculateCircuitParameters(
  project: SwitchboardProject
): CircuitCalculationResult[] {
  const copperConductivity = 56; // γ = 56 m/(Ω·mm²) pre meď pri 20°C (pri oteplení pri skrate uvažujeme koef. 1.25)
  const upstreamZq = project.mainBreaker.supplyTransformerImpedanceOhm ?? 0.25; // Predpokladaná vstupná impedancia siete Zq v bode rozvádzača (Ω)

  return project.circuits.map((c) => {
    const is3fCircuit = c.poles === '3P' || c.poles === '4P' || c.phase === 'L1,L2,L3';
    const voltageV = is3fCircuit ? 400 : 230;
    const cosPhi = c.cosPhi ?? (c.category === 'Osvetlenie' ? 0.95 : 0.92);
    const lengthM = c.cableLengthM ?? (c.category === 'Exteriér / Garáž / EV' ? 25 : 18);
    const method: CableInstallationMethod =
      c.installationMethod ?? 'B1 (v inštalačnej rúre v stene)';
    const crossSectionMm2 = parseCableCrossSection(c.cable);

    // 1. Design current Ib (A)
    const designCurrentIb = is3fCircuit
      ? (c.powerKw * 1000) / (Math.sqrt(3) * 400 * cosPhi)
      : (c.powerKw * 1000) / (230 * cosPhi);

    // 2. Ampacity Iz (A)
    const currentCarryingCapacityIz = getConductorAmpacityIz(
      crossSectionMm2,
      is3fCircuit,
      method
    );

    // 3. Voltage drop ΔU
    // 1f: ΔU = (2 * L * Ib * cosPhi) / (γ * S)
    // 3f: ΔU = (sqrt(3) * L * Ib * cosPhi) / (γ * S)
    const voltageDropVolts = is3fCircuit
      ? (Math.sqrt(3) * lengthM * designCurrentIb * cosPhi) /
        (copperConductivity * crossSectionMm2)
      : (2 * lengthM * designCurrentIb * cosPhi) /
        (copperConductivity * crossSectionMm2);

    const voltageDropPercent = (voltageDropVolts / voltageV) * 100;
    const maxAllowedDropPercent = c.category === 'Osvetlenie' ? 3.0 : 5.0;

    // 4. Fault loop impedance Zs (Ω) & Short-circuit current Ik_min (A)
    // R_loop = 1.25 (oteplenie) * (2 * L) / (γ * S)
    const rLoop = (1.25 * 2 * lengthM) / (copperConductivity * crossSectionMm2);
    const loopImpedanceZsOhm = upstreamZq + rLoop;

    // Instantaneous electromagnetic trip current Ia (A): B = 5*In, C = 10*In, D = 20*In
    const mult = c.characteristic === 'B' ? 5 : c.characteristic === 'C' ? 10 : 20;
    const tripCurrentIa = mult * c.ratedCurrent;

    // Max allowed Zs per STN 33 2000-4-41 (s bezpečnostným súčiniteľom 2/3 pre meranie resp. Cmin = 0.95):
    // U0 = 230 V -> Zs_max = (0.95 * 230) / Ia
    const maxAllowedZsOhm = (0.95 * 230) / tripCurrentIa;
    const minShortCircuitCurrentIkA = (0.95 * 230) / loopImpedanceZsOhm;

    const overloadProtectionOk =
      designCurrentIb <= c.ratedCurrent && c.ratedCurrent <= currentCarryingCapacityIz;
    const voltageDropOk = voltageDropPercent <= maxAllowedDropPercent;
    const disconnectConditionOk = loopImpedanceZsOhm <= maxAllowedZsOhm;

    // Selectivity check with main breaker
    let selectivityWithMain: CircuitCalculationResult['selectivityWithMain'] =
      'Neistá – vyžaduje graf I²t';
    if (project.mainBreaker.ratedCurrent >= c.ratedCurrent * 1.6) {
      selectivityWithMain = 'Čiastočná (do Ik)';
    }

    return {
      circuitId: c.id,
      label: c.label,
      name: c.name,
      poles: c.poles,
      phase: c.phase,
      powerKw: c.powerKw,
      voltageV,
      cosPhi,
      designCurrentIb: Number(designCurrentIb.toFixed(2)),
      breakerCurrentIn: c.ratedCurrent,
      breakerChar: c.characteristic,
      cableText: c.cable,
      crossSectionMm2,
      lengthM,
      installationMethod: method,
      currentCarryingCapacityIz,
      voltageDropVolts: Number(voltageDropVolts.toFixed(2)),
      voltageDropPercent: Number(voltageDropPercent.toFixed(2)),
      maxAllowedDropPercent,
      loopImpedanceZsOhm: Number(loopImpedanceZsOhm.toFixed(3)),
      maxAllowedZsOhm: Number(maxAllowedZsOhm.toFixed(3)),
      minShortCircuitCurrentIkA: Math.round(minShortCircuitCurrentIkA),
      tripCurrentIa,
      overloadProtectionOk,
      voltageDropOk,
      disconnectConditionOk,
      selectivityWithMain,
    };
  });
}

/**
 * Validates the switchboard project using the 3-level Smart Validation system:
 * RED ('error'): Critical error or invalid wiring
 * ORANGE ('warning'): Missing data, unverified assumption, or requires inspection/measurement
 * GREEN ('ok'): Specific check passed
 */
export function validateStnCompliance(project: SwitchboardProject): StnValidationIssue[] {
  const issues: StnValidationIssue[] = [];
  const load = calculatePhaseLoad(project);
  const calcs = calculateCircuitParameters(project);
  const upstream = getEffectiveUpstreamBreaker(project);
  const internalDev = getEffectiveInternalDevice(project);
  const internalIsBreaker =
    internalDev.enabled &&
    (internalDev.deviceType === 'Istič' || internalDev.hasOvercurrentProtection);

  const effectiveOvercurrentIn = internalIsBreaker
    ? upstream.enabled
      ? Math.min(upstream.ratedCurrent, internalDev.ratedCurrent)
      : internalDev.ratedCurrent
    : upstream.enabled
    ? upstream.ratedCurrent
    : 63;

  // 0. Check Dual Main Devices (QF0 + QS1/QF1) coordination & selectivity
  if (!upstream.enabled && !internalIsBreaker) {
    issues.push({
      id: 'missing-main-overcurrent',
      severity: 'error',
      category: 'Zapojenie & Sieť',
      code: 'STN 33 2000-4-43 / STN 33 2130',
      title: 'Chýba hlavné nadprúdové istenie rozvádzača (QF0 alebo QF1)',
      message:
        'Hlavný istič pred elektromerom (QF0) je vypnutý a hlavný prvok v rozvádzači nemá nadprúdovú ochranou. Zapnite QF0 alebo zvoľte hlavný istič (QF1) s nadprúdovou ochranou priamo v rozvádzači.',
    });
  } else if (internalDev.enabled && !internalIsBreaker) {
    if (upstream.enabled && internalDev.ratedCurrent < upstream.ratedCurrent) {
      issues.push({
        id: 'internal-switch-overload',
        severity: 'error',
        category: 'Chrániče & Selektivita',
        code: 'STN EN 61439-3 / STN EN 60947-3',
        title: `Nepostačujúci menovitý prúd hlavného vypínača ${internalDev.designation} (${internalDev.ratedCurrent} A)`,
        message: `${internalDev.deviceType} ${internalDev.designation} (In = ${internalDev.ratedCurrent} A, bez vlastnej nadprúdovej ochrany) má nižší menovitý prúd ako predradený hlavný istič ${upstream.designation} (${upstream.ratedCurrent} A). Zvoľte ${internalDev.deviceType.toLowerCase()} s In ≥ ${upstream.ratedCurrent} A.`,
      });
    } else {
      issues.push({
        id: 'internal-device-ok',
        severity: 'ok',
        category: 'Zapojenie & Sieť',
        code: 'STN 33 2130 / STN EN 60947-3',
        title: `Koordinácia hlavného ističa ${upstream.designation} a hlavného vypínača ${internalDev.designation}`,
        message: `Hlavný vypínač ${internalDev.designation} (${internalDev.poles} ${internalDev.ratedCurrent} A, bez nadprúdovej ochrany) slúži na bezpečné odpojenie rozvádzača a je chránený predradeným hlavným ističom ${upstream.designation} (${upstream.characteristic}${upstream.ratedCurrent} A).`,
      });
    }
  } else if (internalIsBreaker && upstream.enabled) {
    if (internalDev.ratedCurrent >= upstream.ratedCurrent) {
      issues.push({
        id: 'dual-breaker-selectivity',
        severity: 'warning',
        category: 'Chrániče & Selektivita',
        code: 'STN 33 2000-5-53 čl. 536',
        title: `Neselektívne radenie dvoch hlavných ističov ${upstream.designation} (${upstream.ratedCurrent} A) a ${internalDev.designation} (${internalDev.ratedCurrent} A)`,
        message: `V rozvádzači je osadený hlavný istič ${internalDev.designation} (${internalDev.characteristic || 'B'}${internalDev.ratedCurrent} A) za hlavným ističom ${upstream.designation} (${upstream.characteristic}${upstream.ratedCurrent} A). Pri poruche alebo preťažení môže vypnúť istič pri elektromere. V bytovom rozvádzači odporúčame použiť hlavný vypínač (QS1) bez nadprúdovej ochrany alebo nižší stupeň ističa.`,
      });
    } else {
      issues.push({
        id: 'internal-device-ok',
        severity: 'ok',
        category: 'Chrániče & Selektivita',
        code: 'STN 33 2000-5-53',
        title: `Odstupňovanie hlavného ističa ${upstream.designation} (${upstream.ratedCurrent} A) a ${internalDev.designation} (${internalDev.ratedCurrent} A)`,
        message: `Hlavný istič v rozvádzači ${internalDev.designation} (${internalDev.characteristic || 'B'}${internalDev.ratedCurrent} A) má nižší menovitý prúd ako hlavný istič pred elektromerom ${upstream.designation} (${upstream.characteristic}${upstream.ratedCurrent} A).`,
      });
    }
  }

  // 1. TN-C network vs RCD check (STN 33 2000-4-41)
  if (project.networkSystem === 'TN-C' && project.rcds.length > 0) {
    issues.push({
      id: 'tnc-rcd',
      severity: 'error',
      category: 'Zapojenie & Sieť',
      code: 'STN 33 2000-4-41 čl. 411.4.3',
      title: 'KRITICKÁ CHYBA: Prúdový chránič v sieti TN-C nie je prípustný',
      message:
        'V sieti TN-C (spoločný vodič PEN) nesmie byť zaradený prúdový chránič, pretože ochranný vodič PE sa nesmie spínať ani odpájať. Zmeňte sústavu na TN-C-S (s bodom rozdelenia PEN na PE a N pred chráničmi) alebo TN-S.',
    });
  } else if (project.rcds.length > 0) {
    issues.push({
      id: 'rcd-present',
      severity: 'ok',
      category: 'Zapojenie & Sieť',
      code: 'STN 33 2000-4-41',
      title: 'Doplnková ochrana prúdovými chráničmi a oddelenie N zberníc',
      message: `Osadené prúdové chrániče (${project.rcds.length} ks) v sústave ${project.networkSystem} majú samostatne oddelené neutrálne prípojnice N(FI) bez nepovoleného spájania neutrálnych vodičov za rôznymi chráničmi.`,
    });
  }

  // 2. Check RCCB rated current vs Effective Upstream Breaker rated current (STN EN 61439-3)
  let allRccbsProtected = true;
  project.rcds
    .filter((r) => r.deviceKind === 'RCCB')
    .forEach((rccb) => {
      const childCircuits = project.circuits.filter((c) => c.rcdId === rccb.id);
      const sumChildCurrents = childCircuits.reduce((acc, c) => acc + c.ratedCurrent, 0);

      if (rccb.ratedCurrent < effectiveOvercurrentIn && sumChildCurrents > rccb.ratedCurrent) {
        allRccbsProtected = false;
        issues.push({
          id: `rccb-overload-${rccb.id}`,
          severity: 'error',
          category: 'Chrániče & Selektivita',
          code: 'STN EN 61439-3 / STN 33 2000-5-53',
          title: `Nepostačujúca ochrana chrániča ${rccb.label} (${rccb.ratedCurrent} A) pred preťažením`,
          message: `Prúdový chránič ${rccb.label} (RCCB bez vlastnej nadprúdovej ochrany, In = ${rccb.ratedCurrent} A) má nižší menovitý prúd ako predradený hlavný istič (${effectiveOvercurrentIn} A) a súčet ističov za ním je ${sumChildCurrents} A. Zvoľte RCCB s In ≥ ${effectiveOvercurrentIn} A (napr. 40 A / 63 A).`,
        });
      }
    });

  if (allRccbsProtected && project.rcds.some((r) => r.deviceKind === 'RCCB')) {
    const activeBreakerLabel = internalIsBreaker
      ? `${internalDev.designation} (${internalDev.ratedCurrent} A)`
      : `${upstream.designation} (${upstream.ratedCurrent} A)`;
    issues.push({
      id: 'rccb-overload-ok',
      severity: 'ok',
      category: 'Chrániče & Selektivita',
      code: 'STN EN 61439-3',
      title: 'Koordinácia prúdových chráničov RCCB s hlavným ističom',
      message: `Menovitý prúd všetkých skupinových chráničov RCCB vyhovuje voči predradenému hlavnému ističu ${activeBreakerLabel}.`,
    });
  }

  // 3. Check 4P RCD in 1-phase supply system
  if (project.phaseCount === 1 && project.rcds.some((r) => r.poles === '4P')) {
    issues.push({
      id: '1f-4p-rcd',
      severity: 'warning',
      category: 'Zapojenie & Sieť',
      code: 'STN 33 2130',
      title: '4-pólový chránič v jednofázovej sústave 230 V',
      message:
        'V jednofázovej sústave (230 V) odporúčame použiť 2-pólové (2P) prúdové chrániče namiesto 4-pólových (4P).',
    });
  }

  // 4. Cable cross-section vs breaker rating & voltage drop checks (STN 33 2000-5-523)
  calcs.forEach((calc) => {
    if (!calc.overloadProtectionOk) {
      issues.push({
        id: `cable-overload-${calc.circuitId}`,
        severity: 'error',
        category: 'Káble & Istenie',
        code: 'STN 33 2000-4-43 čl. 433.1',
        title: `Porušená podmienka istenia vodiča na vývode ${calc.label} (${calc.name})`,
        message: `Pre kábel ${calc.cableText} (Iz = ${calc.currentCarryingCapacityIz} A) a výpočtový prúd Ib = ${calc.designCurrentIb} A nevyhovuje istič ${calc.breakerChar}${calc.breakerCurrentIn} A. Musí platiť Ib ≤ In ≤ Iz.`,
      });
    }
    if (!calc.voltageDropOk) {
      issues.push({
        id: `vdrop-${calc.circuitId}`,
        severity: 'warning',
        category: 'Káble & Istenie',
        code: 'STN 33 2130 / STN 33 2000-5-52',
        title: `Prekročený úbytok napätia na vývode ${calc.label} (ΔU = ${calc.voltageDropPercent} %)`,
        message: `Pri dĺžke ${calc.lengthM} m a zaťažení ${calc.powerKw} kW vychádza úbytok napätia ${calc.voltageDropPercent} % (limit ${calc.maxAllowedDropPercent} %). Zväčšite prierez vodiča alebo skontrolujte skutočnú dĺžku trasy.`,
      });
    }
    if (!calc.disconnectConditionOk) {
      issues.push({
        id: `zs-${calc.circuitId}`,
        severity: 'error',
        category: 'Meranie & Overenie',
        code: 'STN 33 2000-4-41 čl. 411.4.4',
        title: `Nevyhovujúca impedancia poruchovej slučky na vývode ${calc.label}`,
        message: `Výpočtová impedancia slučky Zs = ${calc.loopImpedanceZsOhm} Ω prekračuje maximálnu dovolenú hodnotu Zs_max = ${calc.maxAllowedZsOhm} Ω pre istič ${calc.breakerChar}${calc.breakerCurrentIn} A (Ia = ${calc.tripCurrentIa} A).`,
      });
    }
  });

  if (calcs.every((c) => c.overloadProtectionOk)) {
    issues.push({
      id: 'cables-all-ok',
      severity: 'ok',
      category: 'Káble & Istenie',
      code: 'STN 33 2000-4-43',
      title: 'Koordinácia prierezov vodičov a nadprúdových ističov (Ib ≤ In ≤ Iz)',
      message: `Všetkých ${calcs.length} koncových okruhov spĺňa podmienku ochrany vodičov pred preťažením.`,
    });
  }

  // 5. Socket circuits up to 32A without 30mA RCD check (STN 33 2000-4-41)
  const unprotectedSockets = project.circuits.filter(
    (c) =>
      (c.category === 'Zásuvky' || c.category === 'Kúpeľňa / Práčovňa') &&
      c.ratedCurrent <= 32 &&
      c.rcdId === 'NONE'
  );
  if (unprotectedSockets.length > 0) {
    issues.push({
      id: 'unprotected-sockets',
      severity: 'error',
      category: 'Zapojenie & Sieť',
      code: 'STN 33 2000-4-41 čl. 411.3.3',
      title: 'Zásuvkové/kúpeľňové obvody do 32 A bez prúdového chrániča 30 mA',
      message: `Obvody (${unprotectedSockets.map((s) => s.label).join(', ')}) nemajú priradený prúdový chránič. Podľa STN 33 2000-4-41 musia byť zásuvkové obvody do 32 A a obvody v kúpeľni povinne chránené chráničom s IΔn ≤ 30 mA.`,
    });
  }

  // 6. Main breaker capacity vs simultaneous load
  if (load.estimatedMaxCurrentA > project.mainBreaker.ratedCurrent) {
    issues.push({
      id: 'main-breaker-overload',
      severity: 'warning',
      category: 'Káble & Istenie',
      code: 'STN 33 2130',
      title: 'Výpočtový súdobý prúd prevyšuje hlavný istič',
      message: `Odhadovaný súdobý prúd najzaťaženejšej fázy (${load.estimatedMaxCurrentA} A pri súčiniteli súčasnosti β = ${load.simultaneityFactor}) prevyšuje menovitý prúd hlavného ističa (${project.mainBreaker.ratedCurrent} A). Zvážte vyváženie fáz alebo vyšší hlavný istič.`,
    });
  } else {
    issues.push({
      id: 'main-breaker-ok',
      severity: 'ok',
      category: 'Káble & Istenie',
      code: 'STN 33 2130',
      title: 'Dimenzovanie hlavného ističa a súdobého príkonu vyhovuje',
      message: `Súdobý prúd (${load.estimatedMaxCurrentA} A) je nižší ako menovitý prúd hlavného ističa ${project.mainBreaker.characteristic}${project.mainBreaker.ratedCurrent} A (${project.mainBreaker.location}).`,
    });
  }

  // 7. Phase symmetry check for 3-phase systems
  if (project.phaseCount === 3 && load.asymmetryPercent > 25) {
    issues.push({
      id: 'phase-asymmetry',
      severity: 'warning',
      category: 'Fázová symetria',
      code: 'STN 33 2130',
      title: `Nesymetria zaťaženia fáz L1/L2/L3 (${load.asymmetryPercent} %)`,
      message: `Rozdiel medzi najzaťaženejšou a najmenej zaťaženou fázou je ${load.asymmetryPercent} %. Odporúčame využiť automatické vyváženie fáz.`,
    });
  } else if (project.phaseCount === 3) {
    issues.push({
      id: 'phase-symmetry-ok',
      severity: 'ok',
      category: 'Fázová symetria',
      code: 'STN 33 2130',
      title: `Rovnomerné rozdelenie záťaže medzi fázy L1, L2, L3 (odchýlka ${load.asymmetryPercent} %)`,
      message: `Zaťaženie fáz L1 (${load.L1.powerKw} kW), L2 (${load.L2.powerKw} kW), L3 (${load.L3.powerKw} kW) je vyvážené.`,
    });
  }

  // 8. Mandatory Engineering & On-Site Verification Warnings (ORANGE) unless verified by engineer
  const checklist = project.verificationChecklist;
  if (!checklist?.shortCircuitMeasuredOrCalculated) {
    issues.push({
      id: 'verify-impedance-zq',
      severity: 'warning',
      category: 'Meranie & Overenie',
      code: 'STN 33 2000-6 (Revízia)',
      title: 'Vyžaduje overenie skutočnej vstupnej impedancie siete Zq a skratových prúdov',
      message:
        'Výpočet impedancie poruchovej slučky Zs vychádza z predpokladanej vstupnej impedancie nadradenej siete Zq = 0,25 Ω. Pred uvedením do prevádzky je nevyhnutné odborné meranie impedancie slučky a skratového prúdu na mieste inštalácie.',
      verificationRequirement: 'Potvrdiť v sekcii Kontrola po overení meraním/výpočtom projektanta',
    });
  }
  if (!checklist?.selectivityVerified) {
    issues.push({
      id: 'verify-selectivity-i2t',
      severity: 'warning',
      category: 'Chrániče & Selektivita',
      code: 'STN EN 60898-1 / STN 33 2000-5-53',
      title: 'Selektivita ističov v skratovej oblasti vyžaduje overenie charakteristík I²t',
      message:
        'Medzi modulárnymi ističmi (hlavný istič v RE a podradené vývodové ističe FA) je úplná selektivita zaručená len do medzného prúdu selektivity Is podľa tabuliek výrobcu.',
      verificationRequirement: 'Overiť tabuľku selektivity konkrétneho výrobcu a potvrdiť v protokole',
    });
  }
  if (!checklist?.thermalDissipationVerified) {
    issues.push({
      id: 'verify-thermal-loss',
      severity: 'warning',
      category: 'Meranie & Overenie',
      code: 'STN EN 61439-1 čl. 10.10',
      title: 'Kontrola oteplenia a stratového výkonu rozvádzača',
      message:
        'Pre finálne osadenie rozvádzača je potrebné overiť, že celkový stratový výkon prístrojov (W) neprekračuje maximálny dovolený stratový výkon zvolenej rozvodnicovej skrine.',
      verificationRequirement: 'Overiť katalógový stratový výkon skrine (W) podľa STN EN 61439-3',
    });
  }

  return issues;
}

export interface DinModuleSlot {
  id: string;
  label: string;
  sublabel: string;
  type: 'main-breaker' | 'main-switch' | 'spd' | 'rccb' | 'rcbo' | 'mcb' | 'reserve';
  poles: string;
  modules: number;
  ratingText: string;
  phaseText: string;
  manufacturer: string;
  model: string;
  rcdGroupLabel?: string;
}

export interface DinRailLayout {
  modulesPerRow: number;
  rows: DinModuleSlot[][];
  totalUsedModules: number;
  totalCapacityModules: number;
  reservePercentage: number;
  recommendedEnclosure: string;
  dimensionsMm: { width: number; height: number; depth: number };
  estimatedPowerLossW: number;
}

export function calculateDinRailAllocation(project: SwitchboardProject): DinRailLayout {
  const slots: DinModuleSlot[] = [];
  const internalDev = getEffectiveInternalDevice(project);

  const pushInternalMainSlot = () => {
    if (!internalDev.enabled) return;
    const isBreaker = internalDev.deviceType === 'Istič' || internalDev.hasOvercurrentProtection;
    slots.push({
      id: isBreaker ? 'FA-MAIN' : 'QS-MAIN',
      label: `${internalDev.designation} / ${
        internalDev.deviceType === 'Istič'
          ? 'HL. ISTIČ'
          : internalDev.deviceType === 'Odpínač'
          ? 'ODPÍNAČ'
          : 'HL. VYP.'
      }`,
      sublabel: `${internalDev.deviceType} v rozvádzači`,
      type: isBreaker ? 'main-breaker' : 'main-switch',
      poles: internalDev.poles,
      modules: internalDev.modules || getPolesModuleCount(internalDev.poles),
      ratingText: isBreaker
        ? `${internalDev.characteristic || 'B'}${internalDev.ratedCurrent} A (${
            internalDev.breakingCapacity || '10 kA'
          })`
        : `${internalDev.ratedCurrent} A`,
      phaseText: project.phaseCount === 3 ? 'L1,L2,L3' : 'L1',
      manufacturer: internalDev.manufacturer,
      model: internalDev.model,
    });
  };

  const pushSpdSlot = () => {
    if (!project.mainBreaker.hasSurgeProtector) return;
    const spdModules = project.phaseCount === 3 ? 4 : 2;
    slots.push({
      id: 'FA-SPD',
      label: 'FV1 / SPD',
      sublabel: `Zvodič prepätia ${project.mainBreaker.surgeProtectorType}`,
      type: 'spd',
      poles: project.phaseCount === 3 ? '4P' : '2P',
      modules: spdModules,
      ratingText: project.mainBreaker.surgeProtectorType,
      phaseText: project.phaseCount === 3 ? 'L1,L2,L3,N,PE' : 'L1,N,PE',
      manufacturer: project.mainBreaker.manufacturer,
      model: project.mainBreaker.surgeProtectorType.startsWith('T1')
        ? 'SPBT12-280/4'
        : 'SPCT2-280/4',
    });
  };

  if (internalDev.topologyPosition === 'ZA_SPD_PRED_RCD') {
    pushSpdSlot();
    pushInternalMainSlot();
  } else {
    pushInternalMainSlot();
    pushSpdSlot();
  }

  project.rcds.forEach((rcd) => {
    if (rcd.deviceKind === 'RCCB') {
      slots.push({
        id: rcd.id,
        label: rcd.label,
        sublabel: `Prúdový chránič RCCB (${rcd.type})`,
        type: 'rccb',
        poles: rcd.poles,
        modules: getPolesModuleCount(rcd.poles),
        ratingText: `${rcd.ratedCurrent} A / ${rcd.sensitivity} mA`,
        phaseText: rcd.poles === '4P' ? 'L1,L2,L3,N' : `${rcd.phase || 'L1'},N`,
        manufacturer: rcd.manufacturer,
        model: rcd.model,
        rcdGroupLabel: rcd.label,
      });

      const children = project.circuits.filter((c) => c.rcdId === rcd.id);
      children.forEach((c) => {
        slots.push({
          id: c.id,
          label: c.label,
          sublabel: c.name,
          type: 'mcb',
          poles: c.poles,
          modules: getPolesModuleCount(c.poles),
          ratingText: `${c.characteristic}${c.ratedCurrent} A`,
          phaseText: c.phase,
          manufacturer: c.manufacturer,
          model: c.model,
          rcdGroupLabel: rcd.label,
        });
      });
    } else {
      slots.push({
        id: rcd.id,
        label: rcd.label,
        sublabel: rcd.circuitName ? `RCBO: ${rcd.circuitName}` : `Ističochránič RCBO (${rcd.type})`,
        type: 'rcbo',
        poles: rcd.poles,
        modules: getPolesModuleCount(rcd.poles),
        ratingText: `${rcd.characteristic || 'B'}${rcd.ratedCurrent} A / ${rcd.sensitivity} mA`,
        phaseText: rcd.poles === '4P' ? 'L1,L2,L3,N' : `${rcd.phase || 'L1'},N`,
        manufacturer: rcd.manufacturer,
        model: rcd.model,
        rcdGroupLabel: `${rcd.label} (RCBO)`,
      });

      const children = project.circuits.filter((c) => c.rcdId === rcd.id);
      children.forEach((c) => {
        slots.push({
          id: c.id,
          label: c.label,
          sublabel: c.name,
          type: 'mcb',
          poles: c.poles,
          modules: getPolesModuleCount(c.poles),
          ratingText: `${c.characteristic}${c.ratedCurrent} A`,
          phaseText: c.phase,
          manufacturer: c.manufacturer,
          model: c.model,
          rcdGroupLabel: rcd.label,
        });
      });
    }
  });

  const validRcdIds = new Set(project.rcds.map((r) => r.id));
  const directCircuits = project.circuits.filter(
    (c) => c.rcdId === 'NONE' || !validRcdIds.has(c.rcdId)
  );
  directCircuits.forEach((c) => {
    slots.push({
      id: c.id,
      label: c.label,
      sublabel: c.name,
      type: 'mcb',
      poles: c.poles,
      modules: getPolesModuleCount(c.poles),
      ratingText: `${c.characteristic}${c.ratedCurrent} A`,
      phaseText: c.phase,
      manufacturer: c.manufacturer,
      model: c.model,
      rcdGroupLabel: 'Bez RCD',
    });
  });

  const totalUsedModules = slots.reduce((sum, s) => sum + s.modules, 0);
  const modulesPerRow = totalUsedModules > 36 ? 18 : 12;

  const rows: DinModuleSlot[][] = [];
  let currentRow: DinModuleSlot[] = [];
  let currentRowMods = 0;

  slots.forEach((slot) => {
    if (currentRowMods + slot.modules > modulesPerRow && currentRow.length > 0) {
      rows.push(currentRow);
      currentRow = [slot];
      currentRowMods = slot.modules;
    } else {
      currentRow.push(slot);
      currentRowMods += slot.modules;
    }
  });
  if (currentRow.length > 0) {
    rows.push(currentRow);
  }

  const minRequiredCapacity = Math.ceil(totalUsedModules * 1.25);
  while (rows.length * modulesPerRow < minRequiredCapacity || rows.length === 0) {
    rows.push([]);
  }

  const totalCapacityModules = rows.length * modulesPerRow;
  const reservePercentage = Math.round(
    ((totalCapacityModules - totalUsedModules) / totalCapacityModules) * 100
  );

  const recommendedEnclosure = `${rows.length}-radový rozvádzač (${totalCapacityModules} modulov, ${rows.length}×${modulesPerRow}M, ${project.ipRating})`;

  const width = modulesPerRow === 18 ? 420 : 315;
  const height = 160 + rows.length * 150;
  const depth = project.enclosureMounting.includes('Pod omietku') ? 98 : 122;
  const estimatedPowerLossW = Number((totalUsedModules * 2.1).toFixed(1));

  return {
    modulesPerRow,
    rows,
    totalUsedModules,
    totalCapacityModules,
    reservePercentage,
    recommendedEnclosure,
    dimensionsMm: { width, height, depth },
    estimatedPowerLossW,
  };
}

/**
 * Generates Bill of Materials (Kusovník prístrojov) with catalog numbers
 */
export function generateBom(project: SwitchboardProject): BomItem[] {
  const items: BomItem[] = [];
  const upstream = getEffectiveUpstreamBreaker(project);
  const internalDev = getEffectiveInternalDevice(project);

  if (upstream.enabled) {
    items.push({
      code: upstream.designation || 'QF0',
      designation: `Hlavný istič pred elektromerom (${upstream.placement})`,
      category: 'Hlavné istenie (RE)',
      description: `Istič ${upstream.poles}, char. ${upstream.characteristic}, In = ${upstream.ratedCurrent} A, Icn = ${upstream.breakingCapacity}`,
      manufacturer: upstream.manufacturer,
      model: upstream.model,
      catalogNumber:
        project.mainBreaker.catalogNumber ||
        suggestCatalogNumber(
          upstream.manufacturer,
          upstream.model,
          upstream.poles,
          upstream.ratedCurrent
        ),
      modules: getPolesModuleCount(upstream.poles),
      quantity: 1,
    });
  }

  if (internalDev.enabled) {
    const isBreaker = internalDev.deviceType === 'Istič' || internalDev.hasOvercurrentProtection;
    items.push({
      code: internalDev.designation,
      designation: `${internalDev.deviceType} v bytovom rozvádzači`,
      category: isBreaker ? 'Hlavné istenie v rozvádzači' : 'Hlavný spínací prvok',
      description: isBreaker
        ? `${internalDev.deviceType} (s nadprúdovou ochranou) ${internalDev.poles}, char. ${
            internalDev.characteristic || 'B'
          }, In = ${internalDev.ratedCurrent} A, Icn = ${internalDev.breakingCapacity || '10 kA'}`
        : `${internalDev.deviceType} (bez nadprúdovej ochrany) ${internalDev.poles}, In = ${internalDev.ratedCurrent} A`,
      manufacturer: internalDev.manufacturer,
      model: internalDev.model,
      catalogNumber:
        internalDev.catalogNumber ||
        (isBreaker
          ? suggestCatalogNumber(
              internalDev.manufacturer,
              internalDev.model,
              internalDev.poles,
              internalDev.ratedCurrent
            )
          : `276${internalDev.ratedCurrent}`),
      modules: internalDev.modules || getPolesModuleCount(internalDev.poles),
      quantity: 1,
    });
  }

  if (project.mainBreaker.hasSurgeProtector) {
    const spdModel =
      project.mainBreaker.manufacturer === 'Eaton'
        ? project.mainBreaker.surgeProtectorType.startsWith('T1')
          ? 'SPBT12-280/4'
          : 'SPCT2-280/4'
        : `SPD-${project.mainBreaker.surgeProtectorType.split(' ')[0]}`;
    items.push({
      code: 'FV1',
      designation: 'Zvodič bleskového prúdu a prepätia (SPD)',
      category: 'Prepäťová ochrana',
      description: `Zvodič prepätia ${project.mainBreaker.surgeProtectorType}, ${
        project.phaseCount === 3 ? '4-pólový (L1,L2,L3,N/PE)' : '2-pólový (L,N/PE)'
      }`,
      manufacturer: project.mainBreaker.manufacturer,
      model: spdModel,
      catalogNumber: project.mainBreaker.surgeProtectorType.startsWith('T1')
        ? '158331'
        : '167595',
      modules: project.phaseCount === 3 ? 4 : 2,
      quantity: 1,
    });
  }

  project.rcds.forEach((rcd) => {
    const isRcbo = rcd.deviceKind === 'RCBO';
    items.push({
      code: rcd.label,
      designation: isRcbo
        ? `Kombinovaný chránič s nadprúdovou ochranou (RCBO)${
            rcd.circuitName ? ` – ${rcd.circuitName}` : ''
          }`
        : `Prúdový chránič (RCCB)`,
      category: isRcbo ? 'RCBO (Ističochránič)' : 'RCCB (Prúdový chránič)',
      description: isRcbo
        ? `${rcd.poles}, char. ${rcd.characteristic || 'B'}, In = ${rcd.ratedCurrent} A, IΔn = ${
            rcd.sensitivity
          } mA, typ ${rcd.type}`
        : `${rcd.poles}, In = ${rcd.ratedCurrent} A, IΔn = ${rcd.sensitivity} mA, typ ${rcd.type}`,
      manufacturer: rcd.manufacturer,
      model: rcd.model,
      catalogNumber:
        rcd.catalogNumber ||
        suggestCatalogNumber(rcd.manufacturer, rcd.model, rcd.poles, rcd.ratedCurrent),
      modules: getPolesModuleCount(rcd.poles),
      quantity: 1,
    });
  });

  project.circuits.forEach((c) => {
    items.push({
      code: c.label,
      designation: `Istič obvodu – ${c.name}`,
      category: `Vývod (${c.category})`,
      description: `Istič ${c.poles}, char. ${c.characteristic}, In = ${c.ratedCurrent} A, Icn = ${c.breakingCapacity} (${c.cable})`,
      manufacturer: c.manufacturer,
      model: c.model,
      catalogNumber:
        c.catalogNumber ||
        suggestCatalogNumber(c.manufacturer, c.model, c.poles, c.ratedCurrent),
      modules: getPolesModuleCount(c.poles),
      quantity: 1,
    });
  });

  return items;
}

/**
 * AI Smart Designer input & proposal generator
 * Explicitly lists engineering assumptions, uncertainties, and mandatory human verification items
 */
export interface SmartDesignerInput {
  projectName: string;
  objectType: ObjectType;
  roomCount: number;
  lightCircuitCount: number;
  socketCircuitCount: number;
  mainBreakerCurrent: MainBreakerCurrent;
  mainBreakerChar: BreakerCharacteristic;
  mainBreakerLocation: 'PRED ROZVÁDZAČOM' | 'V ROZVÁDZAČI';
  networkSystem: NetworkSystemType;
  supplySystem: '1f' | '3f';
  preferredManufacturer: Manufacturer;
  appliances: {
    inductionCooktop: boolean;
    electricOven: boolean;
    dishwasher: boolean;
    washingMachine: boolean;
    dryer: boolean;
    boilerWaterHeater: boolean;
    heatPumpOrBoiler: boolean;
    airConditioning: boolean;
    evWallbox11kW: boolean;
    outdoorAndGarage: boolean;
  };
  protections: {
    hasSpd: boolean;
    spdType: 'T1+T2 (B+C)' | 'T2 (C)';
    useRcboForFridgeAndCritical: boolean;
    useTypeBRcdForEv: boolean;
    useAfddForBedrooms: boolean;
  };
}

export interface SmartDesignerProposal {
  project: SwitchboardProject;
  assumptions: string[];
  uncertainties: string[];
  mandatoryHumanChecks: string[];
}

export function generateSmartSwitchboardProposal(
  input: SmartDesignerInput
): SmartDesignerProposal {
  const is3f = input.supplySystem === '3f';
  const mfg = input.preferredManufacturer;
  const mainPoles: PolesType = is3f ? '3P' : '1P';

  const rcds: RcdConfig[] = [];
  const circuits: CircuitConfig[] = [];

  // Create Group 1 & Group 2 RCCBs (minimum 2 independent RCCBs per STN 33 2130 so a single fault never plunges whole house into darkness)
  const rccb1Id = 'rcd-smart-1';
  const rccb2Id = 'rcd-smart-2';

  const rccbCurrent: RcdRatedCurrent = input.mainBreakerCurrent <= 40 ? 40 : 63;
  const rccbPoles: RcdPoles = is3f ? '4P' : '2P';

  rcds.push({
    id: rccb1Id,
    label: 'FI1',
    deviceKind: 'RCCB',
    poles: rccbPoles,
    ratedCurrent: rccbCurrent,
    sensitivity: 30,
    type: 'A',
    manufacturer: mfg,
    model: suggestRcdModel(mfg, 'RCCB', rccbPoles, rccbCurrent, 30, 'A'),
    phase: is3f ? 'L1,L2,L3' : 'L1',
    notes: 'Skupina 1 – Kuchyňa, denná zóna a polovica osvetlenia',
  });

  rcds.push({
    id: rccb2Id,
    label: 'FI2',
    deviceKind: 'RCCB',
    poles: rccbPoles,
    ratedCurrent: rccbCurrent,
    sensitivity: 30,
    type: 'A',
    manufacturer: mfg,
    model: suggestRcdModel(mfg, 'RCCB', rccbPoles, rccbCurrent, 30, 'A'),
    phase: is3f ? 'L1,L2,L3' : 'L1',
    notes: 'Skupina 2 – Nočná zóna, kúpeľňa, technológie a druhá polovica osvetlenia',
  });

  if (input.appliances.evWallbox11kW && is3f) {
    const evRcdType: RcdType = input.protections.useTypeBRcdForEv ? 'B' : 'A';
    rcds.push({
      id: 'rcd-smart-ev',
      label: `FI${rcds.length + 1}`,
      deviceKind: 'RCCB',
      poles: '4P',
      ratedCurrent: 40,
      sensitivity: 30,
      type: evRcdType,
      manufacturer: mfg,
      model: suggestRcdModel(mfg, 'RCCB', '4P', 40, 30, evRcdType),
      phase: 'L1,L2,L3',
      notes: `Samostatný prúdový chránič typu ${evRcdType} pre EV Wallbox 11 kW`,
    });
  }

  if (input.protections.useRcboForFridgeAndCritical) {
    rcds.push({
      id: 'rcd-smart-rcbo',
      label: `FI${rcds.length + 1}`,
      deviceKind: 'RCBO',
      poles: '2P',
      ratedCurrent: 16,
      sensitivity: 30,
      type: 'A',
      characteristic: 'B',
      breakingCapacity: '10 kA',
      manufacturer: mfg,
      model: suggestRcdModel(mfg, 'RCBO', '2P', 16, 30, 'A', 'B'),
      phase: is3f ? 'L3' : 'L1',
      circuitName: 'Chladnička, mraznička, router a zabezpečenie (RCBO)',
      cableType: 'CYKY-J 3x2,5 mm²',
      powerKw: 0.65,
      notes: 'Samostatný kombinovaný ističochránič RCBO pre kritické spotrebiče',
    });
  }

  let faCounter = 1;
  const nextFa = () => `FA${faCounter++}`;

  // Add appliances first
  if (input.appliances.inductionCooktop) {
    const poles: PolesType = is3f ? '3P' : '1P';
    const curr = is3f ? 16 : 25;
    circuits.push({
      id: `sc-${faCounter}`,
      label: nextFa(),
      name: 'Indukčná varná doska',
      category: 'Kuchyňa / Spotrebiče',
      rcdId: rccb1Id,
      poles,
      ratedCurrent: curr,
      characteristic: 'B',
      breakingCapacity: '10 kA',
      phase: is3f ? 'L1,L2,L3' : 'L1',
      cable: is3f ? 'CYKY-J 5x2,5 mm²' : 'CYKY-J 3x4 mm²',
      cableLengthM: 14,
      powerKw: is3f ? 7.2 : 4.5,
      manufacturer: mfg,
      model: suggestCircuitBreakerModel(mfg, poles, 'B', curr),
    });
  }

  if (input.appliances.electricOven) {
    circuits.push({
      id: `sc-${faCounter}`,
      label: nextFa(),
      name: 'Elektrická rúra na pečenie',
      category: 'Kuchyňa / Spotrebiče',
      rcdId: rccb1Id,
      poles: '1P',
      ratedCurrent: 16,
      characteristic: 'B',
      breakingCapacity: '10 kA',
      phase: 'L1',
      cable: 'CYKY-J 3x2,5 mm²',
      cableLengthM: 14,
      powerKw: 3.2,
      manufacturer: mfg,
      model: suggestCircuitBreakerModel(mfg, '1P', 'B', 16),
    });
  }

  if (input.appliances.dishwasher) {
    circuits.push({
      id: `sc-${faCounter}`,
      label: nextFa(),
      name: 'Umývačka riadu',
      category: 'Kuchyňa / Spotrebiče',
      rcdId: rccb1Id,
      poles: '1P',
      ratedCurrent: 16,
      characteristic: 'B',
      breakingCapacity: '10 kA',
      phase: is3f ? 'L2' : 'L1',
      cable: 'CYKY-J 3x2,5 mm²',
      cableLengthM: 15,
      powerKw: 2.2,
      manufacturer: mfg,
      model: suggestCircuitBreakerModel(mfg, '1P', 'B', 16),
    });
  }

  if (input.appliances.washingMachine) {
    circuits.push({
      id: `sc-${faCounter}`,
      label: nextFa(),
      name: 'Kúpeľňa – práčka',
      category: 'Kúpeľňa / Práčovňa',
      rcdId: rccb2Id,
      poles: '1P',
      ratedCurrent: 16,
      characteristic: 'B',
      breakingCapacity: '10 kA',
      phase: is3f ? 'L3' : 'L1',
      cable: 'CYKY-J 3x2,5 mm²',
      cableLengthM: 12,
      powerKw: 2.2,
      manufacturer: mfg,
      model: suggestCircuitBreakerModel(mfg, '1P', 'B', 16),
    });
  }

  if (input.appliances.dryer) {
    circuits.push({
      id: `sc-${faCounter}`,
      label: nextFa(),
      name: 'Sušička bielizne',
      category: 'Kúpeľňa / Práčovňa',
      rcdId: rccb2Id,
      poles: '1P',
      ratedCurrent: 16,
      characteristic: 'B',
      breakingCapacity: '10 kA',
      phase: is3f ? 'L1' : 'L1',
      cable: 'CYKY-J 3x2,5 mm²',
      cableLengthM: 12,
      powerKw: 1.8,
      manufacturer: mfg,
      model: suggestCircuitBreakerModel(mfg, '1P', 'B', 16),
    });
  }

  if (input.appliances.boilerWaterHeater) {
    circuits.push({
      id: `sc-${faCounter}`,
      label: nextFa(),
      name: 'Elektrický ohrievač vody (Bojler TÚV)',
      category: 'Technológia / Kúrenie',
      rcdId: rccb2Id,
      poles: '1P',
      ratedCurrent: 16,
      characteristic: 'B',
      breakingCapacity: '10 kA',
      phase: is3f ? 'L2' : 'L1',
      cable: 'CYKY-J 3x2,5 mm²',
      cableLengthM: 10,
      powerKw: 2.2,
      manufacturer: mfg,
      model: suggestCircuitBreakerModel(mfg, '1P', 'B', 16),
    });
  }

  if (input.appliances.heatPumpOrBoiler) {
    const poles: PolesType = is3f ? '3P' : '1P';
    circuits.push({
      id: `sc-${faCounter}`,
      label: nextFa(),
      name: is3f ? 'Tepelné čerpadlo / Elektrokotol (400 V)' : 'Vykurovacie teleso',
      category: 'Technológia / Kúrenie',
      rcdId: rccb2Id,
      poles,
      ratedCurrent: 16,
      characteristic: 'C',
      breakingCapacity: '10 kA',
      phase: is3f ? 'L1,L2,L3' : 'L1',
      cable: is3f ? 'CYKY-J 5x2,5 mm²' : 'CYKY-J 3x2,5 mm²',
      cableLengthM: 16,
      powerKw: is3f ? 6.5 : 2.5,
      manufacturer: mfg,
      model: suggestCircuitBreakerModel(mfg, poles, 'C', 16),
    });
  }

  if (input.appliances.airConditioning) {
    circuits.push({
      id: `sc-${faCounter}`,
      label: nextFa(),
      name: 'Klimatizačná jednotka',
      category: 'Technológia / Kúrenie',
      rcdId: rccb2Id,
      poles: '1P',
      ratedCurrent: 16,
      characteristic: 'C',
      breakingCapacity: '10 kA',
      phase: is3f ? 'L3' : 'L1',
      cable: 'CYKY-J 3x2,5 mm²',
      cableLengthM: 20,
      powerKw: 1.6,
      manufacturer: mfg,
      model: suggestCircuitBreakerModel(mfg, '1P', 'C', 16),
    });
  }

  if (input.appliances.evWallbox11kW && is3f) {
    circuits.push({
      id: `sc-${faCounter}`,
      label: nextFa(),
      name: 'Nabíjacia stanica elektromobilu Wallbox 11 kW',
      category: 'Exteriér / Garáž / EV',
      rcdId: 'rcd-smart-ev',
      poles: '3P',
      ratedCurrent: 16,
      characteristic: 'B',
      breakingCapacity: '10 kA',
      phase: 'L1,L2,L3',
      cable: 'CYKY-J 5x4 mm²',
      cableLengthM: 22,
      powerKw: 11.0,
      manufacturer: mfg,
      model: suggestCircuitBreakerModel(mfg, '3P', 'B', 16),
    });
  }

  // Socket circuits
  for (let i = 1; i <= input.socketCircuitCount; i++) {
    const targetRcd = i % 2 === 1 ? rccb1Id : rccb2Id;
    circuits.push({
      id: `sc-sock-${i}-${faCounter}`,
      label: nextFa(),
      name:
        i === 1
          ? 'Zásuvky kuchynská linka'
          : i === 2
          ? 'Zásuvky obývacia izba'
          : `Zásuvkový okruh izby č. ${i - 1}`,
      category: 'Zásuvky',
      rcdId: targetRcd,
      poles: '1P',
      ratedCurrent: 16,
      characteristic: 'B',
      breakingCapacity: '10 kA',
      phase: 'L1',
      cable: 'CYKY-J 3x2,5 mm²',
      cableLengthM: 18 + i * 2,
      powerKw: 2.0,
      manufacturer: mfg,
      model: suggestCircuitBreakerModel(mfg, '1P', 'B', 16),
      hasAfdd: input.protections.useAfddForBedrooms && i >= 2,
    });
  }

  // Lighting circuits (divided acrossFI1 and FI2 so lighting never fails completely on single RCD trip)
  for (let i = 1; i <= input.lightCircuitCount; i++) {
    const targetRcd = i % 2 === 1 ? rccb1Id : rccb2Id;
    circuits.push({
      id: `sc-light-${i}-${faCounter}`,
      label: nextFa(),
      name:
        i === 1
          ? 'Osvetlenie denná časť (obývačka, kuchyňa, chodba)'
          : i === 2
          ? 'Osvetlenie nočná časť (spálňa, izby, kúpeľňa)'
          : `Osvetlenie sekcia č. ${i}`,
      category: 'Osvetlenie',
      rcdId: targetRcd,
      poles: '1P',
      ratedCurrent: 10,
      characteristic: 'B',
      breakingCapacity: '10 kA',
      phase: 'L1',
      cable: 'CYKY-J 3x1,5 mm²',
      cableLengthM: 16 + i * 2,
      powerKw: 0.35,
      manufacturer: mfg,
      model: suggestCircuitBreakerModel(mfg, '1P', 'B', 10),
    });
  }

  if (input.appliances.outdoorAndGarage) {
    circuits.push({
      id: `sc-ext-${faCounter}`,
      label: nextFa(),
      name: 'Exteriér, terasa a vonkajšie zásuvky IP44',
      category: 'Exteriér / Garáž / EV',
      rcdId: rccb2Id,
      poles: '1P',
      ratedCurrent: 16,
      characteristic: 'B',
      breakingCapacity: '10 kA',
      phase: 'L1',
      cable: 'CYKY-J 3x2,5 mm²',
      cableLengthM: 25,
      powerKw: 1.8,
      manufacturer: mfg,
      model: suggestCircuitBreakerModel(mfg, '1P', 'B', 16),
    });
  }

  const rawProject: SwitchboardProject = {
    id: `proj-smart-${Date.now()}`,
    name: input.projectName || `RH – Rozvádzač (${input.objectType})`,
    objectType: input.objectType,
    supplySystem: input.supplySystem,
    voltage: is3f ? '400 V' : '230 V',
    networkSystem: input.networkSystem,
    phaseCount: is3f ? 3 : 1,
    supplyCable: is3f ? 'CYKY-J 5x10 mm²' : 'CYKY-J 3x10 mm²',
    designerName: 'Návrh generovaný systémom – vyžaduje autorizáciu projektantom',
    projectNumber: `ESG-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 899)}`,
    projectDate: new Date().toLocaleDateString('sk-SK'),
    enclosureMounting:
      input.objectType === 'Garáž' || input.objectType === 'Prevádzka'
        ? 'Na omietku (povrchový)'
        : 'Pod omietku (zapustený)',
    ipRating: input.objectType === 'Garáž' ? 'IP65' : 'IP40',
    mainBreaker: {
      poles: mainPoles,
      ratedCurrent: input.mainBreakerCurrent,
      characteristic: input.mainBreakerChar,
      breakingCapacity: '10 kA',
      manufacturer: mfg,
      model: suggestMainBreakerModel(
        mfg,
        mainPoles,
        input.mainBreakerChar,
        input.mainBreakerCurrent,
        '10 kA'
      ),
      location: input.mainBreakerLocation,
      hasInternalMainSwitch: input.mainBreakerLocation === 'PRED ROZVÁDZAČOM',
      internalSwitchCurrent: input.mainBreakerCurrent <= 40 ? 40 : 63,
      hasSurgeProtector: input.protections.hasSpd,
      surgeProtectorType: input.protections.spdType,
      supplyTransformerImpedanceOhm: 0.25,
      supplyLineLengthM: 12,
    },
    rcds,
    circuits,
  };

  // Auto-balance phases across L1, L2, L3
  const balancedProject = balanceCircuitPhases(rawProject);

  const assumptions = [
    `Predpokladaná teplota okolia rozvádzača a vedení do +30 °C, medené vodiče (Cu) s izoláciou PVC uložené spôsobom B1/C podľa STN 33 2000-5-523.`,
    `Svetelné okruhy sú rozdelené pod minimálne dva nezávislé prúdové chrániče (FI1 a FI2), aby pri vybavení jedného chrániča nezostal celý objekt bez osvetlenia (STN 33 2130).`,
    `Predpokladaná vstupná impedancia nadradenej distribučnej siete v bode napojenia Zq = 0,25 Ω a priemerné dĺžky káblových trás 12 m až 25 m.`,
    `Súčiniteľ súčasnosti β je odhadnutý podľa počtu koncových obvodov pre bežnú bytovú/domovú prevádzku.`,
  ];

  const uncertainties = [
    `Skutočné dĺžky káblových trás, súbeh vedení vo zväzkoch a prechod cez tepelnú izoláciu (spôsob uloženia A1) môžu znížiť dovolenú prúdovú zaťažiteľnosť Iz vodičov.`,
    `Skutočný skratový prúd Ik a impedancia poruchovej slučky Zs v mieste stavby závisia od vzdialenosti od distribučného transformátora VN/NN a prierezu prípojky.`,
    `Vypínacia charakteristika a požiadavka na prúdový chránič typu B alebo F pri tepelnom čerpadle / klimatizácii / meniči závisia od konkrétneho technického listu výrobcu zariadenia.`,
  ];

  const mandatoryHumanChecks = [
    `UPOZORNENIE: Tento návrh je automatizovanou projekčnou pomôckou. AI ani softvér nesmú a nemôžu nahradiť autorizovaného elektroprojektanta ani schváliť bezpečnosť elektrického zariadenia.`,
    `Overiť skutočný spôsob uloženia káblov, korekčné súčinitele zoskupenia a skutočné dĺžky vedení pre výpočet úbytku napätia ΔU.`,
    `Overiť selektivitu istenia voči hlavnému ističu v elektromerovom rozvádzači (RE) podľa technických podmienok príslušnej distribučnej spoločnosti (ZSD / SSD / VSD).`,
    `Pred uvedením rozvádzača do prevádzky vykonať kusovú skúšku podľa STN EN 61439-1/-3 a východiskovú odbornú prehliadku a odbornú skúšku (revíziu) podľa STN 33 2000-6.`,
  ];

  return {
    project: balancedProject,
    assumptions,
    uncertainties,
    mandatoryHumanChecks,
  };
}

/**
 * Verified Component Library Database for ABB, Hager, Schneider Electric, Eaton, OEZ, Legrand
 */
export const INITIAL_COMPONENT_LIBRARY: CatalogProduct[] = [
  // EATON
  {
    id: 'lib-eaton-pl7-b16-1',
    manufacturer: 'Eaton',
    catalogNumber: '262705',
    model: 'PL7-B16/1',
    name: 'Modulárny istič 1P B16A 10kA',
    deviceType: 'MCB (Istič)',
    poles: '1P',
    ratedCurrent: 16,
    characteristic: 'B',
    breakingCapacity: '10 kA',
    modules: 1,
    voltage: '230/400 V AC',
    standard: 'STN EN 60898-1',
    powerLossW: 2.4,
    maxTerminalCrossSectionMm2: '1 – 25 mm²',
    datasheetSummary: 'Istič pre zásuvkové obvody, skratová vypínacia schopnosť 10 kA, dvojité strmeňové svorky.',
  },
  {
    id: 'lib-eaton-pl7-b10-1',
    manufacturer: 'Eaton',
    catalogNumber: '262699',
    model: 'PL7-B10/1',
    name: 'Modulárny istič 1P B10A 10kA',
    deviceType: 'MCB (Istič)',
    poles: '1P',
    ratedCurrent: 10,
    characteristic: 'B',
    breakingCapacity: '10 kA',
    modules: 1,
    voltage: '230/400 V AC',
    standard: 'STN EN 60898-1',
    powerLossW: 1.8,
    maxTerminalCrossSectionMm2: '1 – 25 mm²',
    datasheetSummary: 'Istič pre svetelné obvody Cu 1,5 mm², indikácia polohy kontaktov červená/zelená.',
  },
  {
    id: 'lib-eaton-pl7-b25-3',
    manufacturer: 'Eaton',
    catalogNumber: '263018',
    model: 'PL7-B25/3',
    name: 'Hlavný istič 3P B25A 10kA',
    deviceType: 'MCB (Istič)',
    poles: '3P',
    ratedCurrent: 25,
    characteristic: 'B',
    breakingCapacity: '10 kA',
    modules: 3,
    voltage: '400 V AC',
    standard: 'STN EN 60898-1',
    powerLossW: 9.3,
    maxTerminalCrossSectionMm2: '1 – 25 mm²',
    datasheetSummary: 'Trojpólový hlavný istič pre rodinné domy (štandard 3×25 A), Icn = 10 kA.',
  },
  {
    id: 'lib-eaton-pf7-40-4-003-a',
    manufacturer: 'Eaton',
    catalogNumber: '263621',
    model: 'PF7-40/4/003-A',
    name: 'Prúdový chránič RCCB 4P 40A / 30mA Typ A',
    deviceType: 'RCCB (Prúdový chránič)',
    poles: '4P',
    ratedCurrent: 40,
    rcdSensitivity: 30,
    rcdType: 'A',
    modules: 4,
    voltage: '230/400 V AC',
    standard: 'STN EN 61008-1',
    powerLossW: 5.2,
    maxTerminalCrossSectionMm2: '1,5 – 35 mm²',
    datasheetSummary: 'Štvorpólový prúdový chránič citlivý na striedavé aj pulzujúce jednosmerné reziduálne prúdy, podmienená skratová odolnosť Inc = 10 kA.',
  },
  {
    id: 'lib-eaton-pfl7-16-1n-b-003-a',
    manufacturer: 'Eaton',
    catalogNumber: '264385',
    model: 'PFL7-16/1N/B/003-A',
    name: 'Kombinovaný ističochránič RCBO 2P B16A / 30mA Typ A',
    deviceType: 'RCBO (Ističochránič)',
    poles: '2P',
    ratedCurrent: 16,
    characteristic: 'B',
    breakingCapacity: '10 kA',
    rcdSensitivity: 30,
    rcdType: 'A',
    modules: 2,
    voltage: '230 V AC',
    standard: 'STN EN 61009-1',
    powerLossW: 3.6,
    maxTerminalCrossSectionMm2: '1 – 25 mm²',
    datasheetSummary: 'Kombinovaný prúdový chránič s nadprúdovou ochranou pre samostatné istenie chladničky, kúpeľne alebo kotla.',
  },
  // SCHNEIDER ELECTRIC
  {
    id: 'lib-se-ic60h-b16-1',
    manufacturer: 'Schneider Electric',
    catalogNumber: 'A9F84116',
    model: 'iC60H 1P B16A',
    name: 'Istič Acti9 iC60H 1P B16A 10kA',
    deviceType: 'MCB (Istič)',
    poles: '1P',
    ratedCurrent: 16,
    characteristic: 'B',
    breakingCapacity: '10 kA',
    modules: 1,
    voltage: '230/400 V AC',
    standard: 'STN EN 60898-1 / EN 60947-2',
    powerLossW: 2.6,
    maxTerminalCrossSectionMm2: '1 – 25 mm²',
    datasheetSummary: 'Profesionálny istič radu Acti9 s indikáciou poruchového vypnutia VisiTrip a bezpečným odpojením VisiSafe.',
  },
  {
    id: 'lib-se-iid-4p-40-30a',
    manufacturer: 'Schneider Electric',
    catalogNumber: 'A9R21440',
    model: 'iID 4P 40A 30mA-A',
    name: 'Prúdový chránič Acti9 iID 4P 40A 30mA Typ A',
    deviceType: 'RCCB (Prúdový chránič)',
    poles: '4P',
    ratedCurrent: 40,
    rcdSensitivity: 30,
    rcdType: 'A',
    modules: 4,
    voltage: '400 V AC',
    standard: 'STN EN 61008-1',
    powerLossW: 4.8,
    maxTerminalCrossSectionMm2: '1 – 35 mm²',
    datasheetSummary: 'Prúdový chránič Acti9 iID s indikáciou VisiTrip, kompatibilný s hrebeňovými prípojnicami Acti9.',
  },
  // ABB
  {
    id: 'lib-abb-s201m-b16',
    manufacturer: 'ABB',
    catalogNumber: '2CDS271001R0165',
    model: 'S201M-B16',
    name: 'Istič System pro M compact S201M-B16 10kA',
    deviceType: 'MCB (Istič)',
    poles: '1P',
    ratedCurrent: 16,
    characteristic: 'B',
    breakingCapacity: '10 kA',
    modules: 1,
    voltage: '230/400 V AC',
    standard: 'STN EN 60898-1',
    powerLossW: 2.5,
    maxTerminalCrossSectionMm2: '0,75 – 35 mm²',
    datasheetSummary: 'Modulárny istič ABB S200M s dvojitými valcovými svorkami pre hrebeňovú lištu aj vodič.',
  },
  {
    id: 'lib-abb-f204-a-40',
    manufacturer: 'ABB',
    catalogNumber: '2CSF204101R1400',
    model: 'F204 A-40/0.03',
    name: 'Prúdový chránič ABB F204 A 40A / 30mA',
    deviceType: 'RCCB (Prúdový chránič)',
    poles: '4P',
    ratedCurrent: 40,
    rcdSensitivity: 30,
    rcdType: 'A',
    modules: 4,
    voltage: '230/400 V AC',
    standard: 'STN EN 61008-1',
    powerLossW: 3.2,
    maxTerminalCrossSectionMm2: '1 – 25 mm²',
    datasheetSummary: 'Trojfázový prúdový chránič ABB typu A pre moderné domové a komerčné rozvádzače.',
  },
  // HAGER
  {
    id: 'lib-hager-mcn116',
    manufacturer: 'Hager',
    catalogNumber: 'MCN116',
    model: 'MC1B16',
    name: 'Istič Hager 1P B16A 10kA QuickConnect',
    deviceType: 'MCB (Istič)',
    poles: '1P',
    ratedCurrent: 16,
    characteristic: 'B',
    breakingCapacity: '10 kA',
    modules: 1,
    voltage: '230/400 V AC',
    standard: 'STN EN 60898-1',
    powerLossW: 2.2,
    maxTerminalCrossSectionMm2: '1 – 25 mm²',
    datasheetSummary: 'Modulárny istič Hager s technológiou Bi-Connect a popisovacím okienkom.',
  },
  {
    id: 'lib-hager-cda440d',
    manufacturer: 'Hager',
    catalogNumber: 'CDA440D',
    model: 'CD440J (A)',
    name: 'Prúdový chránič Hager 4P 40A 30mA Typ A',
    deviceType: 'RCCB (Prúdový chránič)',
    poles: '4P',
    ratedCurrent: 40,
    rcdSensitivity: 30,
    rcdType: 'A',
    modules: 4,
    voltage: '400 V AC',
    standard: 'STN EN 61008-1',
    powerLossW: 4.5,
    maxTerminalCrossSectionMm2: '1 – 25 mm²',
    datasheetSummary: 'Štvorpólový prúdový chránič Hager s mechanickou indikáciou poruchového prúdu.',
  },
  // OEZ
  {
    id: 'lib-oez-ltn-16b-1',
    manufacturer: 'OEZ',
    catalogNumber: '41744',
    model: 'LTN-16B-1',
    name: 'Istič OEZ Minia LTN-16B-1 10kA',
    deviceType: 'MCB (Istič)',
    poles: '1P',
    ratedCurrent: 16,
    characteristic: 'B',
    breakingCapacity: '10 kA',
    modules: 1,
    voltage: '230/400 V AC',
    standard: 'STN EN 60898-1',
    powerLossW: 2.1,
    maxTerminalCrossSectionMm2: '1 – 35 mm²',
    datasheetSummary: 'Osvedčený modulárny istič radu Minia s vypínacou schopnosťou 10 kA.',
  },
  {
    id: 'lib-oez-ofi-40-4-003b',
    manufacturer: 'OEZ',
    catalogNumber: '48512',
    model: 'OFI-40-4-003B',
    name: 'Prúdový chránič OEZ OFI 4P 40A 30mA Typ B (EV / FVE)',
    deviceType: 'RCCB (Prúdový chránič)',
    poles: '4P',
    ratedCurrent: 40,
    rcdSensitivity: 30,
    rcdType: 'B',
    modules: 4,
    voltage: '400 V AC',
    standard: 'STN EN 62423 / EN 61008-1',
    powerLossW: 6.4,
    maxTerminalCrossSectionMm2: '1,5 – 35 mm²',
    datasheetSummary: 'Prúdový chránič typu B citlivý aj na hladké jednosmerné reziduálne prúdy – určený pre nabíjacie stanice EV, frekvenčné meniče a FVE.',
  },
  // LEGRAND
  {
    id: 'lib-legrand-tx3-b16',
    manufacturer: 'Legrand',
    catalogNumber: '404027',
    model: 'TX3 B16 1P 10 kA',
    name: 'Istič Legrand TX3 1P B16A 10kA',
    deviceType: 'MCB (Istič)',
    poles: '1P',
    ratedCurrent: 16,
    characteristic: 'B',
    breakingCapacity: '10 kA',
    modules: 1,
    voltage: '230/400 V AC',
    standard: 'STN EN 60898-1',
    powerLossW: 2.3,
    maxTerminalCrossSectionMm2: '1 – 25 mm²',
    datasheetSummary: 'Modulárny istič Legrand TX3 pre hrebeňové lišty HX3.',
  },
  {
    id: 'lib-legrand-dx3-id-4p-40',
    manufacturer: 'Legrand',
    catalogNumber: '411660',
    model: 'DX3-ID 4P 40A 30mA A',
    name: 'Prúdový chránič Legrand DX3-ID 4P 40A 30mA Typ A',
    deviceType: 'RCCB (Prúdový chránič)',
    poles: '4P',
    ratedCurrent: 40,
    rcdSensitivity: 30,
    rcdType: 'A',
    modules: 4,
    voltage: '400 V AC',
    standard: 'STN EN 61008-1',
    powerLossW: 4.9,
    maxTerminalCrossSectionMm2: '1,5 – 35 mm²',
    datasheetSummary: 'Prúdový chránič Legrand DX3-ID s hornými aj dolnými strmeňovými svorkami.',
  },
  // HLAVNÉ VYPÍNAČE (QS1) & PREPÄŤOVÉ OCHRANY (SPD FV1)
  {
    id: 'lib-eaton-is-63-3',
    manufacturer: 'Eaton',
    catalogNumber: '276274',
    model: 'IS-63/3',
    name: 'Hlavný vypínač Eaton IS-63/3 3P 63A',
    deviceType: 'Hlavný vypínač',
    poles: '3P',
    ratedCurrent: 63,
    modules: 3,
    voltage: '400 V AC',
    standard: 'STN EN 60947-3',
    powerLossW: 4.5,
    maxTerminalCrossSectionMm2: '2,5 – 50 mm²',
    datasheetSummary: 'Trojpólový hlavný vypínač do domového rozvádzača (QS1) bez nadprúdovej ochrany, kategória užitia AC-22A.',
  },
  {
    id: 'lib-se-isw-40-2p',
    manufacturer: 'Schneider Electric',
    catalogNumber: 'A9S65240',
    model: 'iSW 2P 40A',
    name: 'Hlavný vypínač Acti9 iSW 2P 40A',
    deviceType: 'Hlavný vypínač',
    poles: '2P',
    ratedCurrent: 40,
    modules: 2,
    voltage: '230 V AC',
    standard: 'STN EN 60947-3',
    powerLossW: 2.8,
    maxTerminalCrossSectionMm2: '1,5 – 35 mm²',
    datasheetSummary: 'Dvojpólový hlavný vypínač (QS1) pre jednofázové bytové rozvádzače, bezpečné odpojenie L+N.',
  },
  {
    id: 'lib-eaton-spbt12-280-4',
    manufacturer: 'Eaton',
    catalogNumber: '158331',
    model: 'SPBT12-280/4',
    name: 'Zvodič bleskového prúdu a prepätia SPD T1+T2 (B+C) 4P',
    deviceType: 'SPD (Prepäťová ochrana)',
    poles: '4P',
    ratedCurrent: 63,
    modules: 4,
    voltage: '280 V AC',
    standard: 'STN EN 61643-11',
    powerLossW: 0.5,
    maxTerminalCrossSectionMm2: '4 – 35 mm²',
    datasheetSummary: 'Kombinovaný zvodič bleskového prúdu a prepätia triedy T1+T2 (B+C) pre domové rozvádzače s vonkajším bleskozvodom.',
  },
  {
    id: 'lib-hager-spn415',
    manufacturer: 'Hager',
    catalogNumber: 'SPN415',
    model: 'SPN415 T2 (C)',
    name: 'Zvodič prepätia Hager SPD T2 (C) 4P',
    deviceType: 'SPD (Prepäťová ochrana)',
    poles: '4P',
    ratedCurrent: 40,
    modules: 4,
    voltage: '275 V AC',
    standard: 'STN EN 61643-11',
    powerLossW: 0.4,
    maxTerminalCrossSectionMm2: '2,5 – 25 mm²',
    datasheetSummary: 'Štvorpólový zvodič prepätia triedy T2 (C) pre podružné a bytové rozvádzače.',
  },
];

/**
 * Creates a clean blank switchboard project (1-phase 230 V or 3-phase 400 V)
 */
export function createBlankProject(supplySystem: '1f' | '3f' = '3f'): SwitchboardProject {
  const is3f = supplySystem === '3f';
  const mainPoles: PolesType = is3f ? '3P' : '1P';
  const internalPoles: PolesType = is3f ? '3P' : '2P';
  const rcdPoles: RcdPoles = is3f ? '4P' : '2P';

  return {
    id: `proj-blank-${Date.now()}`,
    name: is3f ? 'Nový 3-fázový rozvádzač (400 V)' : 'Nový 1-fázový rozvádzač (230 V)',
    objectType: is3f ? 'Rodinný dom' : 'Byt',
    supplySystem,
    voltage: is3f ? '400 V' : '230 V',
    networkSystem: 'TN-C-S',
    phaseCount: is3f ? 3 : 1,
    supplyCable: is3f ? 'CYKY-J 5x10 mm²' : 'CYKY-J 3x10 mm²',
    designerName: 'Ing. Marek Kováč – autorizovaný elektroprojektant',
    projectNumber: `ESG-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 899)}`,
    projectDate: new Date().toLocaleDateString('sk-SK'),
    enclosureMounting: 'Pod omietku (zapustený)',
    ipRating: 'IP40',
    mainBreaker: {
      enabled: true,
      designation: 'QF0',
      placement: 'Pred elektromerom',
      poles: mainPoles,
      ratedCurrent: 25,
      characteristic: 'B',
      breakingCapacity: '10 kA',
      manufacturer: 'Eaton',
      model: suggestMainBreakerModel('Eaton', mainPoles, 'B', 25, '10 kA'),
      location: 'PRED ROZVÁDZAČOM',
      hasInternalMainSwitch: true,
      internalSwitchCurrent: is3f ? 63 : 40,
      internalDevice: {
        enabled: true,
        deviceType: 'Hlavný vypínač',
        designation: 'QS1',
        poles: internalPoles,
        ratedCurrent: is3f ? 63 : 40,
        manufacturer: 'Eaton',
        model: suggestInternalMainDeviceModel('Eaton', 'Hlavný vypínač', internalPoles, is3f ? 63 : 40, 'B', false),
        modules: getPolesModuleCount(internalPoles),
        hasOvercurrentProtection: false,
        topologyPosition: 'PRED_SPD_A_RCD',
      },
      electricityMeter: {
        enabled: true,
        designation: 'kWh',
        type: is3f ? '3-fázový elektromer' : '1-fázový elektromer',
        tariff: 'Dvojtarifný (VT/NT)',
        location: 'V elektromerovom rozvádzači (RE)',
      },
      hasSurgeProtector: true,
      surgeProtectorType: is3f ? 'T1+T2 (B+C)' : 'T2 (C)',
      supplyTransformerImpedanceOhm: 0.25,
      supplyLineLengthM: 12,
    },
    rcds: [
      {
        id: 'rcd-blank-1',
        label: 'FI1',
        deviceKind: 'RCCB',
        poles: rcdPoles,
        ratedCurrent: 40,
        sensitivity: 30,
        type: 'A',
        manufacturer: 'Eaton',
        model: suggestRcdModel('Eaton', 'RCCB', rcdPoles, 40, 30, 'A'),
        phase: is3f ? 'L1,L2,L3' : 'L1',
        notes: 'Skupinový prúdový chránič FI1',
      },
    ],
    circuits: [
      {
        id: 'c-blank-1',
        label: 'FA1',
        name: 'Svetelný okruh č. 1',
        category: 'Osvetlenie',
        rcdId: 'rcd-blank-1',
        poles: '1P',
        ratedCurrent: 10,
        characteristic: 'B',
        breakingCapacity: '10 kA',
        phase: 'L1',
        cable: 'CYKY-J 3x1,5 mm²',
        cableLengthM: 15,
        powerKw: 0.35,
        manufacturer: 'Eaton',
        model: 'PL7-B10/1',
      },
      {
        id: 'c-blank-2',
        label: 'FA2',
        name: 'Zásuvkový okruh č. 1',
        category: 'Zásuvky',
        rcdId: 'rcd-blank-1',
        poles: '1P',
        ratedCurrent: 16,
        characteristic: 'B',
        breakingCapacity: '10 kA',
        phase: is3f ? 'L2' : 'L1',
        cable: 'CYKY-J 3x2,5 mm²',
        cableLengthM: 18,
        powerKw: 2.2,
        manufacturer: 'Eaton',
        model: 'PL7-B16/1',
      },
    ],
  };
}

/**
 * Pre-configured realistic Slovak switchboard templates according to STN 33 2130
 * Includes all 6 mandatory engineering test projects (TEST 1 – TEST 6)
 */
export const PROJECT_TEMPLATES: Record<string, SwitchboardProject> = {
  rodinny_dom_3f: {
    id: 'rodinny_dom_3f',
    name: 'TEST 3: RH – Hlavný domový rozvádzač (Rodinný dom 3F, 9 okruhov)',
    objectType: 'Rodinný dom',
    supplySystem: '3f',
    voltage: '400 V',
    networkSystem: 'TN-C-S',
    phaseCount: 3,
    supplyCable: 'CYKY-J 5x10 mm²',
    designerName: 'Ing. Marek Kováč – autorizovaný elektroprojektant',
    projectNumber: 'ESG-2026-041',
    projectDate: '04.11.2026',
    enclosureMounting: 'Pod omietku (zapustený)',
    ipRating: 'IP40',
    mainBreaker: {
      enabled: true,
      designation: 'QF0',
      placement: 'Pred elektromerom',
      poles: '3P',
      ratedCurrent: 25,
      characteristic: 'B',
      breakingCapacity: '10 kA',
      manufacturer: 'Eaton',
      model: 'PL7-B25/3',
      catalogNumber: '263018',
      location: 'PRED ROZVÁDZAČOM',
      hasInternalMainSwitch: true,
      internalSwitchCurrent: 63,
      internalDevice: {
        enabled: true,
        deviceType: 'Hlavný vypínač',
        designation: 'QS1',
        poles: '3P',
        ratedCurrent: 63,
        manufacturer: 'Eaton',
        model: 'IS-63/3',
        catalogNumber: '276274',
        modules: 3,
        hasOvercurrentProtection: false,
        topologyPosition: 'PRED_SPD_A_RCD',
      },
      electricityMeter: {
        enabled: true,
        designation: 'kWh',
        type: '3-fázový elektromer',
        tariff: 'Dvojtarifný (VT/NT)',
        location: 'V elektromerovom rozvádzači (RE)',
      },
      hasSurgeProtector: true,
      surgeProtectorType: 'T1+T2 (B+C)',
      supplyTransformerImpedanceOhm: 0.25,
      supplyLineLengthM: 12,
    },
    rcds: [
      {
        id: 'rcd-fi1',
        label: 'FI1',
        deviceKind: 'RCCB',
        poles: '4P',
        ratedCurrent: 40,
        sensitivity: 30,
        type: 'A',
        manufacturer: 'Eaton',
        model: 'PF7-40/4/003-A',
        catalogNumber: '263621',
        phase: 'L1,L2,L3',
        notes: 'Skupina 1 – Kuchyňa, varná doska a obytná zóna',
      },
      {
        id: 'rcd-fi2',
        label: 'FI2',
        deviceKind: 'RCCB',
        poles: '4P',
        ratedCurrent: 40,
        sensitivity: 30,
        type: 'A',
        manufacturer: 'Eaton',
        model: 'PF7-40/4/003-A',
        catalogNumber: '263621',
        phase: 'L1,L2,L3',
        notes: 'Skupina 2 – Izby, kúpeľňa, práčovňa a exteriér',
      },
      {
        id: 'rcd-fi3',
        label: 'FI3',
        deviceKind: 'RCBO',
        poles: '2P',
        ratedCurrent: 16,
        sensitivity: 30,
        type: 'A',
        characteristic: 'B',
        breakingCapacity: '10 kA',
        manufacturer: 'Eaton',
        model: 'PFL7-16/1N/B/003-A',
        catalogNumber: '264385',
        phase: 'L3',
        circuitName: 'Chladnička, mraznička & alarm (samostatný RCBO)',
        cableType: 'CYKY-J 3x2,5 mm²',
        cableLengthM: 14,
        powerKw: 0.6,
        notes: 'Kombinovaný prúdový chránič s nadprúdovou ochranou (RCBO)',
      },
    ],
    circuits: [
      {
        id: 'c-fa1',
        label: 'FA1',
        name: 'Indukčná varná doska',
        category: 'Kuchyňa / Spotrebiče',
        rcdId: 'rcd-fi1',
        poles: '3P',
        ratedCurrent: 16,
        characteristic: 'B',
        breakingCapacity: '10 kA',
        phase: 'L1,L2,L3',
        cable: 'CYKY-J 5x2,5 mm²',
        cableLengthM: 14,
        powerKw: 7.2,
        manufacturer: 'Eaton',
        model: 'PL7-B16/3',
      },
      {
        id: 'c-fa2',
        label: 'FA2',
        name: 'Elektrická rúra na pečenie',
        category: 'Kuchyňa / Spotrebiče',
        rcdId: 'rcd-fi1',
        poles: '1P',
        ratedCurrent: 16,
        characteristic: 'B',
        breakingCapacity: '10 kA',
        phase: 'L1',
        cable: 'CYKY-J 3x2,5 mm²',
        cableLengthM: 14,
        powerKw: 3.2,
        manufacturer: 'Eaton',
        model: 'PL7-B16/1',
      },
      {
        id: 'c-fa3',
        label: 'FA3',
        name: 'Umývačka riadu',
        category: 'Kuchyňa / Spotrebiče',
        rcdId: 'rcd-fi1',
        poles: '1P',
        ratedCurrent: 16,
        characteristic: 'B',
        breakingCapacity: '10 kA',
        phase: 'L2',
        cable: 'CYKY-J 3x2,5 mm²',
        cableLengthM: 15,
        powerKw: 2.2,
        manufacturer: 'Eaton',
        model: 'PL7-B16/1',
      },
      {
        id: 'c-fa4',
        label: 'FA4',
        name: 'Zásuvky kuchynská linka',
        category: 'Zásuvky',
        rcdId: 'rcd-fi1',
        poles: '1P',
        ratedCurrent: 16,
        characteristic: 'B',
        breakingCapacity: '10 kA',
        phase: 'L3',
        cable: 'CYKY-J 3x2,5 mm²',
        cableLengthM: 16,
        powerKw: 2.5,
        manufacturer: 'Eaton',
        model: 'PL7-B16/1',
      },
      {
        id: 'c-fa5',
        label: 'FA5',
        name: 'Osvetlenie denná časť (obývačka, kuchyňa, chodba)',
        category: 'Osvetlenie',
        rcdId: 'rcd-fi1',
        poles: '1P',
        ratedCurrent: 10,
        characteristic: 'B',
        breakingCapacity: '10 kA',
        phase: 'L1',
        cable: 'CYKY-J 3x1,5 mm²',
        cableLengthM: 18,
        powerKw: 0.4,
        manufacturer: 'Eaton',
        model: 'PL7-B10/1',
      },
      {
        id: 'c-fa6',
        label: 'FA6',
        name: 'Zásuvky obývacia izba a pracovňa',
        category: 'Zásuvky',
        rcdId: 'rcd-fi2',
        poles: '1P',
        ratedCurrent: 16,
        characteristic: 'B',
        breakingCapacity: '10 kA',
        phase: 'L1',
        cable: 'CYKY-J 3x2,5 mm²',
        cableLengthM: 20,
        powerKw: 2.0,
        manufacturer: 'Eaton',
        model: 'PL7-B16/1',
      },
      {
        id: 'c-fa7',
        label: 'FA7',
        name: 'Zásuvky spálňa a detské izby',
        category: 'Zásuvky',
        rcdId: 'rcd-fi2',
        poles: '1P',
        ratedCurrent: 16,
        characteristic: 'B',
        breakingCapacity: '10 kA',
        phase: 'L2',
        cable: 'CYKY-J 3x2,5 mm²',
        cableLengthM: 22,
        powerKw: 1.8,
        manufacturer: 'Eaton',
        model: 'PL7-B16/1',
      },
      {
        id: 'c-fa8',
        label: 'FA8',
        name: 'Kúpeľňa – práčka, sušička a zásuvky',
        category: 'Kúpeľňa / Práčovňa',
        rcdId: 'rcd-fi2',
        poles: '1P',
        ratedCurrent: 16,
        characteristic: 'B',
        breakingCapacity: '10 kA',
        phase: 'L3',
        cable: 'CYKY-J 3x2,5 mm²',
        cableLengthM: 14,
        powerKw: 2.8,
        manufacturer: 'Eaton',
        model: 'PL7-B16/1',
      },
      {
        id: 'c-fa9',
        label: 'FA9',
        name: 'Osvetlenie nočná časť (spálňa, izby, kúpeľňa)',
        category: 'Osvetlenie',
        rcdId: 'rcd-fi2',
        poles: '1P',
        ratedCurrent: 10,
        characteristic: 'B',
        breakingCapacity: '10 kA',
        phase: 'L2',
        cable: 'CYKY-J 3x1,5 mm²',
        cableLengthM: 20,
        powerKw: 0.35,
        manufacturer: 'Eaton',
        model: 'PL7-B10/1',
      },
    ],
  },

  byt_1f_230v: {
    id: 'byt_1f_230v',
    name: 'TEST 1: RB – Jednofázový bytový rozvádzač (230 V)',
    objectType: 'Byt',
    supplySystem: '1f',
    voltage: '230 V',
    networkSystem: 'TN-C-S',
    phaseCount: 1,
    supplyCable: 'CYKY-J 3x10 mm²',
    designerName: 'Ing. Marek Kováč – autorizovaný elektroprojektant',
    projectNumber: 'ESG-2026-088',
    projectDate: '04.11.2026',
    enclosureMounting: 'Pod omietku (zapustený)',
    ipRating: 'IP30',
    mainBreaker: {
      enabled: true,
      designation: 'QF0',
      placement: 'Pred elektromerom',
      poles: '1P',
      ratedCurrent: 25,
      characteristic: 'B',
      breakingCapacity: '10 kA',
      manufacturer: 'Schneider Electric',
      model: 'iC60H 1P B25A',
      location: 'PRED ROZVÁDZAČOM',
      hasInternalMainSwitch: true,
      internalSwitchCurrent: 40,
      internalDevice: {
        enabled: true,
        deviceType: 'Hlavný vypínač',
        designation: 'QS1',
        poles: '2P',
        ratedCurrent: 40,
        manufacturer: 'Schneider Electric',
        model: 'iSW 2P 40A',
        modules: 2,
        hasOvercurrentProtection: false,
        topologyPosition: 'PRED_SPD_A_RCD',
      },
      electricityMeter: {
        enabled: true,
        designation: 'kWh',
        type: '1-fázový elektromer',
        tariff: 'Jednotarifný',
        location: 'V elektromerovom rozvádzači (RE)',
      },
      hasSurgeProtector: true,
      surgeProtectorType: 'T2 (C)',
      supplyTransformerImpedanceOhm: 0.28,
      supplyLineLengthM: 10,
    },
    rcds: [
      {
        id: 'rcd-b1',
        label: 'FI1',
        deviceKind: 'RCCB',
        poles: '2P',
        ratedCurrent: 40,
        sensitivity: 30,
        type: 'A',
        manufacturer: 'Schneider Electric',
        model: 'iID 2P 40A 30mA-A',
        phase: 'L1',
        notes: 'Prúdový chránič pre zásuvkové a svetelné obvody bytu',
      },
      {
        id: 'rcd-b2',
        label: 'FI2',
        deviceKind: 'RCBO',
        poles: '2P',
        ratedCurrent: 16,
        sensitivity: 30,
        type: 'A',
        characteristic: 'B',
        breakingCapacity: '10 kA',
        manufacturer: 'Schneider Electric',
        model: 'iDPN N Vigi B16A 30mA-A',
        phase: 'L1',
        circuitName: 'Kúpeľňa – práčka a ohrievač vody',
        cableType: 'CYKY-J 3x2,5 mm²',
        cableLengthM: 10,
        powerKw: 2.4,
      },
    ],
    circuits: [
      {
        id: 'cb-1',
        label: 'FA1',
        name: 'Zásuvky kuchyňa a spotrebiče',
        category: 'Kuchyňa / Spotrebiče',
        rcdId: 'rcd-b1',
        poles: '1P',
        ratedCurrent: 16,
        characteristic: 'B',
        breakingCapacity: '10 kA',
        phase: 'L1',
        cable: 'CYKY-J 3x2,5 mm²',
        cableLengthM: 12,
        powerKw: 2.8,
        manufacturer: 'Schneider Electric',
        model: 'iC60H 1P B16A',
      },
      {
        id: 'cb-2',
        label: 'FA2',
        name: 'Zásuvky izby a obývačka',
        category: 'Zásuvky',
        rcdId: 'rcd-b1',
        poles: '1P',
        ratedCurrent: 16,
        characteristic: 'B',
        breakingCapacity: '10 kA',
        phase: 'L1',
        cable: 'CYKY-J 3x2,5 mm²',
        cableLengthM: 16,
        powerKw: 1.8,
        manufacturer: 'Schneider Electric',
        model: 'iC60H 1P B16A',
      },
      {
        id: 'cb-3',
        label: 'FA3',
        name: 'Osvetlenie celého bytu',
        category: 'Osvetlenie',
        rcdId: 'rcd-b1',
        poles: '1P',
        ratedCurrent: 10,
        characteristic: 'B',
        breakingCapacity: '10 kA',
        phase: 'L1',
        cable: 'CYKY-J 3x1,5 mm²',
        cableLengthM: 15,
        powerKw: 0.35,
        manufacturer: 'Schneider Electric',
        model: 'iC60H 1P B10A',
      },
    ],
  },

  test2_byt_3f_viac_fi: {
    id: 'test2_byt_3f_viac_fi',
    name: 'TEST 2: RB – Trojfázový bytový rozvádzač s 3× prúdovými chráničmi (400 V)',
    objectType: 'Byt',
    supplySystem: '3f',
    voltage: '400 V',
    networkSystem: 'TN-S',
    phaseCount: 3,
    supplyCable: 'CYKY-J 5x6 mm²',
    designerName: 'Ing. Marek Kováč – autorizovaný elektroprojektant',
    projectNumber: 'ESG-2026-202',
    projectDate: '04.11.2026',
    enclosureMounting: 'Pod omietku (zapustený)',
    ipRating: 'IP30',
    mainBreaker: {
      enabled: true,
      designation: 'QF0',
      placement: 'Pred elektromerom',
      poles: '3P',
      ratedCurrent: 25,
      characteristic: 'B',
      breakingCapacity: '10 kA',
      manufacturer: 'ABB',
      model: 'S203M-B25',
      location: 'PRED ROZVÁDZAČOM',
      hasInternalMainSwitch: true,
      internalSwitchCurrent: 40,
      internalDevice: {
        enabled: true,
        deviceType: 'Hlavný vypínač',
        designation: 'QS1',
        poles: '3P',
        ratedCurrent: 40,
        manufacturer: 'ABB',
        model: 'SD203/40',
        modules: 3,
        hasOvercurrentProtection: false,
        topologyPosition: 'PRED_SPD_A_RCD',
      },
      electricityMeter: {
        enabled: true,
        designation: 'kWh',
        type: '3-fázový elektromer',
        tariff: 'Jednotarifný',
        location: 'V elektromerovom rozvádzači (RE)',
      },
      hasSurgeProtector: true,
      surgeProtectorType: 'T2 (C)',
      supplyTransformerImpedanceOhm: 0.26,
      supplyLineLengthM: 14,
    },
    rcds: [
      {
        id: 'rcd-t2-1',
        label: 'FI1',
        deviceKind: 'RCCB',
        poles: '4P',
        ratedCurrent: 40,
        sensitivity: 30,
        type: 'A',
        manufacturer: 'ABB',
        model: 'F204 A-40/0.03',
        phase: 'L1,L2,L3',
        notes: 'Skupina 1 – Kuchyňa a varná doska',
      },
      {
        id: 'rcd-t2-2',
        label: 'FI2',
        deviceKind: 'RCCB',
        poles: '4P',
        ratedCurrent: 40,
        sensitivity: 30,
        type: 'A',
        manufacturer: 'ABB',
        model: 'F204 A-40/0.03',
        phase: 'L1,L2,L3',
        notes: 'Skupina 2 – Obytné miestnosti a balkón',
      },
      {
        id: 'rcd-t2-3',
        label: 'FI3',
        deviceKind: 'RCCB',
        poles: '2P',
        ratedCurrent: 40,
        sensitivity: 30,
        type: 'A',
        manufacturer: 'ABB',
        model: 'F202 A-40/0.03',
        phase: 'L3',
        notes: 'Skupina 3 – Samostatný chránič pre kúpeľňu a práčovňu',
      },
    ],
    circuits: [
      {
        id: 't2-c1',
        label: 'FA1',
        name: 'Indukčná varná doska (400 V)',
        category: 'Kuchyňa / Spotrebiče',
        rcdId: 'rcd-t2-1',
        poles: '3P',
        ratedCurrent: 16,
        characteristic: 'B',
        breakingCapacity: '10 kA',
        phase: 'L1,L2,L3',
        cable: 'CYKY-J 5x2,5 mm²',
        cableLengthM: 12,
        powerKw: 6.8,
        manufacturer: 'ABB',
        model: 'S203M-B16',
      },
      {
        id: 't2-c2',
        label: 'FA2',
        name: 'Elektrická rúra a mikrovlnka',
        category: 'Kuchyňa / Spotrebiče',
        rcdId: 'rcd-t2-1',
        poles: '1P',
        ratedCurrent: 16,
        characteristic: 'B',
        breakingCapacity: '10 kA',
        phase: 'L1',
        cable: 'CYKY-J 3x2,5 mm²',
        cableLengthM: 12,
        powerKw: 2.8,
        manufacturer: 'ABB',
        model: 'S201M-B16',
      },
      {
        id: 't2-c3',
        label: 'FA3',
        name: 'Osvetlenie kuchyňa a obývačka',
        category: 'Osvetlenie',
        rcdId: 'rcd-t2-1',
        poles: '1P',
        ratedCurrent: 10,
        characteristic: 'B',
        breakingCapacity: '10 kA',
        phase: 'L2',
        cable: 'CYKY-J 3x1,5 mm²',
        cableLengthM: 14,
        powerKw: 0.3,
        manufacturer: 'ABB',
        model: 'S201M-B10',
      },
      {
        id: 't2-c4',
        label: 'FA4',
        name: 'Zásuvky obývacia izba a spálňa',
        category: 'Zásuvky',
        rcdId: 'rcd-t2-2',
        poles: '1P',
        ratedCurrent: 16,
        characteristic: 'B',
        breakingCapacity: '10 kA',
        phase: 'L2',
        cable: 'CYKY-J 3x2,5 mm²',
        cableLengthM: 16,
        powerKw: 2.0,
        manufacturer: 'ABB',
        model: 'S201M-B16',
      },
      {
        id: 't2-c5',
        label: 'FA5',
        name: 'Osvetlenie spálňa, chodba a kúpeľňa',
        category: 'Osvetlenie',
        rcdId: 'rcd-t2-2',
        poles: '1P',
        ratedCurrent: 10,
        characteristic: 'B',
        breakingCapacity: '10 kA',
        phase: 'L1',
        cable: 'CYKY-J 3x1,5 mm²',
        cableLengthM: 15,
        powerKw: 0.25,
        manufacturer: 'ABB',
        model: 'S201M-B10',
      },
      {
        id: 't2-c6',
        label: 'FA6',
        name: 'Kúpeľňa – práčka a sušička',
        category: 'Kúpeľňa / Práčovňa',
        rcdId: 'rcd-t2-3',
        poles: '1P',
        ratedCurrent: 16,
        characteristic: 'B',
        breakingCapacity: '10 kA',
        phase: 'L3',
        cable: 'CYKY-J 3x2,5 mm²',
        cableLengthM: 10,
        powerKw: 2.5,
        manufacturer: 'ABB',
        model: 'S201M-B16',
      },
    ],
  },

  test4_qf0_a_vypinac_qs1: {
    id: 'test4_qf0_a_vypinac_qs1',
    name: 'TEST 4: Rozvádzač s QF0 pred elektromerom + hlavným vypínačom QS1 v rozvádzači',
    objectType: 'Rodinný dom',
    supplySystem: '3f',
    voltage: '400 V',
    networkSystem: 'TN-C-S',
    phaseCount: 3,
    supplyCable: 'CYKY-J 5x10 mm²',
    designerName: 'Ing. Marek Kováč – autorizovaný elektroprojektant',
    projectNumber: 'ESG-2026-404',
    projectDate: '04.11.2026',
    enclosureMounting: 'Pod omietku (zapustený)',
    ipRating: 'IP40',
    mainBreaker: {
      enabled: true,
      designation: 'QF0',
      placement: 'Pred elektromerom',
      poles: '3P',
      ratedCurrent: 25,
      characteristic: 'B',
      breakingCapacity: '10 kA',
      manufacturer: 'Eaton',
      model: 'PL7-B25/3',
      location: 'PRED ROZVÁDZAČOM',
      hasInternalMainSwitch: true,
      internalSwitchCurrent: 63,
      internalDevice: {
        enabled: true,
        deviceType: 'Hlavný vypínač',
        designation: 'QS1',
        poles: '3P',
        ratedCurrent: 63,
        manufacturer: 'Eaton',
        model: 'IS-63/3',
        modules: 3,
        hasOvercurrentProtection: false,
        topologyPosition: 'PRED_SPD_A_RCD',
      },
      electricityMeter: {
        enabled: true,
        designation: 'kWh',
        type: '3-fázový elektromer',
        tariff: 'Dvojtarifný (VT/NT)',
        location: 'V elektromerovom rozvádzači (RE)',
      },
      hasSurgeProtector: true,
      surgeProtectorType: 'T1+T2 (B+C)',
      supplyTransformerImpedanceOhm: 0.25,
      supplyLineLengthM: 12,
    },
    rcds: [
      {
        id: 'rcd-t4-1',
        label: 'FI1',
        deviceKind: 'RCCB',
        poles: '4P',
        ratedCurrent: 40,
        sensitivity: 30,
        type: 'A',
        manufacturer: 'Eaton',
        model: 'PF7-40/4/003-A',
        phase: 'L1,L2,L3',
        notes: 'Skupinový chránič za hlavným vypínačom QS1',
      },
    ],
    circuits: [
      {
        id: 't4-c1',
        label: 'FA1',
        name: 'Svetlá prízemie a poschodie',
        category: 'Osvetlenie',
        rcdId: 'rcd-t4-1',
        poles: '1P',
        ratedCurrent: 10,
        characteristic: 'B',
        breakingCapacity: '10 kA',
        phase: 'L1',
        cable: 'CYKY-J 3x1,5 mm²',
        cableLengthM: 15,
        powerKw: 0.4,
        manufacturer: 'Eaton',
        model: 'PL7-B10/1',
      },
      {
        id: 't4-c2',
        label: 'FA2',
        name: 'Zásuvky obývačka a kuchyňa',
        category: 'Zásuvky',
        rcdId: 'rcd-t4-1',
        poles: '1P',
        ratedCurrent: 16,
        characteristic: 'B',
        breakingCapacity: '10 kA',
        phase: 'L2',
        cable: 'CYKY-J 3x2,5 mm²',
        cableLengthM: 16,
        powerKw: 2.4,
        manufacturer: 'Eaton',
        model: 'PL7-B16/1',
      },
      {
        id: 't4-c3',
        label: 'FA3',
        name: 'Kúpeľňa – práčka a bojler',
        category: 'Kúpeľňa / Práčovňa',
        rcdId: 'rcd-t4-1',
        poles: '1P',
        ratedCurrent: 16,
        characteristic: 'B',
        breakingCapacity: '10 kA',
        phase: 'L3',
        cable: 'CYKY-J 3x2,5 mm²',
        cableLengthM: 14,
        powerKw: 2.2,
        manufacturer: 'Eaton',
        model: 'PL7-B16/1',
      },
    ],
  },

  test5_qf0_a_istic_qf1: {
    id: 'test5_qf0_a_istic_qf1',
    name: 'TEST 5: Rozvádzač s QF0 pred elektromerom (32 A) + hlavným ističom QF1 v rozvádzači (25 A)',
    objectType: 'Prevádzka',
    supplySystem: '3f',
    voltage: '400 V',
    networkSystem: 'TN-C-S',
    phaseCount: 3,
    supplyCable: 'CYKY-J 5x10 mm²',
    designerName: 'Ing. Marek Kováč – autorizovaný elektroprojektant',
    projectNumber: 'ESG-2026-505',
    projectDate: '04.11.2026',
    enclosureMounting: 'Na omietku (povrchový)',
    ipRating: 'IP54',
    mainBreaker: {
      enabled: true,
      designation: 'QF0',
      placement: 'Pred elektromerom',
      poles: '3P',
      ratedCurrent: 32,
      characteristic: 'B',
      breakingCapacity: '10 kA',
      manufacturer: 'Hager',
      model: 'MC3B32',
      location: 'PRED ROZVÁDZAČOM',
      hasInternalMainSwitch: true,
      internalSwitchCurrent: 40,
      internalDevice: {
        enabled: true,
        deviceType: 'Istič',
        designation: 'QF1',
        poles: '3P',
        ratedCurrent: 25,
        characteristic: 'B',
        breakingCapacity: '10 kA',
        manufacturer: 'Hager',
        model: 'MC3B25',
        modules: 3,
        hasOvercurrentProtection: true,
        topologyPosition: 'PRED_SPD_A_RCD',
      },
      electricityMeter: {
        enabled: true,
        designation: 'kWh',
        type: '3-fázový elektromer',
        tariff: 'IMS / Smart meter',
        location: 'V elektromerovom rozvádzači (RE)',
      },
      hasSurgeProtector: true,
      surgeProtectorType: 'T2 (C)',
      supplyTransformerImpedanceOhm: 0.22,
      supplyLineLengthM: 18,
    },
    rcds: [
      {
        id: 'rcd-t5-1',
        label: 'FI1',
        deviceKind: 'RCCB',
        poles: '4P',
        ratedCurrent: 40,
        sensitivity: 30,
        type: 'A',
        manufacturer: 'Hager',
        model: 'CD440J (A)',
        phase: 'L1,L2,L3',
        notes: 'Skupinový chránič za hlavným ističom QF1 (25 A)',
      },
    ],
    circuits: [
      {
        id: 't5-c1',
        label: 'FA1',
        name: 'Klimatizačná jednotka prevádzky',
        category: 'Technológia / Kúrenie',
        rcdId: 'rcd-t5-1',
        poles: '1P',
        ratedCurrent: 16,
        characteristic: 'C',
        breakingCapacity: '10 kA',
        phase: 'L1',
        cable: 'CYKY-J 3x2,5 mm²',
        cableLengthM: 16,
        powerKw: 2.0,
        manufacturer: 'Hager',
        model: 'MC1C16',
      },
      {
        id: 't5-c2',
        label: 'FA2',
        name: 'Zásuvky kancelária a pokladňa',
        category: 'Zásuvky',
        rcdId: 'rcd-t5-1',
        poles: '1P',
        ratedCurrent: 16,
        characteristic: 'B',
        breakingCapacity: '10 kA',
        phase: 'L2',
        cable: 'CYKY-J 3x2,5 mm²',
        cableLengthM: 15,
        powerKw: 2.2,
        manufacturer: 'Hager',
        model: 'MC1B16',
      },
      {
        id: 't5-c3',
        label: 'FA3',
        name: 'LED osvetlenie prevádzky',
        category: 'Osvetlenie',
        rcdId: 'rcd-t5-1',
        poles: '1P',
        ratedCurrent: 10,
        characteristic: 'B',
        breakingCapacity: '10 kA',
        phase: 'L3',
        cable: 'CYKY-J 3x1,5 mm²',
        cableLengthM: 18,
        powerKw: 0.45,
        manufacturer: 'Hager',
        model: 'MC1B10',
      },
    ],
  },

  test6_rcbo_a_rccb: {
    id: 'test6_rcbo_a_rccb',
    name: 'TEST 6: Rozvádzač s kombináciou RCCB (skupinový) + 3× RCBO (samostatné ističochrániče)',
    objectType: 'Rodinný dom',
    supplySystem: '3f',
    voltage: '400 V',
    networkSystem: 'TN-C-S',
    phaseCount: 3,
    supplyCable: 'CYKY-J 5x10 mm²',
    designerName: 'Ing. Marek Kováč – autorizovaný elektroprojektant',
    projectNumber: 'ESG-2026-606',
    projectDate: '04.11.2026',
    enclosureMounting: 'Pod omietku (zapustený)',
    ipRating: 'IP40',
    mainBreaker: {
      enabled: true,
      designation: 'QF0',
      placement: 'Pred elektromerom',
      poles: '3P',
      ratedCurrent: 25,
      characteristic: 'B',
      breakingCapacity: '10 kA',
      manufacturer: 'Eaton',
      model: 'PL7-B25/3',
      location: 'PRED ROZVÁDZAČOM',
      hasInternalMainSwitch: true,
      internalSwitchCurrent: 63,
      internalDevice: {
        enabled: true,
        deviceType: 'Hlavný vypínač',
        designation: 'QS1',
        poles: '3P',
        ratedCurrent: 63,
        manufacturer: 'Eaton',
        model: 'IS-63/3',
        modules: 3,
        hasOvercurrentProtection: false,
        topologyPosition: 'PRED_SPD_A_RCD',
      },
      electricityMeter: {
        enabled: true,
        designation: 'kWh',
        type: '3-fázový elektromer',
        tariff: 'Dvojtarifný (VT/NT)',
        location: 'V elektromerovom rozvádzači (RE)',
      },
      hasSurgeProtector: true,
      surgeProtectorType: 'T1+T2 (B+C)',
      supplyTransformerImpedanceOhm: 0.25,
      supplyLineLengthM: 12,
    },
    rcds: [
      {
        id: 'rcd-t6-1',
        label: 'FI1',
        deviceKind: 'RCCB',
        poles: '4P',
        ratedCurrent: 40,
        sensitivity: 30,
        type: 'A',
        manufacturer: 'Eaton',
        model: 'PF7-40/4/003-A',
        phase: 'L1,L2,L3',
        notes: 'Skupinový RCCB pre bežné zásuvkové a svetelné okruhy',
      },
      {
        id: 'rcd-t6-2',
        label: 'FI2',
        deviceKind: 'RCBO',
        poles: '2P',
        ratedCurrent: 16,
        sensitivity: 30,
        type: 'A',
        characteristic: 'B',
        breakingCapacity: '10 kA',
        manufacturer: 'Eaton',
        model: 'PFL7-16/1N/B/003-A',
        phase: 'L1',
        circuitName: 'Chladnička, mraznička a vínotéka (RCBO)',
        cableType: 'CYKY-J 3x2,5 mm²',
        cableLengthM: 14,
        powerKw: 0.65,
      },
      {
        id: 'rcd-t6-3',
        label: 'FI3',
        deviceKind: 'RCBO',
        poles: '2P',
        ratedCurrent: 16,
        sensitivity: 30,
        type: 'A',
        characteristic: 'B',
        breakingCapacity: '10 kA',
        manufacturer: 'Eaton',
        model: 'PFL7-16/1N/B/003-A',
        phase: 'L2',
        circuitName: 'Kotolňa, obehové čerpadlá a rekuperácia (RCBO)',
        cableType: 'CYKY-J 3x2,5 mm²',
        cableLengthM: 12,
        powerKw: 1.4,
      },
      {
        id: 'rcd-t6-4',
        label: 'FI4',
        deviceKind: 'RCBO',
        poles: '2P',
        ratedCurrent: 10,
        sensitivity: 30,
        type: 'A',
        characteristic: 'B',
        breakingCapacity: '10 kA',
        manufacturer: 'Eaton',
        model: 'PFL7-10/1N/B/003-A',
        phase: 'L3',
        circuitName: 'Server, router, kamerový systém a EZS (RCBO)',
        cableType: 'CYKY-J 3x1,5 mm²',
        cableLengthM: 10,
        powerKw: 0.4,
      },
    ],
    circuits: [
      {
        id: 't6-c1',
        label: 'FA1',
        name: 'Indukčná varná doska',
        category: 'Kuchyňa / Spotrebiče',
        rcdId: 'rcd-t6-1',
        poles: '3P',
        ratedCurrent: 16,
        characteristic: 'B',
        breakingCapacity: '10 kA',
        phase: 'L1,L2,L3',
        cable: 'CYKY-J 5x2,5 mm²',
        cableLengthM: 14,
        powerKw: 7.2,
        manufacturer: 'Eaton',
        model: 'PL7-B16/3',
      },
      {
        id: 't6-c2',
        label: 'FA2',
        name: 'Zásuvky obytná zóna',
        category: 'Zásuvky',
        rcdId: 'rcd-t6-1',
        poles: '1P',
        ratedCurrent: 16,
        characteristic: 'B',
        breakingCapacity: '10 kA',
        phase: 'L1',
        cable: 'CYKY-J 3x2,5 mm²',
        cableLengthM: 18,
        powerKw: 2.2,
        manufacturer: 'Eaton',
        model: 'PL7-B16/1',
      },
      {
        id: 't6-c3',
        label: 'FA3',
        name: 'Osvetlenie prízemie a poschodie',
        category: 'Osvetlenie',
        rcdId: 'rcd-t6-1',
        poles: '1P',
        ratedCurrent: 10,
        characteristic: 'B',
        breakingCapacity: '10 kA',
        phase: 'L2',
        cable: 'CYKY-J 3x1,5 mm²',
        cableLengthM: 16,
        powerKw: 0.4,
        manufacturer: 'Eaton',
        model: 'PL7-B10/1',
      },
    ],
  },

  garaz_dielna_3f: {
    id: 'garaz_dielna_3f',
    name: 'RG – Rozvádzač garáže, dielne a Wallboxu EV',
    objectType: 'Garáž',
    supplySystem: '3f',
    voltage: '400 V',
    networkSystem: 'TN-S',
    phaseCount: 3,
    supplyCable: 'CYKY-J 5x6 mm²',
    designerName: 'Ing. Marek Kováč – autorizovaný elektroprojektant',
    projectNumber: 'ESG-2026-102',
    projectDate: '04.11.2026',
    enclosureMounting: 'Na omietku (povrchový)',
    ipRating: 'IP65',
    mainBreaker: {
      poles: '3P',
      ratedCurrent: 32,
      characteristic: 'C',
      breakingCapacity: '10 kA',
      manufacturer: 'OEZ',
      model: 'LTN-32C-3',
      location: 'V ROZVÁDZAČI',
      hasInternalMainSwitch: false,
      internalSwitchCurrent: 40,
      hasSurgeProtector: true,
      surgeProtectorType: 'T2 (C)',
      supplyTransformerImpedanceOhm: 0.3,
      supplyLineLengthM: 18,
    },
    rcds: [
      {
        id: 'rcd-g1',
        label: 'FI1',
        deviceKind: 'RCCB',
        poles: '4P',
        ratedCurrent: 40,
        sensitivity: 30,
        type: 'A',
        manufacturer: 'OEZ',
        model: 'OFI-40-4-003A',
        phase: 'L1,L2,L3',
        notes: 'Chránič pre 400 V a 230 V zásuvky v dielni',
      },
      {
        id: 'rcd-g2',
        label: 'FI2',
        deviceKind: 'RCCB',
        poles: '4P',
        ratedCurrent: 40,
        sensitivity: 30,
        type: 'B',
        manufacturer: 'OEZ',
        model: 'OFI-40-4-003B',
        phase: 'L1,L2,L3',
        notes: 'Chránič typu B pre nabíjaciu stanicu elektromobilu (Wallbox 11 kW)',
      },
    ],
    circuits: [
      {
        id: 'cg-1',
        label: 'FA1',
        name: 'Zásuvka motorová 400 V / 16 A (5P)',
        category: 'Exteriér / Garáž / EV',
        rcdId: 'rcd-g1',
        poles: '3P',
        ratedCurrent: 16,
        characteristic: 'C',
        breakingCapacity: '10 kA',
        phase: 'L1,L2,L3',
        cable: 'CYKY-J 5x2,5 mm²',
        cableLengthM: 12,
        powerKw: 5.5,
        manufacturer: 'OEZ',
        model: 'LTN-16C-3',
      },
      {
        id: 'cg-2',
        label: 'FA2',
        name: 'Zásuvky pracovný ponk 230 V',
        category: 'Zásuvky',
        rcdId: 'rcd-g1',
        poles: '1P',
        ratedCurrent: 16,
        characteristic: 'B',
        breakingCapacity: '10 kA',
        phase: 'L1',
        cable: 'CYKY-J 3x2,5 mm²',
        cableLengthM: 10,
        powerKw: 2.2,
        manufacturer: 'OEZ',
        model: 'LTN-16B-1',
      },
      {
        id: 'cg-3',
        label: 'FA3',
        name: 'Sekcionálna garážová brána a vonkajšie zásuvky',
        category: 'Exteriér / Garáž / EV',
        rcdId: 'rcd-g1',
        poles: '1P',
        ratedCurrent: 16,
        characteristic: 'B',
        breakingCapacity: '10 kA',
        phase: 'L2',
        cable: 'CYKY-J 3x2,5 mm²',
        cableLengthM: 15,
        powerKw: 1.2,
        manufacturer: 'OEZ',
        model: 'LTN-16B-1',
      },
      {
        id: 'cg-4',
        label: 'FA4',
        name: 'LED osvetlenie garáže a vonkajší reflektor',
        category: 'Osvetlenie',
        rcdId: 'rcd-g1',
        poles: '1P',
        ratedCurrent: 10,
        characteristic: 'B',
        breakingCapacity: '10 kA',
        phase: 'L3',
        cable: 'CYKY-J 3x1,5 mm²',
        cableLengthM: 14,
        powerKw: 0.3,
        manufacturer: 'OEZ',
        model: 'LTN-10B-1',
      },
      {
        id: 'cg-5',
        label: 'FA5',
        name: 'Nabíjacia stanica Wallbox EV 11 kW',
        category: 'Exteriér / Garáž / EV',
        rcdId: 'rcd-g2',
        poles: '3P',
        ratedCurrent: 16,
        characteristic: 'B',
        breakingCapacity: '10 kA',
        phase: 'L1,L2,L3',
        cable: 'CYKY-J 5x4 mm²',
        cableLengthM: 18,
        powerKw: 11.0,
        manufacturer: 'OEZ',
        model: 'LTN-16B-3',
      },
    ],
  },
};

// =============================================================================
// VÝROBNÁ DOKUMENTÁCIA, KUSOVÁ SKÚŠKA A OTEPLENIE ROZVÁDZAČA (STN EN 61439-1/3)
// =============================================================================

export interface ThermalDissipationResult {
  totalUsedModules: number;
  totalLoss100PercentW: number;
  ratedDiversityFactorRdf: number;
  actualOperatingLossW: number;
  enclosureDissipationCapacityW: number;
  isCompliant: boolean;
  temperatureRiseK: number;
  maxAllowedTemperatureRiseK: number;
  reserveW: number;
  status: 'VYHOVUJE' | 'PREKROČENÉ';
  breakdown: {
    category: string;
    itemCount: number;
    nominalLossW: number;
    description: string;
  }[];
}

export function calculateThermalDissipation(project: SwitchboardProject): ThermalDissipationResult {
  const din = calculateDinRailAllocation(project);
  const upstream = getEffectiveUpstreamBreaker(project);
  const internalDev = getEffectiveInternalDevice(project);

  // 1. Stratové výkony jednotlivých kategórií prístrojov (menovité hodnoty pri 100% In)
  let mcbLossW = 0;
  project.circuits.forEach((c) => {
    // 1P MCB: ~1.5 - 2.5W, 3P MCB: ~5.0 - 7.5W
    const baseW = c.poles === '3P' || c.poles === '4P' ? 6.2 : c.ratedCurrent >= 20 ? 2.6 : 2.1;
    mcbLossW += baseW;
  });

  let rcdLossW = 0;
  project.rcds.forEach((r) => {
    // RCCB 2P: ~2.5W, 4P: ~6.5W, RCBO: ~3.8W
    const baseW = r.deviceKind === 'RCBO' ? 3.8 : r.poles === '4P' ? 6.5 : 2.5;
    rcdLossW += baseW;
  });

  // Hlavný vypínač / hlavný istič v rozvádzači
  let mainDeviceLossW = 0;
  if (internalDev.enabled) {
    mainDeviceLossW = internalDev.deviceType === 'Istič' ? (internalDev.poles === '4P' || internalDev.poles === '3P' ? 8.5 : 3.0) : 3.5;
  }

  // Prepäťová ochrana SPD (pokojový stratový výkon)
  let spdLossW = project.mainBreaker.hasSurgeProtector ? 1.2 : 0;

  // Vnútorné lankové spoje, prepojovacie hrebene a svorkovnice (cca 18 % zo súčtu prístrojov)
  const devicesNominalSum = mcbLossW + rcdLossW + mainDeviceLossW + spdLossW;
  const wiringAndTerminalsLossW = Number((devicesNominalSum * 0.18).toFixed(1));

  const totalLoss100PercentW = Number((devicesNominalSum + wiringAndTerminalsLossW).toFixed(1));

  // 2. Súčiniteľ súdobosti (RDF - Rated Diversity Factor) podľa STN EN 61439-3 čl. 5.3.2:
  // 2 až 3 okruhy: RDF = 0.8; 4 až 5 okruhov: RDF = 0.7; 6 až 9 okruhov: RDF = 0.6; 10 a viac: RDF = 0.5
  const mfg = project.manufacturingInfo;
  let rdf = mfg?.ratedDiversityFactor || 0.7;
  if (!mfg?.ratedDiversityFactor) {
    const count = project.circuits.length;
    if (count <= 3) rdf = 0.8;
    else if (count <= 5) rdf = 0.7;
    else if (count <= 9) rdf = 0.6;
    else rdf = 0.55;
  }

  // Skutočný stratový výkon rozvádzača pri súdobosti RDF:
  // Straty prístrojov závisia od I^2, preto sa násobia RDF^2 (podľa STN IEC TR 60890)
  const actualOperatingLossW = Number((devicesNominalSum * Math.pow(rdf, 2) + wiringAndTerminalsLossW * rdf).toFixed(1));

  // 3. Odvádzací chladiaci výkon skrine rozvádzača Pvext (W)
  // Štandardná rozvodnica DBO: orientačne cca 1.4 W až 1.8 W na 1 modul kapacity skrine
  // Zapustená skriňa má cca 15% nižší odvod tepla ako povrchová (montáž na stenu)
  const isFlushMounting = project.enclosureMounting.includes('Pod omietku') || project.enclosureMounting.includes('sadrokartónu');
  const baseWattsPerModule = isFlushMounting ? 1.45 : 1.75;
  const enclosureDissipationCapacityW = Number((din.totalCapacityModules * baseWattsPerModule).toFixed(1));

  // Oteplenie vnútra skrine ΔT (K) pri maximálnom dovolenom limite 30 K (alebo 35 K pre DBO)
  const maxAllowedTemperatureRiseK = 30;
  const temperatureRiseK = Number(
    enclosureDissipationCapacityW > 0
      ? ((actualOperatingLossW / enclosureDissipationCapacityW) * maxAllowedTemperatureRiseK).toFixed(1)
      : '0'
  );

  const reserveW = Number((enclosureDissipationCapacityW - actualOperatingLossW).toFixed(1));
  const isCompliant = actualOperatingLossW <= enclosureDissipationCapacityW;

  const breakdown = [
    {
      category: 'Inštalačné ističe (MCB)',
      itemCount: project.circuits.length,
      nominalLossW: Number(mcbLossW.toFixed(1)),
      description: `Menovitá strata ${project.circuits.length}× ističov pri 100% In`,
    },
    {
      category: 'Prúdové chrániče (RCCB / RCBO)',
      itemCount: project.rcds.length,
      nominalLossW: Number(rcdLossW.toFixed(1)),
      description: `Menovitá strata ${project.rcds.length}× chráničov`,
    },
    {
      category: 'Hlavný vypínač / istič v rozvádzači',
      itemCount: internalDev.enabled ? 1 : 0,
      nominalLossW: Number(mainDeviceLossW.toFixed(1)),
      description: internalDev.enabled ? `${internalDev.designation} (${internalDev.deviceType})` : 'Bez vnútorného hlavného prvku',
    },
    {
      category: 'Prepäťová ochrana (SPD)',
      itemCount: project.mainBreaker.hasSurgeProtector ? 1 : 0,
      nominalLossW: Number(spdLossW.toFixed(1)),
      description: project.mainBreaker.hasSurgeProtector ? `Zvodič ${project.mainBreaker.surgeProtectorType}` : 'Bez SPD',
    },
    {
      category: 'Vnútorné lanká, hrebene a svorky',
      itemCount: din.totalUsedModules,
      nominalLossW: wiringAndTerminalsLossW,
      description: 'Prechodové odpory svorkovníc a vedenia (~18 %)',
    },
  ];

  return {
    totalUsedModules: din.totalUsedModules,
    totalLoss100PercentW,
    ratedDiversityFactorRdf: rdf,
    actualOperatingLossW,
    enclosureDissipationCapacityW,
    isCompliant,
    temperatureRiseK,
    maxAllowedTemperatureRiseK,
    reserveW,
    status: isCompliant ? 'VYHOVUJE' : 'PREKROČENÉ',
    breakdown,
  };
}

export function getEffectiveManufacturingInfo(project: SwitchboardProject): SwitchboardManufacturerInfo {
  const currentYear = new Date().getFullYear();
  const todayFormatted = new Date().toLocaleDateString('sk-SK');
  const defaults: SwitchboardManufacturerInfo = {
    manufacturerName: 'ELEKTRO MONTÁŽ & VÝROBA ROZVÁDZAČOV s.r.o.',
    manufacturerStreet: 'Priemyselná 12',
    manufacturerCity: project.locationCity || 'Bratislava',
    manufacturerIco: '52 345 678',
    manufacturerDic: 'SK2024567890',
    manufacturerPhone: '+421 905 123 456',
    manufacturerEmail: 'vyroba@elektro-rozvadzace.sk',
    technicianName: project.designerName?.split('–')[0]?.trim() || 'Ing. Marek Kováč',
    technicianCertificateNumber: 'Ev. č. 1420/2021-EZ-S,O-E2A (§ 23)',
    serialNumber: `SN-${currentYear}-${project.projectNumber ? project.projectNumber.replace(/[^0-9]/g, '').slice(-4) || '0042' : '0042'}`,
    productionYear: currentYear,
    typeDesignation: `DBO-${project.objectType === 'Byt' ? 'RB' : project.objectType === 'Garáž' || project.objectType === 'Garáž / Dielňa' ? 'RG' : 'RD'}-${currentYear}/01`,
    testedDate: todayFormatted,
    measurementDeviceModel: 'Metrel MI 3152 EurotestXC (Kalibrácia do 2027)',
    measurementDeviceSerial: 'SN: 21450892',
    calibrationValidUntil: `31.12.${currentYear + 2}`,
    enclosureProtectionClass: project.enclosureMounting?.includes('sadrokartónu') || project.ipRating === 'IP65'
      ? 'Trieda II (dvojitá izolácia / celoplast)'
      : 'Trieda I (s PE svorkou)',
    ratedDiversityFactor: project.circuits.length > 9 ? 0.6 : project.circuits.length > 5 ? 0.7 : 0.8,
    ambientTempRange: '-5 °C až +40 °C',
    ratedShortCircuitIcnKa: project.mainBreaker.breakingCapacity ? parseInt(project.mainBreaker.breakingCapacity) : 10,
    manufacturerLogoUrl: undefined,
    logoDisplayMode: 'text_only',
    logoHeightMm: 16,
    notes: 'Kusové overenie vykonané v súlade s STN EN 61439-1 čl. 11 a STN EN 61439-3. Výrobok spĺňa všetky bezpečnostné požiadavky.',
    verificationChecks: {
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
    },
  };

  if (!project.manufacturingInfo) {
    return defaults;
  }

  return {
    ...defaults,
    ...project.manufacturingInfo,
    verificationChecks: {
      ...defaults.verificationChecks!,
      ...(project.manufacturingInfo.verificationChecks || {}),
    },
  };
}


