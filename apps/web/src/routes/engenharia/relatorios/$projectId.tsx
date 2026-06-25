import { useState } from "react";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { createFileRoute } from "@tanstack/react-router";

import { AuthShell } from "@/components/auth-shell";
import { ApartmentPanel } from "@/components/engenharia/apartment-panel";
import { BuildingGrid } from "@/components/engenharia/building-grid";
import { UNIT_STATE_STYLES } from "@/components/engenharia/building";
import { ProjectShell } from "@/components/engenharia/project-shell";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/engenharia/relatorios/$projectId")({
  component: () => (
    <AuthShell>
      <BuildingPage />
    </AuthShell>
  ),
});

function BuildingPage() {
  const { projectId } = Route.useParams();
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);

  return (
    <ProjectShell projectId={projectId} tab="building">
      {(project, now) => {
        const selectedUnit =
          project.units.find((u) => u._id === selectedUnitId) ?? null;

        return (
          <>
            <Card>
              <CardContent className="py-6">
                {project.units.length === 0 ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">
                    Nenhum apartamento cadastrado. Use o gerador em{" "}
                    <span className="font-medium">Editar layout</span> ou o{" "}
                    <span className="font-medium">Assistente IA</span> para
                    montar o prédio.
                  </p>
                ) : (
                  <>
                    <BuildingGrid
                      floors={project.floors}
                      units={project.units}
                      now={now}
                      selectedUnitId={selectedUnitId}
                      onSelectUnit={(u) => setSelectedUnitId(u._id)}
                    />
                    <Legend />
                  </>
                )}
              </CardContent>
            </Card>

            <ApartmentPanel
              projectId={project._id as Id<"projects">}
              unit={selectedUnit}
              onClose={() => setSelectedUnitId(null)}
            />
          </>
        );
      }}
    </ProjectShell>
  );
}

const legendItems: { key: keyof typeof UNIT_STATE_STYLES; label: string }[] = [
  { key: "complete", label: "Concluído" },
  { key: "partial", label: "Parcial" },
  { key: "pending", label: "Pendente" },
  { key: "overdue", label: "Em atraso" },
  { key: "empty", label: "Sem equipamentos" },
];

function Legend() {
  return (
    <div className="mt-6 flex flex-wrap justify-center gap-x-5 gap-y-2">
      {legendItems.map((item) => (
        <span
          key={item.key}
          className="flex items-center gap-1.5 text-sm text-muted-foreground"
        >
          <span
            className={`size-3.5 rounded border-2 ${UNIT_STATE_STYLES[item.key].cell}`}
          />
          {item.label}
        </span>
      ))}
    </div>
  );
}
