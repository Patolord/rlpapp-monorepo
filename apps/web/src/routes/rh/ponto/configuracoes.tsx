import { createFileRoute } from "@tanstack/react-router";

import { TimeClockSettingsView } from "@/components/rh/time-clock/settings-view";

export const Route = createFileRoute("/rh/ponto/configuracoes")({
  component: TimeClockSettingsView,
});
