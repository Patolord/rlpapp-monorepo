import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import type { FunctionReturnType } from "convex/server";
import { Plus } from "lucide-react";
import { useState, type ReactNode } from "react";

import { InventoryMovementForm } from "@/components/estoque/inventory-movement-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type Access = FunctionReturnType<typeof api.inventory.getAccess>;
type Project = FunctionReturnType<typeof api.inventory.listProjects>[number];

export type MovementPrefillLine = {
  materialId: Id<"materials">;
  name: string;
  variantLabel: string | null;
  unit: string | null;
  quantity: number;
};

export function InventoryMovementDialog({
  access,
  projects,
  fixedProjectId,
  scope = "central",
  requestId,
  prefillLines,
  open: openProp,
  onOpenChange,
  trigger,
}: {
  access: Access;
  projects: Project[];
  fixedProjectId?: Id<"projects">;
  scope?: "central" | "obra";
  requestId?: Id<"inventoryRequests">;
  prefillLines?: MovementPrefillLine[];
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: ReactNode;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = openProp ?? uncontrolledOpen;
  const setOpen = onOpenChange ?? setUncontrolledOpen;
  const fulfilling = Boolean(requestId);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger === undefined ? (
        <DialogTrigger
          render={
            <Button>
              <Plus className="mr-2 size-4" />
              Nova movimentação
            </Button>
          }
        />
      ) : (
        trigger
      )}
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {fulfilling ? "Enviar pedido à obra" : "Movimentação em lote"}
          </DialogTitle>
          <DialogDescription>
            {fulfilling
              ? "Confira os materiais e conclua a transferência do estoque central."
              : "Registre vários materiais no mesmo documento."}
          </DialogDescription>
        </DialogHeader>
        <InventoryMovementForm
          access={access}
          projects={projects}
          fixedProjectId={fixedProjectId}
          scope={scope}
          layout="dialog"
          requestId={requestId}
          prefillLines={prefillLines}
          lockType={fulfilling ? "transfer" : undefined}
          onSuccess={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
