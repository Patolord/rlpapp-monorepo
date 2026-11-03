import { createFileRoute, redirect } from "@tanstack/react-router";

import { DepartmentLayout } from "@/components/department-layout";

// Backoffice: cadastros gerais usados por mais de um departamento
// (clientes, empreiteiros e seus contatos).
export const Route = createFileRoute("/backoffice")({
  beforeLoad: async ({ context }) => {
    if (!context.userId) {
      throw redirect({ to: "/" });
    }
  },
  component: () => <DepartmentLayout area="backoffice" />,
});
