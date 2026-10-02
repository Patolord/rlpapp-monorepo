import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/rh/")({
  beforeLoad: () => {
    throw redirect({ to: "/rh/folha" });
  },
});
