import { createFileRoute } from "@tanstack/react-router";

import { AuthShell } from "@/components/auth-shell";
import { ContractsPage } from "@/components/engenharia/contracts/contracts-page";
import { PermissionGate } from "@/components/role-area-gate";

export const Route = createFileRoute("/engenharia/contratos")({
  component: () => (
    <PermissionGate permissions={["contratos.read"]}>
      <AuthShell>
        <div className="mx-auto max-w-6xl">
          <ContractsPage />
        </div>
      </AuthShell>
    </PermissionGate>
  ),
});
