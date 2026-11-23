/**
 * Ponto (RH): configuração do módulo. Cercas das obras, quem bate ponto pelo
 * app e regras da marcação. Usado por `convex/timeClock.ts`.
 *
 * Cada pessoa do ponto é um usuário do app com a permissão `ponto.registrar`;
 * cada local é uma obra cadastrada com cerca (`projects.geofence`).
 */

import { ConvexError } from "convex/values";
import { normalizePermissionOverrides, resolveRoles } from "@rlpapp/shared/auth/permissions";
import {
  describeWorkSchedule,
  workScheduleError,
  type WorkSchedule,
} from "@rlpapp/shared/rh/pontoDay";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { logAudit } from "../../lib/audit";
import { hasPermission } from "../../lib/rbac";
import { getSettings, loginOf, saveSettings } from "./timeClockDb";
import { getUserScheduleOverride } from "./timeClockDay";
import {
  MAX_GEOFENCE_RADIUS_METERS,
  MIN_GEOFENCE_RADIUS_METERS,
} from "./timeClockPunch";

type ProjectGeofence = NonNullable<Doc<"projects">["geofence"]>;

export type TimeClockWorksite = {
  projectId: Id<"projects">;
  name: string;
  address: string | null;
  status: string | null;
  geofence: ProjectGeofence | null;
};

export type SetProjectGeofenceInput = {
  projectId: Id<"projects">;
  geofence: ProjectGeofence | null;
};

export type ClockPerson = {
  userId: Id<"users">;
  name: string;
  login: string | null;
  clocksIn: boolean;
  /** Jornada própria (sem ela, vale a da empresa). */
  schedule: WorkSchedule | null;
};

export type SetClocksInInput = { userId: Id<"users">; enabled: boolean };

export type UpdateTimeClockSettingsInput = {
  manDayCostCents?: number;
  photoRequired?: boolean;
  locationRequired?: boolean;
  duplicateWindowMinutes?: number;
  schedule?: WorkSchedule;
};

export type SetUserScheduleInput = { userId: Id<"users">; schedule: WorkSchedule | null };

// ---------------------------------------------------------------------------
// Cercas das obras
// ---------------------------------------------------------------------------

/** Obras ativas e a cerca do ponto de cada uma (sem cerca: `geofence` nulo). */
export async function listTimeClockWorksites(ctx: QueryCtx): Promise<TimeClockWorksite[]> {
  const projects = await ctx.db.query("projects").withIndex("by_name").take(1000);
  return projects
    .filter((project) => !project.archivedAt)
    .map((project) => ({
      projectId: project._id,
      name: project.name,
      address: project.address ?? null,
      status: project.status ?? null,
      geofence: project.geofence ?? null,
    }));
}

/** Define (ou remove, com `geofence: null`) a cerca do ponto de uma obra. */
export async function setProjectTimeClockGeofence(
  ctx: MutationCtx,
  user: Doc<"users">,
  input: SetProjectGeofenceInput
): Promise<void> {
  const project = await ctx.db.get("projects", input.projectId);
  if (!project) throw new ConvexError("Obra não encontrada");
  if (project.archivedAt) throw new ConvexError("Obra arquivada");
  let geofence: Doc<"projects">["geofence"];
  if (input.geofence) {
    const { latitude, longitude, radiusMeters } = input.geofence;
    if (!Number.isFinite(latitude) || Math.abs(latitude) > 90) {
      throw new ConvexError("Latitude inválida");
    }
    if (!Number.isFinite(longitude) || Math.abs(longitude) > 180) {
      throw new ConvexError("Longitude inválida");
    }
    if (
      !Number.isFinite(radiusMeters) ||
      radiusMeters < MIN_GEOFENCE_RADIUS_METERS ||
      radiusMeters > MAX_GEOFENCE_RADIUS_METERS
    ) {
      throw new ConvexError(
        `Raio inválido (de ${MIN_GEOFENCE_RADIUS_METERS} a ${MAX_GEOFENCE_RADIUS_METERS} m)`
      );
    }
    geofence = { latitude, longitude, radiusMeters: Math.round(radiusMeters) };
  }
  await ctx.db.patch("projects", project._id, { geofence });
  await logAudit(ctx, user, {
    action: "update",
    tableName: "projects",
    recordId: project._id,
    entityLabel: project.name,
    details: geofence ? "Cerca do ponto definida" : "Cerca do ponto removida",
    snapshotBefore: { geofence: project.geofence },
    snapshotAfter: { geofence },
  });
}

// ---------------------------------------------------------------------------
// Quem bate ponto
// ---------------------------------------------------------------------------

/** Usuários ativos e se cada um bate ponto pelo app. */
export async function listTimeClockPeople(ctx: QueryCtx): Promise<ClockPerson[]> {
  const users = await ctx.db
    .query("users")
    .withIndex("by_active", (q) => q.eq("isActive", true))
    .take(2000);
  const overrides = new Map(
    (await ctx.db.query("clockUserSchedules").take(2000)).map((row) => [row.userId, row.schedule])
  );
  return users
    .filter((user) => !resolveRoles(user).includes("client"))
    .map((user) => ({
      userId: user._id,
      name: user.name,
      login: loginOf(user),
      clocksIn: hasPermission(user, "ponto.registrar"),
      schedule: overrides.get(user._id) ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

/**
 * Libera ou retira a marcação de ponto de um usuário. Mexe só na permissão
 * `ponto.registrar` dos ajustes individuais (os demais acessos do usuário são
 * da administração, em Configurações → Usuários).
 */
export async function setUserClocksIn(
  ctx: MutationCtx,
  actor: Doc<"users">,
  input: SetClocksInInput
): Promise<void> {
  const user = await ctx.db.get("users", input.userId);
  if (!user) throw new ConvexError("Usuário não encontrado");
  if (!user.isActive && input.enabled) throw new ConvexError("Usuário inativo");
  const before = hasPermission(user, "ponto.registrar");
  if (before === input.enabled) return;

  const grants = (user.permissionGrants ?? []).filter((item) => item !== "ponto.registrar");
  const denials = (user.permissionDenials ?? []).filter((item) => item !== "ponto.registrar");
  if (input.enabled) grants.push("ponto.registrar");
  else denials.push("ponto.registrar");
  await ctx.db.patch(
    "users",
    user._id,
    normalizePermissionOverrides(resolveRoles(user), grants, denials)
  );
  await logAudit(ctx, actor, {
    action: "update",
    tableName: "users",
    recordId: user._id,
    entityLabel: user.name,
    details: input.enabled ? "Marcação de ponto liberada" : "Marcação de ponto retirada",
    snapshotBefore: {
      permissionGrants: user.permissionGrants,
      permissionDenials: user.permissionDenials,
    },
    snapshotAfter: { clocksIn: input.enabled },
  });
}

// ---------------------------------------------------------------------------
// Regras
// ---------------------------------------------------------------------------

export async function editTimeClockSettings(
  ctx: MutationCtx,
  user: Doc<"users">,
  input: UpdateTimeClockSettingsInput
): Promise<void> {
  const current = await getSettings(ctx);
  const next = { ...current };
  if (input.manDayCostCents !== undefined) {
    if (!Number.isFinite(input.manDayCostCents) || input.manDayCostCents < 0) {
      throw new ConvexError("Custo do homem-dia inválido");
    }
    next.manDayCostCents = Math.round(input.manDayCostCents);
  }
  if (input.photoRequired !== undefined) next.photoRequired = input.photoRequired;
  if (input.locationRequired !== undefined) next.locationRequired = input.locationRequired;
  if (input.duplicateWindowMinutes !== undefined) {
    if (
      !Number.isFinite(input.duplicateWindowMinutes) ||
      input.duplicateWindowMinutes < 0 ||
      input.duplicateWindowMinutes > 60
    ) {
      throw new ConvexError("Janela de marcação repetida inválida (0 a 60 min)");
    }
    next.duplicateWindowMinutes = input.duplicateWindowMinutes;
  }
  if (input.schedule !== undefined) {
    const error = workScheduleError(input.schedule);
    if (error) throw new ConvexError(error);
    next.schedule = { ...input.schedule };
  }
  await saveSettings(ctx, next, user._id);
  await logAudit(ctx, user, {
    action: "update",
    tableName: "clockSettings",
    recordId: "default",
    entityLabel: "Ponto",
    snapshotBefore: current,
    snapshotAfter: next,
  });
}

/**
 * Define (ou remove, com `schedule: null`) a jornada própria de uma pessoa.
 * Vale para a leitura dos dias dali em diante (os resumos já gravados são
 * recalculados na próxima marcação do dia).
 */
export async function setUserWorkSchedule(
  ctx: MutationCtx,
  actor: Doc<"users">,
  input: SetUserScheduleInput
): Promise<void> {
  const user = await ctx.db.get("users", input.userId);
  if (!user) throw new ConvexError("Usuário não encontrado");
  const current = await getUserScheduleOverride(ctx, user._id);
  if (input.schedule) {
    const error = workScheduleError(input.schedule);
    if (error) throw new ConvexError(error);
    const payload = { schedule: { ...input.schedule }, updatedAt: Date.now(), updatedByUserId: actor._id };
    if (current) await ctx.db.patch("clockUserSchedules", current._id, payload);
    else await ctx.db.insert("clockUserSchedules", { userId: user._id, ...payload });
  } else if (current) {
    await ctx.db.delete("clockUserSchedules", current._id);
  } else {
    return;
  }
  await logAudit(ctx, actor, {
    action: "update",
    tableName: "users",
    recordId: user._id,
    entityLabel: user.name,
    details: input.schedule
      ? `Jornada do ponto: ${describeWorkSchedule(input.schedule)}`
      : "Jornada do ponto: volta à da empresa",
    snapshotBefore: { schedule: current?.schedule ?? null },
    snapshotAfter: { schedule: input.schedule },
  });
}
