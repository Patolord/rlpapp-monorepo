import { describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import { setup, withUser } from "./helpers";

async function seedHr() {
  const t = setup();
  const hr = await withUser(t, {
    clerkId: "hr-employees",
    name: "RH",
    role: "operator",
    department: "rh",
  });
  const engineer = await withUser(t, {
    clerkId: "eng-employees",
    name: "Eng",
    role: "engenheiro",
    department: "engenharia",
  });
  return { t, hr, engineer };
}

describe("employees API", () => {
  test("RH can create, update and archive employees", async () => {
    const { hr } = await seedHr();
    const employeeId = await hr.mutation(api.employees.create, {
      name: "Alan Pereira Ferreira",
      code: "125",
      jobTitle: "AJUDANTE GERAL",
      baseSalaryCents: 199_016,
      paymentMethod: "pix",
    });
    await hr.mutation(api.employees.update, {
      employeeId,
      jobTitle: "AJUD GERAL",
      status: "on_leave",
    });
    const listed = await hr.query(api.employees.list, {});
    expect(listed[0]?.jobTitle).toBe("AJUD GERAL");
    expect(listed[0]?.status).toBe("on_leave");

    await hr.mutation(api.employees.archive, { employeeId });
    const active = await hr.query(api.employees.list, {});
    expect(active).toHaveLength(0);
    const archived = await hr.query(api.employees.list, {
      includeArchived: true,
    });
    expect(archived[0]?.archivedAt).not.toBeNull();
  });

  test("blocks engenharia and duplicate identity", async () => {
    const { hr, engineer } = await seedHr();
    await hr.mutation(api.employees.create, {
      name: "Andrea Schil Pellegrini",
      cpf: "529.982.247-25",
    });
    await expect(
      engineer.query(api.employees.list, {})
    ).rejects.toThrow(/recursos humanos/i);
    await expect(
      hr.mutation(api.employees.create, { name: "Andrea Schil Pellegrini" })
    ).rejects.toThrow(/nome/i);
    await expect(
      hr.mutation(api.employees.create, {
        name: "Outra Pessoa",
        cpf: "52998224725",
      })
    ).rejects.toThrow(/CPF/i);
  });
});
