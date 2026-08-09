import { describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { setup } from "./helpers";
import {
  assertEligibleForMedicao,
  assertValidCounterparty,
  normalizeServiceItems,
  sumServiceItemCents,
} from "../convex/lib/contracts/helpers";

describe("contract helpers", () => {
  test("assertValidCounterparty requires matching counterparty", () => {
    expect(() =>
      assertValidCounterparty({ direction: "client_sale" })
    ).toThrow("cliente");
    expect(() =>
      assertValidCounterparty({
        direction: "client_sale",
        customerId: "jd7abc" as Id<"customers">,
        contractorId: "jd7xyz" as Id<"contractors">,
      })
    ).toThrow("empreiteiro");
    expect(() =>
      assertValidCounterparty({ direction: "contractor_hire" })
    ).toThrow("empreiteiro");
    expect(() =>
      assertValidCounterparty({
        direction: "contractor_hire",
        customerId: "jd7abc" as Id<"customers">,
        contractorId: "jd7xyz" as Id<"contractors">,
      })
    ).toThrow("cliente");
  });

  test("normalizeServiceItems sums and validates", () => {
    expect(() => normalizeServiceItems([])).toThrow("ao menos um serviço");
    const items = normalizeServiceItems([
      { description: " Instalação ", valueCents: 10050.4 },
      { description: "Comissionamento", valueCents: 2000 },
    ]);
    expect(items).toEqual([
      { description: "Instalação", valueCents: 10050 },
      { description: "Comissionamento", valueCents: 2000 },
    ]);
    expect(sumServiceItemCents(items)).toBe(12050);
  });

  test("assertEligibleForMedicao allows only obra client sales", () => {
    expect(() =>
      assertEligibleForMedicao({
        direction: "contractor_hire",
        projectId: "p1" as Id<"projects">,
      } as never)
    ).toThrow("venda ao cliente");
    expect(() =>
      assertEligibleForMedicao({
        direction: "client_sale",
      } as never)
    ).toThrow("vinculados a uma obra");
  });
});

async function seedEngineering() {
  const t = setup();
  const ids = await t.run(async (ctx) => {
    const now = Date.now();
    await ctx.db.insert("users", {
      name: "Engenheiro",
      clerkId: "engineer-contracts",
      role: "engenheiro",
      department: "engenharia",
      isActive: true,
      createdAt: now,
    });
    const customerId = await ctx.db.insert("customers", {
      name: "Cliente Alpha",
      nameNormalized: "cliente alpha",
      active: true,
      createdAt: now,
    });
    const contractorId = await ctx.db.insert("contractors", {
      name: "Empreiteiro Beta",
      nameNormalized: "empreiteiro beta",
      active: true,
      createdAt: now,
    });
    const projectId = await ctx.db.insert("projects", {
      name: "Obra Teste",
      slug: "obra-teste",
      customerId,
      floors: [],
      createdAt: now,
    });
    return { customerId, contractorId, projectId };
  });

  return {
    t,
    engineer: t.withIdentity({ subject: "engineer-contracts" }),
    ...ids,
  };
}

describe("contracts API", () => {
  test("creates client sale and contractor hire with service totals", async () => {
    const { engineer, customerId, contractorId, projectId } =
      await seedEngineering();

    const clientContractId = await engineer.mutation(api.contracts.create, {
      title: "Contrato principal",
      direction: "client_sale",
      kind: "base",
      projectId,
      customerId,
      serviceItems: [
        { description: "Instalação VRF", valueCents: 100_000 },
        { description: "Startup", valueCents: 25_000 },
      ],
    });

    const hireContractId = await engineer.mutation(api.contracts.create, {
      title: "Contratação elétrica",
      direction: "contractor_hire",
      kind: "base",
      projectId,
      contractorId,
      serviceItems: [{ description: "Mão de obra", valueCents: 40_000 }],
    });

    const listed = await engineer.query(api.contracts.list, { projectId });
    expect(listed).toHaveLength(2);
    const client = listed.find((c) => c._id === clientContractId)!;
    const hire = listed.find((c) => c._id === hireContractId)!;
    expect(client.valueCents).toBe(125_000);
    expect(client.serviceItemCount).toBe(2);
    expect(hire.valueCents).toBe(40_000);
    expect(hire.direction).toBe("contractor_hire");
  });

  test("rejects medicoes on contractor contracts", async () => {
    const { engineer, contractorId, projectId } = await seedEngineering();

    const hireContractId = await engineer.mutation(api.contracts.create, {
      title: "Contratação",
      direction: "contractor_hire",
      kind: "base",
      projectId,
      contractorId,
      serviceItems: [{ description: "Serviço", valueCents: 10_000 }],
    });

    await expect(
      engineer.mutation(api.medicoes.createMedicao, {
        contractId: hireContractId,
        basis: "valor_fixo",
        amountCents: 1_000,
        referenceDate: Date.now(),
      })
    ).rejects.toThrow("venda ao cliente");
  });

  test("listContracts for medicoes only returns eligible client sales", async () => {
    const { engineer, customerId, contractorId, projectId } =
      await seedEngineering();

    await engineer.mutation(api.contracts.create, {
      title: "Venda",
      direction: "client_sale",
      kind: "base",
      projectId,
      customerId,
      serviceItems: [{ description: "Serviço", valueCents: 10_000 }],
    });
    await engineer.mutation(api.contracts.create, {
      title: "Contratação",
      direction: "contractor_hire",
      kind: "base",
      projectId,
      contractorId,
      serviceItems: [{ description: "Serviço", valueCents: 5_000 }],
    });

    const eligible = await engineer.query(api.medicoes.listContracts, {
      projectId,
    });
    expect(eligible).toHaveLength(1);
    expect(eligible[0]!.title).toBe("Venda");
  });

  test("addendum requires parent base contract", async () => {
    const { engineer, customerId, projectId } = await seedEngineering();

    const baseId = await engineer.mutation(api.contracts.create, {
      title: "Base",
      direction: "client_sale",
      kind: "base",
      projectId,
      customerId,
      serviceItems: [{ description: "Serviço", valueCents: 10_000 }],
    });

    await expect(
      engineer.mutation(api.contracts.create, {
        title: "Aditivo sem pai",
        direction: "client_sale",
        kind: "addendum",
        projectId,
        customerId,
        serviceItems: [{ description: "Extra", valueCents: 1_000 }],
      })
    ).rejects.toThrow("contrato base");

    const addendumId = await engineer.mutation(api.contracts.create, {
      title: "Aditivo 1",
      direction: "client_sale",
      kind: "addendum",
      projectId,
      customerId,
      parentContractId: baseId,
      serviceItems: [{ description: "Extra", valueCents: 1_000 }],
    });
    expect(addendumId).toBeTruthy();
  });

  test("archives contractor and blocks new contracts", async () => {
    const { engineer, contractorId, projectId } = await seedEngineering();

    await engineer.mutation(api.contractors.archive, { contractorId });

    await expect(
      engineer.mutation(api.contracts.create, {
        title: "Contratação",
        direction: "contractor_hire",
        kind: "base",
        projectId,
        contractorId,
        serviceItems: [{ description: "Serviço", valueCents: 1_000 }],
      })
    ).rejects.toThrow("arquivado");
  });
});
