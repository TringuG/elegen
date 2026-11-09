import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INITIAL_COMPONENT_LIBRARY,
  PROJECT_TEMPLATES,
  applySupplySystemChange,
  balanceCircuitPhases,
  calculateCircuitParameters,
  calculateDinRailAllocation,
  calculatePhaseLoad,
  generateBom,
  generateSmartSwitchboardProposal,
  suggestMainBreakerModel,
  suggestRcdModel,
  validateStnCompliance,
  calculateThermalDissipation,
  getEffectiveManufacturingInfo,
} from './electricalEngine';

test('suggestRcdModel differentiates between RCCB and RCBO models', () => {
  const rccbModel = suggestRcdModel('Eaton', 'RCCB', '4P', 40, 30, 'A');
  const rcboModel = suggestRcdModel('Eaton', 'RCBO', '2P', 16, 30, 'A', 'B');

  assert.equal(rccbModel, 'PF7-40/4/003-A');
  assert.equal(rcboModel, 'PFL7-16/1N/B/003-A');
});

test('suggestMainBreakerModel generates correct model string per manufacturer', () => {
  assert.equal(suggestMainBreakerModel('Eaton', '3P', 'B', 25, '10 kA'), 'PL7-B25/3');
  assert.equal(suggestMainBreakerModel('OEZ', '3P', 'C', 32, '10 kA'), 'LTN-32C-3');
});

test('applySupplySystemChange converts 3-phase 400V project to 1-phase 230V properly', () => {
  const initial = PROJECT_TEMPLATES.rodinny_dom_3f;
  const converted = applySupplySystemChange(initial, '1f');

  assert.equal(converted.supplySystem, '1f');
  assert.equal(converted.voltage, '230 V');
  assert.equal(converted.phaseCount, 1);
  assert.equal(converted.mainBreaker.poles, '1P');
  assert.ok(converted.rcds.every((r) => r.poles === '2P'));
  assert.ok(converted.circuits.every((c) => c.phase === 'L1'));
});

test('calculatePhaseLoad computes phase distribution, utilization %, and simultaneity factor', () => {
  const project = PROJECT_TEMPLATES.rodinny_dom_3f;
  const load = calculatePhaseLoad(project);

  assert.ok(load.totalInstalledKw > 20);
  assert.ok(load.L1.powerKw > 0);
  assert.ok(load.L2.powerKw > 0);
  assert.ok(load.L3.powerKw > 0);
  assert.ok(load.L1.utilizationPercent > 0);
  assert.ok(load.simultaneousKw < load.totalInstalledKw);
});

test('balanceCircuitPhases reduces phase asymmetry across L1, L2, L3', () => {
  const unbalanced = {
    ...PROJECT_TEMPLATES.rodinny_dom_3f,
    circuits: PROJECT_TEMPLATES.rodinny_dom_3f.circuits.map((c) =>
      c.poles === '1P' ? { ...c, phase: 'L1' as const } : c
    ),
  };

  const beforeLoad = calculatePhaseLoad(unbalanced);
  const balanced = balanceCircuitPhases(unbalanced);
  const afterLoad = calculatePhaseLoad(balanced);

  assert.ok(afterLoad.asymmetryPercent < beforeLoad.asymmetryPercent);
});

test('validateStnCompliance flags TN-C with RCD as an error and keeps orange verification items when unconfirmed', () => {
  const invalidTnc = {
    ...PROJECT_TEMPLATES.rodinny_dom_3f,
    networkSystem: 'TN-C' as const,
  };
  const issues = validateStnCompliance(invalidTnc);
  assert.ok(issues.some((i) => i.id === 'tnc-rcd' && i.severity === 'error'));
  // Also must contain orange warnings requiring on-site measurement/verification when checklist is not confirmed
  assert.ok(issues.some((i) => i.severity === 'warning'));
});

test('calculateDinRailAllocation and generateBom include main breaker, RCCBs, RCBOs, circuits, and enclosure dimensions', () => {
  const project = PROJECT_TEMPLATES.rodinny_dom_3f;
  const din = calculateDinRailAllocation(project);
  const bom = generateBom(project);

  assert.ok(din.totalUsedModules > 15);
  assert.ok(din.reservePercentage >= 20);
  assert.ok(din.dimensionsMm.width > 200);
  assert.ok(din.dimensionsMm.height > 300);
  assert.ok(bom.some((item) => item.category === 'RCCB (Prúdový chránič)'));
  assert.ok(bom.some((item) => item.category === 'RCBO (Ističochránič)'));
});

test('calculateCircuitParameters computes Ib, Iz, voltage drop, loop impedance Zs, and disconnection check', () => {
  const project = PROJECT_TEMPLATES.rodinny_dom_3f;
  const results = calculateCircuitParameters(project);

  assert.equal(results.length, project.circuits.length);
  const cooktop = results[0];
  assert.equal(cooktop.voltageV, 400);
  assert.ok(cooktop.designCurrentIb > 10 && cooktop.designCurrentIb < 16);
  assert.ok(cooktop.voltageDropPercent > 0 && cooktop.voltageDropPercent < 5);
  assert.ok(cooktop.loopImpedanceZsOhm > 0.25);
  assert.equal(cooktop.overloadProtectionOk, true);
  assert.equal(cooktop.disconnectConditionOk, true);
});

test('generateSmartSwitchboardProposal builds balanced switchboard and mandatory engineering disclaimers', () => {
  const proposal = generateSmartSwitchboardProposal({
    projectName: 'RH – Novostavba RD',
    objectType: 'Rodinný dom',
    roomCount: 5,
    lightCircuitCount: 3,
    socketCircuitCount: 4,
    mainBreakerCurrent: 25,
    mainBreakerChar: 'B',
    mainBreakerLocation: 'PRED ROZVÁDZAČOM',
    networkSystem: 'TN-C-S',
    supplySystem: '3f',
    preferredManufacturer: 'ABB',
    appliances: {
      inductionCooktop: true,
      electricOven: true,
      dishwasher: true,
      washingMachine: true,
      dryer: true,
      boilerWaterHeater: false,
      heatPumpOrBoiler: true,
      airConditioning: true,
      evWallbox11kW: true,
      outdoorAndGarage: true,
    },
    protections: {
      hasSpd: true,
      spdType: 'T1+T2 (B+C)',
      useRcboForFridgeAndCritical: true,
      useTypeBRcdForEv: true,
      useAfddForBedrooms: true,
    },
  });

  assert.ok(proposal.project.rcds.length >= 3);
  assert.ok(proposal.project.circuits.length >= 12);
  assert.ok(proposal.assumptions.length >= 3);
  assert.ok(proposal.uncertainties.length >= 3);
  assert.ok(proposal.mandatoryHumanChecks.length >= 3);
});

test('INITIAL_COMPONENT_LIBRARY contains all 6 required manufacturers', () => {
  const requiredManufacturers = [
    'ABB',
    'Hager',
    'Schneider Electric',
    'Eaton',
    'OEZ',
    'Legrand',
  ];
  for (const mfg of requiredManufacturers) {
    assert.ok(
      INITIAL_COMPONENT_LIBRARY.some((p) => p.manufacturer === mfg),
      `Missing manufacturer ${mfg}`
    );
  }
});

test('parseCircuitListText parses numbered list, Excel TSV, and unstructured text without confirming missing data', async () => {
  const {
    parseCircuitListText,
    SAMPLE_IMPORT_TEXT_PROMPT,
    SAMPLE_IMPORT_EXCEL_TSV,
    applyImportedCircuitsToProject,
  } = await import('./autoCircuitImportEngine');

  const res = parseCircuitListText(SAMPLE_IMPORT_TEXT_PROMPT);
  assert.equal(res.header.objectType?.value, 'Rodinný dom');
  assert.equal(res.header.mainBreakerCurrent?.value, 25);
  assert.equal(res.header.mainBreakerPoles?.value, '3P');
  assert.equal(res.header.networkSystem?.value, 'TN-C-S');
  assert.equal(res.circuits.length, 8);

  // Check QF1 (Svetlá prízemie – B10 – 1,5 mm²)
  const qf1 = res.circuits[0];
  assert.equal(qf1.designation, 'QF1');
  assert.equal(qf1.ratedCurrent, 10);
  assert.equal(qf1.characteristic, 'B');
  assert.equal(qf1.crossSectionMm2, 1.5);
  assert.equal(qf1.powerKw, null);
  assert.equal(qf1.powerStatus, 'missing');

  // Check QF8 (Varná doska – 3P B16 – 5x2,5 mm²)
  const qf8 = res.circuits[7];
  assert.equal(qf8.designation, 'QF8');
  assert.equal(qf8.poles, '3P');
  assert.equal(qf8.ratedCurrent, 16);
  assert.equal(qf8.isThreePhase, true);

  // Check Excel TSV parsing
  const tsvRes = parseCircuitListText(SAMPLE_IMPORT_EXCEL_TSV);
  assert.equal(tsvRes.circuits.length, 6);
  assert.equal(tsvRes.circuits[3].characteristic, 'C');
  assert.equal(tsvRes.circuits[5].rcdAssignment, 'RCBO');

  // Check applyImportedCircuitsToProject creates QF1..QF8 and keeps verification unconfirmed
  const updatedProj = applyImportedCircuitsToProject(
    PROJECT_TEMPLATES.rodinny_dom_3f,
    res.circuits,
    res.header,
    {
      applyHeaderMetadata: true,
      replaceExistingCircuits: true,
      autoBalancePhases: true,
    }
  );
  assert.equal(updatedProj.circuits.length, 8);
  assert.equal(updatedProj.circuits[0].label, 'QF1');
  assert.equal(updatedProj.circuits[7].label, 'QF8');
  assert.equal(updatedProj.verificationChecklist?.shortCircuitMeasuredOrCalculated, false);
});

test('two independent main devices (QF0 pred elektromerom + QS1/QF1 v rozvádzači) never conflate Hlavný vypínač with Istič', async () => {
  const {
    getEffectiveUpstreamBreaker,
    getEffectiveElectricityMeter,
    getEffectiveInternalDevice,
    suggestInternalMainDeviceModel,
  } = await import('./electricalEngine');

  const base = PROJECT_TEMPLATES.rodinny_dom_3f;
  const upstream = getEffectiveUpstreamBreaker(base);
  const meter = getEffectiveElectricityMeter(base);
  const internalSw = getEffectiveInternalDevice(base);

  assert.equal(upstream.enabled, true);
  assert.equal(upstream.designation, 'QF0');
  assert.equal(upstream.placement, 'Pred elektromerom');
  assert.equal(meter.enabled, true);
  assert.equal(meter.type, '3-fázový elektromer');

  // By default when upstream breaker is before switchboard, internal device is Hlavný vypínač QS1 without overcurrent protection
  assert.equal(internalSw.deviceType, 'Hlavný vypínač');
  assert.equal(internalSw.designation, 'QS1');
  assert.equal(internalSw.hasOvercurrentProtection, false);

  const bomWithSwitch = generateBom(base);
  assert.ok(bomWithSwitch.some((i) => i.code === 'QF0' && i.category === 'Hlavné istenie (RE)'));
  assert.ok(
    bomWithSwitch.some(
      (i) =>
        i.code === 'QS1' &&
        i.category === 'Hlavný spínací prvok' &&
        i.description.includes('bez nadprúdovej ochrany')
    )
  );

  // Now configure internal device as an Istič QF1 (with overcurrent protection)
  const withInternalBreaker = {
    ...base,
    mainBreaker: {
      ...base.mainBreaker,
      internalDevice: {
        enabled: true,
        deviceType: 'Istič' as const,
        poles: '3P' as const,
        ratedCurrent: 32 as const,
        characteristic: 'B' as const,
        breakingCapacity: '10 kA' as const,
        manufacturer: 'Eaton' as const,
        model: suggestInternalMainDeviceModel('Eaton', 'Istič', '3P', 32, 'B', true),
        modules: 3,
        designation: 'QF1',
        hasOvercurrentProtection: true,
        topologyPosition: 'PRED_SPD_A_RCD' as const,
      },
    },
  };

  const dinBreaker = calculateDinRailAllocation(withInternalBreaker);
  const bomBreaker = generateBom(withInternalBreaker);
  assert.equal(dinBreaker.rows[0][0].type, 'main-breaker');
  assert.ok(dinBreaker.rows[0][0].label.startsWith('QF1'));
  assert.ok(
    bomBreaker.some(
      (i) =>
        i.code === 'QF1' &&
        i.category === 'Hlavné istenie v rozvádzači' &&
        i.description.includes('s nadprúdovou ochranou')
    )
  );
});

test('all 6 required test projects (TEST 1 to TEST 6) and createBlankProject work and pass calculations', async () => {
  const {
    createBlankProject,
    getEffectiveUpstreamBreaker,
    getEffectiveInternalDevice,
  } = await import('./electricalEngine');

  const testKeys = [
    'byt_1f_230v',
    'test2_byt_3f_viac_fi',
    'rodinny_dom_3f',
    'test4_qf0_a_vypinac_qs1',
    'test5_qf0_a_istic_qf1',
    'test6_rcbo_a_rccb',
  ];

  for (const key of testKeys) {
    const proj = PROJECT_TEMPLATES[key];
    assert.ok(proj, `Template ${key} must exist`);
    const calcs = calculateCircuitParameters(proj);
    assert.equal(calcs.length, proj.circuits.length);
    const din = calculateDinRailAllocation(proj);
    assert.ok(din.totalUsedModules > 0);
    const bom = generateBom(proj);
    assert.ok(bom.length > 0);
    const issues = validateStnCompliance(proj);
    assert.equal(
      issues.filter((i) => i.severity === 'error').length,
      0,
      `Template ${key} should have 0 critical errors`
    );
  }

  // Verify TEST 4 has QF0 + Hlavný vypínač QS1
  const t4 = PROJECT_TEMPLATES.test4_qf0_a_vypinac_qs1;
  assert.equal(getEffectiveUpstreamBreaker(t4).designation, 'QF0');
  assert.equal(getEffectiveInternalDevice(t4).deviceType, 'Hlavný vypínač');
  assert.equal(getEffectiveInternalDevice(t4).designation, 'QS1');

  // Verify TEST 5 has QF0 (32A) + Hlavný istič QF1 (25A)
  const t5 = PROJECT_TEMPLATES.test5_qf0_a_istic_qf1;
  assert.equal(getEffectiveUpstreamBreaker(t5).ratedCurrent, 32);
  assert.equal(getEffectiveInternalDevice(t5).deviceType, 'Istič');
  assert.equal(getEffectiveInternalDevice(t5).designation, 'QF1');
  assert.equal(getEffectiveInternalDevice(t5).ratedCurrent, 25);

  // Verify TEST 6 has both RCCB and RCBO
  const t6 = PROJECT_TEMPLATES.test6_rcbo_a_rccb;
  assert.ok(t6.rcds.some((r) => r.deviceKind === 'RCCB'));
  assert.ok(t6.rcds.some((r) => r.deviceKind === 'RCBO'));

  // Verify createBlankProject('1f') and createBlankProject('3f')
  const blank1f = createBlankProject('1f');
  assert.equal(blank1f.supplySystem, '1f');
  assert.equal(blank1f.voltage, '230 V');
  assert.ok(blank1f.circuits.length >= 2);

  const blank3f = createBlankProject('3f');
  assert.equal(blank3f.supplySystem, '3f');
  assert.equal(blank3f.voltage, '400 V');
  assert.ok(blank3f.circuits.length >= 2);
});

test('validateStnCompliance detects internal-switch-overload, dual-breaker-selectivity, and missing-main-overcurrent', () => {
  const base = PROJECT_TEMPLATES.test4_qf0_a_vypinac_qs1;

  // 1. internal-switch-overload: In(QS1) = 25A < In(QF0) = 32A
  const overloadedSwitch = {
    ...base,
    mainBreaker: {
      ...base.mainBreaker,
      enabled: true,
      ratedCurrent: 32 as const,
      internalDevice: {
        ...base.mainBreaker.internalDevice!,
        enabled: true,
        deviceType: 'Hlavný vypínač' as const,
        hasOvercurrentProtection: false,
        ratedCurrent: 25 as const,
      },
    },
  };
  const switchIssues = validateStnCompliance(overloadedSwitch);
  assert.ok(switchIssues.some((i) => i.id === 'internal-switch-overload' && i.severity === 'error'));

  // 2. dual-breaker-selectivity: In(QF1) = 32A >= In(QF0) = 25A
  const nonSelective = {
    ...PROJECT_TEMPLATES.test5_qf0_a_istic_qf1,
    mainBreaker: {
      ...PROJECT_TEMPLATES.test5_qf0_a_istic_qf1.mainBreaker,
      enabled: true,
      ratedCurrent: 25 as const,
      internalDevice: {
        ...PROJECT_TEMPLATES.test5_qf0_a_istic_qf1.mainBreaker.internalDevice!,
        enabled: true,
        deviceType: 'Istič' as const,
        hasOvercurrentProtection: true,
        ratedCurrent: 32 as const,
      },
    },
  };
  const selIssues = validateStnCompliance(nonSelective);
  assert.ok(selIssues.some((i) => i.id === 'dual-breaker-selectivity' && i.severity === 'warning'));

  // 3. missing-main-overcurrent: QF0 disabled AND internal device is only Hlavný vypínač
  const noOvercurrent = {
    ...base,
    mainBreaker: {
      ...base.mainBreaker,
      enabled: false,
      internalDevice: {
        ...base.mainBreaker.internalDevice!,
        enabled: true,
        deviceType: 'Hlavný vypínač' as const,
        hasOvercurrentProtection: false,
      },
    },
  };
  const missingOcIssues = validateStnCompliance(noOvercurrent);
  assert.ok(
    missingOcIssues.some((i) => i.id === 'missing-main-overcurrent' && i.severity === 'error')
  );
});

test('calculateThermalDissipation computes power losses and verifies enclosure heat balance', () => {
  const project = PROJECT_TEMPLATES.rodinny_dom_3f;
  const result = calculateThermalDissipation(project);

  assert.ok(result.totalLoss100PercentW > 0, 'Total nominal loss should be positive');
  assert.ok(result.actualOperatingLossW > 0, 'Actual operating loss should be positive');
  assert.ok(result.actualOperatingLossW <= result.totalLoss100PercentW, 'Operating loss with RDF should be <= 100% loss');
  assert.ok(result.enclosureDissipationCapacityW > 0, 'Enclosure capacity should be positive');
  assert.equal(result.isCompliant, true, 'Rodinny dom should comply with enclosure heat dissipation');
  assert.equal(result.status, 'VYHOVUJE');
  assert.ok(result.breakdown.length >= 4, 'Breakdown should list MCBs, RCDs, main device and wiring');
});

test('getEffectiveManufacturingInfo provides full nameplate data, piece verification protocol, and logo support', () => {
  const project = PROJECT_TEMPLATES.rodinny_dom_3f;
  const mfg = getEffectiveManufacturingInfo(project);

  assert.ok(mfg.manufacturerName.length > 0);
  assert.ok(mfg.serialNumber.startsWith('SN-'));
  assert.ok(mfg.typeDesignation.startsWith('DBO-'));
  assert.ok(mfg.verificationChecks);
  assert.equal(mfg.verificationChecks?.overallPieceVerificationResult, 'VYHOVUJE');
  assert.ok(mfg.verificationChecks?.measuredInsulationResistanceMohm >= 50);
  assert.ok(mfg.verificationChecks?.measuredPeResistanceOhm <= 0.1);
});

test('browser memory nameplate persistence saves and loads last nameplate and presets', async () => {
  const {
    saveLastNameplateToBrowserMemory,
    loadLastNameplateFromBrowserMemory,
    clearLastNameplateFromBrowserMemory,
    saveNameplatePresetToBrowserMemory,
    getSavedNameplatePresets,
    deleteNameplatePresetFromBrowserMemory,
  } = await import('./electricalEngine');

  // Provide an in-memory localStorage mock for Node test environment
  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => store.set(k, v),
    removeItem: (k: string) => store.delete(k),
  };

  const baseMfg = getEffectiveManufacturingInfo(PROJECT_TEMPLATES.rodinny_dom_3f);
  const customMfg = {
    ...baseMfg,
    manufacturerName: 'ELEKTRO MONTÁŽE KOVÁČ s.r.o.',
    manufacturerIco: '55443322',
    boardTitle: 'HLAVNÝ DOMOVÝ ROZVÁDZAČ (HDR)',
    customRatedCurrentInA: '63 A',
  };

  saveLastNameplateToBrowserMemory(customMfg, 'large');
  const loaded = loadLastNameplateFromBrowserMemory();
  assert.ok(loaded);
  assert.equal(loaded?.labelSize, 'large');
  assert.equal(loaded?.info.manufacturerName, 'ELEKTRO MONTÁŽE KOVÁČ s.r.o.');
  assert.equal(loaded?.info.boardTitle, 'HLAVNÝ DOMOVÝ ROZVÁDZAČ (HDR)');

  // Verify getEffectiveManufacturingInfo picks up browser memory defaults for a fresh project
  const merged = getEffectiveManufacturingInfo(PROJECT_TEMPLATES.byt_1f_230v);
  assert.equal(merged.manufacturerName, 'ELEKTRO MONTÁŽE KOVÁČ s.r.o.');
  assert.equal(merged.manufacturerIco, '55443322');
  assert.equal(merged.customRatedCurrentInA, '63 A');

  // Verify preset library in browser memory
  const presetsAfterSave = saveNameplatePresetToBrowserMemory('Štítok RD Kováč', customMfg, 'standard');
  assert.equal(presetsAfterSave.length, 1);
  assert.equal(getSavedNameplatePresets()[0].presetName, 'Štítok RD Kováč');

  const afterDelete = deleteNameplatePresetFromBrowserMemory(presetsAfterSave[0].id);
  assert.equal(afterDelete.length, 0);

  clearLastNameplateFromBrowserMemory();
  assert.equal(loadLastNameplateFromBrowserMemory(), null);
  delete (globalThis as any).localStorage;
});
