import { describe, expect, it } from "vitest";
import {
  STAFF_GROUPS,
  STAFF_GROUP_LABELS,
  STAFF_GROUP_PAYROLL_DEFAULTS,
  isStaffGroup,
} from "../src/rh/staffGroups";

describe("staff groups", () => {
  it("covers every group with a label and payroll defaults", () => {
    for (const group of STAFF_GROUPS) {
      expect(STAFF_GROUP_LABELS[group]).toBeTruthy();
      expect(STAFF_GROUP_PAYROLL_DEFAULTS[group]).toBeDefined();
    }
  });

  it("everyone receives the food basket; diretoria has no vouchers", () => {
    for (const group of STAFF_GROUPS) {
      expect(STAFF_GROUP_PAYROLL_DEFAULTS[group].receivesFoodBasket).toBe(true);
    }
    expect(STAFF_GROUP_PAYROLL_DEFAULTS.obra).toEqual({
      receivesFoodBasket: true,
      dailyTransitCents: 2140,
      defaultTransportFoodDays: 22,
    });
    expect(STAFF_GROUP_PAYROLL_DEFAULTS.escritorio.defaultTransportFoodDays).toBe(22);
    expect(STAFF_GROUP_PAYROLL_DEFAULTS.diretoria).toEqual({
      receivesFoodBasket: true,
      dailyTransitCents: 0,
      defaultTransportFoodDays: 0,
    });
  });

  it("recognizes group ids", () => {
    expect(isStaffGroup("escritorio")).toBe(true);
    expect(isStaffGroup("fabrica")).toBe(false);
  });
});
