import { v } from "convex/values";
import type { TableNames } from "./_generated/dataModel";
import { internalQuery } from "./_generated/server";
import { isStaff, staffQuery } from "./lib/rbac";
import schema from "./schema";
import { buildCatalog, catalogEntryValidator } from "./mcp/catalog";

/** Catálogo completo, com `allowed` avaliado para o usuário atual. */
export const list = staffQuery({
  args: {},
  returns: v.array(catalogEntryValidator),
  handler: async (ctx) => buildCatalog(ctx.user),
});

/**
 * Catálogo avaliado para o dono de um token de agente, usado pelo gateway
 * HTTP (que autentica pelo token, não por identidade do Convex). `null`
 * quando o usuário não existe ou não é interno.
 */
export const listForUser = internalQuery({
  args: { userId: v.id("users") },
  returns: v.union(v.array(catalogEntryValidator), v.null()),
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get("users", userId);
    if (!user || !user.isActive || !isStaff(user)) return null;
    return buildCatalog(user);
  },
});

const SCHEMA_TABLES = Object.keys(schema.tables) as TableNames[];

/**
 * Confere se cada ID coletado por `validateArgs` (gateway/validate.ts)
 * pertence a uma das tabelas que o validador aceita. `normalizeId` só
 * decodifica a string (não lê documento), então é barato e cacheável. Para
 * uma divergência, informa a tabela real do ID, ou `null` quando a string
 * não é um ID deste deployment.
 */
export const checkIds = internalQuery({
  args: {
    ids: v.array(
      v.object({ field: v.string(), tables: v.array(v.string()), value: v.string() })
    ),
  },
  returns: v.array(
    v.object({
      field: v.string(),
      ok: v.boolean(),
      actualTable: v.union(v.string(), v.null()),
    })
  ),
  handler: async (ctx, args) => {
    return args.ids.map(({ field, tables, value }) => {
      const ok = tables.some(
        (table) => ctx.db.normalizeId(table as TableNames, value) !== null
      );
      if (ok) return { field, ok: true, actualTable: null };
      const actualTable =
        SCHEMA_TABLES.find((table) => ctx.db.normalizeId(table, value) !== null) ??
        null;
      return { field, ok: false, actualTable };
    });
  },
});
