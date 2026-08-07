import { v } from "convex/values";
import { STAFF_ROLES, authedQuery } from "./lib/rbac";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";

// Portal do técnico em campo: lista obras atribuídas (technicianIds) e os
// QRs/equipamentos de cada obra. Staff enxerga todas as obras.

function isStaff(user: Doc<"users">): boolean {
  return STAFF_ROLES.includes(user.role);
}

export async function assertTechnicianProjectAccess(
  ctx: QueryCtx,
  user: Doc<"users">,
  projectId: Id<"projects">
): Promise<Doc<"projects">> {
  const project = await ctx.db.get("projects", projectId);
  if (!project) throw new Error("Obra não encontrada");
  if (isStaff(user)) return project;
  const allowed = (project.technicianIds ?? []).includes(user._id);
  if (!allowed) throw new Error("Acesso negado a esta obra");
  return project;
}

export const listMyProjects = authedQuery({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("projects"),
      name: v.string(),
      client: v.union(v.string(), v.null()),
      address: v.union(v.string(), v.null()),
      status: v.union(v.string(), v.null()),
      qrCount: v.number(),
      registeredCount: v.number(),
    })
  ),
  handler: async (ctx) => {
    const staff = isStaff(ctx.user);
    const allProjects = await ctx.db.query("projects").collect();
    const visible = staff
      ? allProjects
      : allProjects.filter((p) =>
          (p.technicianIds ?? []).includes(ctx.user._id)
        );

    const out = [];
    for (const project of visible) {
      const qrCodes = await ctx.db
        .query("qrCodes")
        .withIndex("by_project", (q) => q.eq("projectId", project._id))
        .collect();
      const registeredCount = qrCodes.filter((q) => q.equipmentId).length;
      out.push({
        _id: project._id,
        name: project.name,
        client: project.client ?? null,
        address: project.address ?? null,
        status: project.status ?? null,
        qrCount: qrCodes.length,
        registeredCount,
      });
    }
    out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
  },
});

const qrRowValidator = v.object({
  _id: v.id("qrCodes"),
  token: v.string(),
  qrStatus: v.union(v.literal("active"), v.literal("inactive")),
  equipmentId: v.union(v.id("equipment"), v.null()),
  description: v.union(v.string(), v.null()),
  status: v.union(
    v.literal("installing"),
    v.literal("operational"),
    v.literal("warning"),
    v.literal("error"),
    v.null()
  ),
  ambiente: v.union(v.string(), v.null()),
  modelo: v.union(v.string(), v.null()),
});

export const listQrsByProject = authedQuery({
  args: { projectId: v.id("projects") },
  returns: v.array(qrRowValidator),
  handler: async (ctx, args) => {
    await assertTechnicianProjectAccess(ctx, ctx.user, args.projectId);

    const qrCodes = await ctx.db
      .query("qrCodes")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    const rows = await Promise.all(
      qrCodes.map(async (qr) => {
        const equipment = qr.equipmentId
          ? await ctx.db.get("equipment", qr.equipmentId)
          : null;
        const planned = equipment?.projectEquipmentId
          ? await ctx.db.get("projectEquipment", equipment.projectEquipmentId)
          : null;

        return {
          _id: qr._id,
          token: qr.token,
          qrStatus: qr.status,
          equipmentId: qr.equipmentId ?? null,
          description: equipment?.description ?? null,
          status: planned?.status ?? equipment?.status ?? null,
          ambiente: planned?.ambiente ?? null,
          modelo: planned?.modelo ?? null,
        };
      })
    );

    return rows.sort(
      (a, b) =>
        (a.ambiente ?? "").localeCompare(b.ambiente ?? "") ||
        a.token.localeCompare(b.token)
    );
  },
});
