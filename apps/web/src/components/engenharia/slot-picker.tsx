import { useEffect, useMemo, useState } from "react";
import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import {
  Building2,
  CheckCircle2,
  ChevronRight,
  Loader2,
  MapPin,
  Search,
  Wind,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { getErrorMessage } from "@/lib/errors";

type PendingSlot = {
  itemId: Id<"projectEquipment">;
  kind: "condensadora" | "evaporadora";
  system: string;
  modelo: string;
  capacidade: string;
  towerName: string | null;
  floorLabel: string | null;
  floorNumber: number | null;
  environmentName: string | null;
};

/**
 * Passo opcional após o técnico cadastrar um equipamento pelo QR: escolher a
 * vaga planejada ("onde está este equipamento?") na obra de destino do lote.
 * Pular mantém o comportamento atual — o cadastro cai na fila que a
 * engenharia atribui depois no modo "Vincular QRs".
 */
export function SlotPickerStep({
  projectId,
  projectName,
  equipmentId,
  onDone,
}: {
  projectId: Id<"projects">;
  projectName: string;
  equipmentId: Id<"equipment">;
  onDone: () => void;
}) {
  const slots = useQuery(api.projectEquipment.listPendingSlots, {
    projectId,
  }) as PendingSlot[] | undefined;
  const claimSlot = useMutation(api.projectEquipment.claimSlot);

  const [filter, setFilter] = useState("");
  const [claimingId, setClaimingId] = useState<Id<"projectEquipment"> | null>(
    null
  );

  // Sem vagas pendentes: nada a escolher, segue direto para o detalhe.
  useEffect(() => {
    if (slots !== undefined && slots.length === 0) onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots]);

  const groups = useMemo(() => {
    if (!slots) return [];
    const term = filter.trim().toLowerCase();
    const filtered = term
      ? slots.filter((slot) =>
          [
            slot.towerName,
            slot.floorLabel,
            slot.environmentName,
            slot.system,
            slot.modelo,
            slot.capacidade,
            slot.kind,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(term)
        )
      : slots;

    const byFloor = new Map<string, { label: string; slots: PendingSlot[] }>();
    for (const slot of filtered) {
      const label = [slot.towerName, slot.floorLabel ?? "Sem andar"]
        .filter(Boolean)
        .join(" · ");
      let group = byFloor.get(label);
      if (!group) {
        group = { label, slots: [] };
        byFloor.set(label, group);
      }
      group.slots.push(slot);
    }
    return [...byFloor.values()];
  }, [slots, filter]);

  async function handleClaim(slot: PendingSlot) {
    if (claimingId) return;
    setClaimingId(slot.itemId);
    try {
      await claimSlot({ itemId: slot.itemId, equipmentId });
      toast.success(
        `Equipamento atribuído a ${slot.environmentName ?? "vaga"}${slot.floorLabel ? ` · ${slot.floorLabel}` : ""}`
      );
      onDone();
    } catch (error) {
      toast.error(
        getErrorMessage(error, "Não foi possível atribuir o equipamento")
      );
      setClaimingId(null);
    }
  }

  if (slots === undefined || slots.length === 0) {
    return (
      <div className="flex min-h-40 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center gap-2 text-center">
        <CheckCircle2 className="h-10 w-10 text-green-600" />
        <h1 className="text-xl font-bold">Equipamento registrado!</h1>
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Building2 className="h-4 w-4 shrink-0" />
          {projectName}
        </p>
        <p className="text-sm text-muted-foreground">
          Onde está este equipamento? Escolha a vaga planejada (opcional).
        </p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="h-11 pl-9 text-base"
          placeholder="Filtrar andar, ambiente, sistema…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>

      <div className="space-y-3">
        {groups.length === 0 && (
          <p className="rounded-md border border-dashed px-3 py-5 text-center text-sm text-muted-foreground">
            Nenhuma vaga encontrada com esse filtro.
          </p>
        )}
        {groups.map((group) => (
          <Card key={group.label}>
            <CardContent className="space-y-1.5 py-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <MapPin className="h-3.5 w-3.5" />
                {group.label}
              </p>
              <ul className="space-y-1.5">
                {group.slots.map((slot) => {
                  const claiming = claimingId === slot.itemId;
                  return (
                    <li key={slot.itemId}>
                      <button
                        type="button"
                        disabled={claimingId !== null}
                        onClick={() => void handleClaim(slot)}
                        className={cn(
                          "flex w-full items-center gap-2.5 rounded-md border px-3 py-2.5 text-left transition-colors",
                          "hover:border-primary/50 hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-60"
                        )}
                      >
                        <Wind className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">
                            {slot.environmentName ?? "Sem ambiente"}
                            {" · "}
                            {slot.kind === "condensadora"
                              ? "Condensadora"
                              : "Evaporadora"}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {[slot.system || "Sem sistema", slot.modelo, slot.capacidade]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </span>
                        {claiming ? (
                          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>

      <Button
        variant="outline"
        className="h-12 w-full text-base"
        disabled={claimingId !== null}
        onClick={onDone}
      >
        Pular — atribuir depois
      </Button>
    </div>
  );
}
