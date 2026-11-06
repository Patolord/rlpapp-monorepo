/**
 * Ferramentas MCP de RH: funcionários, pensões, folha, empréstimos e ponto.
 */

import type { ToolSpec } from "../manifest";

export const RH_TOOLS: readonly ToolSpec[] = [
  // --------------------------------------------------------------------------
  // HR: employees, payroll, time clock
  // --------------------------------------------------------------------------
  {
    name: "list_employees",
    function: "employees:list",
    title: "List employees",
    description:
      "Employees (funcionários) with staff group (obra, escritorio, diretoria), job title, status and payroll parameters. Filter by staffGroup.",
  },
  {
    name: "get_employee",
    function: "employees:get",
    title: "Get employee",
    description: "One employee record.",
  },
  {
    name: "create_employee",
    function: "employees:create",
    title: "Create employee",
    description:
      "Create an employee. staffGroup (obra, escritorio or diretoria; default obra) sets the default food basket, daily transit and voucher days when they are omitted. Salary and allowance fields are in BRL cents. Returns the employee id.",
  },
  {
    name: "update_employee",
    function: "employees:update",
    title: "Update employee",
    description: "Change employee fields. Pass null to clear nullable fields.",
    idempotent: true,
  },
  {
    name: "list_employee_alimonies",
    function: "alimonies:listForEmployee",
    title: "List employee alimonies",
    description:
      "Pensões alimentícias (alimony) paid on behalf of an employee: beneficiary, default monthly amount, payment method. Separate from the employee's own payroll line.",
  },
  {
    name: "create_employee_alimony",
    function: "alimonies:create",
    title: "Create employee alimony",
    description:
      "Register an alimony for an employee (beneficiary name, amount in BRL cents, payment method, PIX key). It joins open draft payrolls the employee is in. Returns the alimony id.",
  },
  {
    name: "update_employee_alimony",
    function: "alimonies:update",
    title: "Update employee alimony",
    description:
      "Change an alimony's beneficiary, default amount, payment method, PIX key or notes. Name, method and PIX key propagate to unpaid draft lines; the amount only applies to new months.",
    idempotent: true,
  },
  {
    name: "archive_employee_alimony",
    function: "alimonies:archive",
    title: "End employee alimony",
    description: "End an alimony: removed from unpaid draft payrolls and no longer added to new months.",
    destructive: true,
  },
  {
    name: "archive_employee",
    function: "employees:archive",
    title: "Archive employee",
    description: "Archive an employee (terminated/inactive). Reversible in the app.",
    destructive: true,
    idempotent: true,
  },
  {
    name: "list_payroll_runs",
    function: "payroll:listRuns",
    title: "List payroll runs",
    description: "Monthly payroll runs, optionally for one year.",
  },
  {
    name: "get_payroll_workspace",
    function: "payroll:getWorkspace",
    title: "Payroll workspace",
    description: "Everything about one month's payroll: run, lines per employee, totals, KPIs and employees not yet included.",
  },
  {
    name: "create_payroll_run",
    function: "payroll:createRun",
    title: "Create payroll run",
    description: "Open the payroll run for a payment month. Returns the run id.",
  },
  {
    name: "list_employee_loans",
    function: "payroll:listLoans",
    title: "List employee loans",
    description: "Loans/advances of an employee as of a payment month.",
  },
  {
    name: "get_time_clock_day",
    function: "timeClock:getDay",
    title: "Time clock: day",
    description: "Punches made in the RLP app, presence of each user who clocks in and per-project (geofence) summary for one day.",
    fieldDescriptions: { date: "Day as YYYY-MM-DD." },
  },
  {
    name: "get_time_clock_live_status",
    function: "timeClock:getLiveStatus",
    title: "Time clock: who is on site now",
    description: "Live presence per person and worksite for a day (on site, lunch, left, absent, outside fence).",
    fieldDescriptions: { date: "Day as YYYY-MM-DD." },
  },
  {
    name: "get_time_clock_month_stats",
    function: "timeClock:getMonthStats",
    title: "Time clock: month stats",
    description: "Man-days per person and per worksite for a month, with cost.",
  },

  // --------------------------------------------------------------------------
  // Payroll lines, runs and loans
  // --------------------------------------------------------------------------
  {
    name: "add_payroll_line",
    function: "payroll:addEmployeeToRun",
    title: "Add employee to payroll run",
    description: "Add a payroll line to a run, either for an existing employee (employeeId) or an ad-hoc name. Returns the line id.",
  },
  {
    name: "update_payroll_line",
    function: "payroll:updateLine",
    title: "Update payroll line",
    description: "Change a payroll line: salary, earnings, deductions, allowances, 13th salary parts, manual loan deduction, notes. All money fields are BRL cents. Pass null to clear nullable text fields.",
    idempotent: true,
  },
  {
    name: "remove_payroll_line",
    function: "payroll:removeLine",
    title: "Remove payroll line",
    description: "Remove an employee's line from a payroll run. Cannot be undone.",
    destructive: true,
  },
  {
    name: "set_payroll_line_paid",
    function: "payroll:togglePaid",
    title: "Mark payroll line paid",
    description: "Mark a payroll line as paid or unpaid.",
    idempotent: true,
  },
  {
    name: "update_payroll_run_parameters",
    function: "payroll:updateRunParameters",
    title: "Update payroll run parameters",
    description: "Change the run-wide defaults: meal voucher per day, food basket value, default daily transit and transport/food days (BRL cents where applicable).",
    idempotent: true,
  },
  {
    name: "close_payroll_run",
    function: "payroll:closeRun",
    title: "Close payroll run",
    description: "Close a payroll run so its lines stop being editable. Reopen with reopen_payroll_run.",
    idempotent: true,
  },
  {
    name: "reopen_payroll_run",
    function: "payroll:reopenRun",
    title: "Reopen payroll run",
    description: "Reopen a closed payroll run for corrections.",
    idempotent: true,
  },
  {
    name: "create_employee_loan",
    function: "payroll:createLoan",
    title: "Create employee loan",
    description: "Register a loan/advance for an employee, split into monthly installments deducted from payroll starting at startYear/startMonth. Amounts in BRL cents. Returns the loan id.",
  },
  {
    name: "update_employee_loan",
    function: "payroll:updateLoan",
    title: "Update employee loan",
    description: "Change a loan's total, installments, start month or description.",
    idempotent: true,
  },
  {
    name: "archive_employee_loan",
    function: "payroll:archiveLoan",
    title: "Archive employee loan",
    description: "Archive a loan so it stops being deducted. Cannot be undone from here.",
    destructive: true,
    idempotent: true,
  },
  {
    name: "restore_employee",
    function: "employees:restore",
    title: "Restore employee",
    description: "Restore an archived employee.",
    idempotent: true,
  },
];
