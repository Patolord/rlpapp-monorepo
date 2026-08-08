import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { MapPin } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getErrorMessage } from "@/lib/errors";

export function InventoryAddressDialog({
  balanceId,
  materialName,
  currentAddress,
}: {
  balanceId: Id<"inventoryBalances">;
  materialName: string;
  currentAddress: string | null;
}) {
  const updateAddress = useMutation(api.inventory.updatePhysicalAddress);
  const [open, setOpen] = useState(false);
  const [address, setAddress] = useState(currentAddress ?? "");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setSubmitting(true);
    try {
      await updateAddress({ balanceId, physicalAddress: address });
      toast.success("Localização atualizada");
      setOpen(false);
    } catch (error) {
      toast.error(getErrorMessage(error, "Erro ao atualizar localização"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          setAddress(currentAddress ?? "");
          setOpen(true);
        }}
      >
        <MapPin className="mr-1 size-4" />
        {currentAddress || "Definir"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Localização física</DialogTitle>
            <DialogDescription>{materialName}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Endereço no estoque central</Label>
            <Input
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              placeholder="Ex.: Corredor A, prateleira 3"
            />
          </div>
          <DialogFooter>
            <Button
              onClick={() => void submit()}
              disabled={submitting}
            >
              {submitting ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
