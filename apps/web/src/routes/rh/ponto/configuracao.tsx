import { createFileRoute } from "@tanstack/react-router";
import { AttendanceSettings } from "@/components/rh/attendance/attendance-settings";

export const Route = createFileRoute("/rh/ponto/configuracao")({ component: AttendanceSettings });
