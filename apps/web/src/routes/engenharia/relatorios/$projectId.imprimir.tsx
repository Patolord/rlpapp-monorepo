import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { ArrowLeft, Loader2, Printer } from "lucide-react";

import { AuthShell } from "@/components/auth-shell";
import {
  TYPE_LABELS,
  type GridItem,
  type GridUnit,
} from "@/components/engenharia/building";
import { Button } from "@/components/ui/button";
import { EQUIPMENT_STATUS_LABELS } from "@/lib/equipment-status";

export const Route = createFileRoute(
  "/engenharia/relatorios/$projectId/imprimir"
)({
  component: () => (
    <AuthShell>
      <PrintPage />
    </AuthShell>
  ),
});

const PRINT_STYLES = `
@media print {
  body * { visibility: hidden !important; }
  .print-root, .print-root * { visibility: visible !important; }
  .print-root { position: absolute; inset: 0; margin: 0; padding: 0; }
  .print-hide { display: none !important; }
  .print-floor { break-inside: avoid; }
  .print-floor + .print-floor { break-before: page; }
  @page { size: A4 landscape; margin: 12mm; }
}
`;

function PrintPage() {
  const { projectId } = Route.useParams();
  const project = useQuery(api.projects.getOverview, {
    projectId: projectId as Id<"projects">,
  });

  if (project === undefined) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (project === null) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        Obra não encontrada.
      </div>
    );
  }

  const floors = project.floors.slice().sort((a, b) => a.number - b.number);
  const unitsByFloor = new Map<number, GridUnit[]>();
  for (const u of project.units) {
    const list = unitsByFloor.get(u.floor) ?? [];
    list.push(u);
    unitsByFloor.set(u.floor, list);
  }

  return (
    <div className="print-root fixed inset-0 z-200 overflow-y-auto bg-white">
      <style>{PRINT_STYLES}</style>

      <div className="print-hide sticky top-0 z-10 flex items-center justify-between border-b bg-white px-4 py-3">
        <Button
          variant="ghost"
          size="sm"
          render={
            <Link
              to="/engenharia/relatorios/$projectId"
              params={{ projectId: project._id }}
            />
          }
        >
          <ArrowLeft className="mr-1.5 size-4" />
          Voltar
        </Button>
        <Button size="sm" onClick={() => window.print()}>
          <Printer className="mr-1.5 size-4" />
          Imprimir
        </Button>
      </div>

      <div className="mx-auto max-w-[1100px] space-y-8 p-6 text-black">
        <h1 className="text-2xl font-bold">{project.name}</h1>

        {floors.map((floor) => {
          const units = (unitsByFloor.get(floor.number) ?? []).sort(
            (a, b) => a.final - b.final
          );
          if (units.length === 0) return null;
          return (
            <FloorSection
              key={floor.number}
              title={floor.label}
              units={units}
            />
          );
        })}
      </div>
    </div>
  );
}

function FloorSection({
  title,
  units,
}: {
  title: string;
  units: GridUnit[];
}) {
  const condensadoras = units.flatMap((u) =>
    u.equipment
      .filter((e) => e.kind === "condensadora")
      .map((e) => ({ unit: u, item: e }))
  );

  return (
    <section className="print-floor space-y-3">
      <h2 className="border-b-2 border-black pb-1 text-lg font-bold uppercase">
        {title}
      </h2>

      {condensadoras.length > 0 && (
        <div>
          <h3 className="mb-1 text-sm font-semibold uppercase">
            Condensadoras — Área Técnica
          </h3>
          <PrintTable
            head={["Apto", "Sistema", "Equipamento", "Capacidade", "Status"]}
            rows={condensadoras.map(({ unit, item }) => [
              `Final ${unit.final} (${unit.label})`,
              item.system,
              item.modelo || "—",
              item.capacidade || "—",
              EQUIPMENT_STATUS_LABELS[item.status],
            ])}
          />
        </div>
      )}

      {units.map((unit) => (
        <UnitBlocks key={unit._id} unit={unit} />
      ))}
    </section>
  );
}

function UnitBlocks({ unit }: { unit: GridUnit }) {
  const systems = new Map<string, GridItem[]>();
  for (const e of unit.equipment) {
    if (e.kind !== "evaporadora") continue;
    const list = systems.get(e.system) ?? [];
    list.push(e);
    systems.set(e.system, list);
  }
  if (systems.size === 0) return null;

  return (
    <div className="space-y-2">
      {Array.from(systems.entries()).map(([system, items]) => (
        <div key={system}>
          <h4 className="mb-1 text-sm font-semibold">
            APTO {unit.label} — FINAL {unit.final} — {system} (
            {TYPE_LABELS[unit.type]})
          </h4>
          <PrintTable
            head={["Ambiente", "Equipamento", "Capacidade", "Status", "Obs"]}
            rows={items.map((e) => [
              e.ambiente,
              e.modelo || "—",
              e.capacidade || "—",
              EQUIPMENT_STATUS_LABELS[e.status],
              e.obs ?? "",
            ])}
          />
        </div>
      ))}
    </div>
  );
}

function PrintTable({
  head,
  rows,
}: {
  head: string[];
  rows: string[][];
}) {
  return (
    <table className="w-full border-collapse text-xs">
      <thead>
        <tr>
          {head.map((h) => (
            <th
              key={h}
              className="border border-black bg-gray-100 px-2 py-1 text-left font-semibold"
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            {row.map((cell, j) => (
              <td key={j} className="border border-black px-2 py-1">
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
