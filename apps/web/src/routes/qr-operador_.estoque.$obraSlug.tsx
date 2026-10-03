import { createFileRoute, redirect } from "@tanstack/react-router";

// Rota antiga: mantém links salvos funcionando apontando para a obra.
export const Route = createFileRoute("/qr-operador_/estoque/$obraSlug")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/qr-operador/obras/$obraSlug/estoque",
      params: { obraSlug: params.obraSlug },
      replace: true,
    });
  },
});
