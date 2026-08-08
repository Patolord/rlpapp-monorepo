import { createFileRoute, Outlet } from "@tanstack/react-router";

import { ObraSlugLayout } from "@/lib/engenharia/obra-context";

export const Route = createFileRoute("/engenharia/obras/$obraSlug")({
  component: ObraSlugRoute,
});

function ObraSlugRoute() {
  const { obraSlug } = Route.useParams();
  return (
    <ObraSlugLayout obraSlug={obraSlug}>
      <Outlet />
    </ObraSlugLayout>
  );
}
