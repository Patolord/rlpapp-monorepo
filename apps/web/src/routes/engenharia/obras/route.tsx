import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/engenharia/obras")({
  component: () => <Outlet />,
});
