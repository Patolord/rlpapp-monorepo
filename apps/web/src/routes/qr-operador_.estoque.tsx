import {
  Outlet,
  createFileRoute,
  redirect,
} from "@tanstack/react-router";

export const Route = createFileRoute("/qr-operador_/estoque")({
  beforeLoad: async ({ context }) => {
    if (!context.userId) {
      throw redirect({ to: "/" });
    }
  },
  component: CampoEstoqueLayout,
});

function CampoEstoqueLayout() {
  return <Outlet />;
}
