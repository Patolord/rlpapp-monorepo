import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { EquipmentEditForm } from "@/components/engenharia/equipment-edit-form";
import { PlannedEquipmentPanel } from "@/components/engenharia/planned-equipment-panel";
import { StatusBadge } from "@/components/engenharia/status-badge";
import { MaintenanceLogCard } from "@/components/engenharia/maintenance-log";
import { MaintenanceForm } from "@/components/engenharia/maintenance-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tag, Clock, Loader2, Pencil } from "lucide-react";

type EquipmentStatus = "installing" | "operational" | "warning" | "error";

export interface EquipmentInfo {
  description?: string;
  status: EquipmentStatus;
  createdAt: number;
}

export function EquipmentDetail({
  equipmentId,
  equipment,
  qrToken,
  currentUserName,
  embedded = false,
  showMaintenanceForm = true,
}: {
  equipmentId: Id<"equipment">;
  equipment: EquipmentInfo;
  qrToken: string;
  currentUserName?: string;
  embedded?: boolean;
  showMaintenanceForm?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const logs = useQuery(api.maintenanceLogs.listByEquipment, {
    equipmentId,
  });

  const lastMaintenance = logs?.[0];
  const lastMaintenanceDate = lastMaintenance
    ? new Date(lastMaintenance.createdAt).toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    : null;

  const content = (
    <>
      {editing ? (
        <div className="mb-4">
          <EquipmentEditForm
            equipmentId={equipmentId}
            initial={{
              description: equipment.description,
              status: equipment.status,
            }}
            onClose={() => setEditing(false)}
          />
        </div>
      ) : (
        <Card className="mb-4">
          <CardContent className="pt-4">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Tag className="h-4 w-4 text-muted-foreground" />
                  <h1 className="text-xl font-bold">
                    {equipment.description ?? "Equipamento"}
                  </h1>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={equipment.status} />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setEditing(true)}
                  aria-label="Editar equipamento"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {lastMaintenanceDate && (
              <>
                <Separator className="my-3" />
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  <span>Último registro: {lastMaintenanceDate}</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      <PlannedEquipmentPanel token={qrToken} />

      {showMaintenanceForm && (
        <div className="mb-4">
          <MaintenanceForm
            equipmentId={equipmentId}
            qrToken={qrToken}
            technicianName={currentUserName}
          />
        </div>
      )}

      {logs === undefined ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : logs.length > 0 ? (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Histórico ({logs.length})</h2>
          {logs.map((log) => (
            <MaintenanceLogCard key={log._id} log={log} />
          ))}
        </div>
      ) : (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Nenhum registro de manutenção encontrado.
        </p>
      )}
    </>
  );

  if (embedded) return content;

  return <div className="mx-auto max-w-lg px-4 py-6">{content}</div>;
}
