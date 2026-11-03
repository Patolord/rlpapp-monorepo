import { convexTest } from "convex-test";
import { rolesFromLegacy } from "@rlpapp/shared/auth/permissions";
import type { Doc } from "../convex/_generated/dataModel";
import schema from "../convex/schema";

export const modules = import.meta.glob([
  "../convex/**/*.ts",
  "../convex/**/*.js",
  "!../convex/**/*.d.ts",
]);

export function setup() {
  return convexTest(schema, modules);
}

type TestConvex = ReturnType<typeof setup>;

/** Insere um usuário e retorna o cliente autenticado como ele. */
export async function withUser(
  t: TestConvex,
  overrides: Partial<Doc<"users">> & { clerkId: string }
) {
  await t.run(async (ctx) => {
    // Fixtures informam `roles`, ou role + department (atalho legado, traduzido
    // na hora; o documento gravado só tem `roles`).
    await ctx.db.insert("users", {
      name: overrides.name ?? "Usuário Teste",
      email: overrides.email,
      clerkId: overrides.clerkId,
      roles:
        overrides.roles ??
        rolesFromLegacy(overrides.role ?? "operator", overrides.department),
      isActive: overrides.isActive ?? true,
      createdAt: Date.now(),
    });
  });
  return t.withIdentity({ subject: overrides.clerkId });
}
