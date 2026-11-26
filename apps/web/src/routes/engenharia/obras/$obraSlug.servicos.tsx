import { createFileRoute } from "@tanstack/react-router";

import { AuthShell } from "@/components/auth-shell";
import { ProjectShell } from "@/components/engenharia/project-shell";
import { ProjectServicesPanel } from "@/components/engenharia/servicos/project-services-panel";
import { useObraProjectId } from "@/lib/engenharia/obra-context";
import { PermissionGate } from "@/components/role-area-gate";

export const Route = createFileRoute("/engenharia/obras/$obraSlug/servicos")({
  component: () => (
    <PermissionGate permissions={["servicos.read"]}>
      <ObraServicosPage />
    </PermissionGate>
  ),
});

function ObraServicosPage() {
  const projectId = useObraProjectId();
  return (
    <AuthShell>
      <ProjectShell projectId={projectId}>
        {(project) => (
          <ProjectServicesPanel
            projectId={project._id}
            archived={project.status === "archived"}
          />
        )}
      </ProjectShell>
    </AuthShell>
  );
}
