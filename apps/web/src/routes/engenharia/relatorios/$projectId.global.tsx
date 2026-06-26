import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/engenharia/relatorios/$projectId/global"
)({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/engenharia/relatorios/$projectId",
      params: { projectId: params.projectId },
    });
  },
});
