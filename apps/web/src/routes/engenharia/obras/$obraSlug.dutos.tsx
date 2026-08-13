import { createFileRoute } from "@tanstack/react-router";

import { AuthShell } from "@/components/auth-shell";
import { DuctEstimateWorkspace } from "@/components/engenharia/dutos/duct-estimate-workspace";
import { ProjectShell } from "@/components/engenharia/project-shell";
import { useObraProjectId } from "@/lib/engenharia/obra-context";

export const Route = createFileRoute("/engenharia/obras/$obraSlug/dutos")({
  component: DutosPage,
});

function DutosPage() {
  const projectId = useObraProjectId();
  return (
    <AuthShell>
      <ProjectShell projectId={projectId}>
        {(project) => <DuctEstimateWorkspace project={project} />}
      </ProjectShell>
    </AuthShell>
  );
}
