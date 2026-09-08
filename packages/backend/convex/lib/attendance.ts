import type { Doc, Id } from "../_generated/dataModel";
import type { RhidPunch } from "./rhid";

export const DEFAULT_ATTENDANCE_SETTINGS = { enabled: false, companyId: 1, departmentNames: ["Obra", "Escritorio", "Manutencao"], dailyRateCents: 15_000 };
export const MAX_DAY_PUNCHES = 5000;
export const MAX_DIRECTORY = 2000;
export const MAX_REPORT_ROWS = 5000;
export const BATCH_SIZE = 100;

export type AttendanceSummary = {
  employeeKey: string; employeeId?: Id<"employees">; employeeName: string; rhidEmployeeIds: number[];
  firstPunchAt: number; lastPunchAt: number; punchCount: number; geofenceSourceId?: string;
  projectId?: Id<"projects">; worksiteName?: string;
};
export type EmployeeMapping = Pick<Doc<"attendanceEmployees">, "rhidEmployeeId" | "employeeId" | "sourceName" | "department" | "active"> & { employeeName?: string };
export type GeofenceMapping = Pick<Doc<"attendanceGeofences">, "sourceId" | "sourceName" | "projectId" | "excluded"> & { projectName?: string };

export function employeeKey(sourceId: number, employeeId?: Id<"employees">): string {
  return employeeId ? `employee:${employeeId}` : `rhid:${sourceId}`;
}
export function departmentIncluded(department: string | undefined, names: string[]): boolean {
  if (!department || names.length === 0) return true;
  const normalize = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
  return names.some((name) => normalize(name) === normalize(department));
}

/** One employee/day, including multiple linked source identities. Ties use stable source ID. */
export function buildAttendanceSummaries(punches: RhidPunch[], employees: EmployeeMapping[], geofences: GeofenceMapping[], departmentNames: string[]): AttendanceSummary[] {
  const people = new Map(employees.map((row) => [row.rhidEmployeeId, row]));
  const sites = new Map(geofences.map((row) => [row.sourceId, row]));
  const summaries = new Map<string, AttendanceSummary>();
  for (const punch of [...punches].sort((a, b) => a.occurredAt - b.occurredAt || a.sourceId.localeCompare(b.sourceId))) {
    const person = people.get(punch.rhidEmployeeId);
    const site = punch.geofenceSourceId ? sites.get(punch.geofenceSourceId) : undefined;
    // An archived geofence is still evidence of a historical punch location.
    if (punch.excluded || !departmentIncluded(person?.department, departmentNames)) continue;
    const key = employeeKey(punch.rhidEmployeeId, person?.employeeId);
    const existing = summaries.get(key);
    if (existing) {
      existing.lastPunchAt = punch.occurredAt;
      existing.punchCount++;
      if (!existing.rhidEmployeeIds.includes(punch.rhidEmployeeId)) existing.rhidEmployeeIds.push(punch.rhidEmployeeId);
    } else {
      summaries.set(key, {
        employeeKey: key, employeeId: person?.employeeId, employeeName: person?.employeeName ?? person?.sourceName ?? punch.sourceName,
        rhidEmployeeIds: [punch.rhidEmployeeId], firstPunchAt: punch.occurredAt, lastPunchAt: punch.occurredAt, punchCount: 1,
        geofenceSourceId: punch.geofenceSourceId, projectId: site?.projectId, worksiteName: site?.projectName ?? site?.sourceName,
      });
    }
  }
  return [...summaries.values()];
}

/** RHiD's raw type field is not a verified entry/exit classification. */
export function punchKind(_type?: number): string {
  return "unknown";
}

/** A shrinking undocumented feed cannot establish whether a punch was deleted or omitted. */
export function assertSourceContinuity(previous: Pick<RhidPunch, "sourceId" | "excluded">[], current: Pick<RhidPunch, "sourceId">[]): void {
  const ids = new Set(current.map((row) => row.sourceId));
  if (previous.some((row) => !row.excluded && !ids.has(row.sourceId))) {
    throw new Error("O RHiD omitiu marcações já publicadas. A atualização foi bloqueada para preservar o histórico.");
  }
}
