import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  Link2,
  Pencil,
  QrCode,
  Trash2,
  Unlink,
  Wind,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { BuildingMatrixActions } from "@/components/engenharia/building-panel/building-matrix";
import { EquipmentStatusDot } from "@/components/engenharia/building-panel/equipment-status-dot";
import {
  EQUIPMENT_VISUAL_STYLES,
  getEquipmentVisualState,
  type HierarchyEnvironment,
  type HierarchyItem,
} from "@/components/engenharia/building-panel/hierarchy";

export function EquipmentRow({
  item,
  env,
  now,
  actions,
}: {
  item: HierarchyItem;
  env: HierarchyEnvironment;
  now: number;
  actions?: BuildingMatrixActions;
}) {
  const visual = getEquipmentVisualState(item, now);
  const style = EQUIPMENT_VISUAL_STYLES[visual];

  return (
    <li className="space-y-1.5 rounded-lg border bg-muted/20 px-3 py-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <EquipmentStatusDot item={item} now={now} />
        <span className="flex items-center gap-1 text-muted-foreground">
          <Wind className="size-3" />
          {item.kind === "condensadora" ? "Condensadora" : "Evaporadora"}
        </span>
        <span className={cn("font-medium", style.text)}>{style.label}</span>
        {!item.systemId && !item.system && (
          <span
            className="inline-flex items-center gap-1 text-amber-600"
            title="Equipamento sem sistema"
          >
            <AlertTriangle className="size-3 shrink-0" />
            <span className="text-[0.625rem] font-medium uppercase">
              Sem sistema
            </span>
          </span>
        )}
      </div>

      {(item.modelo || item.capacidade || item.serialNumber) && (
        <div className="flex flex-wrap gap-x-3 text-muted-foreground">
          {(item.modelo || item.capacidade) && (
            <span>
              {[item.modelo, item.capacidade].filter(Boolean).join(" · ")}
            </span>
          )}
          {item.serialNumber && <span>S/N {item.serialNumber}</span>}
        </div>
      )}

      {item.deadline && (
        <p className="text-muted-foreground">
          Prazo: {new Date(item.deadline).toLocaleDateString("pt-BR")}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-0.5">
        {item.token ? (
          <>
            <Link
              to="/engenharia/qr/$token"
              params={{ token: item.token }}
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              <QrCode className="size-3" />
              Ver QR
            </Link>
            {actions?.onUnlinkQr && (
              <Button
                variant="ghost"
                size="xs"
                className="text-muted-foreground"
                onClick={() => actions.onUnlinkQr?.(item)}
              >
                <Unlink />
                Desvincular
              </Button>
            )}
          </>
        ) : (
          <>
            {actions?.onLinkQr && (
              <Button
                variant="outline"
                size="xs"
                onClick={() => actions.onLinkQr?.(item)}
              >
                <Link2 />
                Vincular QR
              </Button>
            )}
            {actions?.onGenerateQr && (
              <Button
                variant="ghost"
                size="xs"
                onClick={() => actions.onGenerateQr?.(item)}
              >
                <QrCode />
                Gerar QR
              </Button>
            )}
          </>
        )}
        {actions?.onEditEquipment && (
          <Button
            variant="ghost"
            size="xs"
            onClick={() => actions.onEditEquipment?.(item, env)}
          >
            <Pencil />
          </Button>
        )}
        {actions?.onRemoveEquipment && (
          <Button
            variant="ghost"
            size="xs"
            className="ml-auto text-destructive hover:text-destructive"
            onClick={() => actions.onRemoveEquipment?.(item)}
          >
            <Trash2 />
          </Button>
        )}
      </div>
    </li>
  );
}
