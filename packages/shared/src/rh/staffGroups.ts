/**
 * Equipes do quadro de funcionários da RLP. Cada equipe tem padrões próprios
 * de benefícios na folha mensal:
 *
 * - Obra: cesta básica, vale-transporte e vale-refeição por dia trabalhado.
 * - Escritório: vale-transporte e vale-refeição por dia, sem cesta básica.
 * - Diretoria: pró-labore fixo, sem cesta, vale-transporte ou vale-refeição.
 *
 * Os padrões só preenchem o cadastro; cada funcionário pode ser ajustado
 * individualmente (um diretor que recebe vale-transporte, por exemplo).
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
  obra: "Cesta básica, vale-transporte e vale-refeição por dia trabalhado.",
  escritorio: "Vale-transporte e vale-refeição por dia, sem cesta básica.",
  diretoria: "Pró-labore fixo, sem cesta básica, vale-transporte ou vale-refeição.",
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
    receivesFoodBasket: false,
    dailyTransitCents: DEFAULT_DAILY_TRANSIT_CENTS,
    defaultTransportFoodDays: DEFAULT_TRANSPORT_FOOD_DAYS,
  },
  diretoria: {
    receivesFoodBasket: false,
    dailyTransitCents: 0,
    defaultTransportFoodDays: 0,
  },
};

export function isStaffGroup(value: unknown): value is StaffGroup {
  return (
    typeof value === "string" && (STAFF_GROUPS as readonly string[]).includes(value)
  );
}

/** Nome do valor fixo mensal: salário para empregados, pró-labore para a diretoria. */
export function baseSalaryLabel(group: StaffGroup): string {
  return group === "diretoria" ? "Pró-labore" : "Salário base";
}
