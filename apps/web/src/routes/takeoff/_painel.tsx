import { createFileRoute, redirect } from "@tanstack/react-router";

import { DepartmentLayout } from "@/components/department-layout";

// App Takeoff: configuração do app desktop RLP Takeoff (kits padrão da
// empresa). Layout sem segmento de URL para não envolver /takeoff/conectar,
// que é a página de login do app e tem a própria moldura.
export const Route = createFileRoute("/takeoff/_painel")({
  beforeLoad: async ({ context }) => {
    if (!context.userId) {
      throw redirect({ to: "/" });
    }
  },
  component: () => <DepartmentLayout area="takeoff" />,
});
