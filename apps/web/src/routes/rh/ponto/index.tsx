import { createFileRoute } from "@tanstack/react-router";
import { AttendanceDashboard } from "@/components/rh/attendance/attendance-dashboard";

export const Route = createFileRoute("/rh/ponto/")({ component: AttendanceDashboard });
