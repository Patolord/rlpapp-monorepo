import { z } from "zod";

/** Server-only boundary for the currently used RHiD web API. Never return tokens to clients. */
const RHID_BASE_URL = "https://rhid.com.br/v2";
const REQUEST_TIMEOUT_MS = 25_000;
export const RHID_TIME_ZONE = "America/Sao_Paulo";

export type RhidErrorKind = "authentication" | "transient" | "invalid_response";

export class RhidError extends Error {
  constructor(
    readonly kind: RhidErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "RhidError";
  }
}

export interface RhidEmployee {
  sourceId: string;
  rhidEmployeeId: number;
  sourceName: string;
  department?: string;
  active: boolean;
}

export interface RhidGeofence {
  sourceId: string;
  sourceName: string;
  latitude?: number;
  longitude?: number;
  radius?: number;
  excluded: boolean;
}

export interface RhidPunch {
  /** The vendor record ID is namespaced by the vendor person ID, not by the day. */
  sourceId: string;
  rhidEmployeeId: number;
  sourceName: string;
  occurredAt: number;
  sourceTimestamp: string;
  businessDate: string;
  latitude?: number;
  longitude?: number;
  geofenceSourceId?: string;
  excluded: boolean;
  approvalStatus?: number;
  rawType?: number;
  photoUrl?: string;
}

export interface FetchRhidDayInput {
  email: string;
  password: string;
  domain?: string;
  companyId: number;
  date: string;
  token?: string;
}

export interface RhidDay {
  token: string;
  employees: RhidEmployee[];
  geofences: RhidGeofence[];
  punches: RhidPunch[];
  coverage: "unverified" | "partial";
  warnings: string[];
}

const dateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: RHID_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const localFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: RHID_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

export function isBusinessDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1000 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const instant = new Date(Date.UTC(year, month - 1, day));
  return instant.toISOString().slice(0, 10) === value;
}

export function getBusinessDate(timestamp: number): string {
  if (!Number.isFinite(timestamp) || Number.isNaN(new Date(timestamp).getTime())) {
    throw new RhidError("invalid_response", "RHiD retornou uma data inválida.");
  }
  const parts = dateFormatter.formatToParts(timestamp);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** Calendar-day arithmetic; 'business' refers to the timezone, not weekdays. */
export function addBusinessDays(date: string, days: number): string {
  if (!isBusinessDate(date) || !Number.isSafeInteger(days)) {
    throw new RhidError("invalid_response", "Período de ponto inválido.");
  }
  const timestamp = Date.parse(`${date}T12:00:00Z`) + days * 86_400_000;
  if (!Number.isFinite(timestamp) || Number.isNaN(new Date(timestamp).getTime())) {
    throw new RhidError("invalid_response", "Período de ponto inválido.");
  }
  const result = new Date(timestamp).toISOString().slice(0, 10);
  if (!isBusinessDate(result)) throw new RhidError("invalid_response", "Período de ponto inválido.");
  return result;
}

export function businessDateRange(start: string, end: string): string[] {
  if (!isBusinessDate(start) || !isBusinessDate(end) || start > end) {
    throw new RhidError("invalid_response", "Período de ponto inválido.");
  }
  const dates: string[] = [];
  for (let date = start; date <= end; date = addBusinessDays(date, 1)) {
    if (dates.length >= 366) {
      throw new RhidError("invalid_response", "Selecione no máximo 366 dias de ponto.");
    }
    dates.push(date);
  }
  return dates;
}

function localWallClock(timestamp: number): number {
  const parts = localFormatter.formatToParts(timestamp);
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((item) => item.type === type)?.value);
  return Date.UTC(part("year"), part("month") - 1, part("day"), part("hour"), part("minute"), part("second"));
}

/** Explicit offsets win. Offsetless vendor timestamps are São Paulo wall time. */
export function parseRhidTimestamp(value: string): number {
  const match = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,7}))?(Z|[+-]\d{2}:?\d{2})?$/.exec(value);
  if (!match || !isBusinessDate(match[1])) {
    throw new RhidError("invalid_response", "RHiD retornou uma data de marcação inválida.");
  }
  const [, date, rawHour, rawMinute, rawSecond, fraction, offset] = match;
  const hour = Number(rawHour);
  const minute = Number(rawMinute);
  const second = Number(rawSecond);
  if (hour > 23 || minute > 59 || second > 59) {
    throw new RhidError("invalid_response", "RHiD retornou um horário de marcação inválido.");
  }
  const milliseconds = Number((fraction ?? "").padEnd(3, "0").slice(0, 3));
  const wall = Date.parse(`${date}T${rawHour}:${rawMinute}:${rawSecond}.000Z`);
  if (offset === "Z") return wall + milliseconds;
  if (offset) {
    const hours = Number(offset.slice(1, 3));
    const minutes = Number(offset.replace(":", "").slice(3, 5));
    if (hours > 14 || minutes > 59 || (hours === 14 && minutes !== 0)) {
      throw new RhidError("invalid_response", "RHiD retornou um fuso de marcação inválido.");
    }
    const direction = offset[0] === "+" ? 1 : -1;
    return wall - direction * (hours * 60 + minutes) * 60_000 + milliseconds;
  }

  // Resolve against IANA timezone rules rather than the host's timezone or a fixed -03:00.
  let candidate = wall;
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const correction = wall - localWallClock(candidate);
    if (correction === 0) break;
    candidate += correction;
  }
  if (localWallClock(candidate) !== wall) {
    throw new RhidError("invalid_response", "RHiD retornou um horário inexistente no fuso de São Paulo.");
  }
  // During historical DST fallbacks an offsetless wall time can refer to two instants.
  if (localWallClock(candidate - 3_600_000) === wall || localWallClock(candidate + 3_600_000) === wall) {
    throw new RhidError("invalid_response", "RHiD retornou um horário ambíguo sem fuso explícito.");
  }
  return candidate + milliseconds;
}

const sourceIdSchema = z.union([
  z.number().int().positive().safe(),
  z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().int().positive().safe()),
]);
const optionalStatus = z.number().int().finite().nullish();
const optionalString = z.string().nullish();
const optionalSourceId = sourceIdSchema.nullish();
const sourcePersonSchema = z.object({
  id: sourceIdSchema,
  name: optionalString,
  Name: optionalString,
  nome: optionalString,
  departmentName: optionalString,
  department: optionalString,
  companyId: optionalSourceId,
  idCompany: optionalSourceId,
  excluded: z.boolean().nullish(),
})
  .refine((person) => Boolean((person.name || person.Name || person.nome)?.trim()), "Nome ausente")
  .refine((person) => person.companyId == null || person.idCompany == null || person.companyId === person.idCompany, "Empresa inconsistente");

const sourceGeofenceSchema = z.object({
  id: sourceIdSchema,
  name: z.string().trim().min(1),
  latitude: z.number().min(-90).max(90).nullish(),
  longitude: z.number().min(-180).max(180).nullish(),
  radius: z.number().finite().nonnegative().nullish(),
  excluded: z.boolean().nullish(),
});

const sourcePunchSchema = z.object({
  id: sourceIdSchema,
  idPerson: optionalSourceId,
  companyId: optionalSourceId,
  dateTime: z.string().min(1),
  excluded: z.boolean(),
  Tipo: optionalStatus,
  approvalStatus: optionalStatus,
  latitude: z.number().min(-90).max(90).nullish(),
  longitude: z.number().min(-180).max(180).nullish(),
  // The source uses 0 for a missing geofence, unlike person and record IDs.
  idGeofence: z.union([sourceIdSchema, z.literal(0), z.literal("0")]).nullish(),
  geofence: sourceGeofenceSchema.nullish(),
  photoURL: optionalString,
});

const rosterSchema = z.object({ data: z.array(sourcePersonSchema) });
const attendanceSchema = z.array(z.object({
  person: sourcePersonSchema,
  listAfdMobilePerson: z.array(sourcePunchSchema),
}));

function validate<T>(schema: z.ZodType<T>, input: unknown, label: string): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    // Do not put vendor records, credentials, tokens, or raw error bodies in logs/errors.
    throw new RhidError("invalid_response", `Resposta inválida de RHiD (${label}). A publicação anterior foi preservada.`);
  }
  return result.data;
}

function normalizeEmployee(person: z.infer<typeof sourcePersonSchema>, active: boolean): RhidEmployee {
  const department = (person.departmentName || person.department)?.trim();
  return {
    sourceId: String(person.id),
    rhidEmployeeId: person.id,
    sourceName: (person.name || person.Name || person.nome)!.trim(),
    ...(department ? { department } : {}),
    active: active && person.excluded !== true,
  };
}

function normalizeGeofence(geofence: z.infer<typeof sourceGeofenceSchema>): RhidGeofence {
  return {
    sourceId: String(geofence.id),
    sourceName: geofence.name,
    ...(geofence.latitude != null ? { latitude: geofence.latitude } : {}),
    ...(geofence.longitude != null ? { longitude: geofence.longitude } : {}),
    ...(geofence.radius != null ? { radius: geofence.radius } : {}),
    excluded: geofence.excluded === true,
  };
}

/** No completeness marker is documented by this web endpoint. Successful is not verified. */
export function normalizeRhidDay(
  rosterResponse: unknown,
  attendanceResponse: unknown,
  companyId: number,
  date: string,
): Omit<RhidDay, "token"> {
  if (!isBusinessDate(date) || !Number.isSafeInteger(companyId) || companyId <= 0) {
    throw new RhidError("invalid_response", "Empresa ou data de sincronização inválida.");
  }
  const roster = validate(rosterSchema, rosterResponse, "funcionários");
  const attendance = validate(attendanceSchema, attendanceResponse, "marcações");
  const rosterEmployees = new Map<number, RhidEmployee>();
  const employees = new Map<number, RhidEmployee>();
  const geofences = new Map<string, RhidGeofence>();
  const punches = new Map<string, RhidPunch>();
  const warnings = new Set<string>();
  let partial = false;

  for (const person of roster.data) {
    const sourceCompany = person.companyId ?? person.idCompany;
    if (sourceCompany != null && sourceCompany !== companyId) continue;
    if (sourceCompany == null) {
      warnings.add("Funcionários sem empresa no cadastro só são incluídos quando aparecem nas marcações consultadas para esta empresa.");
    }
    const employee = normalizeEmployee(person, true);
    const previous = rosterEmployees.get(person.id);
    if (previous && JSON.stringify(previous) !== JSON.stringify(employee)) {
      throw new RhidError("invalid_response", "RHiD retornou cadastros conflitantes para um funcionário.");
    }
    rosterEmployees.set(person.id, employee);
    if (sourceCompany === companyId) employees.set(person.id, employee);
  }

  for (const group of attendance) {
    const sourceCompany = group.person.companyId ?? group.person.idCompany;
    if (sourceCompany != null && sourceCompany !== companyId) {
      partial = true;
      warnings.add("RHiD retornou registros de outra empresa; esses registros não foram importados.");
      continue;
    }
    for (const record of group.listAfdMobilePerson) {
      if (record.idPerson != null && record.idPerson !== group.person.id) {
        throw new RhidError("invalid_response", "RHiD retornou uma marcação vinculada ao funcionário incorreto.");
      }
      if (record.companyId != null && record.companyId !== companyId) {
        partial = true;
        warnings.add("RHiD retornou registros de outra empresa; esses registros não foram importados.");
        continue;
      }
      const occurredAt = parseRhidTimestamp(record.dateTime);
      const businessDate = getBusinessDate(occurredAt);
      if (businessDate !== date) {
        partial = true;
        warnings.add("RHiD retornou marcações fora do dia solicitado; reconcilie os dias adjacentes.");
        continue;
      }
      const employee = employees.get(group.person.id) ?? rosterEmployees.get(group.person.id) ?? normalizeEmployee(group.person, false);
      employees.set(group.person.id, employee);
      const referencedGeofenceId = record.idGeofence ? Number(record.idGeofence) : undefined;
      const geofenceId = record.geofence?.id ?? referencedGeofenceId;
      if (record.geofence && referencedGeofenceId && referencedGeofenceId !== record.geofence.id) {
        throw new RhidError("invalid_response", "RHiD retornou referências de geofence conflitantes.");
      }
      if (record.geofence) {
        const geofence = normalizeGeofence(record.geofence);
        const previous = geofences.get(geofence.sourceId);
        if (previous && JSON.stringify(previous) !== JSON.stringify(geofence)) {
          throw new RhidError("invalid_response", "RHiD retornou dados conflitantes para uma geofence.");
        }
        geofences.set(geofence.sourceId, geofence);
      }
      const photoUrl = record.photoURL?.trim();
      let validPhotoUrl: string | undefined;
      if (photoUrl) {
        try {
          const url = new URL(photoUrl);
          if (url.protocol === "https:" && !url.username && !url.password) validPhotoUrl = photoUrl;
        } catch { /* Optional unavailable photos never discard attendance evidence. */ }
        if (!validPhotoUrl) warnings.add("Uma foto indisponível foi omitida; a marcação foi preservada.");
      }
      const punch: RhidPunch = {
        sourceId: `${group.person.id}-${record.id}`,
        rhidEmployeeId: group.person.id,
        sourceName: employee.sourceName,
        occurredAt,
        sourceTimestamp: record.dateTime,
        businessDate,
        ...(record.latitude != null ? { latitude: record.latitude } : {}),
        ...(record.longitude != null ? { longitude: record.longitude } : {}),
        ...(geofenceId ? { geofenceSourceId: String(geofenceId) } : {}),
        excluded: record.excluded,
        ...(record.approvalStatus != null ? { approvalStatus: record.approvalStatus } : {}),
        ...(record.Tipo != null ? { rawType: record.Tipo } : {}),
        ...(validPhotoUrl ? { photoUrl: validPhotoUrl } : {}),
      };
      const previous = punches.get(punch.sourceId);
      if (previous && JSON.stringify(previous) !== JSON.stringify(punch)) {
        throw new RhidError("invalid_response", "RHiD retornou versões conflitantes de uma marcação.");
      }
      punches.set(punch.sourceId, punch);
    }
  }
  return {
    employees: [...employees.values()],
    geofences: [...geofences.values()],
    punches: [...punches.values()].sort((left, right) => left.occurredAt - right.occurredAt || left.sourceId.localeCompare(right.sourceId)),
    coverage: partial ? "partial" : "unverified",
    warnings: [...warnings],
  };
}

class ExpiredRhidToken extends Error {}

async function requestJson(path: string, options: RequestInit, login = false): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${RHID_BASE_URL}${path}`, {
      ...options,
      signal: controller.signal,
      cache: "no-store",
      redirect: "error",
    });
    if (!response.ok) {
      const errorText = await response.text();
      const expired = response.status === 401 || (response.status === 400 && errorText.includes("DoLoginExpirTok"));
      if (!login && expired) throw new ExpiredRhidToken();
      if (response.status === 429 || response.status === 408 || response.status >= 500) {
        throw new RhidError("transient", `RHiD temporariamente indisponível (HTTP ${response.status}).`);
      }
      if ((login && response.status >= 400 && response.status < 500) || response.status === 403) {
        throw new RhidError("authentication", "RHiD recusou o acesso. Confira as credenciais e permissões da integração.");
      }
      throw new RhidError("invalid_response", `RHiD recusou a consulta (HTTP ${response.status}).`);
    }
    try {
      return await response.json() as unknown;
    } catch {
      if (controller.signal.aborted) throw new RhidError("transient", "A consulta RHiD excedeu o tempo limite.");
      throw new RhidError("invalid_response", "RHiD retornou uma resposta que não é JSON válido.");
    }
  } catch (error) {
    if (error instanceof RhidError || error instanceof ExpiredRhidToken) throw error;
    throw new RhidError("transient", controller.signal.aborted
      ? "A consulta RHiD excedeu o tempo limite."
      : "Não foi possível conectar ao RHiD.");
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchRhidDay(input: FetchRhidDayInput): Promise<RhidDay> {
  if (!isBusinessDate(input.date) || !Number.isSafeInteger(input.companyId) || input.companyId <= 0) {
    throw new RhidError("invalid_response", "Empresa ou data de sincronização inválida.");
  }
  if (!input.email.trim() || !input.password) {
    throw new RhidError("authentication", "Configure as credenciais RHiD antes de sincronizar.");
  }
  const login = async () => {
    const response = await requestJson("/login.svc/", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ domain: input.domain || null, email: input.email, password: input.password }),
    }, true);
    const result = validate(z.object({
      accessToken: z.string().trim().min(1),
      expiredPassword: z.boolean().optional(),
    }), response, "autenticação");
    if (result.expiredPassword) {
      throw new RhidError("authentication", "A senha da integração RHiD expirou. Atualize as credenciais.");
    }
    return result.accessToken;
  };

  let token = input.token || await login();
  let renewed = false;
  const authenticatedRequest = async (path: string, body?: unknown): Promise<unknown> => {
    const perform = () => requestJson(`/customerdb${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", authorization: `Bearer ${token}` },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    try {
      return await perform();
    } catch (error) {
      if (!(error instanceof ExpiredRhidToken)) throw error;
      if (renewed) throw new RhidError("authentication", "RHiD recusou o token renovado. Confira as credenciais da integração.");
      renewed = true;
      token = await login();
      try {
        return await perform();
      } catch (retryError) {
        if (retryError instanceof ExpiredRhidToken) {
          throw new RhidError("authentication", "RHiD recusou o token renovado. Confira as credenciais da integração.");
        }
        throw retryError;
      }
    }
  };

  // Sequential calls keep one vendor request active and share a single token renewal budget.
  const roster = await authenticatedRequest("/person.svc/a_status/ativo");
  const date = input.date.replaceAll("-", "");
  const attendance = await authenticatedRequest("/afd.svc/afd_mobile", {
    listPeople: [],
    listCompanies: [input.companyId],
    listDepartments: [],
    ini: date,
    fim: date,
    status: 0,
    fotos: true,
  });
  return { token, ...normalizeRhidDay(roster, attendance, input.companyId, input.date) };
}
