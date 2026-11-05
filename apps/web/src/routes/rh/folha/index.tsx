import { createFileRoute } from "@tanstack/react-router";

import { AuthShell } from "@/components/auth-shell";
import { PayrollWorkspace } from "@/components/rh/payroll-workspace";
import { PermissionGate } from "@/components/role-area-gate";

export const Route = createFileRoute("/rh/folha/")({
  component: () => (
    <PermissionGate permissions={["rh.folha.read"]}>
      <FolhaPage />
    </PermissionGate>
  ),
});

function FolhaPage() {
  return (
    <AuthShell>
      <PayrollWorkspace />
    </AuthShell>
  );
}
