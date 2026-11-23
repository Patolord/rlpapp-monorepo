import {
  DECLARABLE_ROLES,
  formatMinute,
  parseClockLabel,
  PUNCH_ROLE_LABEL,
  type DeclarableRole,
} from "@rlpapp/shared/rh/pontoDay";
import { useEffect, useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getErrorMessage } from "@/lib/errors";

export type TreatRequest = {
  title: string;
  description: string;
  confirmLabel: string;
  /** Pede o tipo da marcação (com este valor inicial). */
  role?: DeclarableRole;
  /** Pede o horário (minutos desde 00:00, Brasília). */
  minute?: number;
  /** O motivo pode ficar em branco (ex.: aprovar). */
  reasonOptional?: boolean;
  submit: (values: { role?: DeclarableRole; minute?: number; reason: string }) => Promise<unknown>;
};

/**
 * Diálogo único do tratamento do RH: incluir horário, mudar o tipo,
 * desconsiderar, voltar ao automático e recusar. Sempre com motivo, que vai
 * para o histórico do dia e para a auditoria.
 */
export function TreatDialog({ request, onClose }: { request: TreatRequest | null; onClose: () => void }) {
  const [role, setRole] = useState<DeclarableRole | undefined>(undefined);
  const [time, setTime] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setRole(request?.role);
    setTime(request?.minute !== undefined ? formatMinute(request.minute) : "");
    setReason("");
  }, [request]);

  const minute = request?.minute !== undefined ? parseClockLabel(time) : undefined;
  const valid =
    (request?.reasonOptional || reason.trim().length > 0) &&
    (request?.minute === undefined || minute !== null);

  async function confirm() {
    if (!request || !valid) return;
    setSaving(true);
    try {
      await request.submit({ role, minute: minute ?? undefined, reason: reason.trim() });
      onClose();
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível salvar"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={request !== null} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{request?.title}</DialogTitle>
          <DialogDescription>{request?.description}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          {request?.role !== undefined ? (
            <div className="space-y-1.5">
              <Label htmlFor="treat-role">Tipo</Label>
              <Select value={role ?? ""} onValueChange={(value) => setRole(value as DeclarableRole)}>
                <SelectTrigger id="treat-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DECLARABLE_ROLES.map((option) => (
                    <SelectItem key={option} value={option}>
                      {PUNCH_ROLE_LABEL[option]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          {request?.minute !== undefined ? (
            <div className="space-y-1.5">
              <Label htmlFor="treat-time">Horário</Label>
              <Input
                id="treat-time"
                type="time"
                step={60}
                value={time}
                onChange={(event) => setTime(event.target.value)}
                className="w-32 tabular-nums"
              />
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="treat-reason">Motivo{request?.reasonOptional ? " (opcional)" : ""}</Label>
            <Textarea
              id="treat-reason"
              rows={3}
              value={reason}
              placeholder="Ex.: confirmado com a pessoa por telefone"
              onChange={(event) => setReason(event.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={!valid || saving} onClick={() => void confirm()}>
            {request?.confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
