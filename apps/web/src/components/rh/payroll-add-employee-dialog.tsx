import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { getErrorMessage } from "@/lib/errors";

export function PayrollAddEmployeeDialog({
  available,
  onClose,
  onAdd,
}: {
  available: { _id: Id<"employees">; name: string; code: string | null; jobTitle: string | null }[];
  onClose: () => void;
  onAdd: (payload: { employeeId?: Id<"employees">; name?: string }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [employeeId, setEmployeeId] = useState<string>(available[0]?._id ?? "");
  const [submitting, setSubmitting] = useState(false);
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="space-y-4 sm:max-w-[420px]">
        <DialogHeader>
          <div className="text-[11px] font-bold tracking-[0.06em] text-muted-foreground uppercase">
            Folha
          </div>
          <DialogTitle className="text-base font-bold">
            Adicionar funcionário
          </DialogTitle>
        </DialogHeader>
        {available.length > 0 && (
          <label className="flex flex-col gap-1 text-sm">
            Cadastro existente
            <select
              className="h-9 rounded-md border border-border bg-background px-2 text-sm"
              value={employeeId}
              onChange={(event) => setEmployeeId(event.target.value)}
            >
              {available.map((employee) => (
                <option key={employee._id} value={employee._id}>
                  {employee.code ? `${employee.code} · ` : ""}
                  {employee.name}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              disabled={submitting || !employeeId}
              onClick={() => {
                setSubmitting(true);
                void onAdd({ employeeId: employeeId as Id<"employees"> })
                  .catch((error) =>
                    toast.error(getErrorMessage(error, "Erro ao adicionar"))
                  )
                  .finally(() => setSubmitting(false));
              }}
            >
              Adicionar selecionado
            </Button>
          </label>
        )}
        <label className="flex flex-col gap-1 text-sm">
          Novo funcionário
          <Input
            value={name}
            placeholder="Nome completo"
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={submitting || !name.trim()}
            onClick={() => {
              setSubmitting(true);
              void onAdd({ name })
                .catch((error) =>
                  toast.error(getErrorMessage(error, "Erro ao adicionar"))
                )
                .finally(() => setSubmitting(false));
            }}
          >
            Criar e incluir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
