import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/sign-in")({
  beforeLoad: () => {
    throw redirect({ to: "/" });
  },
  component: () => null,
});
