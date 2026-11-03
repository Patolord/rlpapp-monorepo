import { describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import { setup, withUser } from "./helpers";

async function seedHr() {
  const t = setup();
  const hr = await withUser(t, {
    clerkId: "hr-alimonies",
    name: "RH",
    role: "operator",
    department: "rh",
  });
  return { t, hr };
}

describe("pensão alimentícia", () => {
  test("enters the month as its own line and never touches the employee line", async () => {
    const { hr } = await seedHr();
    const jeferson = await hr.mutation(api.employees.create, {
      name: "Jeferson Magalhães Inocencio",
      baseSalaryCents: 341_167,
      receivesFoodBasket: true,
      dailyTransitCents: 2140,
      defaultTransportFoodDays: 22,
    });
    await hr.mutation(api.employees.create, {
      name: "Jean Lima Pereira",
      baseSalaryCents: 341_167,
    });
    const alimonyId = await hr.mutation(api.alimonies.create, {
      employeeId: jeferson,
      beneficiaryName: "Renata Santos",
      amountCents: 62_274,
      paymentMethod: "pix",
      pixKey: "renata@exemplo.com",
    });

    await hr.mutation(api.payroll.createRun, { year: 2026, paymentMonth: 8 });
    const august = await hr.query(api.payroll.getWorkspace, {
      year: 2026,
      paymentMonth: 8,
    });
    expect(august.lines).toHaveLength(2);
    expect(august.alimonyLines).toHaveLength(1);
    const line = august.alimonyLines[0]!;
    expect(line).toMatchObject({
      alimonyId,
      employeeId: jeferson,
      employeeName: "Jeferson Magalhães Inocencio",
      beneficiaryName: "Renata Santos",
      amountCents: 62_274,
      paymentMethod: "pix",
      pixKey: "renata@exemplo.com",
      paid: false,
    });
    expect(august.alimonyTotals).toEqual({
      count: 1,
      totalCents: 62_274,
      paidCount: 0,
      paidTotalCents: 0,
      pixTotalCents: 62_274,
    });

    // A linha do funcionário não muda por causa da pensão.
    const jefersonLine = august.lines.find((row) => row.employeeId === jeferson)!;
    const jeanLine = august.lines.find((row) => row.employeeId !== jeferson)!;
    expect(jefersonLine.deductionsCents).toBe(0);
    expect(jefersonLine.totalPaymentCents - jeanLine.totalPaymentCents).toBe(
      jefersonLine.mealVoucherCents +
        jefersonLine.transitVoucherCents +
        jefersonLine.foodBasketCents -
        jeanLine.mealVoucherCents -
        jeanLine.transitVoucherCents -
        jeanLine.foodBasketCents
    );
    expect(august.totals.totalPaymentCents).toBe(
      august.lines.reduce((sum, row) => sum + row.totalPaymentCents, 0)
    );
  });

  test("next month copies the month amount, not the cadastro default", async () => {
    const { hr } = await seedHr();
    const francisco = await hr.mutation(api.employees.create, {
      name: "Francisco José do Nascimento",
    });
    const alimonyId = await hr.mutation(api.alimonies.create, {
      employeeId: francisco,
      beneficiaryName: "Dulcineia",
      amountCents: 93_411,
    });
    await hr.mutation(api.payroll.createRun, { year: 2026, paymentMonth: 3 });
    const march = await hr.query(api.payroll.getWorkspace, {
      year: 2026,
      paymentMonth: 3,
    });
    const marchLine = march.alimonyLines[0]!;
    await hr.mutation(api.alimonies.updateLine, {
      lineId: marchLine._id,
      amountCents: 109_132,
      notes: "reajuste",
    });
    await hr.mutation(api.alimonies.toggleLinePaid, {
      lineId: marchLine._id,
      paid: true,
    });

    await hr.mutation(api.payroll.createRun, { year: 2026, paymentMonth: 4 });
    const april = await hr.query(api.payroll.getWorkspace, {
      year: 2026,
      paymentMonth: 4,
    });
    expect(april.alimonyLines).toHaveLength(1);
    expect(april.alimonyLines[0]).toMatchObject({
      alimonyId,
      amountCents: 109_132,
      notes: "reajuste",
      paid: false,
    });

    // Encerrar a pensão tira do rascunho e não entra nos meses seguintes.
    await hr.mutation(api.alimonies.archive, { alimonyId });
    const aprilAfter = await hr.query(api.payroll.getWorkspace, {
      year: 2026,
      paymentMonth: 4,
    });
    expect(aprilAfter.alimonyLines).toHaveLength(0);
    await hr.mutation(api.payroll.createRun, { year: 2026, paymentMonth: 5 });
    const may = await hr.query(api.payroll.getWorkspace, {
      year: 2026,
      paymentMonth: 5,
    });
    expect(may.alimonyLines).toHaveLength(0);
    // O mês pago fica como estava.
    const marchAfter = await hr.query(api.payroll.getWorkspace, {
      year: 2026,
      paymentMonth: 3,
    });
    expect(marchAfter.alimonyLines).toHaveLength(1);
    expect(marchAfter.alimonyLines[0]?.paid).toBe(true);
    const listed = await hr.query(api.alimonies.listForEmployee, {
      employeeId: francisco,
    });
    expect(listed).toHaveLength(0);
    const archived = await hr.query(api.alimonies.listForEmployee, {
      employeeId: francisco,
      includeArchived: true,
    });
    expect(archived[0]?.archivedAt).not.toBeNull();
  });

  test("cadastro created after the month opens joins the draft; closed runs reject edits", async () => {
    const { hr } = await seedHr();
    const employeeId = await hr.mutation(api.employees.create, {
      name: "Caio Sousa Campos",
    });
    const runId = await hr.mutation(api.payroll.createRun, {
      year: 2026,
      paymentMonth: 9,
    });
    const alimonyId = await hr.mutation(api.alimonies.create, {
      employeeId,
      beneficiaryName: "Maria",
      amountCents: 40_000,
      paymentMethod: "tbi",
    });
    const workspace = await hr.query(api.payroll.getWorkspace, {
      year: 2026,
      paymentMonth: 9,
    });
    expect(workspace.alimonyLines).toHaveLength(1);
    expect(workspace.availableAlimonies).toHaveLength(0);

    // Dados do cadastro vão para a linha em rascunho; o valor não.
    await hr.mutation(api.alimonies.update, {
      alimonyId,
      beneficiaryName: "Maria da Silva",
      paymentMethod: "pix",
      pixKey: "123",
      amountCents: 50_000,
    });
    const updated = await hr.query(api.payroll.getWorkspace, {
      year: 2026,
      paymentMonth: 9,
    });
    expect(updated.alimonyLines[0]).toMatchObject({
      beneficiaryName: "Maria da Silva",
      paymentMethod: "pix",
      pixKey: "123",
      amountCents: 40_000,
    });

    // Tirar só deste mês e incluir de volta.
    await hr.mutation(api.alimonies.removeLine, {
      lineId: updated.alimonyLines[0]!._id,
    });
    const removed = await hr.query(api.payroll.getWorkspace, {
      year: 2026,
      paymentMonth: 9,
    });
    expect(removed.alimonyLines).toHaveLength(0);
    expect(removed.availableAlimonies.map((row) => row._id)).toEqual([alimonyId]);
    await hr.mutation(api.alimonies.addToRun, { runId, alimonyId });
    const readded = await hr.query(api.payroll.getWorkspace, {
      year: 2026,
      paymentMonth: 9,
    });
    expect(readded.alimonyLines[0]?.amountCents).toBe(50_000);
    await expect(
      hr.mutation(api.alimonies.addToRun, { runId, alimonyId })
    ).rejects.toThrow(/já está/i);

    await hr.mutation(api.payroll.closeRun, { runId });
    await expect(
      hr.mutation(api.alimonies.updateLine, {
        lineId: readded.alimonyLines[0]!._id,
        amountCents: 1,
      })
    ).rejects.toThrow(/fechada/i);
    await expect(
      hr.mutation(api.alimonies.toggleLinePaid, {
        lineId: readded.alimonyLines[0]!._id,
        paid: true,
      })
    ).rejects.toThrow(/fechada/i);
  });
});
