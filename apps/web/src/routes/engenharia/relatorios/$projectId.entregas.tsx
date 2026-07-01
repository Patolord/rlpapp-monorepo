import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/engenharia/relatorios/$projectId/entregas"
)({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/engenharia/relatorios/$projectId/global",
      params: { projectId: params.projectId },
    });
  },
});
