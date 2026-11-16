import { createFileRoute, redirect } from "@tanstack/react-router";

import { DepartmentLayout } from "@/components/department-layout";

// Área própria do quadro de orçamentos: engenharia e orçamentistas (acesso App
// Takeoff) abrem sem precisar ver as obras.
export const Route = createFileRoute("/orcamentos")({
  beforeLoad: async ({ context }) => {
    if (!context.userId) {
      throw redirect({ to: "/" });
    }
  },
  component: () => <DepartmentLayout area="orcamentos" />,
});
