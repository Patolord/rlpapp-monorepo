import { createFileRoute } from "@tanstack/react-router";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";

import { AuthShell } from "@/components/auth-shell";
import { ContractsPage } from "@/components/engenharia/contracts/contracts-page";
import { ProjectShell } from "@/components/engenharia/project-shell";
import { useObraProjectId } from "@/lib/engenharia/obra-context";

export const Route = createFileRoute(
  "/engenharia/obras/$obraSlug/contratos"
)({
  component: ObraContratosPage,
});

function ObraContratosPage() {
  const projectId = useObraProjectId();
  return (
    <AuthShell>
      <ProjectShell projectId={projectId}>
        {(project) => (
          <ContractsPage
            lockedProjectId={projectId as Id<"projects">}
            defaultCustomerId={project.customerId}
            title="Contratos da obra"
            description="Vendas ao cliente e contratações de empreiteiros vinculadas a esta obra."
          />
        )}
      </ProjectShell>
    </AuthShell>
  );
}
