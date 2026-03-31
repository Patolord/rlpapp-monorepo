import { createFileRoute } from "@tanstack/react-router";

import ProjectsPage from "@/components/website/projects-page";

export const Route = createFileRoute("/_website/projetos/")({
  component: ProjetosPage,
});

function ProjetosPage() {
  return <ProjectsPage />;
}
