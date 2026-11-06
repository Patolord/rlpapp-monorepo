/**
 * Ponto: regras puras (sem acesso a `ctx`). Datas civis em Brasília, tipo da
 * marcação pela posição no dia, situação "agora" de cada pessoa e agregação de
 * homem-dia. O acesso a dados fica em `timeClockDb.ts`; a marcação em si, em
 * `convex/timeClockPunch.ts`.
 */

// ---------------------------------------------------------------------------
// Datas (Brasília)
// ---------------------------------------------------------------------------

/** Brasília não tem mais horário de verão: deslocamento fixo de -3h. */
export const BRT_OFFSET_MS = -3 * 60 * 60 * 1000;

const DATE_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isDateKey(value: string): boolean {
  if (!DATE_KEY_RE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number) as [number, number, number];
  const probe = new Date(Date.UTC(y, m - 1, d));
  return (
    probe.getUTCFullYear() === y &&
    probe.getUTCMonth() === m - 1 &&
    probe.getUTCDate() === d
  );
}

export function assertDateKey(value: string, label = "Data"): void {
  if (!isDateKey(value)) {
    throw new Error(`${label} inválida (use AAAA-MM-DD)`);
  }
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/** Converte um instante (ms UTC) para a data civil em Brasília. */
export function toBrtDateKey(ms: number): string {
  const wall = new Date(ms + BRT_OFFSET_MS);
  return `${wall.getUTCFullYear()}-${pad2(wall.getUTCMonth() + 1)}-${pad2(wall.getUTCDate())}`;
}

/** Converte um instante (ms UTC) para "HH:MM" em Brasília. */
export function toBrtTimeLabel(ms: number): string {
  const wall = new Date(ms + BRT_OFFSET_MS);
  return `${pad2(wall.getUTCHours())}:${pad2(wall.getUTCMinutes())}`;
}

export function monthRange(year: number, month: number): { from: string; to: string } {
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new Error("Ano inválido");
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error("Mês inválido");
  }
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    from: `${year}-${pad2(month)}-01`,
    to: `${year}-${pad2(month)}-${pad2(lastDay)}`,
  };
}

// ---------------------------------------------------------------------------
// Tipo da marcação
// ---------------------------------------------------------------------------

export type PunchKind = "entrada" | "almoco_saida" | "almoco_retorno" | "saida";

/** 1ª = entrada, 2ª = saída almoço, 3ª = retorno almoço, 4ª em diante = saída. */
export function punchKindForSequence(sequence: number): PunchKind {
  switch (Math.min(Math.max(sequence, 0), 3)) {
    case 0:
      return "entrada";
    case 1:
      return "almoco_saida";
    case 2:
      return "almoco_retorno";
    default:
      return "saida";
  }
}

export type GeofenceStatus = "not_controlled" | "inside" | "outside";

// ---------------------------------------------------------------------------
// Resumo do dia
// ---------------------------------------------------------------------------

/** O que o resumo diário precisa de cada marcação. */
export type SummarizablePunch<P extends string = string> = {
  punchedAt: number;
  kind: PunchKind;
  projectId?: P;
  projectName?: string;
  geofenceStatus: GeofenceStatus;
};

export type DaySummary<P extends string = string> = {
  projectId?: P;
  projectName?: string;
  firstPunchAt: number;
  lastPunchAt: number;
  lastKind: PunchKind;
  punchCount: number;
};

/** Obra do dia = a da primeira marcação dentro de uma cerca. */
export function summarizeDay<P extends string>(
  punches: SummarizablePunch<P>[]
): DaySummary<P> | null {
  if (punches.length === 0) return null;
  const sorted = [...punches].sort((a, b) => a.punchedAt - b.punchedAt);
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  const onSite = sorted.find((punch) => punch.geofenceStatus === "inside" && punch.projectId);
  return {
    projectId: onSite?.projectId,
    projectName: onSite?.projectName,
    firstPunchAt: first.punchedAt,
    lastPunchAt: last.punchedAt,
    lastKind: last.kind,
    punchCount: sorted.length,
  };
}

// ---------------------------------------------------------------------------
// Situação "agora" (onde está cada pessoa / quem está em cada obra)
// ---------------------------------------------------------------------------

export type LiveStatus = "on_site" | "lunch" | "left" | "absent";

/** Situação derivada da última marcação do dia. */
export function liveStatusForKind(kind: PunchKind | null | undefined): LiveStatus {
  switch (kind) {
    case "entrada":
    case "almoco_retorno":
      return "on_site";
    case "almoco_saida":
      return "lunch";
    case "saida":
      return "left";
    case null:
    case undefined:
      return "absent";
  }
}

export type LivePosition<P extends SummarizablePunch> = {
  status: LiveStatus;
  last: P | null;
  /** Obra da última marcação dentro de uma cerca ou, na falta, da mais recente com obra. */
  projectId: P["projectId"];
  projectName: string | undefined;
  /** `true` quando a própria última marcação caiu dentro da cerca da obra. */
  locationExact: boolean;
};

/**
 * Posição atual de uma pessoa a partir das marcações do dia (ordenadas ou não).
 * Quem bateu fora de cerca mantém como referência a obra mais próxima ou a
 * última conhecida, sinalizando `locationExact: false`.
 */
export function derivePosition<P extends SummarizablePunch>(punches: P[]): LivePosition<P> {
  if (punches.length === 0) {
    return {
      status: "absent",
      last: null,
      projectId: undefined,
      projectName: undefined,
      locationExact: false,
    };
  }
  const sorted = [...punches].sort((a, b) => a.punchedAt - b.punchedAt);
  const last = sorted[sorted.length - 1]!;
  const reversed = [...sorted].reverse();
  const reference =
    (last.geofenceStatus === "inside" ? last : undefined) ??
    reversed.find((punch) => punch.geofenceStatus === "inside" && punch.projectId) ??
    reversed.find((punch) => punch.projectId);
  return {
    status: liveStatusForKind(last.kind),
    last,
    projectId: reference?.projectId,
    projectName: reference?.projectName,
    locationExact: last.geofenceStatus === "inside",
  };
}

// ---------------------------------------------------------------------------
// Homem-dia
// ---------------------------------------------------------------------------

export type ManDayInput<U extends string = string, P extends string = string> = {
  date: string;
  userId: U;
  personName: string;
  projectId?: P;
  projectName?: string;
};

export type ManDaysByPerson<U extends string, P extends string> = {
  userId: U;
  personName: string;
  totalDays: number;
  projects: Array<{ projectId?: P; projectName?: string; days: number }>;
};

export type ManDaysByProject<U extends string, P extends string> = {
  projectId?: P;
  projectName?: string;
  totalManDays: number;
  uniquePeople: number;
  people: Array<{ userId: U; personName: string; days: number }>;
};

export type ManDaysAggregate<U extends string, P extends string> = {
  byPerson: ManDaysByPerson<U, P>[];
  byProject: ManDaysByProject<U, P>[];
  byDate: Array<{ date: string; presentCount: number }>;
  totalManDays: number;
  uniquePeople: number;
  uniqueProjects: number;
};

const NO_PROJECT = "";

/** Cada pessoa conta no máximo 1 homem-dia por data, atribuído à obra do dia. */
export function aggregateManDays<U extends string, P extends string>(
  rows: ManDayInput<U, P>[]
): ManDaysAggregate<U, P> {
  const perPersonDate = new Map<string, ManDayInput<U, P>>();
  for (const row of rows) {
    const key = `${row.userId}|${row.date}`;
    if (!perPersonDate.has(key)) perPersonDate.set(key, row);
  }

  type Counter = { name?: string; days: number };
  const people = new Map<U, { personName: string; projects: Map<string, Counter> }>();
  const projects = new Map<
    string,
    { projectName?: string; people: Map<U, { personName: string; days: number }> }
  >();
  const dates = new Map<string, number>();

  for (const row of perPersonDate.values()) {
    const projectKey: string = row.projectId ?? NO_PROJECT;

    const person = people.get(row.userId) ?? { personName: row.personName, projects: new Map() };
    const personProject = person.projects.get(projectKey) ?? { name: row.projectName, days: 0 };
    personProject.days += 1;
    person.projects.set(projectKey, personProject);
    people.set(row.userId, person);

    const project = projects.get(projectKey) ?? { projectName: row.projectName, people: new Map() };
    const projectPerson = project.people.get(row.userId) ?? { personName: row.personName, days: 0 };
    projectPerson.days += 1;
    project.people.set(row.userId, projectPerson);
    projects.set(projectKey, project);

    dates.set(row.date, (dates.get(row.date) ?? 0) + 1);
  }

  const toProjectId = (key: string) => (key === NO_PROJECT ? undefined : (key as P));

  const byPerson = Array.from(people.entries())
    .map(([userId, data]) => {
      const list = Array.from(data.projects.entries())
        .map(([key, value]) => ({
          projectId: toProjectId(key),
          projectName: value.name,
          days: value.days,
        }))
        .sort((a, b) => b.days - a.days);
      return {
        userId,
        personName: data.personName,
        totalDays: list.reduce((sum, item) => sum + item.days, 0),
        projects: list,
      };
    })
    .sort(
      (a, b) => b.totalDays - a.totalDays || a.personName.localeCompare(b.personName, "pt-BR")
    );

  const byProject = Array.from(projects.entries())
    .map(([key, data]) => {
      const list = Array.from(data.people.entries())
        .map(([userId, value]) => ({ userId, personName: value.personName, days: value.days }))
        .sort((a, b) => b.days - a.days || a.personName.localeCompare(b.personName, "pt-BR"));
      return {
        projectId: toProjectId(key),
        projectName: data.projectName,
        totalManDays: list.reduce((sum, item) => sum + item.days, 0),
        uniquePeople: list.length,
        people: list,
      };
    })
    .sort((a, b) => b.totalManDays - a.totalManDays);

  const byDate = Array.from(dates.entries())
    .map(([date, presentCount]) => ({ date, presentCount }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    byPerson,
    byProject,
    byDate,
    totalManDays: perPersonDate.size,
    uniquePeople: people.size,
    uniqueProjects: Array.from(projects.keys()).filter((key) => key !== NO_PROJECT).length,
  };
}
