/**
 * Ponto (RH): configuração do módulo. Cercas das obras, quem bate ponto pelo
 * app e regras da marcação. Usado por `convex/timeClock.ts`.
 *
 * Cada pessoa do ponto é um usuário do app com a permissão `ponto.registrar`;
 * cada local é uma obra cadastrada com cerca (`projects.geofence`).
 */

import { ConvexError } from "convex/values";
import { normalizePermissionOverrides, resolveRoles } from "@rlpapp/shared/auth/permissions";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { logAudit } from "../../lib/audit";
import { hasPermission } from "../../lib/rbac";
import { getSettings, loginOf, saveSettings } from "./timeClockDb";
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
};

export type SetClocksInInput = { userId: Id<"users">; enabled: boolean };

export type UpdateTimeClockSettingsInput = {
  manDayCostCents?: number;
  photoRequired?: boolean;
  locationRequired?: boolean;
  duplicateWindowMinutes?: number;
};

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
  return users
    .filter((user) => !resolveRoles(user).includes("client"))
    .map((user) => ({
      userId: user._id,
      name: user.name,
      login: loginOf(user),
      clocksIn: hasPermission(user, "ponto.registrar"),
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
