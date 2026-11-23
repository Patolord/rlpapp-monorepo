import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import {
  describeWorkSchedule,
  formatMinute,
  parseClockLabel,
  workScheduleError,
  type WorkSchedule,
} from "@rlpapp/shared/rh/pontoDay";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

/** Rascunho editável: horários como "HH:MM", almoço em minutos. */
type Draft = {
  start: string;
  end: string;
  lunchMinutes: string;
  windowStart: string;
  windowEnd: string;
};

function toDraft(schedule: WorkSchedule): Draft {
  return {
    start: formatMinute(schedule.startMinute),
    end: formatMinute(schedule.endMinute),
    lunchMinutes: String(schedule.lunchMinutes),
    windowStart: formatMinute(schedule.lunchWindowStartMinute),
    windowEnd: formatMinute(schedule.lunchWindowEndMinute),
  };
}

function fromDraft(draft: Draft): { schedule: WorkSchedule | null; error: string | null } {
  const values = [draft.start, draft.end, draft.windowStart, draft.windowEnd].map(parseClockLabel);
  const lunch = /^\d+$/.test(draft.lunchMinutes.trim()) ? Number(draft.lunchMinutes) : NaN;
  if (values.some((value) => value === null) || !Number.isFinite(lunch)) {
    return { schedule: null, error: "Preencha todos os horários" };
  }
  const schedule: WorkSchedule = {
    startMinute: values[0]!,
    endMinute: values[1]!,
    lunchMinutes: lunch,
    lunchWindowStartMinute: values[2]!,
    lunchWindowEndMinute: values[3]!,
  };
  return { schedule, error: workScheduleError(schedule) };
}

function sameSchedule(a: WorkSchedule, b: WorkSchedule): boolean {
  return (
    a.startMinute === b.startMinute &&
    a.endMinute === b.endMinute &&
    a.lunchMinutes === b.lunchMinutes &&
    a.lunchWindowStartMinute === b.lunchWindowStartMinute &&
    a.lunchWindowEndMinute === b.lunchWindowEndMinute
  );
}

/** Campos da jornada: entrada e saída fixas, almoço livre dentro de uma faixa. */
function ScheduleFields({
  idPrefix,
  draft,
  disabled,
  onChange,
}: {
  idPrefix: string;
  draft: Draft;
  disabled?: boolean;
  onChange: (draft: Draft) => void;
}) {
  const field = (key: keyof Draft, label: string, kind: "time" | "number") => (
    <div className="space-y-1.5">
      <Label htmlFor={`${idPrefix}-${key}`}>{label}</Label>
      <Input
        id={`${idPrefix}-${key}`}
        type={kind}
        disabled={disabled}
        min={kind === "number" ? 15 : undefined}
        max={kind === "number" ? 240 : undefined}
        step={kind === "number" ? 5 : 300}
        value={draft[key]}
        onChange={(event) => onChange({ ...draft, [key]: event.target.value })}
        className="w-32 tabular-nums"
      />
    </div>
  );
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-4">
        {field("start", "Entrada", "time")}
        {field("end", "Saída", "time")}
        {field("lunchMinutes", "Almoço (min)", "number")}
      </div>
      <div className="flex flex-wrap items-end gap-4">
        {field("windowStart", "Almoço a partir de", "time")}
        {field("windowEnd", "Almoço até", "time")}
      </div>
    </div>
  );
}

/** Jornada padrão da empresa (vale para quem não tem jornada própria). */
export function WorkScheduleCard({ canWrite }: { canWrite: boolean }) {
  const settings = useQuery(api.timeClock.getTimeClockSettings, {});
  const update = useMutation(api.timeClock.updateTimeClockSettings);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  const server = settings?.schedule;
  useEffect(() => {
    if (server) setDraft(toDraft(server));
  }, [server]);

  const parsed = draft ? fromDraft(draft) : null;
  const dirty = Boolean(parsed?.schedule && server && !sameSchedule(parsed.schedule, server));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Jornada</CardTitle>
        <p className="text-sm text-muted-foreground">
          Entrada e saída fixas; o almoço é livre dentro da faixa. O app usa a jornada para saber
          o que cada marcação é (mesmo quando a pessoa esquece uma) e para perguntar quando algo não
          bate. Nenhuma marcação é bloqueada por estar fora do horário.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {draft === null ? (
          <p className="text-muted-foreground">Carregando...</p>
        ) : (
          <>
            <ScheduleFields idPrefix="company-schedule" draft={draft} disabled={!canWrite} onChange={setDraft} />
            {parsed?.error ? <p className="text-xs text-destructive">{parsed.error}</p> : null}
            <Button
              size="sm"
              disabled={!canWrite || !dirty || Boolean(parsed?.error) || saving}
              onClick={async () => {
                if (!parsed?.schedule) return;
                setSaving(true);
                try {
                  await update({ schedule: parsed.schedule });
                  toast.success("Jornada atualizada");
                } catch (error) {
                  toast.error(getErrorMessage(error, "Erro ao salvar"));
                } finally {
                  setSaving(false);
                }
              }}
            >
              Salvar
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** Jornada própria de uma pessoa (ou volta à da empresa). */
export function PersonScheduleDialog({
  person,
  onClose,
}: {
  person: { userId: Id<"users">; name: string; schedule: WorkSchedule | null } | null;
  onClose: () => void;
}) {
  const settings = useQuery(api.timeClock.getTimeClockSettings, person ? {} : "skip");
  const setSchedule = useMutation(api.timeClock.setUserSchedule);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  const base = person?.schedule ?? settings?.schedule ?? null;
  useEffect(() => {
    setDraft(base ? toDraft(base) : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reabre com a pessoa
  }, [person?.userId, base === null]);

  const parsed = draft ? fromDraft(draft) : null;

  async function save(schedule: WorkSchedule | null) {
    if (!person) return;
    setSaving(true);
    try {
      await setSchedule({ userId: person.userId, schedule });
      toast.success(schedule ? `Jornada de ${person.name} salva` : `${person.name} segue a jornada da empresa`);
      onClose();
    } catch (error) {
      toast.error(getErrorMessage(error, "Erro ao salvar"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={person !== null} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Jornada de {person?.name}</DialogTitle>
          <DialogDescription>
            {person?.schedule
              ? "Jornada própria."
              : settings?.schedule
                ? `Segue a da empresa: ${describeWorkSchedule(settings.schedule)}.`
                : ""}
          </DialogDescription>
        </DialogHeader>
        {draft ? (
          <ScheduleFields idPrefix="person-schedule" draft={draft} onChange={setDraft} />
        ) : (
          <p className="text-muted-foreground">Carregando...</p>
        )}
        {parsed?.error ? <p className="text-xs text-destructive">{parsed.error}</p> : null}
        <DialogFooter>
          {person?.schedule ? (
            <Button variant="outline" disabled={saving} onClick={() => void save(null)}>
              Usar a da empresa
            </Button>
          ) : null}
          <Button
            disabled={!parsed?.schedule || Boolean(parsed.error) || saving}
            onClick={() => void save(parsed!.schedule)}
          >
            Salvar jornada própria
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
