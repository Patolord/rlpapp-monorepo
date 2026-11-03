import { describe, expect, it } from "vitest";
import {
  STAFF_GROUPS,
  STAFF_GROUP_LABELS,
  STAFF_GROUP_PAYROLL_DEFAULTS,
  baseSalaryLabel,
  isStaffGroup,
} from "../src/rh/staffGroups";

describe("staff groups", () => {
  it("covers every group with a label and payroll defaults", () => {
    for (const group of STAFF_GROUPS) {
      expect(STAFF_GROUP_LABELS[group]).toBeTruthy();
      expect(STAFF_GROUP_PAYROLL_DEFAULTS[group]).toBeDefined();
    }
  });

  it("only obra receives the food basket; diretoria has no vouchers", () => {
    expect(STAFF_GROUP_PAYROLL_DEFAULTS.obra.receivesFoodBasket).toBe(true);
    expect(STAFF_GROUP_PAYROLL_DEFAULTS.escritorio.receivesFoodBasket).toBe(false);
    expect(STAFF_GROUP_PAYROLL_DEFAULTS.escritorio.defaultTransportFoodDays).toBe(22);
    expect(STAFF_GROUP_PAYROLL_DEFAULTS.diretoria).toEqual({
      receivesFoodBasket: false,
      dailyTransitCents: 0,
      defaultTransportFoodDays: 0,
    });
  });

  it("names the fixed monthly amount per group", () => {
    expect(baseSalaryLabel("obra")).toBe("Salário base");
    expect(baseSalaryLabel("diretoria")).toBe("Pró-labore");
    expect(isStaffGroup("escritorio")).toBe(true);
    expect(isStaffGroup("fabrica")).toBe(false);
  });
});
