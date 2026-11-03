import { createFileRoute, redirect } from "@tanstack/react-router";

// Endereço antigo: a página mudou para Configurações.
export const Route = createFileRoute("/engenharia/politica-privacidade")({
  beforeLoad: () => {
    throw redirect({ to: "/configuracoes/politica-privacidade" });
  },
});
