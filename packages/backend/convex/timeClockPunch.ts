/**
 * Marcação de ponto pelo app RLP (substitui o REP-P mobile do RHID).
 *
 * O funcionário autenticado (usuário vinculado a `employees.userId`) registra
 * a marcação com foto e/ou localização; o servidor atribui o horário oficial,
 * o NSR, o hash do comprovante e classifica a posição contra as cercas das
 * obras. Nada aqui fala com o RHID.
 */

import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { authedMutation, authedQuery } from "./lib/rbac";
import {
  assertDateKey,
  toBrtDateKey,
  toBrtTimeLabel,
  type PunchKind,
} from "./lib/rh/rhid";
import {
  getPersonByEmployee,
  getPunchByClientId,
  getSettings,
  listAppPunchesForEmployeeDate,
  listRhidPunchesForPersonDate,
  listWorksites,
  nextNsr,
  recomputeDaySummary,
} from "./lib/rh/timeClockDb";
import {
  MAX_CLOCK_SKEW_MS,
  PHOTO_MAX_AGE_MS,
  buildPunchHash,
  classifyGeofence,
  isDuplicatePunch,
  nextSequence,
} from "./lib/rh/timeClockPunch";
import { timeClockGeofenceStatus, timeClockPunchKind } from "./schema";

/** Identificador do empregador que entra no hash do comprovante. */
const EMPLOYER_ID = "RLP ENGENHARIA";
/** Marcação offline pode chegar até 7 dias depois; o horário é o do aparelho. */
const MAX_OFFLINE_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** Tolerância para relógio do aparelho adiantado. */
const MAX_FUTURE_MS = 5 * 60 * 1000;

// ---------------------------------------------------------------------------
// Validadores
// ---------------------------------------------------------------------------

const employeeValidator = v.object({
  _id: v.id("employees"),
  name: v.string(),
  jobTitle: v.union(v.string(), v.null()),
});

const rulesValidator = v.object({
  photoRequired: v.boolean(),
  locationRequired: v.boolean(),
  duplicateWindowMinutes: v.number(),
});

const worksiteValidator = v.object({
  _id: v.id("rhidWorksites"),
  name: v.string(),
  latitude: v.number(),
  longitude: v.number(),
  radius: v.number(),
});

const punchValidator = v.object({
  _id: v.id("timeClockPunches"),
  source: v.union(v.literal("rhid"), v.literal("app")),
  date: v.string(),
  punchedAt: v.number(),
  timeLabel: v.string(),
  sequence: v.number(),
  kind: timeClockPunchKind,
  geofenceStatus: v.union(timeClockGeofenceStatus, v.null()),
  worksiteName: v.union(v.string(), v.null()),
  latitude: v.union(v.number(), v.null()),
  longitude: v.union(v.number(), v.null()),
  photoUrl: v.union(v.string(), v.null()),
  offline: v.boolean(),
  nsr: v.union(v.number(), v.null()),
  hash: v.union(v.string(), v.null()),
});

const receiptValidator = v.object({
  punchId: v.id("timeClockPunches"),
  employeeName: v.string(),
  date: v.string(),
  punchedAt: v.number(),
  timeLabel: v.string(),
  sequence: v.number(),
  kind: timeClockPunchKind,
  geofenceStatus: timeClockGeofenceStatus,
  worksiteName: v.union(v.string(), v.null()),
  nsr: v.number(),
  hash: v.string(),
  /** `true` quando o `clientPunchId` já existia (reenvio da fila offline). */
  duplicate: v.boolean(),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isActiveEmployee(employee: Doc<"employees"> | null): employee is Doc<"employees"> {
  return Boolean(employee && !employee.archivedAt && employee.status !== "terminated");
}

/**
 * Funcionário do usuário autenticado: vínculo explícito (`userId`) ou, na
 * falta dele, o funcionário ativo com o mesmo email. Em mutation, o vínculo
 * por email é gravado para as próximas chamadas.
 */
async function findEmployeeForUser(
  ctx: QueryCtx | MutationCtx,
  user: Doc<"users">
): Promise<Doc<"employees"> | null> {
  const linked = await ctx.db
    .query("employees")
    .withIndex("by_user", (q) => q.eq("userId", user._id))
    .take(5);
  const active = linked.find(isActiveEmployee);
  if (active) return active;

  const email = user.email?.trim();
  if (!email) return null;
  // Só funcionários ainda sem vínculo: um vínculo feito pelo RH para outro
  // usuário nunca é tomado pelo e-mail.
  const candidates = await ctx.db
    .query("employees")
    .withIndex("by_email", (q) => q.eq("email", email))
    .take(10);
  const byEmail = candidates.filter(
    (row) => isActiveEmployee(row) && row.userId === undefined
  );
  return byEmail.length === 1 ? byEmail[0]! : null;
}

async function resolveEmployee(
  ctx: MutationCtx,
  user: Doc<"users">
): Promise<Doc<"employees">> {
  const employee = await findEmployeeForUser(ctx, user);
  if (!employee) {
    throw new ConvexError(
      "Seu usuário não está vinculado a um funcionário. Peça ao RH para fazer o vínculo."
    );
  }
  if (employee.userId !== user._id) {
    await ctx.db.patch("employees", employee._id, {
      userId: user._id,
      updatedAt: Date.now(),
    });
  }
  return employee;
}

/** Marcações válidas (não excluídas) do funcionário no dia, app + espelho RHID. */
async function listEmployeeDayPunches(
  ctx: QueryCtx | MutationCtx,
  employeeId: Id<"employees">,
  rhidPersonId: number | undefined,
  date: string
): Promise<Doc<"timeClockPunches">[]> {
  const own = await listAppPunchesForEmployeeDate(ctx, employeeId, date);
  const seen = new Set(own.map((punch) => punch._id));
  const merged = [...own];
  if (rhidPersonId !== undefined) {
    for (const punch of await listRhidPunchesForPersonDate(ctx, rhidPersonId, date)) {
      if (!seen.has(punch._id)) merged.push(punch);
    }
  }
  return merged
    .filter((punch) => !punch.excluded)
    .sort((a, b) => a.punchedAt - b.punchedAt || a._creationTime - b._creationTime);
}

async function toPunchRow(ctx: QueryCtx, punch: Doc<"timeClockPunches">) {
  const photoUrl = punch.photoStorageId
    ? await ctx.storage.getUrl(punch.photoStorageId)
    : null;
  return {
    _id: punch._id,
    source: punch.source ?? ("rhid" as const),
    date: punch.date,
    punchedAt: punch.punchedAt,
    timeLabel: punch.timeLabel,
    sequence: punch.sequence,
    kind: punch.kind as PunchKind,
    geofenceStatus: punch.geofenceStatus ?? null,
    worksiteName: punch.geofenceName ?? null,
    latitude: punch.latitude ?? null,
    longitude: punch.longitude ?? null,
    photoUrl,
    offline: punch.offline ?? false,
    nsr: punch.nsr ?? null,
    hash: punch.hash ?? null,
  };
}

function receiptFor(punch: Doc<"timeClockPunches">, employeeName: string, duplicate: boolean) {
  return {
    punchId: punch._id,
    employeeName,
    date: punch.date,
    punchedAt: punch.punchedAt,
    timeLabel: punch.timeLabel,
    sequence: punch.sequence,
    kind: punch.kind as PunchKind,
    geofenceStatus: punch.geofenceStatus ?? ("not_controlled" as const),
    worksiteName: punch.geofenceName ?? null,
    nsr: punch.nsr ?? 0,
    hash: punch.hash ?? "",
    duplicate,
  };
}

function assertCoordinate(value: number, label: string, limit: number): void {
  if (!Number.isFinite(value) || Math.abs(value) > limit) {
    throw new ConvexError(`${label} inválida`);
  }
}

// ---------------------------------------------------------------------------
// API pública (qualquer usuário autenticado e ativo)
// ---------------------------------------------------------------------------

/** Tudo que a tela de marcação precisa: funcionário, regras, cercas e o dia. */
export const getContext = authedQuery({
  args: { date: v.string() },
  returns: v.object({
    employee: v.union(employeeValidator, v.null()),
    rules: rulesValidator,
    worksites: v.array(worksiteValidator),
    punches: v.array(punchValidator),
  }),
  handler: async (ctx, args) => {
    assertDateKey(args.date);
    const settings = await getSettings(ctx);
    const rules = {
      photoRequired: settings.photoRequired,
      locationRequired: settings.locationRequired,
      duplicateWindowMinutes: settings.duplicateWindowMinutes,
    };
    const worksites = (await listWorksites(ctx)).map((worksite) => ({
      _id: worksite._id,
      name: worksite.name,
      latitude: worksite.latitude,
      longitude: worksite.longitude,
      radius: worksite.radius,
    }));

    const employee = await findEmployeeForUser(ctx, ctx.user);
    if (!employee) {
      return { employee: null, rules, worksites, punches: [] };
    }
    const person = await getPersonByEmployee(ctx, employee._id);
    const punches = await listEmployeeDayPunches(
      ctx,
      employee._id,
      person?.rhidPersonId,
      args.date
    );
    const rows = [];
    for (const punch of punches) rows.push(await toPunchRow(ctx, punch));
    return {
      employee: {
        _id: employee._id,
        name: employee.name,
        jobTitle: employee.jobTitle ?? null,
      },
      rules,
      worksites,
      punches: rows,
    };
  },
});

/** Histórico das marcações do funcionário autenticado no período. */
export const myPunches = authedQuery({
  args: { from: v.string(), to: v.string() },
  returns: v.array(punchValidator),
  handler: async (ctx, args) => {
    assertDateKey(args.from, "Data inicial");
    assertDateKey(args.to, "Data final");
    if (args.from > args.to) throw new ConvexError("Período inválido");
    const employee = await findEmployeeForUser(ctx, ctx.user);
    if (!employee) return [];
    const employeeId = employee._id;

    const own = await ctx.db
      .query("timeClockPunches")
      .withIndex("by_employee_and_date", (q) =>
        q.eq("employeeId", employeeId).gte("date", args.from).lte("date", args.to)
      )
      .take(2000);
    const seen = new Set(own.map((punch) => punch._id));
    const merged = [...own];
    const person = await getPersonByEmployee(ctx, employeeId);
    if (person) {
      const rhidPersonId = person.rhidPersonId;
      const mirrored = await ctx.db
        .query("timeClockPunches")
        .withIndex("by_person_and_date", (q) =>
          q.eq("rhidPersonId", rhidPersonId).gte("date", args.from).lte("date", args.to)
        )
        .take(2000);
      for (const punch of mirrored) {
        if (!seen.has(punch._id)) merged.push(punch);
      }
    }
    const rows = [];
    for (const punch of merged
      .filter((punch) => !punch.excluded)
      .sort((a, b) => b.punchedAt - a.punchedAt)) {
      rows.push(await toPunchRow(ctx, punch));
    }
    return rows;
  },
});

/** URL de upload da foto da marcação (Convex Storage). */
export const generatePhotoUploadUrl = authedMutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => await ctx.storage.generateUploadUrl(),
});

/**
 * Registra uma marcação. Idempotente por `clientPunchId`: reenvios da fila
 * offline devolvem o comprovante já emitido.
 */
export const register = authedMutation({
  args: {
    clientPunchId: v.string(),
    /** Relógio do aparelho no toque em "Registrar ponto". */
    capturedAt: v.number(),
    latitude: v.optional(v.number()),
    longitude: v.optional(v.number()),
    accuracyMeters: v.optional(v.number()),
    photoStorageId: v.optional(v.id("_storage")),
    /** Quando a foto foi tirada (expira em 5 min, como no RHID). */
    photoCapturedAt: v.optional(v.number()),
    /** Marcação feita sem internet e enviada depois. */
    offline: v.optional(v.boolean()),
    deviceModel: v.optional(v.string()),
    appVersion: v.optional(v.string()),
  },
  returns: receiptValidator,
  handler: async (ctx, args) => {
    const clientPunchId = args.clientPunchId.trim();
    if (!clientPunchId || clientPunchId.length > 100) {
      throw new ConvexError("Identificador da marcação inválido");
    }

    const employee = await resolveEmployee(ctx, ctx.user);

    const existing = await getPunchByClientId(ctx, clientPunchId);
    if (existing) {
      if (existing.employeeId !== employee._id) {
        throw new ConvexError("Identificador da marcação já utilizado");
      }
      return receiptFor(existing, employee.name, true);
    }

    const settings = await getSettings(ctx);
    const now = Date.now();
    const offline = args.offline ?? false;

    // Horário oficial: o do servidor; offline, vale o do aparelho (com limites).
    if (!Number.isFinite(args.capturedAt)) {
      throw new ConvexError("Horário da marcação inválido");
    }
    if (args.capturedAt > now + MAX_FUTURE_MS) {
      throw new ConvexError("Relógio do aparelho está adiantado. Ajuste a hora e tente novamente.");
    }
    if (offline && now - args.capturedAt > MAX_OFFLINE_AGE_MS) {
      throw new ConvexError("Marcação offline antiga demais (mais de 7 dias). Fale com o RH.");
    }
    if (!offline && Math.abs(now - args.capturedAt) > MAX_CLOCK_SKEW_MS) {
      throw new ConvexError("Relógio do aparelho fora de sincronia. Ajuste a hora e tente novamente.");
    }
    const punchedAt = offline ? Math.min(args.capturedAt, now) : now;

    // Localização
    const hasPosition = args.latitude !== undefined && args.longitude !== undefined;
    if (hasPosition) {
      assertCoordinate(args.latitude!, "Latitude", 90);
      assertCoordinate(args.longitude!, "Longitude", 180);
    }
    if (settings.locationRequired && !hasPosition) {
      throw new ConvexError(
        "Não foi possível obter sua localização. Permita o acesso à localização e tente novamente."
      );
    }

    // Foto
    if (settings.photoRequired && !args.photoStorageId) {
      throw new ConvexError("Tire uma foto para registrar o ponto.");
    }
    if (args.photoStorageId) {
      const file = await ctx.db.system.get("_storage", args.photoStorageId);
      if (!file) throw new ConvexError("Foto não encontrada. Tire uma nova foto.");
      // A idade da foto conta do instante mais antigo conhecido: o upload
      // (autoritativo, do servidor) ou a captura informada pelo aparelho.
      const photoTakenAt = Math.min(file._creationTime, args.photoCapturedAt ?? Infinity);
      if (!offline && now - photoTakenAt > PHOTO_MAX_AGE_MS) {
        throw new ConvexError("Foto expirada, tire uma nova foto para registrar o ponto.");
      }
    }

    const person = await getPersonByEmployee(ctx, employee._id);
    const rhidPersonId = person?.rhidPersonId;
    const date = toBrtDateKey(punchedAt);
    const dayPunches = await listEmployeeDayPunches(ctx, employee._id, rhidPersonId, date);

    // Toque repetido
    const latest = dayPunches.reduce<number | null>(
      (max, punch) => (max === null || punch.punchedAt > max ? punch.punchedAt : max),
      null
    );
    if (
      !offline &&
      isDuplicatePunch(latest, punchedAt, settings.duplicateWindowMinutes)
    ) {
      throw new ConvexError(
        `Marcação repetida: aguarde ${settings.duplicateWindowMinutes} minuto(s) para registrar novamente.`
      );
    }

    // Posição no dia (marcação offline pode ser anterior às já gravadas)
    const earlier = dayPunches.filter((punch) => punch.punchedAt <= punchedAt).length;
    const { sequence, kind } = nextSequence(earlier);

    // Cerca
    const worksites = await listWorksites(ctx);
    const match = classifyGeofence(
      hasPosition ? { latitude: args.latitude!, longitude: args.longitude! } : null,
      worksites
    );

    // Comprovante
    const nsr = await nextNsr(ctx);
    const hash = buildPunchHash({
      nsr,
      employerId: EMPLOYER_ID,
      employeeId: employee._id,
      cpf: employee.cpfNormalized ?? employee.cpf ?? null,
      punchedAt,
    });

    const punchId = await ctx.db.insert("timeClockPunches", {
      source: "app",
      employeeId: employee._id,
      rhidPersonId,
      clientPunchId,
      personName: employee.name,
      date,
      punchedAt,
      timeLabel: toBrtTimeLabel(punchedAt),
      sequence,
      kind,
      latitude: hasPosition ? args.latitude : undefined,
      longitude: hasPosition ? args.longitude : undefined,
      accuracyMeters: args.accuracyMeters,
      photoStorageId: args.photoStorageId,
      worksiteId: match.worksite?._id,
      rhidGeofenceId: match.worksite?.rhidGeofenceId,
      geofenceName: match.worksite?.name,
      geofenceStatus: match.status,
      capturedAt: args.capturedAt,
      offline,
      deviceModel: args.deviceModel?.slice(0, 80),
      appVersion: args.appVersion?.slice(0, 40),
      nsr,
      hash,
      syncedAt: now,
    });

    // Marcação offline inserida "no meio" do dia: renumera as posteriores.
    if (earlier < dayPunches.length) {
      let next = sequence + 1;
      for (const punch of dayPunches.filter((item) => item.punchedAt > punchedAt)) {
        const renumbered = nextSequence(next);
        if (punch.sequence !== renumbered.sequence || punch.kind !== renumbered.kind) {
          await ctx.db.patch("timeClockPunches", punch._id, renumbered);
        }
        next += 1;
      }
    }

    if (rhidPersonId !== undefined) {
      await recomputeDaySummary(ctx, date, rhidPersonId, now);
    }

    const inserted = await ctx.db.get("timeClockPunches", punchId);
    if (!inserted) throw new ConvexError("Falha ao gravar a marcação");
    return receiptFor(inserted, employee.name, false);
  },
});
