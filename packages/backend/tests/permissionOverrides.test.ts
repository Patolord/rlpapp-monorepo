import { describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { setup, withUser } from "./helpers";

type TestConvex = ReturnType<typeof setup>;

async function seedProject(
  t: TestConvex,
  name: string,
  technicianIds: Id<"users">[] = []
): Promise<Id<"projects">> {
  return await t.run(async (ctx) =>
    ctx.db.insert("projects", {
      name,
      slug: name.toLowerCase().replace(/\s+/g, "-"),
      floors: [],
      technicianIds: technicianIds.length > 0 ? technicianIds : undefined,
      createdAt: Date.now(),
    })
  );
}

async function userId(t: TestConvex, clerkId: string): Promise<Id<"users">> {
  const user = await t.run(async (ctx) =>
    ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", clerkId))
      .first()
  );
  if (!user) throw new Error(`usuário ${clerkId} não encontrado`);
  return user._id;
}

describe("ajustes individuais de permissão", () => {
  test("técnico com medições ganha só essa funcionalidade do escritório", async () => {
    const t = setup();
    const projectId = await seedProject(t, "Obra Medições");
    const asTech = await withUser(t, {
      clerkId: "tec1",
      roles: ["qr_operator"],
      permissionGrants: ["medicoes.read"],
    });

    const me = await asTech.query(api.users.getCurrentUser, {});
    expect(me?.isStaff).toBe(false);
    expect(me?.homeArea).toBe("qr-operador");
    expect(me?.permissions).toEqual(["obras.read", "medicoes.read"]);
    expect(me?.permissionGrants).toEqual(["medicoes.read"]);

    await expect(
      asTech.query(api.medicoes.listMedicoes, { projectId })
    ).resolves.toEqual([]);
    await expect(asTech.query(api.contracts.list, {})).rejects.toThrow(
      "contratos.read"
    );
  });

  test("engenheiro sem contratos continua com o resto da engenharia", async () => {
    const t = setup();
    const projectId = await seedProject(t, "Obra Restrita");
    const asJunior = await withUser(t, {
      clerkId: "eng-jr",
      roles: ["engenheiro"],
      permissionDenials: ["contratos.read", "obras.gestao"],
    });

    await expect(asJunior.query(api.contracts.list, {})).rejects.toThrow(
      "contratos.read"
    );
    await expect(
      asJunior.mutation(api.projects.archive, { projectId })
    ).rejects.toThrow("obras.gestao");
    await expect(
      asJunior.query(api.medicoes.listMedicoes, { projectId })
    ).resolves.toEqual([]);
    const projects = await asJunior.query(api.projects.list, {});
    expect(projects.map((p) => p._id)).toContain(projectId);
  });

  test("técnico líder (campo.todas_obras) vê todas as obras no campo", async () => {
    const t = setup();
    await withUser(t, { clerkId: "tec-a", roles: ["qr_operator"] });
    const techA = await userId(t, "tec-a");
    const assigned = await seedProject(t, "Obra Atribuída", [techA]);
    const other = await seedProject(t, "Obra Outra");

    const asTech = t.withIdentity({ subject: "tec-a" });
    const mine = await asTech.query(api.technicianPortal.listMyProjects, {});
    expect(mine.map((p) => p._id)).toEqual([assigned]);

    const asLeader = await withUser(t, {
      clerkId: "lider",
      roles: ["qr_operator"],
      permissionGrants: ["campo.todas_obras"],
    });
    const all = await asLeader.query(api.technicianPortal.listMyProjects, {});
    expect(all.map((p) => p._id).sort()).toEqual([assigned, other].sort());
    // Continua fora do escritório.
    await expect(asLeader.query(api.projects.list, {})).rejects.toThrow("obras.read");
  });

  test("users.update grava só o que difere do acesso e reavalia ao trocar o acesso", async () => {
    const t = setup();
    const asAdmin = await withUser(t, { clerkId: "adm", roles: ["admin"] });
    await withUser(t, { clerkId: "alvo", roles: ["engenharia"] });
    const target = await userId(t, "alvo");

    await asAdmin.mutation(api.users.update, {
      id: target,
      // obras.read já vem do acesso; rh.ponto.read é avulsa; folha não vem do
      // acesso, então a retirada não tem efeito e é descartada.
      permissionGrants: ["obras.read", "rh.ponto.read"],
      permissionDenials: ["contratos.write", "rh.folha.read"],
    });
    let stored = await t.run(async (ctx) => ctx.db.get("users", target));
    expect(stored?.permissionGrants).toEqual(["rh.ponto.read"]);
    expect(stored?.permissionDenials).toEqual(["contratos.write"]);

    const asTarget = t.withIdentity({ subject: "alvo" });
    const me = await asTarget.query(api.users.getCurrentUser, {});
    expect(me?.permissions).toContain("rh.ponto.read");
    expect(me?.permissions).toContain("rh.funcionarios.read");
    expect(me?.permissions).toContain("contratos.read");
    expect(me?.permissions).not.toContain("contratos.write");

    // Ao virar RH, rh.ponto.read deixa de ser avulsa e contratos.write deixa
    // de ser retirada (o acesso novo nem dá).
    await asAdmin.mutation(api.users.update, { id: target, roles: ["rh"] });
    stored = await t.run(async (ctx) => ctx.db.get("users", target));
    expect(stored?.permissionGrants).toBeUndefined();
    expect(stored?.permissionDenials).toBeUndefined();
  });

  test("administrador não retira de si a gestão de usuários", async () => {
    const t = setup();
    const asAdmin = await withUser(t, { clerkId: "adm", roles: ["admin"] });
    const self = await userId(t, "adm");
    await expect(
      asAdmin.mutation(api.users.update, {
        id: self,
        permissionDenials: ["admin.manage"],
      })
    ).rejects.toThrow("Você não pode remover o próprio acesso de administração");
    await asAdmin.mutation(api.users.update, {
      id: self,
      permissionDenials: ["rh.folha.write"],
    });
    const me = await asAdmin.query(api.users.getCurrentUser, {});
    expect(me?.permissions).not.toContain("rh.folha.write");
    expect(me?.permissions).toContain("admin.manage");
  });

  test("auto-proteção olha a permissão efetiva, não só o acesso", async () => {
    const t = setup();
    // Gestão de usuários por ajuste individual, sem acesso de administração.
    const asLead = await withUser(t, {
      clerkId: "lider-compras",
      roles: ["compras"],
      permissionGrants: ["admin.manage"],
    });
    const self = await userId(t, "lider-compras");
    await asLead.mutation(api.users.update, { id: self, roles: ["compras", "rh"] });
    const me = await asLead.query(api.users.getCurrentUser, {});
    expect(me?.roles).toEqual(["compras", "rh"]);
    expect(me?.permissions).toContain("admin.manage");

    const asAdmin = await withUser(t, { clerkId: "adm2", roles: ["admin"] });
    const admin = await userId(t, "adm2");
    await expect(
      asAdmin.mutation(api.users.update, { id: admin, roles: ["compras"] })
    ).rejects.toThrow("Você não pode remover o próprio acesso de administração");
  });

  test("só quem administra usuários edita ajustes", async () => {
    const t = setup();
    const asEng = await withUser(t, { clerkId: "eng", roles: ["engenheiro"] });
    const self = await userId(t, "eng");
    await expect(
      asEng.mutation(api.users.update, { id: self, permissionGrants: ["admin.manage"] })
    ).rejects.toThrow("Insufficient permissions");
  });

  test("lista completa de usuários só para administração; seletor só com nome", async () => {
    const t = setup();
    await withUser(t, { clerkId: "tec-x", name: "Técnico X", email: "x@rlp.com", roles: ["qr_operator"] });
    const asEng = await withUser(t, { clerkId: "eng-x", roles: ["engenheiro"] });
    const asRh = await withUser(t, { clerkId: "rh-x", roles: ["rh"] });
    const asLeader = await withUser(t, {
      clerkId: "lider-x",
      roles: ["qr_operator"],
      permissionGrants: ["obras.gestao"],
    });
    const asAdmin = await withUser(t, { clerkId: "adm-x", roles: ["admin"] });

    for (const asUser of [asEng, asRh, asLeader]) {
      await expect(asUser.query(api.users.list, {})).rejects.toThrow("admin.manage");
    }
    const full = await asAdmin.query(api.users.list, { role: "qr_operator" });
    expect(full.find((u) => u.name === "Técnico X")?.email).toBe("x@rlp.com");

    // Quem atribui técnicos (obras.gestao) ou vincula funcionários (RH) vê só
    // nome e login.
    for (const asUser of [asEng, asLeader, asRh]) {
      const picker = await asUser.query(api.users.listForPicker, {
        onlyActive: true,
        role: "qr_operator",
      });
      const tech = picker.find((u) => u.name === "Técnico X");
      expect(tech).toBeDefined();
      expect(Object.keys(tech!).sort()).toEqual(["_id", "isActive", "name"]);
    }
    const asQr = t.withIdentity({ subject: "tec-x" });
    await expect(asQr.query(api.users.listForPicker, {})).rejects.toThrow("obras.gestao");
  });

  test("valores fora do catálogo gravados no documento são ignorados", async () => {
    const t = setup();
    const asOld = await withUser(t, {
      clerkId: "antigo",
      roles: ["rh"],
      permissionGrants: ["permissao.removida"],
    });
    const me = await asOld.query(api.users.getCurrentUser, {});
    expect(me?.permissionGrants).toEqual([]);
    expect(me?.permissions).not.toContain("permissao.removida");
  });
});
