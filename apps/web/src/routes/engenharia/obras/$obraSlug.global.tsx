import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/engenharia/obras/$obraSlug/global"
)({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/engenharia/obras/$obraSlug",
      params: { obraSlug: params.obraSlug },
    });
  },
});
