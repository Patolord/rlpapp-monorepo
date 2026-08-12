import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import type { FunctionReturnType } from "convex/server";
import { Plus } from "lucide-react";
import { useState } from "react";

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

export function InventoryMovementDialog({
  access,
  projects,
  fixedProjectId,
  scope = "central",
}: {
  access: Access;
  projects: Project[];
  fixedProjectId?: Id<"projects">;
  scope?: "central" | "obra";
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
    >
      <DialogTrigger
        render={
          <Button>
            <Plus className="mr-2 size-4" />
            Nova movimentação
          </Button>
        }
      />
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Movimentação em lote</DialogTitle>
          <DialogDescription>
            Registre vários materiais no mesmo documento.
          </DialogDescription>
        </DialogHeader>
        <InventoryMovementForm
          access={access}
          projects={projects}
          fixedProjectId={fixedProjectId}
          scope={scope}
          layout="dialog"
          onSuccess={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
