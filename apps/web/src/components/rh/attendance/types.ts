export interface AttendancePunch {
  _id: string;
  sourceId: string | number;
  employeeKey: string;
  employeeName: string;
  timestamp: number;
  kind: string | null;
  latitude: number | null;
  longitude: number | null;
  projectId: string | null;
  projectName: string | null;
  geofenceSourceId?: string | null;
  hasPhoto: boolean;
}

export interface AttendanceWorksite {
  key: string;
  projectId: string | null;
  name: string;
  latitude: number | null;
  longitude: number | null;
  radius: number | null;
  employeeCount: number;
}

export interface AttendanceEmployee {
  key: string;
  employeeId: string | null;
  rhidEmployeeIds: number[];
  name: string;
  matched: boolean;
  hasPunch: boolean;
  firstPunchAt: number | null;
  lastPunchAt: number | null;
  worksiteId: string | null;
  worksiteName: string | null;
}

export interface AttendanceDay {
  date: string;
  status: "missing" | "queued" | "running" | "ready" | "failed" | "succeeded" | "canceled";
  coverage: "missing" | "unverified" | "partial";
  lastSuccessAt: number | null;
  lastAttemptAt: number | null;
  error: string | null;
  warnings: string[];
  provisional: boolean;
}

export interface DashboardData {
  settings: { enabled: boolean; credentialsConfigured: boolean; companyId: number; departmentNames: string[]; dailyRateCents: number };
  day: AttendanceDay;
  totals: { employees: number; punched: number; noPunch: number; punches: number };
  employees: AttendanceEmployee[];
  punches: AttendancePunch[];
  worksites: AttendanceWorksite[];
  truncated: boolean;
}
