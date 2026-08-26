import { createFileRoute } from "@tanstack/react-router";

import { AuthShell } from "@/components/auth-shell";
import { PayrollWorkspace } from "@/components/rh/payroll-workspace";

export const Route = createFileRoute("/rh/folha/")({
  component: FolhaPage,
});

function FolhaPage() {
  return (
    <AuthShell>
      <PayrollWorkspace />
    </AuthShell>
  );
}
