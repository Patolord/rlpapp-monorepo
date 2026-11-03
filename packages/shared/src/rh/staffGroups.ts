/**
 * Equipes do quadro de funcionários da RLP. Cada equipe tem padrões próprios
 * de benefícios na folha mensal (conferidos na planilha FOLHA_DE_PAGTO 2026):
 *
 * - Obra: cesta básica, vale-alimentação e vale-transporte por dia trabalhado.
 * - Escritório: cesta básica e vale-alimentação por dia; vale-transporte só
 *   para quem usa transporte público (engenheiros e gerentes ficam com
 *   passagem zero).
 * - Diretoria: cesta básica e salário base, sem vale-alimentação nem
 *   vale-transporte; o restante da remuneração entra como complemento na folha.
 *
 * Os padrões só preenchem o cadastro; cada funcionário pode ser ajustado
 * individualmente (uma gerente sem vale-alimentação, por exemplo).
 */
export const STAFF_GROUPS = ["obra", "escritorio", "diretoria"] as const;

export type StaffGroup = (typeof STAFF_GROUPS)[number];

/** Cadastros anteriores à equipe eram todos de obra. */
export const DEFAULT_STAFF_GROUP: StaffGroup = "obra";

export const STAFF_GROUP_LABELS: Record<StaffGroup, string> = {
  obra: "Obra",
  escritorio: "Escritório",
  diretoria: "Diretoria",
};

export const STAFF_GROUP_DESCRIPTIONS: Record<StaffGroup, string> = {
  obra: "Cesta básica, vale-alimentação e vale-transporte por dia trabalhado.",
  escritorio:
    "Cesta básica e vale-alimentação por dia; zere a passagem de quem não usa transporte público.",
  diretoria:
    "Cesta básica e salário base, sem vale-alimentação nem vale-transporte; o restante entra como complemento na folha.",
};

/** Passagem diária padrão (ida e volta) em centavos. */
export const DEFAULT_DAILY_TRANSIT_CENTS = 2140;
/** Dias úteis padrão no mês para vale-transporte e vale-refeição. */
export const DEFAULT_TRANSPORT_FOOD_DAYS = 22;

export type StaffGroupPayrollDefaults = {
  receivesFoodBasket: boolean;
  dailyTransitCents: number;
  defaultTransportFoodDays: number;
};

export const STAFF_GROUP_PAYROLL_DEFAULTS: Record<
  StaffGroup,
  StaffGroupPayrollDefaults
> = {
  obra: {
    receivesFoodBasket: true,
    dailyTransitCents: DEFAULT_DAILY_TRANSIT_CENTS,
    defaultTransportFoodDays: DEFAULT_TRANSPORT_FOOD_DAYS,
  },
  escritorio: {
    receivesFoodBasket: true,
    dailyTransitCents: DEFAULT_DAILY_TRANSIT_CENTS,
    defaultTransportFoodDays: DEFAULT_TRANSPORT_FOOD_DAYS,
  },
  diretoria: {
    receivesFoodBasket: true,
    dailyTransitCents: 0,
    defaultTransportFoodDays: 0,
  },
};

export function isStaffGroup(value: unknown): value is StaffGroup {
  return (
    typeof value === "string" && (STAFF_GROUPS as readonly string[]).includes(value)
  );
}
