import { createFileRoute, redirect } from "@tanstack/react-router";

// Rota antiga: o estoque agora fica dentro de cada obra no hub do técnico.
export const Route = createFileRoute("/qr-operador_/estoque/")({
  beforeLoad: () => {
    throw redirect({ to: "/qr-operador", replace: true });
  },
});
