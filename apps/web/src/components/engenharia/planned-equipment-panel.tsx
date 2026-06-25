import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@rlpapp/backend/convex/_generated/api";
import {
  Building2,
  CheckCircle2,
  Circle,
  Loader2,
  MapPin,
  Wrench,
  FlaskConical,
  CheckCheck,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { runWithToast } from "@/lib/errors";

type FieldAction = "install" | "test" | "finalize";

/** Captura GPS de forma não-bloqueante (estrutura pronta para campo). */
function getLocation(): Promise<
  { latitude: number; longitude: number } | undefined
> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve(undefined);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        }),
      () => resolve(undefined),
      { enableHighAccuracy: true, timeout: 5000 }
    );
  });
}

export function PlannedEquipmentPanel({ token }: { token: string }) {
  const context = useQuery(api.qrCodes.getFullContext, { token });
  const fieldAction = useMutation(api.projectEquipment.fieldAction);
  const toggleItem = useMutation(api.checklists.toggleItem);
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState<FieldAction | null>(null);

  if (context === undefined) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  // Sem planejamento vinculado: nada a mostrar (cai no fluxo padrão de manutenção).
  if (!context || !context.plannedEquipment) return null;

  const planned = context.plannedEquipment;
  const location = context.location;

  async function runAction(action: FieldAction) {
    setPending(action);
    const loc = await getLocation();
    const ok = await runWithToast(
      () =>
        fieldAction({
          itemId: planned._id,
          action,
          notes: notes.trim() || undefined,
          location: loc,
        }),
      action === "install"
        ? "Instalação registrada"
        : action === "test"
          ? "Teste registrado"
          : "Equipamento finalizado",
      "Não foi possível registrar a ação"
    );
    setPending(null);
    if (ok) setNotes("");
  }

  return (
    <Card className="mb-4 border-primary/30">
      <CardContent className="space-y-4 pt-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Building2 className="size-4 text-primary" />
            <h2 className="font-semibold">{planned.system}</h2>
          </div>
          {location && (
            <p className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="size-3" />
              {[
                location.projectName,
                location.towerName,
                location.floorLabel,
                location.environmentName,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            {planned.kind === "condensadora" ? "Condensadora" : "Evaporadora"}
            {planned.modelo ? ` · ${planned.modelo}` : ""}
            {planned.capacidade ? ` · ${planned.capacidade}` : ""}
          </p>
        </div>

        {context.checklist.length > 0 && (
          <>
            <Separator />
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Checklist</p>
              {context.checklist.map((item) => (
                <button
                  key={item._id}
                  type="button"
                  onClick={() =>
                    runWithToast(
                      () =>
                        toggleItem({
                          itemId: item._id,
                          completed: !item.completed,
                        }),
                      "Checklist atualizado",
                      "Não foi possível atualizar o checklist"
                    )
                  }
                  className="flex w-full items-center gap-2 rounded px-1 py-1 text-left text-sm hover:bg-muted/50"
                >
                  {item.completed ? (
                    <CheckCircle2 className="size-4 shrink-0 text-green-600" />
                  ) : (
                    <Circle className="size-4 shrink-0 text-muted-foreground" />
                  )}
                  <span
                    className={
                      item.completed ? "text-muted-foreground line-through" : ""
                    }
                  >
                    {item.label}
                  </span>
                  {item.required && !item.completed && (
                    <span className="ml-auto text-[0.625rem] uppercase text-red-600">
                      obrigatório
                    </span>
                  )}
                </button>
              ))}
            </div>
          </>
        )}

        <Separator />
        <div className="space-y-2">
          <Textarea
            placeholder="Observação (opcional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
          />
          <div className="grid grid-cols-3 gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={pending !== null}
              onClick={() => runAction("install")}
            >
              {pending === "install" ? (
                <Loader2 className="mr-1 size-4 animate-spin" />
              ) : (
                <Wrench className="mr-1 size-4" />
              )}
              Instalar
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={pending !== null}
              onClick={() => runAction("test")}
            >
              {pending === "test" ? (
                <Loader2 className="mr-1 size-4 animate-spin" />
              ) : (
                <FlaskConical className="mr-1 size-4" />
              )}
              Testar
            </Button>
            <Button
              size="sm"
              disabled={pending !== null}
              onClick={() => runAction("finalize")}
            >
              {pending === "finalize" ? (
                <Loader2 className="mr-1 size-4 animate-spin" />
              ) : (
                <CheckCheck className="mr-1 size-4" />
              )}
              Finalizar
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
