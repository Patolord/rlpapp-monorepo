import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import {
  describeWorkSchedule,
  PUNCH_ROLE_LABEL,
  type PunchSlot,
  type RoleBasis,
} from "@rlpapp/shared/rh/pontoDay";
import type { FunctionReturnType } from "convex/server";
import { useMutation, useQuery } from "convex/react";
import { AlertTriangle, Info, MoreHorizontal } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDateKeyLong, PUNCH_KIND_BADGE_VARIANT, todayDateKey } from "@/lib/rh/time-clock";

import { PunchPhotoButton } from "./punch-photo";
import { TreatDialog, type TreatRequest } from "./treat-dialog";

type PersonDay = FunctionReturnType<typeof api.timeClock.getPersonDay>;
type DayItem = PersonDay["day"]["items"][number];

const BASIS_LABEL: Record<RoleBasis, string> = {
  auto: "pela jornada",
  employee: "a pessoa informou no app",
  rh: "tratada pelo RH",
  pending: "horário informado, aguarda aprovação",
  approved: "horário incluído/aprovado pelo RH",
};

const REQUEST_STATUS_LABEL = {
  pending: "Aguardando",
  approved: "Aprovado",
  rejected: "Recusado",
  canceled: "Desfeito pela pessoa",
} as const;

/** Horário sugerido para incluir uma posição que faltou. */
function suggestedMinute(slot: PunchSlot, data: PersonDay): number {
  const { schedule } = data;
  const find = (role: PunchSlot) => data.day.items.find((item) => item.role === role)?.minute;
  switch (slot) {
    case "entrada":
      return schedule.startMinute;
    case "saida":
      return schedule.endMinute;
    case "almoco_saida":
      return (find("almoco_retorno") ?? schedule.lunchWindowStartMinute + schedule.lunchMinutes) - schedule.lunchMinutes;
    case "almoco_retorno":
      return (find("almoco_saida") ?? schedule.lunchWindowStartMinute) + schedule.lunchMinutes;
  }
}

/**
 * O dia de uma pessoa para o RH: o que cada marcação é, o que falta e o
 * tratamento (incluir horário, mudar o tipo, desconsiderar, aprovar o que a
 * pessoa informou). A marcação registrada nunca muda; tudo fica no histórico.
 */
export function PersonDayPanel({
  userId,
  date,
  canWrite,
  onClose,
}: {
  userId: Id<"users">;
  date: string;
  canWrite: boolean;
  onClose: () => void;
}) {
  const data = useQuery(api.timeClock.getPersonDay, { userId, date, today: todayDateKey() });
  const adjust = useMutation(api.timeClock.adjustPunch);
  const include = useMutation(api.timeClock.includeMissed);
  const review = useMutation(api.timeClock.reviewMissed);
  const [treat, setTreat] = useState<TreatRequest | null>(null);

  if (data === undefined) {
    return (
      <Card>
        <CardContent className="py-6 text-muted-foreground">Carregando...</CardContent>
      </Card>
    );
  }

  const includeSlot = (slot: PunchSlot) =>
    setTreat({
      title: `Incluir ${PUNCH_ROLE_LABEL[slot].toLowerCase()}`,
      description: `${data.personName}, ${formatDateKeyLong(date)}. Fica no espelho como horário incluído pelo RH, separado das marcações.`,
      confirmLabel: "Incluir",
      minute: suggestedMinute(slot, data),
      submit: async ({ minute, reason }) => {
        await include({ userId, date, role: slot, minute: minute!, reason });
        toast.success("Horário incluído");
      },
    });

  const approve = async (item: DayItem) => {
    try {
      await review({ requestId: item.requestId!, approve: true });
      toast.success("Horário aprovado");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível aprovar");
    }
  };

  const action = (item: DayItem) => {
    if (!canWrite) return null;
    if (item.source === "request") {
      if (item.basis !== "pending" || !item.requestId) return null;
      return (
        <div className="flex gap-1">
          <Button size="xs" onClick={() => void approve(item)}>
            Aprovar
          </Button>
          <Button
            size="xs"
            variant="outline"
            onClick={() =>
              setTreat({
                title: "Recusar horário informado",
                description: `${PUNCH_ROLE_LABEL[item.role]} às ${item.timeLabel}. A pessoa vê que foi recusado.`,
                confirmLabel: "Recusar",
                submit: async ({ reason }) => {
                  await review({ requestId: item.requestId!, approve: false, note: reason });
                  toast.success("Horário recusado");
                },
              })
            }
          >
            Recusar
          </Button>
        </div>
      );
    }
    const punchId = item.punchId!;
    const what = `Marcação das ${item.timeLabel}. A marcação registrada não muda.`;
    return (
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon-xs" aria-label="Tratar marcação" />}
        >
          <MoreHorizontal />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem
            onClick={() =>
              setTreat({
                title: "Mudar o tipo",
                description: what,
                confirmLabel: "Salvar",
                role: item.role === "repetida" || item.role === "desconsiderada" ? "entrada" : item.role,
                submit: async ({ role, reason }) => {
                  await adjust({ punchId, action: "set_role", role, reason });
                  toast.success("Tipo atualizado");
                },
              })
            }
          >
            Mudar o tipo…
          </DropdownMenuItem>
          {item.role !== "desconsiderada" ? (
            <DropdownMenuItem
              onClick={() =>
                setTreat({
                  title: "Desconsiderar marcação",
                  description: `${what} Ela continua no registro, só não conta no dia.`,
                  confirmLabel: "Desconsiderar",
                  submit: async ({ reason }) => {
                    await adjust({ punchId, action: "set_aside", reason });
                    toast.success("Marcação desconsiderada");
                  },
                })
              }
            >
              Desconsiderar…
            </DropdownMenuItem>
          ) : null}
          {item.basis === "rh" ? (
            <DropdownMenuItem
              onClick={() =>
                setTreat({
                  title: "Voltar à leitura automática",
                  description: what,
                  confirmLabel: "Voltar",
                  submit: async ({ reason }) => {
                    await adjust({ punchId, action: "clear", reason });
                    toast.success("Tratamento removido");
                  },
                })
              }
            >
              Voltar ao automático…
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  const issues = data.day.issues;
  const missingSlots = new Set<PunchSlot>();
  for (const issue of issues) {
    if (issue.code === "missing" && issue.slot) missingSlots.add(issue.slot);
    if (issue.code === "no_lunch") {
      missingSlots.add("almoco_saida");
      missingSlots.add("almoco_retorno");
    }
  }
  const history = data.requests.filter((request) => request.status !== "pending");

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="space-y-1">
          <CardTitle className="text-base">Dia de {data.personName}</CardTitle>
          <p className="text-xs text-muted-foreground">Jornada: {describeWorkSchedule(data.schedule)}</p>
        </div>
        <Button variant="ghost" size="xs" onClick={onClose}>
          Fechar
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {issues.length > 0 ? (
          <ul className="space-y-1.5">
            {issues.map((issue, index) => (
              <li
                key={`${issue.code}-${issue.slot ?? issue.itemId ?? index}`}
                className="flex items-center gap-2 text-sm"
              >
                {issue.severity === "action" ? (
                  <AlertTriangle className="size-4 shrink-0 text-amber-600" />
                ) : (
                  <Info className="size-4 shrink-0 text-muted-foreground" />
                )}
                <span className={issue.severity === "action" ? "" : "text-muted-foreground"}>
                  {issue.message}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Dia completo, nada para tratar.</p>
        )}
        {canWrite && missingSlots.size > 0 ? (
          <div className="flex flex-wrap gap-2">
            {[...missingSlots].map((slot) => (
              <Button key={slot} size="xs" variant="outline" onClick={() => includeSlot(slot)}>
                Incluir {PUNCH_ROLE_LABEL[slot].toLowerCase()}
              </Button>
            ))}
          </div>
        ) : null}

        {data.day.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem marcações neste dia.</p>
        ) : (
          <ol className="space-y-2">
            {data.day.items.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="font-mono tabular-nums">{item.timeLabel}</span>
                  <Badge variant={PUNCH_KIND_BADGE_VARIANT[item.role]}>{PUNCH_ROLE_LABEL[item.role]}</Badge>
                  <span className="truncate text-xs text-muted-foreground">
                    {item.source === "request" ? "" : `${item.worksiteName ?? "sem obra"} · `}
                    {BASIS_LABEL[item.basis]}
                    {item.offline ? " · sem internet" : ""}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {item.hasPhoto && item.punchId ? (
                    <PunchPhotoButton punchId={item.punchId} personName={data.personName} />
                  ) : null}
                  {action(item)}
                </div>
              </li>
            ))}
          </ol>
        )}

        {data.adjustments.length > 0 || history.length > 0 ? (
          <div className="space-y-1.5 border-t border-border pt-3">
            <p className="text-xs font-medium text-muted-foreground">Histórico do tratamento</p>
            <ul className="space-y-1 text-xs text-muted-foreground">
              {data.adjustments.map((adjustment) => (
                <li key={adjustment._id}>
                  {adjustment.punchTimeLabel}:{" "}
                  {adjustment.action === "set_aside"
                    ? "desconsiderada"
                    : adjustment.action === "clear"
                      ? "voltou ao automático"
                      : `tratada como ${PUNCH_ROLE_LABEL[adjustment.role ?? "entrada"].toLowerCase()}`}{" "}
                  por {adjustment.byName}: {adjustment.reason}
                </li>
              ))}
              {history.map((request) => (
                <li key={request._id}>
                  {PUNCH_ROLE_LABEL[request.role]} às {request.timeLabel} ({request.origin === "rh" ? "incluído pelo RH" : "informado pela pessoa"}):{" "}
                  {REQUEST_STATUS_LABEL[request.status]}
                  {request.reviewNote ? `, ${request.reviewNote}` : ""}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
      <TreatDialog request={treat} onClose={() => setTreat(null)} />
    </Card>
  );
}
