import { createFileRoute } from "@tanstack/react-router";

import { AuthShell } from "@/components/auth-shell";
import { ProjectDocumentsPanel } from "@/components/engenharia/documents/project-documents-panel";
import { ProjectShell } from "@/components/engenharia/project-shell";
import { useObraProjectId } from "@/lib/engenharia/obra-context";

export const Route = createFileRoute("/engenharia/obras/$obraSlug/documentos")({
  component: ObraDocumentosPage,
});

function ObraDocumentosPage() {
  const projectId = useObraProjectId();
  return (
    <AuthShell>
      <ProjectShell projectId={projectId}>
        {(project) => (
          <ProjectDocumentsPanel
            projectId={project._id}
            projectName={project.name}
          />
        )}
      </ProjectShell>
    </AuthShell>
  );
}
