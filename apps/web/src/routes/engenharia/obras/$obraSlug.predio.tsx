import { createFileRoute } from "@tanstack/react-router";

import { AuthShell } from "@/components/auth-shell";
import { BuildingPage } from "@/components/engenharia/building-page";

export const Route = createFileRoute("/engenharia/obras/$obraSlug/predio")({
  component: () => (
    <AuthShell>
      <BuildingPage />
    </AuthShell>
  ),
});
