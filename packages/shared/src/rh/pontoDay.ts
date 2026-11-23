/**
 * Ponto: o que cada marcação do dia significa.
 *
 * A marcação gravada é só um instante (Portaria MTP 671/2021: o registro é
 * fiel e não se altera). Qual delas é a entrada, a saída do almoço, a volta e a
 * saída é uma leitura feita aqui, a partir da jornada da pessoa, do que ela
 * informou no app e do tratamento do RH. Esquecer uma marcação não empurra as
 * outras: cada uma cai no lugar mais próximo do horário em que aconteceu.
 *
 * Usado pelo backend (resumo do dia, painel do RH) e pelo app (o botão já diz o
 * que vai registrar e pergunta quando algo não bate).
 */

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

/** As quatro marcações da jornada. */
export const PUNCH_SLOTS = ["entrada", "almoco_saida", "almoco_retorno", "saida"] as const;
export type PunchSlot = (typeof PUNCH_SLOTS)[number];

/** Papéis que a pessoa (ou o RH) pode dar a uma marcação. */
export const DECLARABLE_ROLES = [...PUNCH_SLOTS, "entrada_extra", "saida_extra"] as const;
export type DeclarableRole = (typeof DECLARABLE_ROLES)[number];

/** Papel final de uma marcação na leitura do dia. */
export type PunchRole = DeclarableRole | "repetida" | "desconsiderada";

export const PUNCH_ROLES: readonly PunchRole[] = [
  ...DECLARABLE_ROLES,
  "repetida",
  "desconsiderada",
];

export const PUNCH_ROLE_LABEL: Record<PunchRole, string> = {
  entrada: "Entrada",
  almoco_saida: "Saída almoço",
  almoco_retorno: "Retorno almoço",
  saida: "Saída",
  entrada_extra: "Entrada extra",
  saida_extra: "Saída extra",
  repetida: "Repetida",
  desconsiderada: "Desconsiderada",
};

/** Texto do botão de marcar, pelo que a próxima marcação vai ser. */
export const PUNCH_ACTION_LABEL: Record<DeclarableRole | "repetida", string> = {
  entrada: "Registrar entrada",
  almoco_saida: "Registrar saída para almoço",
  almoco_retorno: "Registrar volta do almoço",
  saida: "Registrar saída",
  entrada_extra: "Registrar volta",
  saida_extra: "Registrar saída",
  repetida: "Registrar ponto",
};

/** Como o papel foi decidido. */
export type RoleBasis =
  /** Pela jornada e pelos horários. */
  | "auto"
  /** A pessoa respondeu no app, na hora da marcação. */
  | "employee"
  /** Tratamento do RH. */
  | "rh"
  /** Horário esquecido informado pela pessoa, aguardando o RH. */
  | "pending"
  /** Horário esquecido aprovado (ou incluído) pelo RH. */
  | "approved";

/** Jornada em minutos desde 00:00 (horário de Brasília). */
export type WorkSchedule = {
  startMinute: number;
  endMinute: number;
  /** Duração prevista do almoço. */
  lunchMinutes: number;
  /** Faixa em que o almoço acontece (o horário exato é livre). */
  lunchWindowStartMinute: number;
  lunchWindowEndMinute: number;
};

export const DEFAULT_WORK_SCHEDULE: WorkSchedule = {
  startMinute: 7 * 60,
  endMinute: 17 * 60,
  lunchMinutes: 60,
  lunchWindowStartMinute: 11 * 60,
  lunchWindowEndMinute: 14 * 60,
};

/** Marcação (ou horário informado) que entra na leitura do dia. */
export type DayItemInput = {
  id: string;
  /** Minutos desde 00:00 (Brasília). */
  minute: number;
  source: "punch" | "request";
  /** Papel já definido; sem papel, a leitura decide. */
  role?: DeclarableRole | "desconsiderada" | null;
  /** Sem papel, é sempre "auto". */
  basis?: RoleBasis;
};

export type ClassifiedItem = {
  id: string;
  minute: number;
  source: "punch" | "request";
  role: PunchRole;
  basis: RoleBasis;
};

export type DayIssueCode =
  /** Falta uma das quatro marcações. */
  | "missing"
  /** O dia acabou sem saída e volta do almoço. */
  | "no_lunch"
  /** Marcação a mais que ninguém explicou. */
  | "extra"
  /** Horário esquecido esperando o RH. */
  | "pending_request"
  /** Almoço mais curto que o previsto (só informativo). */
  | "short_lunch";

export type DayIssue = {
  code: DayIssueCode;
  /** `action`: o RH precisa olhar; `info`: só aviso. */
  severity: "action" | "info";
  slot?: PunchSlot;
  itemId?: string;
  message: string;
};

export type DayStatus = "absent" | "on_site" | "lunch" | "away" | "left";

export type ClassifiedDay = {
  /** Todas as marcações e horários informados, em ordem. */
  items: ClassifiedItem[];
  slots: Record<PunchSlot, ClassifiedItem | null>;
  issues: DayIssue[];
  status: DayStatus;
  /** Última marcação que conta (sem repetidas e desconsideradas). */
  last: ClassifiedItem | null;
};

// ---------------------------------------------------------------------------
// Constantes da leitura
// ---------------------------------------------------------------------------

/** Marcação até 5 min depois de outra é tratada como toque repetido. */
export const REPEATED_PUNCH_MINUTES = 5;

/** Custo de deixar uma marcação fora das quatro (vira extra). */
const UNASSIGNED_COST = 600;
/** Custo de duas entradas (ou duas saídas) seguidas sem explicação. */
const SAME_DIRECTION_COST = 1000;
/** Desempate do almoço com uma marcação só (antes do meio da faixa: saída). */
const LUNCH_TIE_BIAS = 0.5;
/** Leitura exaustiva até este número de marcações livres no dia. */
const MAX_FREE_ITEMS = 16;

const SLOT_INDEX: Record<PunchSlot, number> = {
  entrada: 0,
  almoco_saida: 1,
  almoco_retorno: 2,
  saida: 3,
};

function isSlot(role: PunchRole | null | undefined): role is PunchSlot {
  return role === "entrada" || role === "almoco_saida" || role === "almoco_retorno" || role === "saida";
}

function isExtra(role: PunchRole): boolean {
  return role === "entrada_extra" || role === "saida_extra";
}

/** Entrada (começa a trabalhar) ou saída (para de trabalhar). */
function direction(role: PunchRole): "in" | "out" | null {
  switch (role) {
    case "entrada":
    case "almoco_retorno":
    case "entrada_extra":
      return "in";
    case "almoco_saida":
    case "saida":
    case "saida_extra":
      return "out";
    default:
      return null;
  }
}

function distanceToRange(minute: number, from: number, to: number): number {
  if (minute < from) return from - minute;
  if (minute > to) return minute - to;
  return 0;
}

/** Quão estranho é uma marcação neste horário ocupar esta posição. */
export function slotCost(slot: PunchSlot, minute: number, schedule: WorkSchedule): number {
  const { startMinute, endMinute, lunchWindowStartMinute, lunchWindowEndMinute } = schedule;
  const lunchMid = (lunchWindowStartMinute + lunchWindowEndMinute) / 2;
  switch (slot) {
    case "entrada":
      // Chegar atrasado é comum; chegar muito cedo, menos.
      return minute >= startMinute
        ? (minute - startMinute) * 0.25
        : (startMinute - minute) * 0.5;
    case "saida":
      return Math.abs(minute - endMinute) * 0.25;
    case "almoco_saida":
      return (
        distanceToRange(minute, lunchWindowStartMinute, lunchWindowEndMinute) +
        (minute > lunchMid ? LUNCH_TIE_BIAS : 0)
      );
    case "almoco_retorno":
      return (
        distanceToRange(minute, lunchWindowStartMinute, lunchWindowEndMinute) +
        (minute < lunchMid ? LUNCH_TIE_BIAS : 0)
      );
  }
}

// ---------------------------------------------------------------------------
// Leitura do dia
// ---------------------------------------------------------------------------

type Working = {
  id: string;
  minute: number;
  source: "punch" | "request";
  role: PunchRole | null;
  basis: RoleBasis;
  /** Ordem de chegada (desempate de horários iguais). */
  order: number;
};

const BASIS_PRIORITY: Record<RoleBasis, number> = {
  rh: 0,
  approved: 1,
  employee: 2,
  pending: 3,
  auto: 4,
};

/**
 * Rotula repetidas e extras e soma o custo de uma escolha de posições.
 * `assigned` mapeia o índice da marcação livre para a posição escolhida.
 */
function labelTimeline(
  timeline: Working[],
  schedule: WorkSchedule
): { labeled: Working[]; cost: number } {
  let cost = 0;
  const labeled: Working[] = [];
  let lastPunchMinute: number | null = null;
  let previous: Working | null = null;
  for (const item of timeline) {
    if (item.role === "desconsiderada") {
      labeled.push(item);
      continue;
    }
    let role = item.role;
    if (role === null) {
      if (
        item.source === "punch" &&
        lastPunchMinute !== null &&
        item.minute - lastPunchMinute <= REPEATED_PUNCH_MINUTES
      ) {
        role = "repetida";
        cost += UNASSIGNED_COST;
      } else {
        role = previous && direction(previous.role!) === "in" ? "saida_extra" : "entrada_extra";
        // Fecha o par de uma extra anterior (saiu e voltou): esperado.
        if (!(previous && isExtra(previous.role!))) cost += UNASSIGNED_COST;
      }
    } else if (item.basis === "auto" && isSlot(role)) {
      cost += slotCost(role, item.minute, schedule);
    }
    const next: Working = { ...item, role };
    if (role !== "repetida") {
      if (previous) {
        const a = previous.role!;
        const b = role;
        const gapExplains = isSlot(a) && isSlot(b) && SLOT_INDEX[b] > SLOT_INDEX[a] + 1;
        if (!gapExplains && direction(a) === direction(b)) cost += SAME_DIRECTION_COST;
        if (a === "almoco_saida" && b === "almoco_retorno") {
          cost += Math.max(0, schedule.lunchMinutes - (item.minute - previous.minute));
        }
      }
      previous = next;
    }
    if (item.source === "punch") lastPunchMinute = item.minute;
    labeled.push(next);
  }
  return { labeled, cost };
}

function sortTimeline(items: Working[]): Working[] {
  return [...items].sort((a, b) => a.minute - b.minute || a.order - b.order);
}

/**
 * Lê o dia: dá a cada marcação o seu papel e aponta o que falta.
 * `open`: o dia ainda não acabou (hoje), então só falta o que já devia ter
 * acontecido antes de uma marcação posterior.
 */
export function classifyDay(input: {
  items: DayItemInput[];
  schedule: WorkSchedule;
  open: boolean;
}): ClassifiedDay {
  const { schedule } = input;
  const working: Working[] = input.items.map((item, order) => ({
    id: item.id,
    minute: item.minute,
    source: item.source,
    role: item.role ?? null,
    basis: item.role ? (item.basis ?? "employee") : "auto",
    order,
  }));

  // Papéis definidos ocupam as posições (o RH primeiro); quem chega a uma
  // posição já ocupada volta para a leitura automática.
  const taken = new Map<PunchSlot, Working>();
  const byPriority = [...working].sort(
    (a, b) => BASIS_PRIORITY[a.basis] - BASIS_PRIORITY[b.basis] || a.minute - b.minute
  );
  for (const item of byPriority) {
    if (!isSlot(item.role)) continue;
    if (taken.has(item.role)) {
      if (item.source === "request") {
        // Horário informado para um lugar que já tem marcação: não conta.
        item.role = "desconsiderada";
      } else {
        item.role = null;
        item.basis = "auto";
      }
      continue;
    }
    taken.set(item.role, item);
  }

  const timeline = sortTimeline(working);
  // Toque repetido (até 5 min depois da marcação anterior) nunca ocupa lugar.
  const repeated = new Set<Working>();
  let lastPunch: Working | null = null;
  for (const item of timeline) {
    if (item.source !== "punch" || item.role === "desconsiderada") continue;
    if (
      item.role === null &&
      lastPunch &&
      item.minute - lastPunch.minute <= REPEATED_PUNCH_MINUTES
    ) {
      repeated.add(item);
    }
    lastPunch = item;
  }
  const free = timeline.filter((item) => item.role === null && !repeated.has(item));
  const optimized = free.slice(0, MAX_FREE_ITEMS);
  const openSlots = PUNCH_SLOTS.filter((slot) => !taken.has(slot));

  // Procura a melhor escolha de posições para as marcações livres, mantendo a
  // ordem: entrada < saída almoço < volta < saída, também em relação às fixas.
  const fits = (slot: PunchSlot, minute: number) => {
    for (const [fixedSlot, fixed] of taken) {
      if (SLOT_INDEX[fixedSlot] < SLOT_INDEX[slot] && fixed.minute > minute) return false;
      if (SLOT_INDEX[fixedSlot] > SLOT_INDEX[slot] && fixed.minute < minute) return false;
    }
    return true;
  };

  let best: { labeled: Working[]; cost: number } | null = null;
  const choice = new Map<Working, PunchSlot>();
  const evaluate = () => {
    const candidate = timeline.map((item) => {
      const slot = choice.get(item);
      return slot ? { ...item, role: slot, basis: "auto" as const } : item;
    });
    const result = labelTimeline(candidate, schedule);
    if (!best || result.cost < best.cost) best = result;
  };
  const search = (index: number, minSlot: number) => {
    if (index === optimized.length) {
      evaluate();
      return;
    }
    const item = optimized[index]!;
    for (const slot of openSlots) {
      if (SLOT_INDEX[slot] < minSlot || !fits(slot, item.minute)) continue;
      choice.set(item, slot);
      search(index + 1, SLOT_INDEX[slot] + 1);
      choice.delete(item);
    }
    search(index + 1, minSlot);
  };
  search(0, 0);

  const labeled = (best as { labeled: Working[] } | null)?.labeled ?? labelTimeline(timeline, schedule).labeled;
  const items: ClassifiedItem[] = labeled.map((item) => ({
    id: item.id,
    minute: item.minute,
    source: item.source,
    role: item.role as PunchRole,
    basis: item.basis,
  }));

  const slots: Record<PunchSlot, ClassifiedItem | null> = {
    entrada: null,
    almoco_saida: null,
    almoco_retorno: null,
    saida: null,
  };
  for (const item of items) if (isSlot(item.role)) slots[item.role] = item;

  const counted = items.filter((item) => item.role !== "repetida" && item.role !== "desconsiderada");
  const last = counted[counted.length - 1] ?? null;

  return {
    items,
    slots,
    issues: dayIssues(items, slots, schedule, input.open),
    status: dayStatus(last, slots),
    last,
  };
}

function dayStatus(
  last: ClassifiedItem | null,
  slots: Record<PunchSlot, ClassifiedItem | null>
): DayStatus {
  if (!last) return "absent";
  switch (last.role) {
    case "almoco_saida":
      return "lunch";
    case "saida":
      return "left";
    case "saida_extra":
      return slots.saida && slots.saida.minute <= last.minute ? "left" : "away";
    default:
      return "on_site";
  }
}

export function formatMinute(minute: number): string {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.round(minute)));
  return `${String(Math.floor(clamped / 60)).padStart(2, "0")}:${String(clamped % 60).padStart(2, "0")}`;
}

const SLOT_MISSING_MESSAGE: Record<PunchSlot, string> = {
  entrada: "Sem entrada",
  almoco_saida: "Sem saída para almoço",
  almoco_retorno: "Sem volta do almoço",
  saida: "Sem saída",
};

function dayIssues(
  items: ClassifiedItem[],
  slots: Record<PunchSlot, ClassifiedItem | null>,
  schedule: WorkSchedule,
  open: boolean
): DayIssue[] {
  const issues: DayIssue[] = [];
  const counted = items.filter((item) => item.role !== "repetida" && item.role !== "desconsiderada");
  if (counted.length === 0) return issues;

  const lastFilled = Math.max(
    ...PUNCH_SLOTS.filter((slot) => slots[slot]).map((slot) => SLOT_INDEX[slot])
  );
  const due = (slot: PunchSlot) => !open || SLOT_INDEX[slot] < lastFilled;
  const noLunch = !slots.almoco_saida && !slots.almoco_retorno && due("almoco_retorno");
  if (noLunch) {
    issues.push({ code: "no_lunch", severity: "action", message: "Sem registro de almoço" });
  }
  for (const slot of PUNCH_SLOTS) {
    if (slots[slot] || !due(slot)) continue;
    if (noLunch && (slot === "almoco_saida" || slot === "almoco_retorno")) continue;
    issues.push({ code: "missing", severity: "action", slot, message: SLOT_MISSING_MESSAGE[slot] });
  }
  let previous: ClassifiedItem | null = null;
  for (const item of items) {
    const pairsPrevious = previous !== null && isExtra(previous.role);
    if (item.role !== "repetida" && item.role !== "desconsiderada") previous = item;
    // Extra que ninguém explicou; a que fecha o par de outra extra não conta.
    if (item.basis === "auto" && isExtra(item.role) && !pairsPrevious) {
      issues.push({
        code: "extra",
        severity: "action",
        itemId: item.id,
        message: `Marcação a mais às ${formatMinute(item.minute)}`,
      });
    }
    if (item.basis === "pending") {
      issues.push({
        code: "pending_request",
        severity: "action",
        itemId: item.id,
        message: `${PUNCH_ROLE_LABEL[item.role]} às ${formatMinute(item.minute)} informada pela pessoa`,
      });
    }
  }
  const { almoco_saida: out, almoco_retorno: back } = slots;
  if (out && back && back.minute - out.minute < schedule.lunchMinutes - 5) {
    issues.push({
      code: "short_lunch",
      severity: "info",
      message: `Almoço de ${back.minute - out.minute} min (previsto ${schedule.lunchMinutes})`,
    });
  }
  return issues;
}

/** Pendências que pedem o RH (sem os avisos). */
export function actionIssueCount(day: ClassifiedDay): number {
  return day.issues.filter((issue) => issue.severity === "action").length;
}

// ---------------------------------------------------------------------------
// Próxima marcação (app)
// ---------------------------------------------------------------------------

export type MissedPunch = { slot: PunchSlot; minute: number };

export type PunchPromptOption = {
  key: string;
  label: string;
  /** Papel que a marcação leva (o que a pessoa respondeu). */
  declaredRole?: DeclarableRole;
  /** Horários esquecidos que vão junto, para o RH conferir. */
  missed: MissedPunch[];
  /** Não registra nada (toque sem querer). */
  cancel?: boolean;
};

export type PunchPrompt = {
  title: string;
  message: string;
  /** Horários esquecidos sugeridos (editáveis) na primeira opção. */
  missed: MissedPunch[];
  options: PunchPromptOption[];
};

export type PunchPlan = {
  /** O que a próxima marcação vai ser se a pessoa só tocar no botão. */
  role: PunchRole;
  actionLabel: string;
  /** Pergunta antes de registrar; `null` no caminho normal. */
  prompt: PunchPrompt | null;
};

const NEXT_ID = "__next__";

const NOW_LABEL: Record<PunchSlot, string> = {
  entrada: "Estou chegando agora",
  almoco_saida: "Estou saindo para o almoço agora",
  almoco_retorno: "Estou voltando do almoço agora",
  saida: "Estou saindo agora",
};

const FORGOT_TITLE: Record<PunchSlot, string> = {
  entrada: "Faltou registrar a entrada",
  almoco_saida: "Faltou registrar a saída para o almoço",
  almoco_retorno: "Faltou registrar a volta do almoço",
  saida: "Faltou registrar a saída",
};

function defaultLunchStart(schedule: WorkSchedule): number {
  const room = schedule.lunchWindowEndMinute - schedule.lunchWindowStartMinute - schedule.lunchMinutes;
  return schedule.lunchWindowStartMinute + Math.max(0, Math.round(room / 2));
}

/** Horário sugerido para uma marcação esquecida, entre as vizinhas. */
function suggestMinute(
  slot: PunchSlot,
  day: ClassifiedDay,
  schedule: WorkSchedule,
  before: number,
  after: number
): number {
  let minute: number;
  switch (slot) {
    case "entrada":
      minute = schedule.startMinute;
      break;
    case "saida":
      minute = schedule.endMinute;
      break;
    case "almoco_saida":
      minute = day.slots.almoco_retorno
        ? day.slots.almoco_retorno.minute - schedule.lunchMinutes
        : defaultLunchStart(schedule);
      break;
    case "almoco_retorno":
      minute = (day.slots.almoco_saida?.minute ?? defaultLunchStart(schedule)) + schedule.lunchMinutes;
      break;
  }
  if (minute <= before || minute >= after) minute = Math.round((before + after) / 2);
  return Math.max(0, Math.min(24 * 60 - 1, minute));
}

/**
 * Horários sugeridos para posições esquecidas: pela jornada (entrada e saída)
 * ou pelo almoço já marcado, sempre entre as vizinhas conhecidas e antes de
 * `nowMinute`.
 */
export function suggestMissed(
  day: ClassifiedDay,
  schedule: WorkSchedule,
  gaps: PunchSlot[],
  nowMinute: number
): MissedPunch[] {
  const missed: MissedPunch[] = [];
  for (const slot of [...gaps].sort((a, b) => SLOT_INDEX[a] - SLOT_INDEX[b])) {
    // Entre a posição anterior e a seguinte já conhecidas (ou sugeridas).
    const known = PUNCH_SLOTS.map((other) => {
      const suggested = missed.find((item) => item.slot === other);
      return { other, minute: suggested?.minute ?? day.slots[other]?.minute ?? null };
    });
    const lower = known
      .filter((k) => SLOT_INDEX[k.other] < SLOT_INDEX[slot] && k.minute !== null)
      .map((k) => k.minute!);
    const upper = known
      .filter((k) => SLOT_INDEX[k.other] > SLOT_INDEX[slot] && k.minute !== null)
      .map((k) => k.minute!);
    missed.push({
      slot,
      minute: suggestMinute(
        slot,
        day,
        schedule,
        lower.length ? Math.max(...lower) : -1,
        Math.min(nowMinute, ...upper)
      ),
    });
  }
  return missed;
}

/** Posições que já deviam ter sido marcadas (para o "Esqueci" do app). */
export function dueMissingSlots(day: ClassifiedDay): PunchSlot[] {
  const slots = new Set<PunchSlot>();
  for (const issue of day.issues) {
    if (issue.code === "missing" && issue.slot) slots.add(issue.slot);
    if (issue.code === "no_lunch") {
      slots.add("almoco_saida");
      slots.add("almoco_retorno");
    }
  }
  return PUNCH_SLOTS.filter((slot) => slots.has(slot));
}

/**
 * O que o toque em "Registrar" vai gravar agora e, quando algo não bate
 * (toque repetido, marcação esquecida, almoço fora de hora, volta depois da
 * saída), a pergunta curta que o app faz antes. A pergunta nunca impede a
 * marcação: toda opção registra, menos a de cancelar o toque sem querer.
 */
export function planNextPunch(input: {
  items: DayItemInput[];
  schedule: WorkSchedule;
  nowMinute: number;
}): PunchPlan {
  const { schedule, nowMinute } = input;
  const before = classifyDay({ items: input.items, schedule, open: true });
  const after = classifyDay({
    items: [...input.items, { id: NEXT_ID, minute: nowMinute, source: "punch" }],
    schedule,
    open: true,
  });
  const next = after.items.find((item) => item.id === NEXT_ID)!;
  const role = next.role;
  const plan = (prompt: PunchPrompt | null): PunchPlan => ({
    role,
    actionLabel: PUNCH_ACTION_LABEL[role === "desconsiderada" ? "repetida" : role],
    prompt,
  });
  const cancel: PunchPromptOption = { key: "cancel", label: "Não registrar", missed: [], cancel: true };

  // Toque repetido.
  if (role === "repetida") {
    const lastPunch = [...before.items].reverse().find((item) => item.source === "punch");
    return plan({
      title: "Você acabou de registrar",
      message: lastPunch ? `Seu último registro foi às ${formatMinute(lastPunch.minute)}.` : "",
      missed: [],
      options: [cancel, { key: "again", label: "Registrar de novo", missed: [] }],
    });
  }

  // Depois da saída.
  if (before.status === "left" && role === "entrada_extra") {
    return plan({
      title: `Você já registrou a saída às ${formatMinute(before.last!.minute)}`,
      message: "Voltou a trabalhar?",
      missed: [],
      options: [
        { key: "overtime", label: "Sim, voltei a trabalhar", declaredRole: "entrada_extra", missed: [] },
        cancel,
      ],
    });
  }

  // Marcação esquecida antes desta.
  if (isSlot(role)) {
    const gaps = PUNCH_SLOTS.filter(
      (slot) => SLOT_INDEX[slot] < SLOT_INDEX[role] && !after.slots[slot]
    );
    if (gaps.length > 0) {
      const missed = suggestMissed(after, schedule, gaps, nowMinute);
      const first = gaps[0]!;
      const lunchOnly = gaps.length === 2 && first === "almoco_saida";
      const options: PunchPromptOption[] = [
        { key: "forgot", label: "Esqueci, os horários são estes", declaredRole: role, missed },
      ];
      if (first === "entrada" || slotCost(first, nowMinute, schedule) <= 120) {
        options.push({ key: "now", label: NOW_LABEL[first], declaredRole: first, missed: [] });
      } else if (lunchOnly) {
        options.push({ key: "skip", label: "Não fiz intervalo", declaredRole: role, missed: [] });
      } else {
        options.push({
          key: "skip",
          label: `Só registrar a ${PUNCH_ROLE_LABEL[role].toLowerCase()}`,
          declaredRole: role,
          missed: [],
        });
      }
      return plan({
        title: lunchOnly ? "Faltou registrar o almoço" : FORGOT_TITLE[first],
        message:
          gaps.length === 1
            ? "Confira o horário. O RH recebe junto com esta marcação."
            : "Confira os horários. O RH recebe junto com esta marcação.",
        missed,
        options,
      });
    }

    // Almoço bem fora da faixa: pode ser uma saída rápida (médico, banco).
    if (
      role === "almoco_saida" &&
      distanceToRange(nowMinute, schedule.lunchWindowStartMinute - 30, schedule.lunchWindowEndMinute) > 0
    ) {
      return plan({
        title: "Saindo para o almoço?",
        message: "",
        missed: [],
        options: [
          { key: "lunch", label: "Sim, almoço", declaredRole: "almoco_saida", missed: [] },
          { key: "quick", label: "Não, saio e volto", declaredRole: "saida_extra", missed: [] },
        ],
      });
    }

    // Saída bem antes do fim da jornada.
    if (role === "saida" && nowMinute < schedule.endMinute - 60) {
      return plan({
        title: "Encerrando o dia?",
        message: "",
        missed: [],
        options: [
          { key: "end", label: "Sim, encerrar o dia", declaredRole: "saida", missed: [] },
          { key: "quick", label: "Não, saio e volto", declaredRole: "saida_extra", missed: [] },
        ],
      });
    }
  }

  return plan(null);
}

// ---------------------------------------------------------------------------
// Jornada
// ---------------------------------------------------------------------------

/** Mensagem do primeiro problema da jornada, ou `null` se estiver ok. */
export function workScheduleError(schedule: WorkSchedule): string | null {
  const values = [
    schedule.startMinute,
    schedule.endMinute,
    schedule.lunchMinutes,
    schedule.lunchWindowStartMinute,
    schedule.lunchWindowEndMinute,
  ];
  if (values.some((value) => !Number.isInteger(value) || value < 0 || value >= 24 * 60)) {
    return "Horários inválidos";
  }
  if (schedule.startMinute >= schedule.endMinute) {
    return "A saída precisa ser depois da entrada";
  }
  if (schedule.lunchMinutes < 15 || schedule.lunchMinutes > 240) {
    return "Almoço deve ter de 15 min a 4 h";
  }
  if (
    schedule.lunchWindowStartMinute < schedule.startMinute ||
    schedule.lunchWindowEndMinute > schedule.endMinute ||
    schedule.lunchWindowEndMinute - schedule.lunchWindowStartMinute < schedule.lunchMinutes
  ) {
    return "A faixa do almoço precisa caber na jornada e no tempo de almoço";
  }
  return null;
}

/** "07:00 às 17:00 · almoço 1 h entre 11:00 e 14:00". */
export function describeWorkSchedule(schedule: WorkSchedule): string {
  const lunch =
    schedule.lunchMinutes % 60 === 0
      ? `${schedule.lunchMinutes / 60} h`
      : `${schedule.lunchMinutes} min`;
  return `${formatMinute(schedule.startMinute)} às ${formatMinute(schedule.endMinute)} · almoço ${lunch} entre ${formatMinute(schedule.lunchWindowStartMinute)} e ${formatMinute(schedule.lunchWindowEndMinute)}`;
}

/** Minutos desde 00:00 em Brasília (sem horário de verão: -3h fixo). */
export function brtMinuteOfDay(ms: number): number {
  const wall = new Date(ms - 3 * 60 * 60 * 1000);
  return wall.getUTCHours() * 60 + wall.getUTCMinutes();
}

/** "HH:MM" para minutos, aceitando "7", "7:5", "07:05". `null` se inválido. */
export function parseClockLabel(label: string): number | null {
  const match = /^\s*(\d{1,2})(?::(\d{1,2}))?\s*$/.exec(label);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2] ?? "0");
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}
