# ⚡ ELEKTRO SCHEMA GENERATOR PRO

![STN EN 61439-1/3](https://img.shields.io/badge/Norma-STN%20EN%2061439--1%2F3-0066FF?style=for-the-badge)
![STN 33 2000-4-41](https://img.shields.io/badge/Bezpe%C4%8Dnos%C5%A5-STN%2033%202000--4--41-0F172A?style=for-the-badge)
![STN EN 60617](https://img.shields.io/badge/Schematick%C3%A9%20zna%C4%8Dky-STN%20EN%2060617-0284C7?style=for-the-badge)
![React 19 + TypeScript](https://img.shields.io/badge/Stack-React%2019%20%7C%20TypeScript%207%20%7C%20Tailwind%20CSS%204-10B981?style=for-the-badge)

**Elektro Schema Generator PRO** je špecializovaná inžinierska webová aplikácia (CAD & CAE nástroj) určená pre elektrotechnických projektantov, revíznych technikov a montážnikov na automatizovaný návrh, elektrotechnický výpočet, normovú verifikáciu a generovanie jednopólových a viacpólových schém domových a menších komerčných rozvádzačov nízkeho napätia (NN) v súlade so súborom noriem **STN EN IEC**.

---

## 📑 Obsah

1. [Popis aplikácie a hlavné funkcie](#-1-popis-aplikácie-a-hlavné-funkcie)
2. [Technologický stack](#-2-technologický-stack)
3. [Návod na inštaláciu a spustenie](#-3-návod-na-inštaláciu-a-spustenie)
4. [Štruktúra projektu](#-4-štruktúra-projektu)
5. [Technická dokumentácia pre vývojárov](#-5-technická-dokumentácia-pre-vývojárov)
   - [5.1 Architektúra a tok dát (Data Flow)](#51-architektúra-a-tok-dát-data-flow)
   - [5.2 Hlavné dátové modely (TypeScript rozhrania)](#52-hlavné-dátové-modely-typescript-rozhrania)
   - [5.3 Architektúra dvoch hlavných prístrojov (QF0 vs. QS1/QF1)](#53-architektúra-dvoch-hlavných-prístrojov-qf0-vs-qs1qf1)
   - [5.4 Elektrotechnické výpočtové jadro (`electricalEngine.ts`)](#54-elektrotechnické-výpočtové-jadro-electricalenginets)
   - [5.5 Parametrický SVG CAD engine (`ElectricalSchemaCanvas.tsx`)](#55-parametrický-svg-cad-engine-electricalschemacanvastsx)
   - [5.6 Inteligentný textový parser okruhov (`parseCircuitListText`)](#56-inteligentný-textový-parser-okruhov-parsecircuitlisttext)
   - [5.7 Ako rozšíriť aplikáciu (Developer Guide)](#57-ako-rozšíriť-aplikáciu-developer-guide)
6. [Podporované normy STN EN IEC](#-6-podporované-normy-stn-en-iec)
7. [Vzorové testovacie projekty (TEST 1 – TEST 6)](#-7-vzorové-testovacie-projekty-test-1--test-6)
8. [Odborné upozornenie a legislatíva](#-8-odborné-upozornenie-a-legislatíva)

---

## 📌 1. Popis aplikácie a hlavné funkcie

Cieľom projektu **Elektro Schema Generator PRO** je nahradiť zdĺhavé manuálne kreslenie schém v univerzálnych CAD programoch parametrickým návrhom: používateľ zadá vstupné parametre rozvádzača, ochranné prístroje a zoznam vývodov, a aplikácia v reálnom čase vygeneruje kompletnú výkresovú a výpočtovú dokumentáciu.

### Kľúčové vlastnosti
- **Automatické generovanie schém (1-pólové a 3-pólové / 5-vodičové zobrazenie):**
  - Dynamické vykresľovanie vektorovej schémy zapojenia pre jednofázové (**230 V, 1F**) a trojfázové (**400/230 V, 3F**) sústavy v sieťach **TN-C-S, TN-S, TN-C a TT**.
  - Interaktívne plátno s podporou priblíženia (Zoom 50 % – 200 %), posúvania (Pan), prepínania orientácie zberníc, priameho inšpektora prvkov po kliknutí v schéme a pridávania prístrojov systémom Drag & Drop / Quick-Add.
- **Rozlíšenie dvoch samostatných hlavných prístrojov:**
  - **Hlavný istič pred elektromerom (`QF0`)** – istenie distribučnej spoločnosti v elektromerovom rozvádzači (RE).
  - **Hlavný prvok v rozvádzači (`QS1` / `QF1`)** – prístroj osadený priamo na 1. DIN lište rozvádzača s možnosťou výberu: *Hlavný vypínač (`QS1`)*, *Istič (`QF1`)*, *Odpínač (`QS1`)* alebo *Iný hlavný prvok*.
- **Kompletná hierarchia ochranných prvkov:**
  - Zvodiče prepätia **SPD Typ 1+2 (B+C)** a **Typ 2 (C)**.
  - Skupinové prúdové chrániče **RCCB** (`FI1`, `FI2`...) s automatickým priradením oddelených nulových zberníc (`N(FI1)`, `N(FI2)`...).
  - Kombinované prúdové chrániče s nadprúdovou spúšťou **RCBO** (kombi istič + chránič v jednom prístroji) pre vyhradené okruhy.
  - Koncové ističe **MCB** (`FA1`, `FA2`...) s charakteristikami `B`, `C`, `D` a menovitými prúdmi `6 A` až `63 A`.
- **Inžinierske výpočty a verifikácia podľa STN:**
  - Kontrola podmienky istenia vodičov $I_b \le I_n \le I_z$ podľa spôsobu uloženia (`A1`, `A2`, `B1`, `B2`, `C`, `E`).
  - Výpočet úbytku napätia $\Delta U_{\%}$, impedancie poruchovej slučky $Z_s$, skratového prúdu $I_k$ a času automatického odpojenia napájania.
  - Výpočet tepelného vyžarovania prístrojov $\Delta P\text{ [W]}$ a oteplenia skrine rozvádzača podľa **STN EN 61439-1/3**.
- **Symetrizácia fáz L1 / L2 / L3 a AI Smart Designer:**
  - Výpočet zaťaženia jednotlivých fáz, detekcia nesymetrie a 1-klikové automatické vyváženie jednofázových vývodov.
  - Inteligentný sprievodca návrhom rozvádzača na základe typu objektu, počtu miestností a výkonných spotrebičov.
- **Auto-import okruhov z textu:**
  - Konverzia neštruktúrovaného textového zoznamu alebo skopírovanej tabuľky z Excelu na kompletné elektrotechnické okruhy s interaktívnou tabuľkou náhľadu pred importom.
- **2D a 3D vizualizácia skrine rozvádzača (DIN lišty TH35):**
  - Výpočet obsadenosti 18 mm modulov, kontrola normovej rezervy ($\ge 20\,\%$), 3D pohľad s dvierkami a tepelnou mapou (Thermal View).
- **Exporty a tlačová dokumentácia:**
  - Export schémy do **SVG**, **PNG (300 DPI)** a viacstranovej **tlačovej zostavy PDF (A4/A3)** s rohovou pečiatkou podľa **STN ISO 7200**, technickou správou, kusovníkom materiálu (**CSV / Excel**) a revíznym protokolom OPaOS.

---

## 🛠️ 2. Technologický stack

| Vrstva | Technológia | Verzia | Účel v projekte |
| :--- | :--- | :--- | :--- |
| **Jadro UI** | **React** (`react`, `react-dom`) | `^19.0.1` | Deklaratívne vykresľovanie používateľského rozhrania a interaktívneho SVG plátna |
| **Jazyk** | **TypeScript** (`typescript`) | `^7.0.2` | Striktná typová kontrola elektrotechnických modelov, výpočtov a komponentov |
| **Build & Bundler** | **Vite** (`vite`, `@vitejs/plugin-react`) | `^8.3.0` | Rýchly vývojový server (port 3000) a optimalizovaný produkčný bundle |
| **Štýlovanie** | **Tailwind CSS v4** (`tailwindcss`, `@tailwindcss/vite`) | `^4.3.3` | Utility-first dizajn systém (Deep Navy `#0B1120` + Electric Blue `#0066FF`) a `@media print` pravidlá |
| **Ikony** | **Lucide React** (`lucide-react`) | `^0.546.0` | Vektorové technické ikony pre navigáciu, nástrojové lišty a stavové indikátory |
| **Testovanie** | **Node.js Test Runner + tsx** (`node:test`, `tsx`) | `^4.21.0` | Jednotkové testovanie čistej inžinierskej logiky a výpočtov bez závislosti na DOM |

---

## 💻 3. Návod na inštaláciu a spustenie

### Systémové požiadavky
- **Node.js:** verzia `20.x` alebo novšia (odporúčané LTS `22.x`)
- **npm:** verzia `10.x` alebo novšia
- Moderný webový prehliadač s podporou ES2022, SVG 2.0 a CSS Print Media Queries (Chrome, Edge, Firefox, Safari)

### Krok 1: Naklonovanie repozitára
```bash
git clone <url-repozitara>
cd elektro-schema-generator-pro
```

### Krok 2: Inštalácia závislostí
```bash
npm install
```

### Krok 3: Konfigurácia premenných prostredia (voliteľné)
Skopírujte vzorový súbor `.env.example` do `.env`:
```bash
cp .env.example .env
```
> **Poznámka:** Všetky elektrotechnické výpočty, generovanie schém, textový parser aj AI Smart Designer pracujú plne deterministicky priamo v aplikácii a nevyžadujú žiadny externý API kľúč pre svoju prevádzku.

### Krok 4: Spustenie vývojového servera
```bash
npm run dev
```
Vývojový server sa spustí na adrese **`http://localhost:3000`** (prístupný aj v lokálnej sieti vďaka parametru `--host=0.0.0.0`).

### Krok 5: Spustenie jednotkových testov a kontroly typov
```bash
# Kontrola TypeScript typov v celom projekte
npm run lint

# Spustenie sady 14 inžinierskych jednotkových testov
npx tsx --test src/utils/electricalEngine.test.ts
```

### Krok 6: Vytvorenie produkčného buildu
```bash
# Zostavenie produkčnej verzie do priečinka dist/
npm run build

# Lokálny náhľad produkčného buildu
npm run preview
```

---

## 📂 4. Štruktúra projektu

```text
elektro-schema-generator-pro/
├── .env.example                                       # Vzorová konfigurácia premenných prostredia
├── index.html                                         # Vstupný HTML dokument (lang="sk", fonty Inter & JetBrains Mono)
├── metadata.json                                      # Metadáta aplikácie pre AI Studio / nasadenie
├── package.json                                       # Definícia skriptov (dev, build, lint) a závislostí
├── tsconfig.json                                      # Konfigurácia kompilátora TypeScript (ES2022, bundler)
├── vite.config.ts                                     # Konfigurácia Vite, React pluginu a Tailwind CSS v4
├── README.md                                          # Dokumentácia projektu a príručka pre vývojárov
└── src/
    ├── main.tsx                                       # Vstupný bod React aplikácie (mount do #root)
    ├── App.tsx                                        # Hlavný kontajner aplikácie, navigácia, správa projektov a revízií
    ├── index.css                                      # Globálny dizajn systém, CSS premenné a tlačové (@media print) štýly
    ├── types/
    │   └── electrical.ts                              # Centrálne TypeScript definície všetkých dátových štruktúr
    ├── utils/
    │   ├── electricalEngine.ts                        # Výpočtové jadro, STN validácie, katalóg, šablóny a textový parser
    │   └── electricalEngine.test.ts                   # Jednotkové testy elektrotechnických výpočtov a validácií
    └── components/
        ├── DashboardAndProjectsView.tsx               # Správa projektov, šablóny TEST 1–6, import/export JSON a revízie
        ├── StepByStepWizardView.tsx                   # 6-krokový sprievodca návrhom rozvádzača (Krok 1 až Krok 6)
        ├── BasicAndMainSettingsForm.tsx               # Formulár pre základné údaje, QF0 (pred elektromerom) a QS1/QF1 (v rozvádzači)
        ├── RcdManagerForm.tsx                         # Formulár pre správu skupinových RCCB a samostatných RCBO chráničov
        ├── CircuitManagerForm.tsx                     # Tabuľkový a formulárový editor koncových okruhov (FA1..FAn)
        ├── ElectricalSchemaCanvas.tsx                 # Interaktívny vektorový SVG CAD editor 1-pólovej a 3-pólovej schémy
        ├── SmartValidationAndComponentLibraryView.tsx # Katalóg reálnych prístrojov (7 výrobcov) a STN audit súladu
        ├── ProfessionalExportView.tsx                 # Tlačová zostava (PDF A4/A3), technická správa, BOM, OPaOS a pečiatka
        ├── AutoCircuitImportView.tsx                  # Modul pre inteligentný import okruhov z textového zoznamu
        ├── SmartDesignerAndPhaseBalancingView.tsx     # Symetrizácia fáz L1/L2/L3 a AI Smart Designer
        ├── ElectricalCalculatorView.tsx               # Detailná inžinierska kalkulačka (Ib, Iz, ΔU, Zs, Ik)
        ├── DistributionBoard3DView.tsx                # 3D/2D vizualizácia skrine rozvádzača, dvierok a tepelnej mapy
        └── DinRailAndBomView.tsx                      # 2D pohľad na DIN lišty TH35, svorkovnice PE/N a kusovník materiálu
```

---

## 🔧 5. Technická dokumentácia pre vývojárov

### 5.1 Architektúra a tok dát (Data Flow)

Aplikácia využíva **jednosmerný tok dát (Unidirectional Data Flow)** so všetkými odvodenými výpočtami počítanými deterministicky z jedného kanonického objektu `SwitchboardProject`:

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                    App.tsx (Hlavný stav aplikácie)                      │
│  • projects: SwitchboardProject[] (perzistencia v localStorage)         │
│  • activeProjectId: string                                              │
│  • updateActiveProject(updatedProject, revisionActionLabel)             │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│             electricalEngine.ts (Čisté deterministické funkcie)         │
│  • getEffectiveUpstreamBreaker(project)  ──► QF0 (pred elektromerom)    │
│  • getEffectiveInternalDevice(project)   ──► QS1 / QF1 (v rozvádzači)   │
│  • calculatePhaseLoad(project)           ──► L1, L2, L3, nesymetria %   │
│  • calculateCircuitParameters(c, proj)   ──► Ib, Iz, ΔU %, Zs, Ik       │
│  • validateStnCompliance(project)        ──► Chyby, Výstrahy, Info      │
│  • calculateDinRailAllocation(project)   ──► Rozloženie modulov na DIN  │
│  • generateBom(project)                  ──► Kusovník prístrojov (BOM)  │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │
        ┌───────────────────────────┼───────────────────────────┐
        ▼                           ▼                           ▼
┌───────────────────┐     ┌───────────────────┐     ┌─────────────────────┐
│ StepByStepWizard  │     │ ElectricalSchema  │     │ ProfessionalExport  │
│ & Formuláre       │     │ Canvas (SVG CAD)  │     │ & 3D/2D DIN Lišty   │
└───────────────────┘     └───────────────────┘     └─────────────────────┘
```

#### Perzistencia a správa revízií
- Všetky projekty sú automaticky ukladané do `localStorage` pod kľúčom `elektro_schema_projects_v2`.
- Každá významná zmena volajúca `updateActiveProject(updated, actionLabel)` s vyplneným `actionLabel` automaticky vytvorí časovú snímku (`ProjectRevisionSnapshot`) v poli `project.revisions` (max. 25 posledných revízií), čo umožňuje kedykoľvek obnoviť predchádzajúci stav projektu.

---

### 5.2 Hlavné dátové modely (TypeScript rozhrania)

Všetky dátové typy sú definované v súbore `src/types/electrical.ts`:

#### `SwitchboardProject` (Koreňový objekt projektu)
```typescript
export interface SwitchboardProject {
  id: string;
  name: string;                          // Názov rozvádzača (napr. "R-DOM — Rodinný dom 3F")
  objectType: ObjectType;                // 'Rodinný dom' | 'Byt' | 'Garáž' | 'Prevádzka' | 'Iné'
  supplySystem: SupplySystemType;        // '1f' (230 V) | '3f' (400 V)
  voltage: '230 V' | '400 V';
  networkSystem: NetworkSystemType;      // 'TN-C' | 'TN-S' | 'TN-C-S' | 'TT'
  phaseCount: 1 | 3;
  schemaViewMode: SchemaViewMode;        // 'single-line' (1P) | 'multi-line' (3P/5-vodičová)
  busbarStyle: 'top-horizontal' | 'left-vertical';

  // Projektové metadáta pre rohovú pečiatku STN ISO 7200
  author: string;
  investor: string;
  locationAddress: string;
  projectNumber: string;
  revision: string;
  dateCreated: string;
  supplyCable: string;                   // napr. 'CYKY-J 5x10 mm²'
  enclosureMounting: 'Pod omietku' | 'Na stenu' | 'Voľne stojaci';
  enclosureProtection: 'IP20/2XC' | 'IP30' | 'IP40' | 'IP44' | 'IP54' | 'IP65';
  preferredRowCapacity: 12 | 18 | 24 | 36;
  ambientTempC?: number;                 // Teplota okolia (predvolene 30 °C)
  externalZeOhm?: number;                // Impedancia vonkajšej slučky Ze [Ω]

  // Elektrické prístroje a vývody
  mainBreaker: MainBreakerConfig;        // Obsahuje konfiguráciu QF0 aj vnorený internalDevice (QS1/QF1)
  spd: SpdDeviceConfig;                  // Prepäťová ochrana SPD (FV1)
  rcds: RcdDevice[];                     // Prúdové chrániče RCCB a kombinované RCBO (FI1..FIn)
  circuits: CircuitItem[];               // Koncové okruhy a ističe (FA1..FAn)
  auxiliaryDevices: AuxiliaryDeviceItem[]; // Doplnkové prvky (stykače KM, elektromery, HDO)
  revisions?: ProjectRevisionSnapshot[]; // História revízií projektu
}
```

#### `RcdDevice` (Prúdový chránič RCCB / RCBO)
```typescript
export interface RcdDevice {
  id: string;
  label: string;                         // Označenie v schéme, napr. "FI1", "FI2", "RCBO1"
  name: string;                          // Opis skupiny, napr. "Zásuvkové okruhy a kúpeľňa"
  deviceKind: 'RCCB' | 'RCBO';           // RCCB = skupinový chránič, RCBO = kombi istič + chránič
  poles: '2P' | '4P';
  ratedCurrent: 16 | 20 | 25 | 40 | 63 | 80;
  sensitivityMa: 10 | 30 | 100 | 300;
  type: 'AC' | 'A' | 'F' | 'B' | 'G' | 'S (Selektívny)';
  characteristic?: 'B' | 'C' | 'D';      // Relevantné pre RCBO
  breakingCapacity?: '6 kA' | '10 kA' | '15 kA';
  manufacturer: Manufacturer;
  model: string;
  phase?: PhaseAllocation;               // Pre 2P chrániče v 3F sústave ('L1' | 'L2' | 'L3')
}
```

#### `CircuitItem` (Koncový elektrický okruh)
```typescript
export interface CircuitItem {
  id: string;
  order: number;
  label: string;                         // Označenie ističa, napr. "FA1"
  name: string;                          // Názov okruhu, napr. "Zásuvky kuchyňa"
  applianceType: ApplianceCategory;
  poles: '1P' | '2P' | '3P' | '4P';
  characteristic: 'B' | 'C' | 'D';
  ratedCurrent: 6 | 10 | 13 | 16 | 20 | 25 | 32 | 40 | 50 | 63;
  breakingCapacity: '6 kA' | '10 kA' | '15 kA';
  phase: 'L1' | 'L2' | 'L3' | 'L1,L2,L3';
  conductorCrossSection: 1.5 | 2.5 | 4 | 6 | 10 | 16 | 25; // Prierez Cu [mm²]
  cableType: string;                     // napr. "CYKY-J 3x2,5"
  powerKw: number;                       // Inštalovaný príkon [kW]
  rcdId: string | null;                  // ID priradeného RCCB chrániča alebo null
  lengthM?: number;                      // Dĺžka trasy [m] pre výpočet ΔU a Zs
  installationMethod?: 'A1' | 'A2' | 'B1' | 'B2' | 'C' | 'E';
  cosPhi?: number;                       // Účinník cos φ (predvolene 0.95)
  manufacturer: Manufacturer;
  model: string;
}
```

---

### 5.3 Architektúra dvoch hlavných prístrojov (`QF0` vs. `QS1`/`QF1`)

Pre zachovanie spätnej kompatibility so staršími uloženými projektmi a zároveň plnú podporu dvoch nezávislých hlavných prvkov sa používajú dve selektorové funkcie v `src/utils/electricalEngine.ts`:

1. **`getEffectiveUpstreamBreaker(project: SwitchboardProject): EffectiveUpstreamBreaker`**
   - Vracia normalizovanú konfiguráciu hlavného ističa pred elektromerom (**`QF0`**).
   - Ak je `enabled: true`, prvok sa vykreslí v hornej prívodnej časti schémy (spolu s elektromerom `kWh`), ale **nepridáva sa na DIN lištu rozvádzača**.

2. **`getEffectiveInternalDevice(project: SwitchboardProject): InternalMainDeviceConfig`**
   - Vracia normalizovanú konfiguráciu hlavného prístroja priamo v rozvádzači (**`QS1`** alebo **`QF1`**).
   - Podporuje 4 režimy (`deviceType`):
     - `'Hlavný vypínač'` (`hasOvercurrentProtection: false`, predvolené označenie `QS1`),
     - `'Istič'` (`hasOvercurrentProtection: true`, predvolené označenie `QF1`),
     - `'Odpínač'` (`hasOvercurrentProtection: false`, predvolené označenie `QS1`),
     - `'Iný hlavný prvok'` (voliteľná nadprúdová ochrana a vlastná špecifikácia).
   - Ak je `enabled: true`, tento prvok sa fyzicky osadí na 1. DIN lištu rozvádzača a započítava sa do obsadených modulov aj kusovníka (BOM).

---

### 5.4 Elektrotechnické výpočtové jadro (`electricalEngine.ts`)

Súbor `src/utils/electricalEngine.ts` obsahuje kompletnú doménovú logiku oddelenú od React komponentov:

| Funkcia | Vstup | Výstup | Popis algoritmu |
| :--- | :--- | :--- | :--- |
| `calculateCircuitParameters(circuit, project)` | `CircuitItem`, `SwitchboardProject` | `CircuitElectricalCalculation` | Vypočíta prevádzkový prúd $I_b$, prúdovú zaťažiteľnosť vodiča $I_z$ (s teplotným korekčným súčiniteľom $k_t$), úbytok napätia $\Delta U_{\%}$ a $\Delta U_{\text{V}}$, impedanciu slučky $Z_s$, maximálnu dovolenú impedanciu $Z_{s,\max}$ a skratový prúd $I_k$. |
| `calculatePhaseLoad(project)` | `SwitchboardProject` | `PhaseLoadSummary` | Spočíta príkon a prúd pre fázy `L1`, `L2`, `L3`, uplatní súčiniteľ súčasnosti $\beta$ podľa počtu okruhov, vypočíta percentuálne vyťaženie voči hlavnému ističu a percento fázovej nesymetrie. |
| `balanceCircuitPhases(project)` | `SwitchboardProject` | `SwitchboardProject` | Zoradí jednofázové okruhy zostupne podľa príkonu (Greedy Load-Balancing algoritmus) a priradí ich na najmenej zaťaženú fázu s rešpektovaním priradenia 2-pólových RCCB chráničov. |
| `validateStnCompliance(project)` | `SwitchboardProject` | `ValidationIssue[]` | Vykoná viac ako 15 inžinierskych kontrol podľa STN EN (koordinácia $I_b \le I_n \le I_z$, selektivita `QF0` vs. `QF1`, preťaženie `QS1`, chýbajúce RCD $\le 30\text{ mA}$, preťaženie RCCB, zákaz RCD v sieti `TN-C`, rezerva DIN lišty, úbytok napätia $\Delta U$). |
| `calculateDinRailAllocation(project)` | `SwitchboardProject` | `DinRailAllocation` | Rozmiestni prístroje (`QS1/QF1`, `SPD`, `RCCB`, `RCBO`, `MCB`, doplnkové prvky) do radov DIN líšt podľa zvolenej kapacity radu (`12`, `18`, `24` alebo `36` modulov) a vypočíta tepelné straty v skrini. |
| `generateBom(project)` | `SwitchboardProject` | `BomItem[]` | Vygeneruje agregovaný kusovník prístrojov, prepojovacích hrebeňových líšt, svorkovníc `PE`/`N` a rozvodnicovej skrine. |

#### Použité fyzikálne a elektrotechnické vzťahy
- **Výpočtový prúd okruhu ($I_b$):**
  - Pre 1-fázový okruh ($U_n = 230\text{ V}$):
    $$I_b = \frac{P \cdot 1000}{230 \cdot \cos\varphi}$$
  - Pre 3-fázový okruh ($U_n = 400\text{ V}$):
    $$I_b = \frac{P \cdot 1000}{\sqrt{3} \cdot 400 \cdot \cos\varphi}$$
- **Úbytok napätia ($\Delta U_{\%}$ pri medenom vodiči $\gamma_{\text{Cu}} = 56\text{ m}/(\Omega\cdot\text{mm}^2)$):**
  $$\Delta U_{\%,1\text{F}} = \frac{2 \cdot L \cdot I_b \cdot \cos\varphi}{56 \cdot S \cdot 230} \cdot 100, \qquad \Delta U_{\%,3\text{F}} = \frac{\sqrt{3} \cdot L \cdot I_b \cdot \cos\varphi}{56 \cdot S \cdot 400} \cdot 100$$
- **Maximálna impedancia poruchovej slučky pre automatické odpojenie do $0{,}4\text{ s}$ (STN 33 2000-4-41):**
  $$Z_{s,\max} = \frac{U_0}{I_a} = \frac{230}{k \cdot I_n}, \quad \text{kde } k = \begin{cases} 5 & \text{pre char. B} \\ 10 & \text{pre char. C} \\ 20 & \text{pre char. D} \end{cases}$$

---

### 5.5 Parametrický SVG CAD engine (`ElectricalSchemaCanvas.tsx`)

Komponent `ElectricalSchemaCanvas.tsx` generuje čistý vektorový výkres (`<svg>`) na základe aktuálneho stavu projektu:

- **Dynamický výpočet šírky plátna:**
  - Každý koncový okruh (`FA1..FAn`), samostatný `RCBO` a `SPD` má pridelený vlastný vertikálny stĺpec s rozostupom `colSpacing = 128 px` (pre 1-pólovú schému) alebo `148 px` (pre viacpólovú schému).
- **Normové grafické značky podľa STN EN 60617:**
  - **Istič (`QF0`, `QF1`, `FA`):** Kontakt s krížikom (výkonový vypínač) + obdĺžnik tepelnej ($I>$) a elektromagnetickej skratovej ($I\gg$) spúšte.
  - **Hlavný vypínač / Odpínač (`QS1`):** Kontakt s kolmou čiarou odpínača bez nadprúdovej spúšte.
  - **Prúdový chránič (`RCCB`):** Spínací kontakt + elipsa súčtového prúdového transformátora s mechanickou väzbou (prerušovaná čiara) a testovacím tlačidlom `T`.
  - **Zvodič prepätia (`SPD`):** Symbol varistora/bleskoistky pripojený medzi fázové zbernice a ochrannú zbernicu `PE`.
- **Režimy zobrazenia (`schemaViewMode`):**
  - `'single-line'` (**Jednopólová schéma**): Zobrazuje zjednodušené jednopólové vedenie so šikmými značkami počtu vodičov (napr. 3 pre 1F okruh `L+N+PE`, 5 pre 3F okruh `3L+N+PE`).
  - `'multi-line'` (**Viacpólová schéma**): Vykresľuje samostatné farebne rozlíšené zbernice `L1` (hnedá/čierna), `L2`, `L3`, `N` (bledomodrá) a `PE` (zeleno-žltá) s presným napojením každého pólu prístroja na príslušnú fázu.
- **Exporty výkresu:**
  - **SVG export:** Serializuje DOM uzol `<svg>` pomocou `XMLSerializer` do samostatného `.svg` súboru.
  - **PNG export (300 DPI):** Vykreslí serializované SVG na `<canvas>` s dvojnásobným rozlíšením pre ostrú rastrovú tlač.

---

### 5.6 Inteligentný textový parser okruhov (`parseCircuitListText`)

Funkcia `parseCircuitListText(rawText: string, project: SwitchboardProject): AutoImportParseResult` v `src/utils/electricalEngine.ts` spracúva riadkový text alebo TSV dáta z Excelu v 4 fázach:

1. **Detekcia globálnych hlavičiek:** Vyhľadáva riadky obsahujúce definíciu objektu (*Rodinný dom*, *Byt*), hlavného ističa (napr. `Hlavný istič: 3x25 A`) alebo sústavy (`TN-C-S`, `TN-S`, `TT`).
2. **Extrakcia explicitných parametrov (Zelené – `recognizedFields`):**
   - Regulárnymi výrazmi rozpoznáva charakteristiku a prúd ističa (`B16`, `C20`, `3P B16`), počet pólov (`1P`, `3P`, `400V`), prierez a typ kábla (`CYKY-J 3x2,5 mm²`), príkon (`2,2 kW`, `2200 W`) a požiadavku na chránič (`RCD 30mA`, `RCBO`).
3. **Klasifikácia spotrebiča a návrh chýbajúcich údajov (Modré – `suggestedFields`):**
   - Na základe kľúčových slov v názve okruhu (*svetlá*, *zásuvky*, *varná doska*, *rúra*, *práčka*, *kúpeľňa*, *wallbox*, *tepelné čerpadlo*) určí kategóriu spotrebiča a navrhne normové hodnoty istenia a prierezu podľa **STN 33 2130**.
4. **Označenie neúplných údajov (Oranžové – `missingFields`):**
   - Polia, ktoré neboli vo vstupnom texte explicitne uvedené, dostanú príznak `needsConfirmation: true`, takže používateľ v náhľadovej tabuľke presne vidí, ktoré parametre boli rozpoznané z textu a ktoré navrhol systém.

---

### 5.7 Ako rozšíriť aplikáciu (Developer Guide)

#### A. Pridanie nového prístroja do katalógu komponentov
Katalóg prístrojov sa nachádza v konštante `INITIAL_COMPONENT_LIBRARY` v `src/utils/electricalEngine.ts`. Pre pridanie nového modelu pridajte objekt typu `ComponentCatalogItem`:
```typescript
{
  id: 'cat-schrack-mcb-b16-1p-custom',
  manufacturer: 'Schrack Technik',
  category: 'Istič (MCB)',
  model: 'BM018116',
  orderCode: 'BM018116',
  description: 'Istič 1P B16A, 6kA, rad BM',
  poles: '1P',
  ratedCurrentA: 16,
  characteristic: 'B',
  breakingCapacityKa: 6,
  modules: 1,
  powerLossW: 2.1,
}
```

#### B. Pridanie nového validačného pravidla STN
Všetky validačné pravidlá sa vyhodnocujú vo funkcii `validateStnCompliance(project: SwitchboardProject)` v `src/utils/electricalEngine.ts`. Pridajte novú kontrolu, ktorá vloží záznam do poľa `issues`:
```typescript
issues.push({
  id: 'custom-stn-rule-id',
  severity: 'warning', // 'error' | 'warning' | 'info'
  code: 'STN 33 2000-4-41',
  title: 'Názov kontroly',
  message: 'Podrobné technické vysvetlenie problému a odporúčané riešenie.',
  affectedElementId: circuit.id,
});
```

#### C. Pridanie novej vzorovej šablóny projektu
Šablóny projektov sú definované v objekte `PROJECT_TEMPLATES` v `src/utils/electricalEngine.ts`. Každá šablóna vracia plne inicializovaný objekt `SwitchboardProject`.

---

## 📐 6. Podporované normy STN EN IEC

| Označenie normy | Názov a oblasť implementácie v aplikácii |
| :--- | :--- |
| **STN EN 61439-1 / -3** | Nízkonapäťové rozvádzače – Časť 1: Všeobecné pravidlá; Časť 3: Rozvodnice určené na obsluhu laikmi (DBO) – výpočet modulovej rezervy ($\ge 20\,\%$) a oteplenia |
| **STN 33 2000-4-41** | Ochrana pred zásahom elektrickým prúdom – automatické odpojenie napájania do $0{,}4\text{ s}$ ($Z_s \le Z_{s,\max}$) a doplnková ochrana prúdovými chráničmi $I_{\Delta n} \le 30\text{ mA}$ |
| **STN 33 2000-4-43** | Ochrana pred nadprúdmi – koordinácia ochranných prístrojov a vodičov ($I_b \le I_n \le I_z$) |
| **STN 33 2000-5-523** | Prúdová zaťažiteľnosť káblov a vodičov podľa referenčných spôsobov uloženia (`A1`, `B1`, `B2`, `C`, `E`) |
| **STN 33 2000-5-534** | Prístroje na ochranu pred prepätím (SPD Typ 1+2 a Typ 2) |
| **STN 33 2000-6** | Revízie elektrických inštalácií – Východisková odborná prehliadka a odborná skúška (OPaOS) |
| **STN 33 2130** | Vnútorné elektrické rozvody – dimenzovanie domových a bytových okruhov a dovolené úbytky napätia ($\Delta U \le 3\,\%$ svetlá, $\Delta U \le 5\,\%$ ostatné) |
| **STN EN 60617** | Grafické značky na schémach – vektorové elektrotechnické symboly prístrojov |
| **STN EN 81346-2** | Referenčné označovanie prvkov v schémach (`QF0`, `QS1`, `QF1`, `FV1`, `FI1`, `FA1`, `W1`) |
| **STN ISO 7200** | Technická dokumentácia – štandardizovaná rohová pečiatka výkresu |

---

## 🧪 7. Vzorové testovacie projekty (TEST 1 – TEST 6)

V sekcii **Projekty** (aj v hornom výbere šablón) je predpripravených 6 overených inžinierskych projektov pokrývajúcich najčastejšie reálne scenáre:

1. **TEST 1 (`byt_1f_230v`):** Jednofázový byt 230 V (`TN-S`, `QF0 1P B25A` pred elektromerom + hlavný vypínač `QS1 2P 40A` v rozvádzači, 2× RCCB, 7 okruhov).
2. **TEST 2 (`test2_byt_3f_viac_fi`):** Trojfázový byt 400 V s viacerými prúdovými chráničmi (`TN-C-S`, `QF0 3P B25A` + `QS1 3P 40A`, 3× RCCB, varná doska 3F, 10 okruhov).
3. **TEST 3 (`rodinny_dom_3f`):** Rodinný dom 400 V (`TN-C-S`, `QF0 3P B25A` + `QS1 3P 40A`, SPD T1+T2, 3× RCCB + 1× RCBO, tepelné čerpadlo, varná doska, 12 okruhov).
4. **TEST 4 (`test4_qf0_a_vypinac_qs1`):** Ukážka optimálnej koordinácie: Hlavný istič pred elektromerom `QF0 (3P B25A)` + Hlavný vypínač v rozvádzači `QS1 (3P 40A)`.
5. **TEST 5 (`test5_qf0_a_istic_qf1`):** Ukážka koordinácie dvoch ističov za sebou: Hlavný istič pred elektromerom `QF0 (3P B32A)` + Hlavný istič v rozvádzači `QF1 (3P B25A)`.
6. **TEST 6 (`test6_rcbo_a_rccb`):** Kombinovaná ochrana: Skupinové chrániče `RCCB` (`FI1`, `FI2`) + samostatné `RCBO` pre chladničku, mrazničku a server/IT + 1F a 3F okruhy.

---

## ⚠️ 8. Odborné upozornenie a legislatíva

> **VYHLÁSENIE O ODBORNEJ ZODPOVEDNOSTI:**
> Aplikácia **Elektro Schema Generator PRO** slúži ako inžiniersky softvérový nástroj na podporu projektovania elektrických rozvádzačov.
>
> V zmysle slovenskej legislatívy (**vyhláška MPSVR SR č. 508/2009 Z. z.** na zaistenie bezpečnosti a ochrany zdravia pri práci a bezpečnosti technických zariadení) musí byť každá realizačná projektová dokumentácia elektrického zariadenia pred jej vyhotovením skontrolovaná a autorizovaná elektrotechnikom špecialistom na projektovanie elektrických zariadení (**§ 24 vyhl. č. 508/2009 Z. z.**) a pred uvedením do prevádzky podrobená východiskovej odbornej prehliadke a odbornej skúške revíznym technikom (**§ 23 vyhl. č. 508/2009 Z. z.** a norma **STN 33 2000-6**).
