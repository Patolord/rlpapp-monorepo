import { DEFAULT_LABOR_PER_KG } from "../engenharia/ducts";

/**
 * Labour prices of the RLP Takeoff desktop app that are the company's, not a takeoff's: the
 * backend stores them (`takeoffSettings`, kind "labor"), the dashboard edits them (App Takeoff →
 * Parâmetros) and the app applies them to every takeoff that does not set its own value.
 */
export interface LaborPrices {
  /** Ducts: R$ per kg of sheet metal (doubled below 500 kg, as in the workbook). */
  ductPerKg?: number;
  /** VRF: installation per evaporator, R$. */
  vrfPerEvap?: number;
}

/** The workbook's installation labour per evaporator, used until the company publishes its own. */
export const DEFAULT_LABOR_PER_EVAP = 700;

export const DEFAULT_LABOR_PRICES: Required<LaborPrices> = {
  ductPerKg: DEFAULT_LABOR_PER_KG,
  vrfPerEvap: DEFAULT_LABOR_PER_EVAP,
};

export const LABOR_PRICE_KEYS = ["ductPerKg", "vrfPerEvap"] as const;
export type LaborPriceKey = (typeof LABOR_PRICE_KEYS)[number];

export const LABOR_PRICE_LABELS: Record<LaborPriceKey, { label: string; unit: string }> = {
  ductPerKg: { label: "Dutos: mão de obra por kg de chapa", unit: "R$/kg" },
  vrfPerEvap: { label: "VRF: instalação por evaporadora", unit: "R$/evaporadora" },
};

export const isLaborPriceKey = (key: string): key is LaborPriceKey =>
  (LABOR_PRICE_KEYS as readonly string[]).includes(key);

/** The prices in use: the company's over the workbook's. */
export const laborPricesOf = (remote: LaborPrices | null | undefined): Required<LaborPrices> => ({
  ductPerKg: remote?.ductPerKg ?? DEFAULT_LABOR_PRICES.ductPerKg,
  vrfPerEvap: remote?.vrfPerEvap ?? DEFAULT_LABOR_PRICES.vrfPerEvap,
});
