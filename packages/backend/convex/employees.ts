import { v } from "convex/values";
import {
  funcionariosMutation,
  funcionariosQuery,
} from "./lib/rbac";
import {
  archiveEmployee,
  createEmployee,
  listEmployees,
  restoreEmployee,
  toEmployeeRow,
  updateEmployee,
} from "./model/hr/employees";
import { employeePaymentMethod, employeeStaffGroup, employeeStatus } from "./schema/hr";

export const employeeValidator = v.object({
  _id: v.id("employees"),
  _creationTime: v.number(),
  code: v.union(v.string(), v.null()),
  name: v.string(),
  cpf: v.union(v.string(), v.null()),
  staffGroup: employeeStaffGroup,
  jobTitle: v.union(v.string(), v.null()),
  email: v.union(v.string(), v.null()),
  phone: v.union(v.string(), v.null()),
  hiredAt: v.union(v.number(), v.null()),
  notes: v.union(v.string(), v.null()),
  status: employeeStatus,
  archivedAt: v.union(v.number(), v.null()),
  paymentMethod: employeePaymentMethod,
  pixKey: v.union(v.string(), v.null()),
  baseSalaryCents: v.number(),
  receivesFoodBasket: v.boolean(),
  dailyTransitCents: v.number(),
  defaultTransportFoodDays: v.number(),
  createdAt: v.number(),
  updatedAt: v.union(v.number(), v.null()),
});

export const list = funcionariosQuery({
  args: {
    search: v.optional(v.string()),
    includeArchived: v.optional(v.boolean()),
    status: v.optional(employeeStatus),
    staffGroup: v.optional(employeeStaffGroup),
  },
  returns: v.array(employeeValidator),
  handler: async (ctx, args) => {
    return await listEmployees(ctx, args);
  },
});

export const get = funcionariosQuery({
  args: { employeeId: v.id("employees") },
  returns: v.union(employeeValidator, v.null()),
  handler: async (ctx, args) => {
    const employee = await ctx.db.get("employees", args.employeeId);
    return employee ? toEmployeeRow(employee) : null;
  },
});

export const create = funcionariosMutation({
  args: {
    code: v.optional(v.string()),
    name: v.string(),
    cpf: v.optional(v.string()),
    // Padrão: obra. Define os padrões de cesta, passagem e dias quando omitidos.
    staffGroup: v.optional(employeeStaffGroup),
    jobTitle: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    hiredAt: v.optional(v.number()),
    notes: v.optional(v.string()),
    status: v.optional(employeeStatus),
    paymentMethod: v.optional(employeePaymentMethod),
    pixKey: v.optional(v.string()),
    baseSalaryCents: v.optional(v.number()),
    receivesFoodBasket: v.optional(v.boolean()),
    dailyTransitCents: v.optional(v.number()),
    defaultTransportFoodDays: v.optional(v.number()),
  },
  returns: v.id("employees"),
  handler: async (ctx, args) => {
    return await createEmployee(ctx, ctx.user, args);
  },
});

export const update = funcionariosMutation({
  args: {
    employeeId: v.id("employees"),
    code: v.optional(v.union(v.string(), v.null())),
    name: v.optional(v.string()),
    cpf: v.optional(v.union(v.string(), v.null())),
    staffGroup: v.optional(employeeStaffGroup),
    jobTitle: v.optional(v.union(v.string(), v.null())),
    email: v.optional(v.union(v.string(), v.null())),
    phone: v.optional(v.union(v.string(), v.null())),
    hiredAt: v.optional(v.union(v.number(), v.null())),
    notes: v.optional(v.union(v.string(), v.null())),
    status: v.optional(employeeStatus),
    paymentMethod: v.optional(employeePaymentMethod),
    pixKey: v.optional(v.union(v.string(), v.null())),
    baseSalaryCents: v.optional(v.number()),
    receivesFoodBasket: v.optional(v.boolean()),
    dailyTransitCents: v.optional(v.number()),
    defaultTransportFoodDays: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await updateEmployee(ctx, ctx.user, args);
    return null;
  },
});

export const archive = funcionariosMutation({
  args: { employeeId: v.id("employees") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await archiveEmployee(ctx, ctx.user, args.employeeId);
    return null;
  },
});

export const restore = funcionariosMutation({
  args: { employeeId: v.id("employees") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await restoreEmployee(ctx, ctx.user, args.employeeId);
    return null;
  },
});
