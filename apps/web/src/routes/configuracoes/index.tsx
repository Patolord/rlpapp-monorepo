import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/configuracoes/")({
  beforeLoad: () => {
    throw redirect({ to: "/configuracoes/usuarios" });
  },
});
