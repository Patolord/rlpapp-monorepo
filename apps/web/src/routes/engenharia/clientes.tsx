import { createFileRoute, redirect } from "@tanstack/react-router";

// Endereço antigo: o cadastro mudou para o Backoffice.
export const Route = createFileRoute("/engenharia/clientes")({
  beforeLoad: () => {
    throw redirect({ to: "/backoffice/clientes" });
  },
});
