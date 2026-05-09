import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { StatusBadge } from "@/components/engenharia/status-badge";
import { MaintenanceLogCard } from "@/components/engenharia/maintenance-log";
import { MaintenanceForm } from "@/components/engenharia/maintenance-form";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { MapPin, Tag, Clock, Loader2, AlertTriangle } from "lucide-react";
import { ConvexUnauthRedirect } from "@/components/convex-unauth-redirect";

export const Route = createFileRoute("/engenharia/equipamento/$id")({
  component: EquipmentPage,
});

function EquipmentPage() {
  return (
    <>
      <Authenticated>
        <EquipmentContent />
      </Authenticated>
      <Unauthenticated>
        <ConvexUnauthRedirect />
      </Unauthenticated>
      <AuthLoading>
        <div className="flex items-center justify-center h-full">
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </AuthLoading>
    </>
  );
}

function EquipmentContent() {
  const { id } = Route.useParams();
  const equipmentId = id as Id<"equipment">;
  const equipment = useQuery(api.equipment.get, { id: equipmentId });
  const logs = useQuery(api.maintenanceLogs.listByEquipment, {
    equipmentId,
  });

  if (equipment === undefined) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (equipment === null) {
    return (
      <div className="mx-auto max-w-lg px-4 py-8">
        <div className="flex flex-col items-center gap-4 text-center">
          <AlertTriangle className="h-12 w-12 text-yellow-500" />
          <h1 className="text-2xl font-bold">Equipamento Não Encontrado</h1>
          <p className="text-muted-foreground">
            O equipamento solicitado não foi encontrado no sistema.
          </p>
        </div>
      </div>
    );
  }

  const lastMaintenance = logs?.[0];
  const lastMaintenanceDate = lastMaintenance
    ? new Date(lastMaintenance.createdAt).toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    : null;

  return (
    <div className="mx-auto max-w-lg">
      <Card className="mb-4">
        <CardContent className="pt-4">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Tag className="h-4 w-4 text-muted-foreground" />
                <h1 className="text-xl font-bold">{equipment.tag}</h1>
              </div>
              <p className="text-sm text-muted-foreground">{equipment.type}</p>
            </div>
            <StatusBadge status={equipment.status} />
          </div>

          <Separator className="my-3" />

          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" />
              <span>{equipment.location}</span>
            </div>
            {lastMaintenanceDate && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                <span>Última manutenção: {lastMaintenanceDate}</span>
              </div>
            )}
          </div>

          {equipment.notes && (
            <>
              <Separator className="my-3" />
              <p className="text-sm">{equipment.notes}</p>
            </>
          )}
        </CardContent>
      </Card>

      <div className="mb-4">
        <MaintenanceForm equipmentId={equipmentId} />
      </div>

      {logs === undefined ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : logs.length > 0 ? (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">
            Histórico ({logs.length})
          </h2>
          {logs.map((log) => (
            <MaintenanceLogCard key={log._id} log={log} />
          ))}
        </div>
      ) : (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Nenhum registro de manutenção encontrado.
        </p>
      )}
    </div>
  );
}
