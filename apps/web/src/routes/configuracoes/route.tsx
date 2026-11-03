import { createFileRoute, redirect } from "@tanstack/react-router";

import { DepartmentLayout } from "@/components/department-layout";

// Configurações: administração do sistema (usuários, política de privacidade).
export const Route = createFileRoute("/configuracoes")({
  beforeLoad: async ({ context }) => {
    if (!context.userId) {
      throw redirect({ to: "/" });
    }
  },
  component: () => <DepartmentLayout area="configuracoes" />,
});
