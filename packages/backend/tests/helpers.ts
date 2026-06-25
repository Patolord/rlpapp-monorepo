import { convexTest } from "convex-test";
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
    await ctx.db.insert("users", {
      name: overrides.name ?? "Usuário Teste",
      email: overrides.email,
      clerkId: overrides.clerkId,
      role: overrides.role ?? "operator",
      department: overrides.department,
      isActive: overrides.isActive ?? true,
      createdAt: Date.now(),
    });
  });
  return t.withIdentity({ subject: overrides.clerkId });
}
