import { useCallback } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";

import { AuthShell } from "@/components/auth-shell";
import { ContractsPage } from "@/components/engenharia/contracts/contracts-page";
import { ProjectShell } from "@/components/engenharia/project-shell";
import { useObraProjectId } from "@/lib/engenharia/obra-context";

export const Route = createFileRoute(
  "/engenharia/obras/$obraSlug/contratos"
)({
  validateSearch: (
    search: Record<string, unknown>
  ): { novo?: boolean } => {
    const novo = search.novo;
    return {
      novo:
        novo === true ||
        novo === "true" ||
        novo === 1 ||
        novo === "1",
    };
  },
  component: ObraContratosPage,
});

function ObraContratosPage() {
  const projectId = useObraProjectId();
  const { novo } = Route.useSearch();
  const navigate = useNavigate();

  const handleAutoOpenCreateHandled = useCallback(() => {
    void navigate({
      to: ".",
      search: {},
      replace: true,
    });
  }, [navigate]);

  return (
    <AuthShell>
      <ProjectShell projectId={projectId}>
        {(project) => (
          <ContractsPage
            lockedProjectId={projectId as Id<"projects">}
            defaultCustomerId={project.customerId}
            title="Contratos da obra"
            description="Vendas ao cliente e contratações de empreiteiros vinculadas a esta obra."
            autoOpenCreate={novo}
            onAutoOpenCreateHandled={handleAutoOpenCreateHandled}
          />
        )}
      </ProjectShell>
    </AuthShell>
  );
}
