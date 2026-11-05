import { createFileRoute, redirect } from "@tanstack/react-router";

// Endereço antigo: a página mudou para Configurações.
export const Route = createFileRoute("/engenharia/usuarios")({
  beforeLoad: () => {
    throw redirect({ to: "/configuracoes/usuarios" });
  },
});
