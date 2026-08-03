import { createFileRoute } from "@tanstack/react-router";

import { RelatoriosRedirect } from "@/lib/engenharia/relatorios-redirect";

export const Route = createFileRoute(
  "/engenharia/relatorios/$projectId/medicoes"
)({
  component: RelatoriosRedirect,
});
