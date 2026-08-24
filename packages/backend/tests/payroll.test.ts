import { describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import { setup, withUser } from "./helpers";
import {
  computePayrollLine,
  formatPayrollRunLabel,
  loanStatus,
  previousMonth,
} from "../convex/lib/rh/payroll";

describe("payroll helpers", () => {
  test("computes total like the demo formula", () => {
    const computed = computePayrollLine(
      {
        earningsCents: 232_116,
        deductionsCents: 125_231,
        foodBasketEnabled: true,
        transportFoodDays: 22,
        dailyTransitCents: 2140,
        supplementCents: 60_000,
        thirteenthFirstCents: 0,
        thirteenthSecondCents: 0,
        manualLoanDeductionCents: 0,
      },
      { mealVoucherPerDayCents: 2500, foodBasketCents: 35_000 },
      0
    );
    expect(computed.mealVoucherCents).toBe(55_000);
    expect(computed.transitVoucherCents).toBe(47_080);
    expect(computed.foodBasketCents).toBe(35_000);
    expect(computed.totalPaymentCents).toBe(
      232_116 - 125_231 + 35_000 + 55_000 + 47_080 + 60_000
    );
  });

  test("includes 13th and subtracts scheduled loans", () => {
    const computed = computePayrollLine(
      {
        earningsCents: 100_000,
        deductionsCents: 10_000,
        foodBasketEnabled: false,
        transportFoodDays: 0,
        dailyTransitCents: 0,
        supplementCents: 0,
        thirteenthFirstCents: 50_000,
        thirteenthSecondCents: 25_000,
        manualLoanDeductionCents: 5_000,
      },
      { mealVoucherPerDayCents: 2500, foodBasketCents: 35_000 },
      20_000
    );
    expect(computed.foodBasketCents).toBe(0);
    expect(computed.totalLoanDeductionCents).toBe(25_000);
    expect(computed.totalPaymentCents).toBe(100_000 - 10_000 + 50_000 + 25_000 - 25_000);
  });

  test("loan status tracks installments across months", () => {
    const loan = {
      totalCents: 500_000,
      installmentCount: 5,
      installmentCents: 100_000,
      startYear: 2026,
      startMonth: 6,
    };
    const june = loanStatus(loan, 2026, 6);
    expect(june.dueCents).toBe(100_000);
    expect(june.paidCount).toBe(1);
    expect(june.outstandingCents).toBe(400_000);
    const october = loanStatus(loan, 2026, 10);
    expect(october.dueCents).toBe(100_000);
    expect(october.settled).toBe(true);
    expect(october.outstandingCents).toBe(0);
    const may = loanStatus(loan, 2026, 5);
    expect(may.dueCents).toBe(0);
    expect(may.paidCount).toBe(0);
  });

  test("formats competência labels", () => {
    expect(
      formatPayrollRunLabel({
        paymentDay: 5,
        paymentMonth: 8,
        year: 2026,
        referenceMonth: 7,
        referenceYear: 2026,
      })
    ).toBe("05 AGO · ref JUL");
    expect(
      formatPayrollRunLabel({
        paymentDay: 5,
        paymentMonth: 1,
        year: 2026,
        referenceMonth: 12,
        referenceYear: 2025,
      })
    ).toBe("05 JAN · ref DEZ/25");
    expect(previousMonth(2026, 1)).toEqual({ year: 2025, month: 12 });
  });
});

async function seedHr() {
  const t = setup();
  const hr = await withUser(t, {
    clerkId: "hr-user",
    name: "RH",
    role: "operator",
    department: "rh",
  });
  return { t, hr };
}

describe("payroll API", () => {
  test("creates a run from active employees and recomputes on parameters", async () => {
    const { hr } = await seedHr();
    await hr.mutation(api.employees.create, {
      name: "Caio Sousa Campos",
      baseSalaryCents: 232_116,
      dailyTransitCents: 2140,
      defaultTransportFoodDays: 22,
      receivesFoodBasket: true,
    });
    const runId = await hr.mutation(api.payroll.createRun, {
      year: 2026,
      paymentMonth: 8,
    });
    const workspace = await hr.query(api.payroll.getWorkspace, {
      year: 2026,
      paymentMonth: 8,
    });
    expect(workspace.run?._id).toBe(runId);
    expect(workspace.lines).toHaveLength(1);
    const line = workspace.lines[0]!;
    expect(line.mealVoucherCents).toBe(55_000);
    expect(line.earningsCents).toBe(232_116);

    await hr.mutation(api.payroll.updateRunParameters, {
      runId,
      mealVoucherPerDayCents: 3000,
    });
    const after = await hr.query(api.payroll.getWorkspace, {
      year: 2026,
      paymentMonth: 8,
    });
    expect(after.lines[0]?.mealVoucherCents).toBe(66_000);
  });

  test("clones previous month without copying paid state", async () => {
    const { hr } = await seedHr();
    await hr.mutation(api.employees.create, {
      name: "Fernanda Grunthal Monteiro",
      baseSalaryCents: 584_000,
    });
    await hr.mutation(api.payroll.createRun, {
      year: 2026,
      paymentMonth: 7,
    });
    const july = await hr.query(api.payroll.getWorkspace, {
      year: 2026,
      paymentMonth: 7,
    });
    await hr.mutation(api.payroll.togglePaid, {
      lineId: july.lines[0]!._id,
      paid: true,
    });
    await hr.mutation(api.payroll.createRun, {
      year: 2026,
      paymentMonth: 8,
    });
    const august = await hr.query(api.payroll.getWorkspace, {
      year: 2026,
      paymentMonth: 8,
    });
    expect(august.lines).toHaveLength(1);
    expect(august.lines[0]?.paid).toBe(false);
    expect(august.lines[0]?.name).toBe("Fernanda Grunthal Monteiro");
  });

  test("loan deduction hits draft months and closed runs reject edits", async () => {
    const { hr } = await seedHr();
    const employeeId = await hr.mutation(api.employees.create, {
      name: "Francisco José do Nascimento",
      baseSalaryCents: 341_167,
    });
    const runId = await hr.mutation(api.payroll.createRun, {
      year: 2026,
      paymentMonth: 8,
    });
    const loanId = await hr.mutation(api.payroll.createLoan, {
      employeeId,
      totalCents: 500_000,
      installmentCount: 5,
      installmentCents: 100_000,
      startYear: 2026,
      startMonth: 8,
    });
    const withLoan = await hr.query(api.payroll.getWorkspace, {
      year: 2026,
      paymentMonth: 8,
    });
    expect(withLoan.lines[0]?.scheduledLoanDeductionCents).toBe(100_000);
    expect(withLoan.kpis.activeLoanCount).toBe(1);

    await hr.mutation(api.payroll.closeRun, { runId });
    await hr.mutation(api.payroll.updateLoan, {
      loanId,
      installmentCents: 50_000,
    });
    const closedWorkspace = await hr.query(api.payroll.getWorkspace, {
      year: 2026,
      paymentMonth: 8,
    });
    expect(closedWorkspace.lines[0]?.scheduledLoanDeductionCents).toBe(100_000);
    await expect(
      hr.mutation(api.payroll.updateLine, {
        lineId: withLoan.lines[0]!._id,
        supplementCents: 10_000,
      })
    ).rejects.toThrow(/fechada/i);

    await hr.mutation(api.payroll.reopenRun, { runId });
    const reopened = await hr.query(api.payroll.getWorkspace, {
      year: 2026,
      paymentMonth: 8,
    });
    expect(reopened.run?.status).toBe("draft");
    expect(reopened.lines[0]?.scheduledLoanDeductionCents).toBe(50_000);
  });
});
