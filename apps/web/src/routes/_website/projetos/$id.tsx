import { createFileRoute } from "@tanstack/react-router";

import ProjectDetail from "@/components/website/project-detail";
import { projectsData } from "@/data/project-data";

export const Route = createFileRoute("/_website/projetos/$id")({
  component: ProjetoDetailPage,
});

function ProjetoDetailPage() {
  const { id } = Route.useParams();
  const project = projectsData.find((p) => p.id === id);

  if (!project) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-4xl font-serif text-blue-950 mb-4">
            Projeto não encontrado
          </h1>
          <p className="text-gray-600 mb-8">
            O projeto que você está procurando não existe ou foi removido.
          </p>
          <a
            href="/projetos"
            className="inline-flex items-center bg-blue-600 text-white px-6 py-3 rounded-md hover:bg-blue-700 transition"
          >
            Ver todos os projetos
          </a>
        </div>
      </div>
    );
  }

  return <ProjectDetail project={project} />;
}
