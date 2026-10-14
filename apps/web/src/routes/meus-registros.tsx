import { createFileRoute, redirect } from "@tanstack/react-router";

// Rota antiga do técnico: o histórico agora fica dentro de cada obra
// ("Meus registros nesta obra"); a fila offline em /qr-operador/pendentes.
export const Route = createFileRoute("/meus-registros")({
  beforeLoad: () => {
    throw redirect({ to: "/qr-operador", replace: true });
  },
});
