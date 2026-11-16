import { v } from "convex/values";
import {
  type Kit,
  type KitComponent,
  SEED_KITS,
  kitSlugId,
  normalizeKitSku,
} from "@rlpapp/shared/takeoff/kits";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { logAudit } from "../../lib/audit";
import { takeoffKitComponent, takeoffKitMode } from "../../schema/procurement";
import { notFound, ruleViolation } from "../../lib/domainErrors";

/**
 * Company defaults of the RLP Takeoff kit presets (`takeoffKits`), published to
 * the desktop app with the catalog. The app reads the shape of `Kit` from
 * @rlpapp/shared/takeoff/kits; `toTakeoffKit` is the only conversion.
 */

export const MAX_KIT_NAME = 120;
export const MAX_KIT_LABEL = 60;
export const MAX_KIT_COMPONENTS = 50;
export const MAX_COMPONENT_TEXT = 200;
export const MAX_COMPONENT_SKU = 40;

/** A kit as the app receives it (the `kits` list of the catalog response). */
export const takeoffKitValidator = v.object({
  id: v.string(),
  name: v.string(),
  mode: takeoffKitMode,
  label: v.union(v.string(), v.null()),
  components: v.array(
    v.object({
      name: v.string(),
      /** Purchasing catalog code (MAT-000123); null for a custom item. */
      sku: v.union(v.string(), v.null()),
      group: v.string(),
      system: v.union(v.string(), v.null()),
      kind: takeoffKitComponent.fields.kind,
      factor: v.number(),
    })
  ),
});

export type TakeoffKit = {
  id: string;
  name: string;
  mode: "linear" | "count";
  label: string | null;
  components: Array<{
    name: string;
    sku: string | null;
    group: string;
    system: string | null;
    kind: KitComponent["kind"];
    factor: number;
  }>;
};

/** A row for the dashboard: the stored document plus who touched it last. */
export const takeoffKitRowValidator = v.object({
  _id: v.id("takeoffKits"),
  key: v.string(),
  name: v.string(),
  mode: takeoffKitMode,
  label: v.union(v.string(), v.null()),
  components: v.array(takeoffKitComponent),
  sortOrder: v.number(),
  updatedAt: v.number(),
  updatedBy: v.union(v.string(), v.null()),
  /** True when the key is one of the app's factory presets. */
  factory: v.boolean(),
});

/** The fields the dashboard edits. */
export const takeoffKitInputValidator = v.object({
  name: v.string(),
  mode: takeoffKitMode,
  label: v.optional(v.string()),
  components: v.array(takeoffKitComponent),
});

export type TakeoffKitInput = {
  name: string;
  mode: "linear" | "count";
  label?: string;
  components: KitComponent[];
};

const FACTORY_KEYS = new Set(SEED_KITS.map((k) => k.id));
export const isFactoryKey = (key: string): boolean => FACTORY_KEYS.has(key);

export function toTakeoffKit(kit: Doc<"takeoffKits">): TakeoffKit {
  return {
    id: kit.key,
    name: kit.name,
    mode: kit.mode,
    label: kit.label ?? null,
    components: kit.components.map((c) => ({
      name: c.name,
      sku: c.sku ?? null,
      group: c.group,
      system: c.system ?? null,
      kind: c.kind,
      factor: c.factor,
    })),
  };
}

/** Every active kit in display order. */
export async function listActiveTakeoffKits(
  ctx: QueryCtx
): Promise<Doc<"takeoffKits">[]> {
  // eslint-disable-next-line @convex-dev/no-collect-in-query -- a company has a few dozen presets
  return await ctx.db
    .query("takeoffKits")
    .withIndex("by_active_sortOrder", (q) => q.eq("active", true))
    .collect();
}

/** The kits as published to the desktop app with the catalog. */
export async function listPublishedTakeoffKits(
  ctx: QueryCtx
): Promise<TakeoffKit[]> {
  return (await listActiveTakeoffKits(ctx)).map(toTakeoffKit);
}

/**
 * Validate and normalise what the dashboard sends: trimmed texts within size,
 * at least one component with a name, positive finite factors. Throws a
 * message in Portuguese for the form.
 */
export function sanitizeTakeoffKitInput(input: TakeoffKitInput): TakeoffKitInput {
  const name = input.name.trim();
  if (!name) throw ruleViolation("Informe o nome do kit");
  if (name.length > MAX_KIT_NAME) {
    throw ruleViolation(`Nome do kit com mais de ${MAX_KIT_NAME} caracteres`);
  }
  const label = input.label?.trim();
  if (label !== undefined && label.length > MAX_KIT_LABEL) {
    throw ruleViolation(`Rótulo com mais de ${MAX_KIT_LABEL} caracteres`);
  }
  const components: KitComponent[] = [];
  for (const c of input.components) {
    const cname = c.name.trim();
    if (!cname) continue;
    const group = c.group.trim() || "Geral";
    const system = c.system?.trim();
    if (
      cname.length > MAX_COMPONENT_TEXT ||
      group.length > MAX_COMPONENT_TEXT ||
      (system && system.length > MAX_COMPONENT_TEXT)
    ) {
      throw ruleViolation(`Texto de componente com mais de ${MAX_COMPONENT_TEXT} caracteres`);
    }
    if (!Number.isFinite(c.factor) || c.factor <= 0) {
      throw ruleViolation(`${cname}: o fator deve ser maior que zero`);
    }
    const sku = normalizeKitSku(c.sku);
    if (sku && sku.length > MAX_COMPONENT_SKU) {
      throw ruleViolation(`${cname}: código com mais de ${MAX_COMPONENT_SKU} caracteres`);
    }
    components.push({
      name: cname,
      ...(sku ? { sku } : {}),
      group,
      ...(system ? { system } : {}),
      kind: c.kind,
      factor: c.factor,
    });
  }
  if (components.length === 0) throw ruleViolation("O kit precisa de pelo menos um componente");
  if (components.length > MAX_KIT_COMPONENTS) {
    throw ruleViolation(`Kit com mais de ${MAX_KIT_COMPONENTS} componentes`);
  }
  return { name, mode: input.mode, ...(label ? { label } : {}), components };
}

async function findByKey(
  ctx: QueryCtx,
  key: string
): Promise<Doc<"takeoffKits"> | null> {
  return await ctx.db
    .query("takeoffKits")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
}

/** A key from the name that no kit (active or not) uses yet. */
export async function allocateKitKey(ctx: QueryCtx, name: string): Promise<string> {
  const base = kitSlugId(name) || "kit";
  if (!(await findByKey(ctx, base))) return base;
  for (let n = 2; n < 1000; n++) {
    const candidate = `${base}-${n}`;
    if (!(await findByKey(ctx, candidate))) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

async function nextSortOrder(ctx: QueryCtx): Promise<number> {
  const last = await ctx.db
    .query("takeoffKits")
    .withIndex("by_active_sortOrder", (q) => q.eq("active", true))
    .order("desc")
    .first();
  return (last?.sortOrder ?? 0) + 1;
}

/** Insert a new company default; returns its id. */
export async function insertTakeoffKit(
  ctx: MutationCtx,
  input: TakeoffKitInput,
  userId: Id<"users">,
  key?: string
): Promise<Id<"takeoffKits">> {
  const now = Date.now();
  return await ctx.db.insert("takeoffKits", {
    key: key ?? (await allocateKitKey(ctx, input.name)),
    name: input.name,
    mode: input.mode,
    ...(input.label !== undefined ? { label: input.label } : {}),
    components: input.components,
    sortOrder: await nextSortOrder(ctx),
    active: true,
    createdAt: now,
    updatedAt: now,
    updatedByUserId: userId,
  });
}

/** The factory presets no document (active or removed) carries: what seeding would add. */
export async function missingFactoryTakeoffKits(ctx: QueryCtx): Promise<number> {
  let missing = 0;
  for (const seed of SEED_KITS) {
    if (!(await findByKey(ctx, seed.id))) missing++;
  }
  return missing;
}

/**
 * Add the app's factory presets that the company does not have yet (by key);
 * an existing one, active or removed, is left alone so a team's edits and
 * removals stand. Returns how many were added.
 */
export async function seedFactoryTakeoffKits(
  ctx: MutationCtx,
  userId: Id<"users">
): Promise<number> {
  let added = 0;
  for (const seed of SEED_KITS as readonly Kit[]) {
    if (await findByKey(ctx, seed.id)) continue;
    await insertTakeoffKit(
      ctx,
      {
        name: seed.name,
        mode: seed.mode ?? "linear",
        ...(seed.label ? { label: seed.label } : {}),
        components: seed.components.map((c) => ({ ...c })),
      },
      userId,
      seed.id
    );
    added++;
  }
  return added;
}

/** Active kits in display order, with who changed each one last (`takeoffKits.list`). */
export async function listTakeoffKitRows(ctx: QueryCtx) {
  const kits = await listActiveTakeoffKits(ctx);
  const names = new Map<string, string | null>();
  const rows = [];
  for (const kit of kits) {
    let updatedBy: string | null = null;
    if (kit.updatedByUserId) {
      if (!names.has(kit.updatedByUserId)) {
        const user = await ctx.db.get("users", kit.updatedByUserId);
        names.set(kit.updatedByUserId, user?.name ?? null);
      }
      updatedBy = names.get(kit.updatedByUserId) ?? null;
    }
    rows.push({
      _id: kit._id,
      key: kit.key,
      name: kit.name,
      mode: kit.mode,
      label: kit.label ?? null,
      components: kit.components,
      sortOrder: kit.sortOrder,
      updatedAt: kit.updatedAt,
      updatedBy,
      factory: isFactoryKey(kit.key),
    });
  }
  return rows;
}

/** Creates (no `id`) or replaces (with `id`) a company kit, with its audit entry. */
export async function saveTakeoffKit(
  ctx: MutationCtx,
  user: Doc<"users">,
  id: Id<"takeoffKits"> | undefined,
  input: TakeoffKitInput
): Promise<Id<"takeoffKits">> {
  const clean = sanitizeTakeoffKitInput(input);
  if (id === undefined) {
    const kitId = await insertTakeoffKit(ctx, clean, user._id);
    await logAudit(ctx, user, {
      action: "create",
      tableName: "takeoffKits",
      recordId: kitId,
      entityLabel: clean.name,
      snapshotAfter: clean,
    });
    return kitId;
  }
  const existing = await ctx.db.get("takeoffKits", id);
  if (!existing || !existing.active) throw notFound("Kit não encontrado");
  await ctx.db.patch("takeoffKits", id, {
    name: clean.name,
    mode: clean.mode,
    label: clean.label,
    components: clean.components,
    updatedAt: Date.now(),
    updatedByUserId: user._id,
  });
  await logAudit(ctx, user, {
    action: "update",
    tableName: "takeoffKits",
    recordId: id,
    entityLabel: clean.name,
    snapshotBefore: {
      name: existing.name,
      mode: existing.mode,
      label: existing.label,
      components: existing.components,
    },
    snapshotAfter: clean,
  });
  return id;
}

/** Loads the factory kits the company lacks (by key), audited; returns how many were added. */
export async function seedTakeoffKitDefaults(
  ctx: MutationCtx,
  user: Doc<"users">
): Promise<number> {
  const added = await seedFactoryTakeoffKits(ctx, user._id);
  if (added > 0) {
    await logAudit(ctx, user, {
      action: "seed",
      tableName: "takeoffKits",
      recordId: "factory",
      details: `${added} kits de fábrica carregados`,
    });
  }
  return added;
}
