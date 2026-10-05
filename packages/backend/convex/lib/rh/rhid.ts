/**
 * Integração com o RHID (rhid.com.br) — controle de ponto / acesso.
 *
 * Este módulo é puro (sem acesso a `ctx`): tipos da API, parsing de datas,
 * normalização das marcações e agregações. As chamadas HTTP ficam em funções
 * que recebem o token e usam `fetch` (disponível no runtime padrão do Convex),
 * para serem usadas pela action de sincronização.
 */

import { normalizeText } from "../compras/procurement";

// ---------------------------------------------------------------------------
// Configuração
// ---------------------------------------------------------------------------

export const RHID_BASE_URL = "https://rhid.com.br/v2";
export const RHID_CUSTOMERDB_URL = "https://rhid.com.br/v2/customerdb";
export const RHID_DEFAULT_COMPANY_ID = 1;

/** O token do RHID vale 24h; renovamos um pouco antes para evitar 400 no meio da sync. */
export const RHID_TOKEN_TTL_MS = 23 * 60 * 60 * 1000;

/** Brasília não tem mais horário de verão: deslocamento fixo de -3h. */
export const BRT_OFFSET_MS = -3 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Tipos da API (payloads brutos)
// ---------------------------------------------------------------------------

export type RhidLoginResponse = {
  accessToken?: string;
  expiredPassword?: boolean;
};

export type RhidGeofence = {
  excluded?: boolean;
  id: number;
  latitude: number;
  longitude: number;
  name: string;
  radius: number;
};

export type RhidAfdMobileRecord = {
  excluded?: boolean;
  id: number;
  Tipo?: number;
  cpf?: number | string;
  dateTime: string;
  dateTimeStr?: string;
  geofence?: RhidGeofence | null;
  idGeofence?: number;
  idPerson?: number;
  latitude?: number;
  longitude?: number;
  photoURL?: string;
};

export type RhidPerson = {
  id: number;
  name: string;
  cpf?: string | number;
  idDepartment?: number;
  status?: number;
};

export type RhidEmployeeCheckIn = {
  listAfdMobilePerson?: RhidAfdMobileRecord[] | null;
  person?: RhidPerson | null;
};

// ---------------------------------------------------------------------------
// Tipos normalizados (o que gravamos no Convex)
// ---------------------------------------------------------------------------

export type PunchKind = "entrada" | "almoco_saida" | "almoco_retorno" | "saida";

export const PUNCH_KIND_LABEL: Record<PunchKind, string> = {
  entrada: "Entrada",
  almoco_saida: "Saída almoço",
  almoco_retorno: "Retorno almoço",
  saida: "Saída",
};

export type NormalizedPunch = {
  rhidRecordId: number;
  rhidPersonId: number;
  personName: string;
  date: string;
  punchedAt: number;
  timeLabel: string;
  sequence: number;
  kind: PunchKind;
  latitude?: number;
  longitude?: number;
  photoUrl?: string;
  rhidGeofenceId?: number;
  geofenceName?: string;
};

export type NormalizedWorksite = {
  rhidGeofenceId: number;
  name: string;
  latitude: number;
  longitude: number;
  radius: number;
};

export type NormalizedPerson = {
  rhidPersonId: number;
  name: string;
  cpf?: string;
  department?: string;
};

export type DaySummary = {
  date: string;
  rhidPersonId: number;
  personName: string;
  rhidGeofenceId?: number;
  worksiteName?: string;
  firstPunchAt: number;
  lastPunchAt: number;
  lastKind: PunchKind;
  punchCount: number;
};

// ---------------------------------------------------------------------------
// Erros
// ---------------------------------------------------------------------------

export class RhidError extends Error {
  readonly sessionExpired: boolean;
  readonly status: number | undefined;

  constructor(
    message: string,
    options: { sessionExpired?: boolean; status?: number } = {}
  ) {
    super(message);
    this.name = "RhidError";
    this.sessionExpired = options.sessionExpired ?? false;
    this.status = options.status;
  }
}

/** O RHID devolve 400 com "DoLoginExpirTok" quando o token expirou. */
export function isExpiredTokenError(status: number, body: string): boolean {
  if (status === 401) return true;
  return status === 400 && body.includes("DoLoginExpirTok");
}

// ---------------------------------------------------------------------------
// Datas
// ---------------------------------------------------------------------------

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

/** "2026-01-14" -> "20260114" (formato aceito pelo RHID). */
export function formatDateForRhid(dateKey: string): string {
  assertDateKey(dateKey);
  return dateKey.replace(/-/g, "");
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

/** Instante (ms UTC) a partir de componentes de relógio de parede em Brasília. */
export function brtWallToInstant(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0
): number {
  return Date.UTC(year, month - 1, day, hour, minute, second) - BRT_OFFSET_MS;
}

/** Data civil (Brasília) de hoje para um instante de referência. */
export function todayDateKey(now = Date.now()): string {
  return toBrtDateKey(now);
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

/** Lista inclusiva de dias entre duas chaves de data. */
export function enumerateDateKeys(from: string, to: string): string[] {
  assertDateKey(from, "Data inicial");
  assertDateKey(to, "Data final");
  if (from > to) throw new Error("Data inicial posterior à data final");
  const days: string[] = [];
  let cursor = brtWallToInstant(
    Number(from.slice(0, 4)),
    Number(from.slice(5, 7)),
    Number(from.slice(8, 10)),
    12
  );
  const end = brtWallToInstant(
    Number(to.slice(0, 4)),
    Number(to.slice(5, 7)),
    Number(to.slice(8, 10)),
    12
  );
  while (cursor <= end) {
    days.push(toBrtDateKey(cursor));
    cursor += 24 * 60 * 60 * 1000;
  }
  return days;
}

export type ParsedPunchTime = {
  punchedAt: number;
  date: string;
  timeLabel: string;
};

function fromInstant(ms: number): ParsedPunchTime {
  return { punchedAt: ms, date: toBrtDateKey(ms), timeLabel: toBrtTimeLabel(ms) };
}

const ISO_WITH_ZONE_RE =
  /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/i;
const ISO_LOCAL_RE =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/;
const BR_LOCAL_RE =
  /^(\d{2})\/(\d{2})\/(\d{4})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/;
const DOTNET_DATE_RE = /^\/?Date\((-?\d+)(?:[+-]\d{4})?\)\/?$/;

function parseSingle(raw: string): ParsedPunchTime | null {
  const value = raw.trim();
  if (!value) return null;

  const dotnet = DOTNET_DATE_RE.exec(value);
  if (dotnet) return fromInstant(Number(dotnet[1]));

  if (ISO_WITH_ZONE_RE.test(value)) {
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? null : fromInstant(ms);
  }

  // Sem fuso: o RHID informa o horário local do relógio (Brasília).
  const isoLocal = ISO_LOCAL_RE.exec(value);
  if (isoLocal) {
    const [, y, mo, d, h, mi, s] = isoLocal;
    return fromInstant(
      brtWallToInstant(
        Number(y),
        Number(mo),
        Number(d),
        Number(h),
        Number(mi),
        Number(s ?? 0)
      )
    );
  }

  const brLocal = BR_LOCAL_RE.exec(value);
  if (brLocal) {
    const [, d, mo, y, h, mi, s] = brLocal;
    return fromInstant(
      brtWallToInstant(
        Number(y),
        Number(mo),
        Number(d),
        Number(h),
        Number(mi),
        Number(s ?? 0)
      )
    );
  }

  return null;
}

/**
 * Interpreta o horário de uma marcação. Datas sem fuso são tratadas como
 * relógio de parede em Brasília; com fuso (Z / ±HH:MM) são convertidas.
 * Usa `dateTimeStr` como alternativa quando `dateTime` não é reconhecido.
 */
export function parseRhidDateTime(
  dateTime: string | undefined | null,
  dateTimeStr?: string | null
): ParsedPunchTime | null {
  if (dateTime) {
    const parsed = parseSingle(dateTime);
    if (parsed) return parsed;
  }
  if (dateTimeStr) {
    const parsed = parseSingle(dateTimeStr);
    if (parsed) return parsed;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Normalização
// ---------------------------------------------------------------------------

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

/** CPF como 11 dígitos (o RHID às vezes manda número, perdendo zeros à esquerda). */
export function normalizeCpf(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  const digits = String(value).replace(/\D/g, "");
  if (!digits || /^0+$/.test(digits)) return undefined;
  if (digits.length > 11) return undefined;
  return digits.padStart(11, "0");
}

export function normalizePersonName(value: string): string {
  return normalizeText(value);
}

function coordinate(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value === 0) {
    return undefined;
  }
  return value;
}

function nonEmpty(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function readNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

export type NormalizedCheckIns = {
  punches: NormalizedPunch[];
  worksites: NormalizedWorksite[];
  people: NormalizedPerson[];
  /** Registros ignorados por não terem data reconhecível. */
  skipped: number;
};

/**
 * Transforma a resposta de `afd.svc/afd_mobile` em marcações por pessoa/dia,
 * com a posição no dia (0..n) e o tipo derivado dela.
 */
export function normalizeCheckIns(
  data: RhidEmployeeCheckIn[] | null | undefined
): NormalizedCheckIns {
  const punches: NormalizedPunch[] = [];
  const worksites = new Map<number, NormalizedWorksite>();
  const people = new Map<number, NormalizedPerson>();
  let skipped = 0;

  for (const entry of data ?? []) {
    const person = entry?.person;
    const records = entry?.listAfdMobilePerson;
    if (!person || !Array.isArray(records)) continue;
    const personId = readNumber(person.id);
    if (personId === undefined) continue;
    const personName = nonEmpty(person.name) ?? `Pessoa ${personId}`;

    people.set(personId, {
      rhidPersonId: personId,
      name: personName,
      cpf: normalizeCpf(person.cpf),
    });

    const parsed: Array<{ record: RhidAfdMobileRecord; time: ParsedPunchTime }> = [];
    for (const record of records) {
      if (!record || record.excluded) continue;
      const time = parseRhidDateTime(record.dateTime, record.dateTimeStr);
      if (!time) {
        skipped += 1;
        continue;
      }
      parsed.push({ record, time });
    }
    parsed.sort(
      (a, b) =>
        a.time.punchedAt - b.time.punchedAt || a.record.id - b.record.id
    );

    const byDate = new Map<string, number>();
    for (const { record, time } of parsed) {
      const sequence = byDate.get(time.date) ?? 0;
      byDate.set(time.date, sequence + 1);

      const geofence = record.geofence ?? undefined;
      const geofenceId =
        geofence && readNumber(geofence.id) !== undefined
          ? readNumber(geofence.id)
          : undefined;
      if (geofence && geofenceId !== undefined && !geofence.excluded) {
        const lat = readNumber(geofence.latitude);
        const lng = readNumber(geofence.longitude);
        if (lat !== undefined && lng !== undefined) {
          worksites.set(geofenceId, {
            rhidGeofenceId: geofenceId,
            name: nonEmpty(geofence.name) ?? `Obra ${geofenceId}`,
            latitude: lat,
            longitude: lng,
            radius: readNumber(geofence.radius) ?? 0,
          });
        }
      }

      punches.push({
        rhidRecordId: record.id,
        rhidPersonId: personId,
        personName,
        date: time.date,
        punchedAt: time.punchedAt,
        timeLabel: time.timeLabel,
        sequence,
        kind: punchKindForSequence(sequence),
        latitude: coordinate(record.latitude),
        longitude: coordinate(record.longitude),
        photoUrl: nonEmpty(record.photoURL),
        rhidGeofenceId: geofenceId,
        geofenceName: geofence ? nonEmpty(geofence.name) : undefined,
      });
    }
  }

  return {
    punches,
    worksites: Array.from(worksites.values()),
    people: Array.from(people.values()),
    skipped,
  };
}

/**
 * Normaliza o cadastro de pessoas ativas (`person.svc/a_status/ativo`). A API
 * varia o envelope (`{ data: [...] }` ou lista direta) e os nomes de campos.
 */
export function normalizeRoster(raw: unknown): NormalizedPerson[] {
  const list: unknown[] = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { data?: unknown }).data)
      ? ((raw as { data: unknown[] }).data)
      : [];

  const people = new Map<number, NormalizedPerson>();
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (row.excluded === true) continue;
    const id = readNumber(row.id);
    if (id === undefined) continue;
    const name =
      nonEmpty(row.name) ?? nonEmpty(row.Name) ?? nonEmpty(row.nome) ?? `Pessoa ${id}`;
    const department =
      nonEmpty(row.departmentName) ??
      nonEmpty(row.department) ??
      nonEmpty(row.departamento);
    people.set(id, {
      rhidPersonId: id,
      name,
      cpf: normalizeCpf(row.cpf ?? row.CPF ?? row.Cpf),
      department,
    });
  }
  return Array.from(people.values());
}

/** Resume as marcações por pessoa e dia (obra = primeira marcação do dia). */
export function summarizeDays(punches: NormalizedPunch[]): DaySummary[] {
  const summaries = new Map<string, DaySummary>();
  const sorted = [...punches].sort((a, b) => a.punchedAt - b.punchedAt);
  for (const punch of sorted) {
    const key = `${punch.rhidPersonId}|${punch.date}`;
    const existing = summaries.get(key);
    if (!existing) {
      summaries.set(key, {
        date: punch.date,
        rhidPersonId: punch.rhidPersonId,
        personName: punch.personName,
        rhidGeofenceId: punch.rhidGeofenceId,
        worksiteName: punch.geofenceName,
        firstPunchAt: punch.punchedAt,
        lastPunchAt: punch.punchedAt,
        lastKind: punch.kind,
        punchCount: 1,
      });
      continue;
    }
    existing.lastPunchAt = punch.punchedAt;
    existing.lastKind = punch.kind;
    existing.punchCount += 1;
    if (existing.rhidGeofenceId === undefined && punch.rhidGeofenceId !== undefined) {
      existing.rhidGeofenceId = punch.rhidGeofenceId;
      existing.worksiteName = punch.geofenceName;
    }
  }
  return Array.from(summaries.values());
}

// ---------------------------------------------------------------------------
// Situação "agora" (onde está cada pessoa / quem está em cada obra)
// ---------------------------------------------------------------------------

export type LiveStatus = "on_site" | "lunch" | "left" | "absent";

export const LIVE_STATUS_LABEL: Record<LiveStatus, string> = {
  on_site: "Na obra",
  lunch: "Em almoço",
  left: "Encerrou",
  absent: "Sem marcação",
};

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
    default:
      return "absent";
  }
}

export type LivePunchLike = {
  punchedAt: number;
  kind: PunchKind;
  rhidGeofenceId?: number;
  geofenceName?: string;
  latitude?: number;
  longitude?: number;
  photoUrl?: string;
};

export type LivePosition<P extends LivePunchLike> = {
  status: LiveStatus;
  last: P | null;
  /** Cerca da última marcação ou, na falta dela, da marcação mais recente com cerca. */
  worksiteId: number | undefined;
  worksiteName: string | undefined;
  /** `true` quando a própria última marcação caiu dentro da cerca informada. */
  locationExact: boolean;
};

/**
 * Posição atual de uma pessoa a partir das marcações do dia (ordenadas ou não).
 * Quem bateu fora de cerca mantém como referência a última obra conhecida,
 * sinalizando `locationExact: false`.
 */
export function derivePosition<P extends LivePunchLike>(punches: P[]): LivePosition<P> {
  if (punches.length === 0) {
    return {
      status: "absent",
      last: null,
      worksiteId: undefined,
      worksiteName: undefined,
      locationExact: false,
    };
  }
  const sorted = [...punches].sort((a, b) => a.punchedAt - b.punchedAt);
  const last = sorted[sorted.length - 1]!;
  const withFence = [...sorted].reverse().find((p) => p.rhidGeofenceId !== undefined);
  return {
    status: liveStatusForKind(last.kind),
    last,
    worksiteId: withFence?.rhidGeofenceId,
    worksiteName: withFence?.geofenceName,
    locationExact: last.rhidGeofenceId !== undefined,
  };
}

// ---------------------------------------------------------------------------
// Agregações (homem-dia)
// ---------------------------------------------------------------------------

export type ManDayInput = {
  date: string;
  rhidPersonId: number;
  personName: string;
  rhidGeofenceId?: number;
  worksiteName?: string;
};

export type ManDaysByPerson = {
  rhidPersonId: number;
  personName: string;
  totalDays: number;
  worksites: Array<{ rhidGeofenceId?: number; worksiteName?: string; days: number }>;
};

export type ManDaysByWorksite = {
  rhidGeofenceId?: number;
  worksiteName?: string;
  totalManDays: number;
  uniquePeople: number;
  people: Array<{ rhidPersonId: number; personName: string; days: number }>;
};

export type ManDaysAggregate = {
  byPerson: ManDaysByPerson[];
  byWorksite: ManDaysByWorksite[];
  byDate: Array<{ date: string; presentCount: number }>;
  totalManDays: number;
  uniquePeople: number;
  uniqueWorksites: number;
};

const NO_WORKSITE_KEY = -1;

/** Cada pessoa conta no máximo 1 homem-dia por data, atribuído à obra do dia. */
export function aggregateManDays(rows: ManDayInput[]): ManDaysAggregate {
  const perPersonDate = new Map<string, ManDayInput>();
  for (const row of rows) {
    const key = `${row.rhidPersonId}|${row.date}`;
    if (!perPersonDate.has(key)) perPersonDate.set(key, row);
  }

  const people = new Map<
    number,
    { personName: string; worksites: Map<number, { worksiteName?: string; days: number }> }
  >();
  const worksites = new Map<
    number,
    { worksiteName?: string; people: Map<number, { personName: string; days: number }> }
  >();
  const dates = new Map<string, number>();

  for (const row of perPersonDate.values()) {
    const wsKey = row.rhidGeofenceId ?? NO_WORKSITE_KEY;

    const person = people.get(row.rhidPersonId) ?? {
      personName: row.personName,
      worksites: new Map(),
    };
    const personWs = person.worksites.get(wsKey) ?? {
      worksiteName: row.worksiteName,
      days: 0,
    };
    personWs.days += 1;
    person.worksites.set(wsKey, personWs);
    people.set(row.rhidPersonId, person);

    const worksite = worksites.get(wsKey) ?? {
      worksiteName: row.worksiteName,
      people: new Map(),
    };
    const wsPerson = worksite.people.get(row.rhidPersonId) ?? {
      personName: row.personName,
      days: 0,
    };
    wsPerson.days += 1;
    worksite.people.set(row.rhidPersonId, wsPerson);
    worksites.set(wsKey, worksite);

    dates.set(row.date, (dates.get(row.date) ?? 0) + 1);
  }

  const byPerson: ManDaysByPerson[] = Array.from(people.entries())
    .map(([rhidPersonId, data]) => {
      const ws = Array.from(data.worksites.entries())
        .map(([wsKey, value]) => ({
          rhidGeofenceId: wsKey === NO_WORKSITE_KEY ? undefined : wsKey,
          worksiteName: value.worksiteName,
          days: value.days,
        }))
        .sort((a, b) => b.days - a.days);
      return {
        rhidPersonId,
        personName: data.personName,
        totalDays: ws.reduce((sum, item) => sum + item.days, 0),
        worksites: ws,
      };
    })
    .sort(
      (a, b) =>
        b.totalDays - a.totalDays || a.personName.localeCompare(b.personName, "pt-BR")
    );

  const byWorksite: ManDaysByWorksite[] = Array.from(worksites.entries())
    .map(([wsKey, data]) => {
      const list = Array.from(data.people.entries())
        .map(([rhidPersonId, value]) => ({
          rhidPersonId,
          personName: value.personName,
          days: value.days,
        }))
        .sort(
          (a, b) =>
            b.days - a.days || a.personName.localeCompare(b.personName, "pt-BR")
        );
      return {
        rhidGeofenceId: wsKey === NO_WORKSITE_KEY ? undefined : wsKey,
        worksiteName: data.worksiteName,
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
    byWorksite,
    byDate,
    totalManDays: perPersonDate.size,
    uniquePeople: people.size,
    uniqueWorksites: Array.from(worksites.keys()).filter((key) => key !== NO_WORKSITE_KEY)
      .length,
  };
}

// ---------------------------------------------------------------------------
// HTTP (usado pela action de sincronização)
// ---------------------------------------------------------------------------

async function readBody(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

/** Autentica no RHID e devolve o access token. */
export async function rhidLogin(email: string, password: string): Promise<string> {
  let response: Response;
  try {
    response = await fetch(`${RHID_BASE_URL}/login.svc/`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ domain: null, email, password }),
    });
  } catch (error) {
    throw new RhidError(
      `Falha de conexão com o RHID: ${error instanceof Error ? error.message : "erro desconhecido"}`
    );
  }
  if (!response.ok) {
    throw new RhidError(
      response.status === 400 || response.status === 401
        ? "Credenciais do RHID inválidas"
        : `RHID respondeu ${response.status} no login`,
      { status: response.status }
    );
  }
  const data = (await response.json()) as RhidLoginResponse;
  const token = nonEmpty(data?.accessToken);
  if (!token) throw new RhidError("RHID não devolveu o token de acesso");
  return token;
}

export type RhidFetchOptions = {
  method?: "GET" | "POST";
  body?: unknown;
  /** Usa a base `customerdb` (pessoas, marcações). Padrão: true. */
  customerDb?: boolean;
};

/** Chamada autenticada ao RHID; lança `RhidError` (com `sessionExpired`) em erro. */
export async function rhidFetch<T>(
  token: string,
  endpoint: string,
  options: RhidFetchOptions = {}
): Promise<T> {
  const base = options.customerDb === false ? RHID_BASE_URL : RHID_CUSTOMERDB_URL;
  let response: Response;
  try {
    response = await fetch(`${base}${endpoint}`, {
      method: options.method ?? "GET",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        authorization: `Bearer ${token}`,
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch (error) {
    throw new RhidError(
      `Falha de conexão com o RHID: ${error instanceof Error ? error.message : "erro desconhecido"}`
    );
  }
  if (!response.ok) {
    const text = await readBody(response);
    if (isExpiredTokenError(response.status, text)) {
      throw new RhidError("Sessão do RHID expirada", {
        sessionExpired: true,
        status: response.status,
      });
    }
    throw new RhidError(
      `RHID respondeu ${response.status} em ${endpoint}: ${text.slice(0, 200)}`,
      { status: response.status }
    );
  }
  return (await response.json()) as T;
}

export async function fetchRoster(token: string): Promise<NormalizedPerson[]> {
  const raw = await rhidFetch<unknown>(token, "/person.svc/a_status/ativo");
  return normalizeRoster(raw);
}

export async function fetchCheckIns(
  token: string,
  range: { from: string; to: string },
  companyId = RHID_DEFAULT_COMPANY_ID
): Promise<NormalizedCheckIns> {
  const data = await rhidFetch<RhidEmployeeCheckIn[]>(token, "/afd.svc/afd_mobile", {
    method: "POST",
    body: {
      listPeople: [],
      listCompanies: [companyId],
      listDepartments: [],
      ini: formatDateForRhid(range.from),
      fim: formatDateForRhid(range.to),
      status: 0,
      fotos: true,
    },
  });
  return normalizeCheckIns(data);
}
