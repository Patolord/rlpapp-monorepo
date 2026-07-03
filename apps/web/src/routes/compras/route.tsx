import { createFileRoute, redirect } from "@tanstack/react-router";

import { DepartmentLayout } from "@/components/department-layout";

export const Route = createFileRoute("/compras")({
  beforeLoad: async ({ context }) => {
    if (!context.userId) {
      throw redirect({ to: "/" });
    }
  },
  component: () => <DepartmentLayout area="compras" />,
});
