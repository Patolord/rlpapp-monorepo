import { createFileRoute } from "@tanstack/react-router";

import { AuthShell } from "@/components/auth-shell";
import { ContractsPage } from "@/components/engenharia/contracts/contracts-page";

export const Route = createFileRoute("/engenharia/contratos")({
  component: () => (
    <AuthShell>
      <div className="mx-auto max-w-6xl">
        <ContractsPage />
      </div>
    </AuthShell>
  ),
});
