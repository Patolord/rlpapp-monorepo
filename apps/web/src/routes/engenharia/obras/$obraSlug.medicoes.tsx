import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { Plus } from "lucide-react";

import { AuthShell } from "@/components/auth-shell";
import { ProjectShell } from "@/components/engenharia/project-shell";
import { ContractCard } from "@/components/engenharia/medicoes/contract-card";
import {
  MedicaoFormDialog,
  type ContractOption,
} from "@/components/engenharia/medicoes/medicao-form-dialog";
import { MedicoesEmptyState } from "@/components/engenharia/medicoes/medicoes-empty-state";
import { TotalStat } from "@/components/engenharia/medicoes/medicoes-total-stat";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useCan } from "@/hooks/use-can";
import { useObraProjectId } from "@/lib/engenharia/obra-context";
import { obraLinkSlug } from "@/lib/engenharia/obra-paths";
import { PermissionGate } from "@/components/role-area-gate";

export const Route = createFileRoute(
  "/engenharia/obras/$obraSlug/medicoes"
)({
  component: () => (
    <PermissionGate permissions={["medicoes.read"]}>
      <MedicoesPage />
    </PermissionGate>
  ),
});

function MedicoesPage() {
  const projectId = useObraProjectId();
  return (
    <AuthShell>
      <ProjectShell projectId={projectId}>
        {(project) => (
          <MedicoesContent
            projectId={projectId as Id<"projects">}
            obraSlug={obraLinkSlug(project)}
          />
        )}
      </ProjectShell>
    </AuthShell>
  );
}

function MedicoesContent({
  projectId,
  obraSlug,
}: {
  projectId: Id<"projects">;
  obraSlug: string;
}) {
  const contracts = useQuery(api.medicoes.listContracts, { projectId });
  const medicoes = useQuery(api.medicoes.listMedicoes, { projectId });
  const canSeeContracts = useCan("contratos.read");
  const canWrite = useCan("medicoes.write");

  const contractOptions: ContractOption[] = (contracts ?? []).map((c) => ({
    _id: c._id,
    title: c.title,
    valueCents: c.valueCents,
  }));

  const totals = (contracts ?? []).reduce(
    (acc, c) => ({
      contratado: acc.contratado + c.valueCents,
      medido: acc.medido + c.medidoCents,
      pago: acc.pago + c.pagoCents,
    }),
    { contratado: 0, medido: 0, pago: 0 }
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold">Medições</h2>
          <p className="text-sm text-muted-foreground">
            Cobranças por serviços realizados, deduzidas dos contratos de venda
            ao cliente desta obra.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canSeeContracts && (
            <Button variant="outline" render={<Link to="/engenharia/obras/$obraSlug/contratos" params={{ obraSlug }} />}>
              Gerenciar contratos
            </Button>
          )}
          {canWrite && contractOptions.length > 0 && (
            <MedicaoFormDialog
              projectId={projectId}
              contracts={contractOptions}
              trigger={
                <Button>
                  <Plus />
                  Nova medição
                </Button>
              }
            />
          )}
        </div>
      </div>

      {contracts !== undefined && contracts.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border bg-card px-4 py-3 text-sm shadow-sm">
          <TotalStat label="Contratado" value={totals.contratado} />
          <TotalStat label="Medido" value={totals.medido} />
          <TotalStat label="Pago" value={totals.pago} className="text-green-700" />
          <TotalStat
            label="Saldo"
            value={totals.contratado - totals.medido}
            className={
              totals.contratado - totals.medido < 0 ? "text-red-600" : undefined
            }
          />
        </div>
      )}

      {contracts === undefined || medicoes === undefined ? (
        <Card className="h-40 animate-pulse" />
      ) : contracts.length === 0 ? (
        <MedicoesEmptyState obraSlug={obraSlug} />
      ) : (
        contracts.map((contract) => (
          <ContractCard
            key={contract._id}
            projectId={projectId}
            contract={contract}
            contractOptions={contractOptions}
            medicoes={medicoes.filter((m) => m.contractId === contract._id)}
          />
        ))
      )}
    </div>
  );
}
