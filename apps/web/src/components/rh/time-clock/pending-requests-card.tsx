import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { PUNCH_ROLE_LABEL } from "@rlpapp/shared/rh/pontoDay";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getErrorMessage } from "@/lib/errors";
import { formatDateKeyShort } from "@/lib/rh/time-clock";

import { TreatDialog, type TreatRequest } from "./treat-dialog";

/**
 * Horários que as pessoas informaram que esqueceram de marcar, esperando o
 * RH. Aprovar é um clique; recusar pede o motivo. Some quando não há nada.
 */
export function PendingRequestsCard({
  canWrite,
  onOpenDay,
}: {
  canWrite: boolean;
  onOpenDay: (userId: Id<"users">, date: string) => void;
}) {
  const pending = useQuery(api.timeClock.listPendingMissed, {});
  const review = useMutation(api.timeClock.reviewMissed);
  const [treat, setTreat] = useState<TreatRequest | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  if (!pending || pending.length === 0) return null;

  async function approve(requestId: Id<"clockPunchRequests">, revision: number) {
    setBusy(requestId);
    try {
      await review({ requestId, revision, approve: true });
      toast.success("Horário aprovado");
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível aprovar"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Horários esquecidos para conferir ({pending.length})
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          A pessoa informou no app que esqueceu de marcar. Aprovado, entra no espelho como horário
          informado, separado das marcações registradas.
        </p>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-border">
          {pending.map((request) => (
            <li key={request._id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <button
                type="button"
                className="min-w-0 text-left hover:underline"
                onClick={() => onOpenDay(request.userId, request.date)}
              >
                <span className="font-medium">{request.personName}</span>{" "}
                <span className="text-muted-foreground">
                  · {formatDateKeyShort(request.date)} · {PUNCH_ROLE_LABEL[request.role]} às{" "}
                  {request.timeLabel}
                  {request.note ? ` · "${request.note}"` : ""}
                </span>
              </button>
              {canWrite ? (
                <div className="flex gap-1">
                  <Button size="xs" disabled={busy === request._id} onClick={() => void approve(request._id, request.revision)}>
                    Aprovar
                  </Button>
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() =>
                      setTreat({
                        title: "Recusar horário informado",
                        description: `${request.personName}: ${PUNCH_ROLE_LABEL[request.role]} às ${request.timeLabel}.`,
                        confirmLabel: "Recusar",
                        submit: async ({ reason }) => {
                          await review({
                            requestId: request._id,
                            revision: request.revision,
                            approve: false,
                            note: reason,
                          });
                          toast.success("Horário recusado");
                        },
                      })
                    }
                  >
                    Recusar
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </CardContent>
      <TreatDialog request={treat} onClose={() => setTreat(null)} />
    </Card>
  );
}
