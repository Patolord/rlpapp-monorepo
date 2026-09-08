import { createFileRoute } from "@tanstack/react-router";
import { AttendanceLayout } from "@/components/rh/attendance/attendance-layout";

export const Route = createFileRoute("/rh/ponto")({ component: AttendanceLayout });
