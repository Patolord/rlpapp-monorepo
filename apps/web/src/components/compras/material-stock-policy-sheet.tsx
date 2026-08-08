import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { getErrorMessage } from "@/lib/errors";

type ExistingPolicy = {
  locationId: Id<"inventoryLocations">;
  locationName: string;
  minimumQuantity: number;
  reorderPoint: number;
  targetQuantity: number;
  leadTimeDays: number | null;
};

type MaterialStockPolicySheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  materialId: Id<"materials"> | null;
  materialName: string;
  existingPolicy?: ExistingPolicy | null;
};

export function MaterialStockPolicySheet({
  open,
  onOpenChange,
  materialId,
  materialName,
  existingPolicy = null,
}: MaterialStockPolicySheetProps) {
  const locations = useQuery(
    api.inventoryStockPolicies.listLocations,
    open ? {} : "skip"
  );
  const upsertPolicy = useMutation(api.inventoryStockPolicies.upsert);
  const ensureCentralLocation = useMutation(
    api.inventoryStockPolicies.ensureCentralLocation
  );

  const [locationId, setLocationId] = useState("");
  const [minimumQuantity, setMinimumQuantity] = useState("");
  const [reorderPoint, setReorderPoint] = useState("");
  const [targetQuantity, setTargetQuantity] = useState("");
  const [leadTimeDays, setLeadTimeDays] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const locationOptions = useMemo(
    () =>
      (locations ?? []).map((location) => ({
        value: location._id,
        label: location.name,
      })),
    [locations]
  );
  // Base UI: `items` faz o trigger mostrar o rótulo em vez do id bruto.
  const locationItems = useMemo(
    () =>
      Object.fromEntries(
        locationOptions.map((option) => [option.value, option.label])
      ),
    [locationOptions]
  );

  useEffect(() => {
    if (!open) return;
    void ensureCentralLocation({}).catch(() => {
      // Sem permissão de escrita: o select pode ficar vazio.
    });
  }, [open, ensureCentralLocation]);

  useEffect(() => {
    if (!open) return;
    if (existingPolicy) {
      setLocationId(existingPolicy.locationId);
      setMinimumQuantity(String(existingPolicy.minimumQuantity));
      setReorderPoint(String(existingPolicy.reorderPoint));
      setTargetQuantity(String(existingPolicy.targetQuantity));
      setLeadTimeDays(
        existingPolicy.leadTimeDays != null
          ? String(existingPolicy.leadTimeDays)
          : ""
      );
      return;
    }
    setMinimumQuantity("");
    setReorderPoint("");
    setTargetQuantity("");
    setLeadTimeDays("");
    const central = locations?.find((location) => location.type === "central");
    setLocationId(central?._id ?? "");
  }, [open, existingPolicy, locations]);

  async function handleSave() {
    if (!materialId) return;
    if (!locationId) {
      toast.error("Selecione o local de estoque");
      return;
    }
    setSubmitting(true);
    try {
      await upsertPolicy({
        locationId: locationId as Id<"inventoryLocations">,
        materialId,
        minimumQuantity: Number.parseFloat(minimumQuantity),
        reorderPoint: Number.parseFloat(reorderPoint),
        targetQuantity: Number.parseFloat(targetQuantity),
        leadTimeDays: leadTimeDays.trim()
          ? Number.parseInt(leadTimeDays, 10)
          : undefined,
      });
      toast.success(
        existingPolicy ? "Política atualizada" : "Política adicionada"
      );
      onOpenChange(false);
    } catch (error) {
      toast.error(getErrorMessage(error, "Erro ao salvar política"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>
            {existingPolicy ? "Editar política" : "Nova política de reposição"}
          </SheetTitle>
          <SheetDescription>
            Defina estoque mínimo, ponto de reposição e meta para {materialName}.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 px-4 pb-4">
          <div className="space-y-2">
            <Label htmlFor="policy-location">Local de estoque</Label>
            {locationOptions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum local disponível. Abra este material com um usuário de
                Compras ou Estoque, ou registre uma entrada no estoque central.
              </p>
            ) : (
              <Select
                value={locationId}
                items={locationItems}
                onValueChange={setLocationId}
                disabled={existingPolicy != null}
              >
                <SelectTrigger id="policy-location">
                  <SelectValue placeholder="Selecione o local" />
                </SelectTrigger>
                <SelectContent>
                  {locationOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="policy-minimum">Estoque mínimo</Label>
            <Input
              id="policy-minimum"
              type="number"
              min="0"
              step="any"
              value={minimumQuantity}
              onChange={(event) => setMinimumQuantity(event.target.value)}
              placeholder="Ex.: 2"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="policy-reorder">Ponto de reposição</Label>
            <Input
              id="policy-reorder"
              type="number"
              min="0"
              step="any"
              value={reorderPoint}
              onChange={(event) => setReorderPoint(event.target.value)}
              placeholder="Ex.: 5"
            />
            <p className="text-xs text-muted-foreground">
              Deve ser maior ou igual ao mínimo e menor que a meta.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="policy-target">Meta de estoque</Label>
            <Input
              id="policy-target"
              type="number"
              min="0"
              step="any"
              value={targetQuantity}
              onChange={(event) => setTargetQuantity(event.target.value)}
              placeholder="Ex.: 20"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="policy-lead">Prazo de reposição (dias)</Label>
            <Input
              id="policy-lead"
              type="number"
              min="0"
              step="1"
              value={leadTimeDays}
              onChange={(event) => setLeadTimeDays(event.target.value)}
              placeholder="Opcional"
            />
          </div>
        </div>

        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => void handleSave()}
            disabled={submitting || locationOptions.length === 0}
          >
            {submitting ? "Salvando..." : "Salvar política"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
