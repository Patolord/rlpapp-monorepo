import { DoorOpen, Plus, QrCode, Trash2, Wind } from "lucide-react";
import { Link } from "@tanstack/react-router";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EquipmentStatusDot } from "@/components/engenharia/building-panel/equipment-status-dot";
import {
  EQUIPMENT_VISUAL_STYLES,
  type HierarchyEnvironment,
  type HierarchyFloor,
  type HierarchyItem,
} from "@/components/engenharia/building-panel/hierarchy";

export function FloorDetail({
  floor,
  now,
  onGenerateQr,
  onAddEquipment,
  onRemoveEquipment,
}: {
  floor: HierarchyFloor | null;
  now: number;
  onGenerateQr?: (item: HierarchyItem) => void;
  onAddEquipment?: (env: HierarchyEnvironment) => void;
  onRemoveEquipment?: (item: HierarchyItem) => void;
}) {
  if (!floor) {
    return (
      <div className="flex h-full min-h-48 items-center justify-center rounded-lg border border-dashed text-center text-sm text-muted-foreground">
        Selecione um andar para ver os ambientes e equipamentos.
      </div>
    );
  }

  if (floor.environments.length === 0) {
    return (
      <div className="flex h-full min-h-48 flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-center text-sm text-muted-foreground">
        <DoorOpen className="size-8" />
        <p>O andar {floor.label} ainda não tem ambientes.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{floor.label}</h3>
        <EquipmentLegend />
      </div>

      <div className="space-y-3">
        {floor.environments.map((env) => (
          <Card key={env._id}>
            <CardContent className="space-y-2 py-3">
              <div className="flex items-center gap-2">
                <DoorOpen className="size-4 text-muted-foreground" />
                <span className="font-medium">{env.name}</span>
                {env.type && (
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[0.625rem] uppercase text-muted-foreground">
                    {env.type}
                  </span>
                )}
                <span className="ml-auto text-xs text-muted-foreground">
                  {env.equipment.length} equip.
                </span>
                {onAddEquipment && (
                  <Button
                    variant="outline"
                    size="xs"
                    className="h-6 px-1.5 text-xs"
                    onClick={() => onAddEquipment(env)}
                  >
                    <Plus className="mr-1 size-3" />
                    Equip.
                  </Button>
                )}
              </div>

              {env.equipment.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Sem equipamentos neste ambiente.
                </p>
              ) : (
                <ul className="space-y-1">
                  {env.equipment.map((item) => (
                    <li
                      key={item._id}
                      className="flex flex-wrap items-center gap-2 rounded border bg-muted/20 px-2 py-1.5 text-xs"
                    >
                      <EquipmentStatusDot item={item} now={now} />
                      <span className="rounded bg-background px-1.5 py-0.5 font-medium">
                        {item.system}
                      </span>
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <Wind className="size-3" />
                        {item.kind === "condensadora" ? "Cond." : "Evap."}
                      </span>
                      {(item.modelo || item.capacidade) && (
                        <span className="text-muted-foreground">
                          {[item.modelo, item.capacidade]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      )}
                      {item.serialNumber && (
                        <span className="text-muted-foreground">
                          S/N {item.serialNumber}
                        </span>
                      )}
                      <div className="ml-auto flex items-center gap-1">
                        {item.token ? (
                          <Link
                            to="/engenharia/qr/$token"
                            params={{ token: item.token }}
                            className="inline-flex items-center gap-1 text-primary hover:underline"
                          >
                            <QrCode className="size-3" />
                            QR
                          </Link>
                        ) : (
                          onGenerateQr && (
                            <Button
                              variant="ghost"
                              size="xs"
                              className="h-6 px-1.5 text-xs"
                              onClick={() => onGenerateQr(item)}
                            >
                              <QrCode className="mr-1 size-3" />
                              Gerar QR
                            </Button>
                          )
                        )}
                        {onRemoveEquipment && (
                          <Button
                            variant="ghost"
                            size="xs"
                            className="h-6 px-1.5 text-destructive hover:text-destructive"
                            onClick={() => onRemoveEquipment(item)}
                          >
                            <Trash2 className="size-3" />
                          </Button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function EquipmentLegend() {
  const order: (keyof typeof EQUIPMENT_VISUAL_STYLES)[] = [
    "not_started",
    "installing",
    "testing",
    "completed",
    "overdue",
  ];
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[0.625rem] text-muted-foreground">
      {order.map((key) => (
        <span key={key} className="flex items-center gap-1">
          <span
            className={cn(
              "size-2 rounded-full",
              EQUIPMENT_VISUAL_STYLES[key].dot
            )}
          />
          {EQUIPMENT_VISUAL_STYLES[key].label}
        </span>
      ))}
    </div>
  );
}
