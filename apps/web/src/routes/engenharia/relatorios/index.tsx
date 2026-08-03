import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/engenharia/relatorios/")({
  beforeLoad: () => {
    throw redirect({ to: "/engenharia/obras" });
  },
});
