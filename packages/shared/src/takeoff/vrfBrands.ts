/**
 * VRF makers' rules of the RLP Takeoff desktop app: for each brand, three tube-sizing tables
 * (gas/liquid pair from a minimum HP, by the role of the run) and the Y-kit models by
 * downstream HP. The types and the workbook's starting rules live here because the backend
 * stores the company defaults (`takeoffSettings`), the dashboard edits them and the app applies
 * them under its local overrides. The take-off itself stays in apps/takeoff/src/lib/vrf.ts.
 */

/** Tube sizes as the catalog names them (Cobre de 1.1/8"), smallest first. */
export const DIAMETERS = [
  "1/4",
  "3/8",
  "1/2",
  "5/8",
  "3/4",
  "7/8",
  "1",
  "1.1/8",
  "1.1/4",
  "1.3/8",
  "1.1/2",
  "1.5/8",
  "1.3/4",
  "1.7/8",
] as const;
export type Diameter = (typeof DIAMETERS)[number];

export const isDiameter = (d: string): d is Diameter => (DIAMETERS as readonly string[]).includes(d);

/** A row of a sizing table: from `hp` (inclusive) up to the next row, this gas/liquid pair. */
export interface HpRow {
  hp: number;
  gas: Diameter;
  liquid: Diameter;
}

/** From `hp` (inclusive) up to the next row, this Y-kit (refnet) model. */
export interface YkitRow {
  hp: number;
  model: string;
}

/** Saída da condensadora · trecho intermediário (between Y-kits) · ramal de uma evaporadora. */
export type VrfRole = "main" | "trunk" | "branch";
export const VRF_ROLES: readonly VrfRole[] = ["main", "trunk", "branch"];

/** One maker's rules: three sizing tables (by role) and the Y-kit models by downstream HP. */
export interface VrfBrand {
  /** Stable id: VRF systems in a project remember it, and it pairs a local copy with the company's. */
  id: string;
  name: string;
  main: HpRow[];
  trunk: HpRow[];
  branch: HpRow[];
  ykit: YkitRow[];
}

const row = (hp: number, gas: Diameter, liquid: Diameter): HpRow => ({ hp, gas, liquid });

/**
 * The workbook's Cálculos tables (INTERNA / interm / SAIDA). The 6 HP evaporator row reads
 * 3/8" gas in the workbook, below the 2.5 HP row; that is a typo and 3/4" is used here.
 */
const WORKBOOK_BRANCH: HpRow[] = [
  row(0, "1/2", "1/4"),
  row(2, "5/8", "1/4"),
  row(2.5, "5/8", "3/8"),
  row(6, "3/4", "3/8"),
  row(10, "7/8", "3/8"),
  row(16, "1.1/8", "1/2"),
];
const WORKBOOK_TRUNK: HpRow[] = [
  row(0, "5/8", "3/8"),
  row(6, "3/4", "3/8"),
  row(9, "7/8", "3/8"),
  row(12, "1", "1/2"),
  row(16, "1.1/8", "1/2"),
  row(18, "1.1/8", "5/8"),
  row(26, "1.1/4", "3/4"),
  row(36, "1.1/2", "3/4"),
];
const WORKBOOK_MAIN: HpRow[] = [
  row(0, "3/4", "3/8"),
  row(10, "7/8", "3/8"),
  row(12, "1", "1/2"),
  row(16, "1.1/8", "1/2"),
  row(18, "1.1/8", "5/8"),
  row(26, "1.1/4", "3/4"),
  row(36, "1.1/2", "3/4"),
];

const cloneRows = (rows: readonly HpRow[]) => rows.map((r) => ({ ...r }));

/**
 * Starting rule sets. Both brands carry the workbook's tube tables (the sheet has one set);
 * the Y-kit models follow each maker's refnet selection by downstream capacity. Confirm the
 * Hitachi tubes and kits against the maker's catalog; everything is editable.
 */
export const SEED_BRANDS: VrfBrand[] = [
  {
    id: "daikin",
    name: "Daikin",
    main: cloneRows(WORKBOOK_MAIN),
    trunk: cloneRows(WORKBOOK_TRUNK),
    branch: cloneRows(WORKBOOK_BRANCH),
    ykit: [
      { hp: 0, model: "KHRP26A22T" },
      { hp: 8, model: "KHRP26A33T" },
      { hp: 11.6, model: "KHRP26A72T" },
      { hp: 25.6, model: "KHRP26A73T" },
    ],
  },
  {
    id: "hitachi",
    name: "Hitachi",
    main: cloneRows(WORKBOOK_MAIN),
    trunk: cloneRows(WORKBOOK_TRUNK),
    branch: cloneRows(WORKBOOK_BRANCH),
    ykit: [
      { hp: 0, model: "E-102SN4" },
      { hp: 8, model: "E-162SN4" },
      { hp: 18, model: "E-242SN4" },
      { hp: 26, model: "E-302SN4" },
      { hp: 54, model: "E-52XN4" },
    ],
  },
];

/** The tables a new brand starts from: the workbook's. */
export const workbookTables = (): Pick<VrfBrand, "main" | "trunk" | "branch"> => ({
  main: cloneRows(WORKBOOK_MAIN),
  trunk: cloneRows(WORKBOOK_TRUNK),
  branch: cloneRows(WORKBOOK_BRANCH),
});

export const cloneBrand = (b: VrfBrand): VrfBrand => ({
  ...b,
  main: cloneRows(b.main),
  trunk: cloneRows(b.trunk),
  branch: cloneRows(b.branch),
  ykit: b.ykit.map((r) => ({ ...r })),
});

export const cloneBrands = (brands: readonly VrfBrand[]): VrfBrand[] => brands.map(cloneBrand);

const sortedRows = (rows: readonly HpRow[]): HpRow[] =>
  rows.map((r) => ({ hp: r.hp, gas: r.gas, liquid: r.liquid })).sort((a, b) => a.hp - b.hp);

/** The form in which two brands are compared: trimmed name, tables sorted by HP, fixed field order. */
export function normalizeBrand(b: VrfBrand): VrfBrand {
  return {
    id: b.id,
    name: b.name.trim(),
    main: sortedRows(b.main),
    trunk: sortedRows(b.trunk),
    branch: sortedRows(b.branch),
    ykit: b.ykit.map((r) => ({ hp: r.hp, model: r.model.trim() })).sort((a, c) => a.hp - c.hp),
  };
}

export const sameBrand = (a: VrfBrand, b: VrfBrand): boolean =>
  JSON.stringify(normalizeBrand(a)) === JSON.stringify(normalizeBrand(b));
