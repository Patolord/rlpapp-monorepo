import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/engenharia/obras/$obraSlug/entregas"
)({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/engenharia/obras/$obraSlug/global",
      params: { obraSlug: params.obraSlug },
    });
  },
});
