import { createFileRoute } from "@tanstack/react-router";
import { AttendanceReports } from "@/components/rh/attendance/attendance-reports";

export const Route = createFileRoute("/rh/ponto/relatorios")({ component: AttendanceReports });
