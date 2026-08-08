import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/engenharia/relatorios")({
  component: () => <Outlet />,
});
