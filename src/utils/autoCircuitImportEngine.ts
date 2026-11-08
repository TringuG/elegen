import {
  BreakerCharacteristic,
  BreakingCapacity,
  CircuitCategory,
  CircuitConfig,
  MainBreakerCurrent,
  Manufacturer,
  NetworkSystemType,
  ObjectType,
  PhaseAllocation,
  PolesType,
  RcdConfig,
  SwitchboardProject,
} from '../types/electrical';
import {
  balanceCircuitPhases,
  suggestCircuitBreakerModel,
  suggestMainBreakerModel,
  suggestRcdModel,
} from './electricalEngine';

export type FieldStatus = 'recognized' | 'suggested' | 'missing';

export interface ParsedHeaderMetadata {
  objectType?: { value: ObjectType; status: FieldStatus };
  mainBreakerPoles?: { value: PolesType; status: FieldStatus };
  mainBreakerCurrent?: { value: MainBreakerCurrent; status: FieldStatus };
  mainBreakerChar?: { value: BreakerCharacteristic; status: FieldStatus };
  networkSystem?: { value: NetworkSystemType; status: FieldStatus };
  supplySystem?: { value: '1f' | '3f'; status: FieldStatus };
}

export interface ParsedCircuitDraft {
  id: string;
  rawLine: string;
  designation: string; // QF1, QF2, QF3...
  name: string;
  category: CircuitCategory;
  categoryStatus: FieldStatus;
  poles: PolesType;
  polesStatus: FieldStatus;
  characteristic: BreakerCharacteristic;
  characteristicStatus: FieldStatus;
  ratedCurrent: 6 | 10 | 13 | 16 | 20 | 25 | 32 | 40 | 50 | 63;
  ratedCurrentStatus: FieldStatus;
  crossSectionMm2: number | null;
  crossSectionStatus: FieldStatus;
  cableType: string;
  cableStatus: FieldStatus;
  isThreePhase: boolean;
  phase: PhaseAllocation;
  phaseStatus: FieldStatus;
  rcdAssignment: 'FI1' | 'FI2' | 'FI3' | 'RCBO' | 'NONE';
  rcdStatus: FieldStatus;
  powerKw: number | null;
  powerStatus: FieldStatus;
}

export interface AutoImportParseResult {
  header: ParsedHeaderMetadata;
  circuits: ParsedCircuitDraft[];
  warnings: string[];
}

export const SAMPLE_IMPORT_TEXT_PROMPT = `Rodinný dom
Hlavný istič: 3x25 A
Sústava: TN-C-S

1. Svetlá prízemie – B10 – 1,5 mm²
2. Svetlá poschodie – B10 – 1,5 mm²
3. Zásuvky obývačka – B16 – 2,5 mm²
4. Zásuvky kuchyňa – B16 – 2,5 mm²
5. Práčka – B16 – 2,5 mm²
6. Umývačka – B16 – 2,5 mm²
7. Rúra – B16 – 2,5 mm²
8. Varná doska – 3P B16 – 5x2,5 mm²`;

export const SAMPLE_IMPORT_EXCEL_TSV = `Názov okruhu\tIstič\tKábel\tPríkon\tChránič
Osvetlenie vstup a chodba\tB10\tCYKY-J 3x1,5\t0,3 kW\tFI1
Zásuvky pracovňa a PC\tB16\tCYKY-J 3x2,5\t2,0 kW\tFI1
Kúpeľňa práčka + sušička\tB16\tCYKY-J 3x2,5\t3,2 kW\tFI2
Tepelné čerpadlo vonkajšia jedn.\t3P C16\tCYKY-J 5x2,5\t6,5 kW\tFI2
Nabíjačka EV Wallbox garáž\t3P B20\tCYKY-J 5x4\t11 kW\tFI3
Chladnička s mrazničkou\tB16\tCYKY-J 3x2,5\t0,5 kW\tRCBO`;

export const SAMPLE_IMPORT_UNSTRUCTURED = `Byt
Hlavný istič: 1x25 A, TN-S
- svetlo obývačka a spálňa 10A
- zásuvky izby B16 2.5mm2
- kuchynská linka zásuvky 16A
- elektrická rúra 3.2kW
- kúpeľňa zásuvky a práčka B16 30mA`;

function detectCategoryFromName(name: string): {
  category: CircuitCategory;
  status: FieldStatus;
} {
  const lower = name.toLowerCase();
  if (
    lower.includes('svetl') ||
    lower.includes('osvetl') ||
    lower.includes('led') ||
    lower.includes('lamp')
  ) {
    return { category: 'Osvetlenie', status: 'recognized' };
  }
  if (
    lower.includes('kúpeľ') ||
    lower.includes('kupel') ||
    lower.includes('práčk') ||
    lower.includes('prack') ||
    lower.includes('sušič') ||
    lower.includes('susic') ||
    lower.includes('wc')
  ) {
    return { category: 'Kúpeľňa / Práčovňa', status: 'recognized' };
  }
  if (
    lower.includes('kuchy') ||
    lower.includes('varn') ||
    lower.includes('induk') ||
    lower.includes('rúra') ||
    lower.includes('rura') ||
    lower.includes('umývač') ||
    lower.includes('umyvac') ||
    lower.includes('mikrovl') ||
    lower.includes('chladnič') ||
    lower.includes('chladnic') ||
    lower.includes('sporák')
  ) {
    return { category: 'Kuchyňa / Spotrebiče', status: 'recognized' };
  }
  if (
    lower.includes('kotol') ||
    lower.includes('čerpadl') ||
    lower.includes('cerpadl') ||
    lower.includes('bojler') ||
    lower.includes('ohrievač') ||
    lower.includes('klimatiz') ||
    lower.includes('rekuper') ||
    lower.includes('kúren')
  ) {
    return { category: 'Technológia / Kúrenie', status: 'recognized' };
  }
  if (
    lower.includes('garáž') ||
    lower.includes('garaz') ||
    lower.includes('wallbox') ||
    lower.includes('nabíj') ||
    lower.includes('ev ') ||
    lower.includes('exteriér') ||
    lower.includes('vonkaj') ||
    lower.includes('terasa') ||
    lower.includes('brána')
  ) {
    return { category: 'Exteriér / Garáž / EV', status: 'recognized' };
  }
  if (lower.includes('rezerv')) {
    return { category: 'Rezerva', status: 'recognized' };
  }
  if (lower.includes('zásuvk') || lower.includes('zasuvk')) {
    return { category: 'Zásuvky', status: 'recognized' };
  }
  return { category: 'Zásuvky', status: 'suggested' };
}

const VALID_MCB_CURRENTS = [6, 10, 13, 16, 20, 25, 32, 40, 50, 63] as const;
const VALID_MAIN_CURRENTS: MainBreakerCurrent[] = [10, 16, 20, 25, 32, 40, 50, 63];

function snapMcbCurrent(
  val: number
): 6 | 10 | 13 | 16 | 20 | 25 | 32 | 40 | 50 | 63 {
  for (const c of VALID_MCB_CURRENTS) {
    if (c >= val) return c;
  }
  return 63;
}

function snapMainCurrent(val: number): MainBreakerCurrent {
  for (const c of VALID_MAIN_CURRENTS) {
    if (c >= val) return c;
  }
  return 63;
}

/**
 * Local heuristic & rule-based parser for circuit lists (plain text, numbered lists, Excel TSV, Word, CSV).
 * Never marks missing data as confirmed engineering values — explicitly tracks FieldStatus ('recognized' | 'suggested' | 'missing').
 */
export function parseCircuitListText(rawInput: string): AutoImportParseResult {
  const header: ParsedHeaderMetadata = {};
  const circuits: ParsedCircuitDraft[] = [];
  const warnings: string[] = [];

  const lines = rawInput
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  let circuitIndex = 1;

  for (const line of lines) {
    const lower = line.toLowerCase();

    // Skip pure CSV/TSV header row
    if (
      (lower.includes('názov okruhu') || lower.includes('nazov okruhu')) &&
      (lower.includes('istič') || lower.includes('kábel'))
    ) {
      continue;
    }

    // 1. Check if line is Object Type metadata
    if (
      /^(typ objektu\s*:?\s*)?(rodinný dom|rodinny dom|byt|garáž|garaz|prevádzka|prevadzka|iné|ine)$/i.test(
        line
      )
    ) {
      if (lower.includes('rodinn')) {
        header.objectType = { value: 'Rodinný dom', status: 'recognized' };
      } else if (lower.includes('byt')) {
        header.objectType = { value: 'Byt', status: 'recognized' };
      } else if (lower.includes('gar')) {
        header.objectType = { value: 'Garáž', status: 'recognized' };
      } else if (lower.includes('prev')) {
        header.objectType = { value: 'Prevádzka', status: 'recognized' };
      } else {
        header.objectType = { value: 'Iné', status: 'recognized' };
      }
      continue;
    }

    // 2. Check if line is Main Breaker or Network System header line
    if (lower.startsWith('hlavný istič') || lower.startsWith('hlavny istic')) {
      // Extract 3x25 A, 1x25 A, 3P B25, etc.
      const threePhaseMatch = line.match(/\b(?:3\s*[x×]\s*\d|3\s*[pP]\b|4\s*[pP]\b|3f\b)/i);
      const onePhaseMatch = line.match(/\b(?:1\s*[x×]\s*\d|1\s*[pP]\b|2\s*[pP]\b|1f\b)/i);
      if (threePhaseMatch) {
        header.mainBreakerPoles = { value: '3P', status: 'recognized' };
        header.supplySystem = { value: '3f', status: 'recognized' };
      } else if (onePhaseMatch) {
        header.mainBreakerPoles = { value: '1P', status: 'recognized' };
        header.supplySystem = { value: '1f', status: 'recognized' };
      }

      const charMatch = line.match(/\b([BCD])\s*\d{1,2}\b/i);
      if (charMatch) {
        header.mainBreakerChar = {
          value: charMatch[1].toUpperCase() as BreakerCharacteristic,
          status: 'recognized',
        };
      }

      const ampMatch =
        line.match(/(?:[13]\s*[x×]\s*|[BCD]\s*)(\d{2})\s*A?\b/i) ||
        line.match(/\b(\d{2})\s*A\b/i);
      if (ampMatch) {
        header.mainBreakerCurrent = {
          value: snapMainCurrent(Number(ampMatch[1])),
          status: 'recognized',
        };
      }

      // Check if network system is also on the same header line
      const netOnSameLine = line.match(/\b(TN-C-S|TN-S|TN-C|TT)\b/i);
      if (netOnSameLine) {
        header.networkSystem = {
          value: netOnSameLine[1].toUpperCase() as NetworkSystemType,
          status: 'recognized',
        };
      }
      continue;
    }

    if (
      lower.startsWith('sústava') ||
      lower.startsWith('sustava') ||
      lower.startsWith('sieť') ||
      /^(TN-C-S|TN-S|TN-C|TT)$/i.test(line)
    ) {
      const netMatch = line.match(/\b(TN-C-S|TN-S|TN-C|TT)\b/i);
      if (netMatch) {
        header.networkSystem = {
          value: netMatch[1].toUpperCase() as NetworkSystemType,
          status: 'recognized',
        };
        continue;
      }
    }

    // 3. Parse as Circuit Line
    // Normalize separators (tabs, semicolons, em-dashes, en-dashes)
    let working = line.replace(/^\s*(?:\d+[\.\)]\s*|[-•*]\s*|QF\d+\s*[:\-–]?\s*|FA\d+\s*[:\-–]?\s*)/i, '');

    // Detect 3-phase / Poles (3P, 3x, 5x cable, 400V, 3F)
    let poles: PolesType = '1P';
    let polesStatus: FieldStatus = 'suggested';
    let isThreePhase = false;

    if (/\b(3\s*P|3\s*pól|3-pól|3F|400\s*V|5\s*[x×]\s*\d)/i.test(working)) {
      poles = '3P';
      polesStatus = /\b3\s*P\b/i.test(working) ? 'recognized' : 'suggested';
      isThreePhase = true;
    } else if (/\b(1\s*P|230\s*V|3\s*[x×]\s*\d)/i.test(working)) {
      poles = '1P';
      polesStatus = /\b1\s*P\b/i.test(working) ? 'recognized' : 'suggested';
      isThreePhase = false;
    }

    // Detect Breaker Characteristic & Current (e.g., B10, B16, C16, D20, B 16A, 16 A)
    let characteristic: BreakerCharacteristic = 'B';
    let characteristicStatus: FieldStatus = 'suggested';
    let ratedCurrent: 6 | 10 | 13 | 16 | 20 | 25 | 32 | 40 | 50 | 63 = 16;
    let ratedCurrentStatus: FieldStatus = 'missing';

    const charAmpMatch = working.match(/\b([BCD])\s*(6|10|13|16|20|25|32|40|50|63)\s*A?\b/i);
    if (charAmpMatch) {
      characteristic = charAmpMatch[1].toUpperCase() as BreakerCharacteristic;
      characteristicStatus = 'recognized';
      ratedCurrent = snapMcbCurrent(Number(charAmpMatch[2]));
      ratedCurrentStatus = 'recognized';
    } else {
      const onlyAmpMatch = working.match(/\b(6|10|13|16|20|25|32|40|50|63)\s*A\b/i);
      if (onlyAmpMatch) {
        ratedCurrent = snapMcbCurrent(Number(onlyAmpMatch[1]));
        ratedCurrentStatus = 'recognized';
      }
      const onlyCharMatch = working.match(/\bchar(?:akteristika)?\.?\s*([BCD])\b/i);
      if (onlyCharMatch) {
        characteristic = onlyCharMatch[1].toUpperCase() as BreakerCharacteristic;
        characteristicStatus = 'recognized';
      }
    }

    // Detect Cable Type & Conductor Cross-Section (e.g., CYKY-J 3x1,5, 5x2,5 mm², 1,5 mm², 2.5mm2)
    let crossSectionMm2: number | null = null;
    let crossSectionStatus: FieldStatus = 'missing';
    let cableType = '';
    let cableStatus: FieldStatus = 'missing';

    const fullCableMatch = working.match(
      /\b(CYKY(?:-J|-O)?|CHKE-R|NYY-J)?\s*([345])\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(?:mm2\b|mm²)?/i
    );
    if (fullCableMatch) {
      const prefix = fullCableMatch[1] ? fullCableMatch[1].toUpperCase() : 'CYKY-J';
      const cores = Number(fullCableMatch[2]);
      const cs = Number(fullCableMatch[3].replace(',', '.'));
      crossSectionMm2 = cs;
      crossSectionStatus = 'recognized';
      const csFormatted = String(cs).replace('.', ',');
      cableType = `${prefix} ${cores}x${csFormatted} mm²`;
      cableStatus = fullCableMatch[1] ? 'recognized' : 'suggested';
      if (cores === 5) {
        isThreePhase = true;
        poles = '3P';
      }
    } else {
      const csOnlyMatch = working.match(/\b(\d+(?:[.,]\d+)?)\s*(?:mm2\b|mm²)/i);
      if (csOnlyMatch) {
        const cs = Number(csOnlyMatch[1].replace(',', '.'));
        crossSectionMm2 = cs;
        crossSectionStatus = 'recognized';
        const cores = isThreePhase ? 5 : 3;
        const csFormatted = String(cs).replace('.', ',');
        cableType = `CYKY-J ${cores}x${csFormatted} mm²`;
        cableStatus = 'suggested';
      }
    }

    // Detect Power (kW or W)
    let powerKw: number | null = null;
    let powerStatus: FieldStatus = 'missing';

    const kwMatch = working.match(/\b(\d+(?:[.,]\d+)?)\s*kW\b/i);
    const wattMatch = working.match(/\b(\d{3,5})\s*W\b/i);
    if (kwMatch) {
      powerKw = Number(kwMatch[1].replace(',', '.'));
      powerStatus = 'recognized';
    } else if (wattMatch) {
      powerKw = Number((Number(wattMatch[1]) / 1000).toFixed(2));
      powerStatus = 'recognized';
    }

    // Detect RCD requirement (FI1, FI2, FI3, RCBO, 30mA, Bez chrániča)
    let rcdAssignment: 'FI1' | 'FI2' | 'FI3' | 'RCBO' | 'NONE' =
      circuitIndex % 2 === 1 ? 'FI1' : 'FI2';
    let rcdStatus: FieldStatus = 'suggested';

    if (/\bRCBO\b|\bističochránič/i.test(working)) {
      rcdAssignment = 'RCBO';
      rcdStatus = 'recognized';
    } else if (/\bFI\s*1\b/i.test(working)) {
      rcdAssignment = 'FI1';
      rcdStatus = 'recognized';
    } else if (/\bFI\s*2\b/i.test(working)) {
      rcdAssignment = 'FI2';
      rcdStatus = 'recognized';
    } else if (/\bFI\s*3\b/i.test(working)) {
      rcdAssignment = 'FI3';
      rcdStatus = 'recognized';
    } else if (/\bbez\s*(?:fi|rcd|chrániča)/i.test(working)) {
      rcdAssignment = 'NONE';
      rcdStatus = 'recognized';
    } else if (/\b(10|30|100|300)\s*mA\b/i.test(working)) {
      rcdAssignment = 'FI1';
      rcdStatus = 'recognized';
    }

    // Extract clean Circuit Name by removing technical tokens
    let cleanName = working
      .split(/[\t;]|(?:\s+[–—-]\s+)/)[0]
      .replace(/\b(3P|1P|B10|B16|C16|B20|C20|B25|C25|B32)\b/gi, '')
      .replace(/\b(CYKY(?:-J|-O)?\s*)?[345]\s*[x×]\s*\d+(?:[.,]\d+)?\s*(?:mm2|mm²)?/gi, '')
      .replace(/\b\d+(?:[.,]\d+)?\s*(?:mm2|mm²|kW)\b/gi, '')
      .replace(/\b(6|10|13|16|20|25|32)\s*A\b/gi, '')
      .replace(/\b(30\s*mA|RCBO|FI[123])\b/gi, '')
      .replace(/[-–—,:]+$/, '')
      .trim();

    if (!cleanName) {
      cleanName = `Okruh č. ${circuitIndex}`;
    }

    const catResult = detectCategoryFromName(cleanName);

    // If ratedCurrent was missing, propose based on category or cross-section, but keep status as 'suggested'
    if (ratedCurrentStatus === 'missing') {
      if (crossSectionMm2 === 1.5 || catResult.category === 'Osvetlenie') {
        ratedCurrent = 10;
      } else if (crossSectionMm2 === 4) {
        ratedCurrent = 20;
      } else if (crossSectionMm2 === 6) {
        ratedCurrent = 32;
      } else {
        ratedCurrent = 16;
      }
      ratedCurrentStatus = 'suggested';
    }

    // If cable/cross-section was missing, keep crossSectionMm2 as null ('missing') or provide suggested cable with 'missing' status so user sees it must be confirmed
    if (crossSectionStatus === 'missing') {
      const suggestedCs = ratedCurrent <= 10 ? 1.5 : ratedCurrent <= 16 ? 2.5 : 4;
      const cores = isThreePhase ? 5 : 3;
      cableType = `CYKY-J ${cores}x${String(suggestedCs).replace('.', ',')} mm²`;
    }

    // Phase assignment
    const phase: PhaseAllocation = isThreePhase
      ? 'L1,L2,L3'
      : (['L1', 'L2', 'L3'][(circuitIndex - 1) % 3] as PhaseAllocation);

    circuits.push({
      id: `draft-${Date.now()}-${circuitIndex}`,
      rawLine: line,
      designation: `QF${circuitIndex}`,
      name: cleanName,
      category: catResult.category,
      categoryStatus: catResult.status,
      poles,
      polesStatus,
      characteristic,
      characteristicStatus,
      ratedCurrent,
      ratedCurrentStatus,
      crossSectionMm2,
      crossSectionStatus,
      cableType,
      cableStatus,
      isThreePhase,
      phase,
      phaseStatus: isThreePhase ? 'recognized' : 'suggested',
      rcdAssignment,
      rcdStatus,
      powerKw,
      powerStatus,
    });

    circuitIndex++;
  }

  const missingCount = circuits.filter(
    (c) =>
      c.crossSectionStatus === 'missing' ||
      c.powerStatus === 'missing' ||
      c.ratedCurrentStatus !== 'recognized'
  ).length;

  if (missingCount > 0) {
    warnings.push(
      `V ${missingCount} okruhoch chýbali niektoré technické parametre (napr. prierez vodiča alebo príkon). Tieto položky sú v tabuľke označené ako NAVRHOVANÉ / NEVYPLNENÉ a vyžadujú kontrolu projektantom.`
    );
  }

  return {
    header,
    circuits,
    warnings,
  };
}

/**
 * Converts reviewed ParsedCircuitDraft rows into the active SwitchboardProject:
 * - Assigns QF1, QF2, QF3...
 * - Prepares RCD groups (FI1, FI2, FI3, RCBO)
 * - Balances phases L1/L2/L3
 * - Resets verificationChecklist so imported data is never treated as approved safety design
 */
export function applyImportedCircuitsToProject(
  currentProject: SwitchboardProject,
  drafts: ParsedCircuitDraft[],
  header: ParsedHeaderMetadata,
  options: {
    applyHeaderMetadata: boolean;
    replaceExistingCircuits: boolean;
    autoBalancePhases: boolean;
  }
): SwitchboardProject {
  const mfg: Manufacturer = currentProject.mainBreaker.manufacturer || 'Eaton';

  const supplySystem =
    options.applyHeaderMetadata && header.supplySystem
      ? header.supplySystem.value
      : currentProject.supplySystem;
  const is3f = supplySystem === '3f';

  const networkSystem =
    options.applyHeaderMetadata && header.networkSystem
      ? header.networkSystem.value
      : currentProject.networkSystem;

  const objectType =
    options.applyHeaderMetadata && header.objectType
      ? header.objectType.value
      : currentProject.objectType;

  const mainCurrent =
    options.applyHeaderMetadata && header.mainBreakerCurrent
      ? header.mainBreakerCurrent.value
      : currentProject.mainBreaker.ratedCurrent;

  const mainChar =
    options.applyHeaderMetadata && header.mainBreakerChar
      ? header.mainBreakerChar.value
      : currentProject.mainBreaker.characteristic;

  const mainPoles: PolesType =
    options.applyHeaderMetadata && header.mainBreakerPoles
      ? header.mainBreakerPoles.value
      : is3f
      ? '3P'
      : '1P';

  // Ensure FI1, FI2 (and FI3 if used) exist in RCD list
  const rccbPoles = is3f ? '4P' : '2P';
  const rccbCurrent = mainCurrent <= 40 ? 40 : 63;

  const rcds: RcdConfig[] = [
    {
      id: 'rcd-import-fi1',
      label: 'FI1',
      deviceKind: 'RCCB',
      poles: rccbPoles,
      ratedCurrent: rccbCurrent,
      sensitivity: 30,
      type: 'A',
      manufacturer: mfg,
      model: suggestRcdModel(mfg, 'RCCB', rccbPoles, rccbCurrent, 30, 'A'),
      phase: is3f ? 'L1,L2,L3' : 'L1',
      notes: 'Skupina FI1 – Svetelné a zásuvkové okruhy (1. sekcia)',
    },
    {
      id: 'rcd-import-fi2',
      label: 'FI2',
      deviceKind: 'RCCB',
      poles: rccbPoles,
      ratedCurrent: rccbCurrent,
      sensitivity: 30,
      type: 'A',
      manufacturer: mfg,
      model: suggestRcdModel(mfg, 'RCCB', rccbPoles, rccbCurrent, 30, 'A'),
      phase: is3f ? 'L1,L2,L3' : 'L1',
      notes: 'Skupina FI2 – Spotrebiče, kúpeľňa a svetelné okruhy (2. sekcia)',
    },
  ];

  if (drafts.some((d) => d.rcdAssignment === 'FI3')) {
    rcds.push({
      id: 'rcd-import-fi3',
      label: 'FI3',
      deviceKind: 'RCCB',
      poles: rccbPoles,
      ratedCurrent: rccbCurrent,
      sensitivity: 30,
      type: 'A',
      manufacturer: mfg,
      model: suggestRcdModel(mfg, 'RCCB', rccbPoles, rccbCurrent, 30, 'A'),
      phase: is3f ? 'L1,L2,L3' : 'L1',
      notes: 'Skupina FI3 – Výkonové spotrebiče / Technológia',
    });
  }

  const convertedCircuits: CircuitConfig[] = drafts.map((d, idx) => {
    const qfLabel = `QF${idx + 1}`;
    let rcdId = 'rcd-import-fi1';

    if (d.rcdAssignment === 'FI1') rcdId = 'rcd-import-fi1';
    else if (d.rcdAssignment === 'FI2') rcdId = 'rcd-import-fi2';
    else if (d.rcdAssignment === 'FI3') rcdId = 'rcd-import-fi3';
    else if (d.rcdAssignment === 'NONE') rcdId = 'NONE';
    else if (d.rcdAssignment === 'RCBO') {
      const rcboId = `rcd-import-rcbo-${idx + 1}`;
      rcds.push({
        id: rcboId,
        label: `FI${rcds.length + 1}`,
        deviceKind: 'RCBO',
        poles: '2P',
        ratedCurrent: d.ratedCurrent <= 32 ? (d.ratedCurrent as 10 | 16 | 20 | 25 | 32) : 16,
        sensitivity: 30,
        type: 'A',
        characteristic: d.characteristic,
        breakingCapacity: '10 kA',
        manufacturer: mfg,
        model: suggestRcdModel(mfg, 'RCBO', '2P', 16, 30, 'A', d.characteristic),
        phase: d.phase === 'L1,L2,L3' ? 'L1' : d.phase,
        circuitName: d.name,
        notes: `Samostatný RCBO pre ${d.name}`,
      });
      rcdId = rcboId;
    }

    // Default conservative estimated power if user left powerKw empty
    const effectivePowerKw =
      d.powerKw !== null && d.powerKw > 0
        ? d.powerKw
        : d.poles === '3P'
        ? 5.5
        : d.category === 'Osvetlenie'
        ? 0.35
        : 2.0;

    return {
      id: `circ-qf-${Date.now()}-${idx + 1}`,
      label: qfLabel,
      name: d.name,
      category: d.category,
      rcdId,
      poles: d.poles,
      ratedCurrent: d.ratedCurrent,
      characteristic: d.characteristic,
      breakingCapacity: '10 kA' as BreakingCapacity,
      phase: is3f ? d.phase : 'L1',
      cable: d.cableType,
      cableLengthM: 18,
      installationMethod: 'B1 (v inštalačnej rúre v stene)',
      cosPhi: 0.95,
      powerKw: effectivePowerKw,
      manufacturer: mfg,
      model: suggestCircuitBreakerModel(mfg, d.poles, d.characteristic, d.ratedCurrent),
    };
  });

  const finalCircuits = options.replaceExistingCircuits
    ? convertedCircuits
    : [
        ...currentProject.circuits,
        ...convertedCircuits.map((c, idx) => ({
          ...c,
          label: `QF${currentProject.circuits.length + idx + 1}`,
        })),
      ];

  const updatedProject: SwitchboardProject = {
    ...currentProject,
    objectType,
    supplySystem,
    voltage: is3f ? '400 V' : '230 V',
    phaseCount: is3f ? 3 : 1,
    networkSystem,
    mainBreaker: {
      ...currentProject.mainBreaker,
      poles: mainPoles,
      ratedCurrent: mainCurrent,
      characteristic: mainChar,
      model: suggestMainBreakerModel(
        mfg,
        mainPoles,
        mainChar,
        mainCurrent,
        currentProject.mainBreaker.breakingCapacity
      ),
    },
    rcds: options.replaceExistingCircuits ? rcds : [...currentProject.rcds, ...rcds],
    circuits: finalCircuits,
    // Reset verification checklist so imported circuits are never marked as engineer-approved
    verificationChecklist: {
      shortCircuitMeasuredOrCalculated: false,
      voltageDropVerified: false,
      selectivityVerified: false,
      thermalDissipationVerified: false,
      onSiteRevisionRequiredAcknowledged: false,
    },
  };

  return options.autoBalancePhases && is3f
    ? balanceCircuitPhases(updatedProject)
    : updatedProject;
}
