import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/backoffice/")({
  beforeLoad: () => {
    throw redirect({ to: "/backoffice/clientes" });
  },
});
