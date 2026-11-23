import { api } from "@rlpapp/backend/convex/_generated/api";
import {
  REMINDER_EARLIEST,
  REMINDER_LATEST,
  WEEKDAYS,
  WEEKDAY_SHORT_LABELS,
  normalizeWeekdays,
  reminderTimeError,
} from "@rlpapp/shared/rh/timeClockReminders";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getErrorMessage } from "@/lib/errors";

type Draft = {
  entryOn: boolean;
  entryTime: string;
  exitOn: boolean;
  exitTime: string;
  weekdays: number[];
};

const DEFAULT_ENTRY = "08:00";
const DEFAULT_EXIT = "18:00";

/** Lembretes por push no app para quem bate ponto (avisos N18 e N19). */
export function RemindersCard({ canWrite }: { canWrite: boolean }) {
  const settings = useQuery(api.timeClock.getTimeClockSettings, {});
  const update = useMutation(api.timeClock.updateTimeClockSettings);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setDraft({
      entryOn: settings.entryReminderTime !== null,
      entryTime: settings.entryReminderTime ?? DEFAULT_ENTRY,
      exitOn: settings.exitReminderTime !== null,
      exitTime: settings.exitReminderTime ?? DEFAULT_EXIT,
      weekdays: settings.reminderWeekdays,
    });
  }, [settings]);

  if (draft === null || settings === undefined) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lembretes no celular</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Carregando...</p>
        </CardContent>
      </Card>
    );
  }

  const entryError = draft.entryOn ? reminderTimeError(draft.entryTime) : null;
  const exitError = draft.exitOn ? reminderTimeError(draft.exitTime) : null;
  const orderError =
    draft.entryOn && draft.exitOn && !entryError && !exitError && draft.exitTime <= draft.entryTime
      ? "O lembrete de saída precisa ser depois do de entrada."
      : null;
  const next = {
    entryReminderTime: draft.entryOn ? draft.entryTime : null,
    exitReminderTime: draft.exitOn ? draft.exitTime : null,
    reminderWeekdays: normalizeWeekdays(draft.weekdays),
  };
  const dirty =
    next.entryReminderTime !== settings.entryReminderTime ||
    next.exitReminderTime !== settings.exitReminderTime ||
    next.reminderWeekdays.join(",") !== normalizeWeekdays(settings.reminderWeekdays).join(",");
  const invalid = Boolean(entryError || exitError || orderError);

  function toggleDay(day: number, on: boolean) {
    if (!draft) return;
    const days = new Set(draft.weekdays);
    if (on) days.add(day);
    else days.delete(day);
    setDraft({ ...draft, weekdays: [...days] });
  }

  async function save() {
    setSaving(true);
    try {
      await update(next);
      toast.success("Lembretes do ponto atualizados");
    } catch (error) {
      toast.error(getErrorMessage(error, "Erro ao salvar"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Lembretes no celular</CardTitle>
        <p className="text-sm text-muted-foreground">
          O app RLP avisa quem bate ponto e ainda não marcou a entrada, e quem marcou mas não
          fechou o dia com a saída. Cada lembrete sai uma vez por dia, nos dias escolhidos, entre{" "}
          {REMINDER_EARLIEST} e {REMINDER_LATEST} (de noite o celular fica em silêncio).
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <ReminderRow
          id="reminder-entry"
          label="Lembrar quem não marcou a entrada às"
          on={draft.entryOn}
          time={draft.entryTime}
          disabled={!canWrite}
          error={entryError}
          onToggle={(entryOn) => setDraft({ ...draft, entryOn })}
          onTime={(entryTime) => setDraft({ ...draft, entryTime })}
        />
        <ReminderRow
          id="reminder-exit"
          label="Lembrar quem não marcou a saída às"
          on={draft.exitOn}
          time={draft.exitTime}
          disabled={!canWrite}
          error={exitError ?? orderError}
          onToggle={(exitOn) => setDraft({ ...draft, exitOn })}
          onTime={(exitTime) => setDraft({ ...draft, exitTime })}
        />
        <div className="space-y-2">
          <p className="text-sm">Dias da semana</p>
          <div className="flex flex-wrap gap-3">
            {WEEKDAYS.map((day) => (
              <label key={day} className="flex items-center gap-1.5 text-sm">
                <Checkbox
                  disabled={!canWrite}
                  checked={draft.weekdays.includes(day)}
                  onCheckedChange={(checked) => toggleDay(day, checked === true)}
                />
                {WEEKDAY_SHORT_LABELS[day]}
              </label>
            ))}
          </div>
          {next.reminderWeekdays.length === 0 && (draft.entryOn || draft.exitOn) ? (
            <p className="text-xs text-muted-foreground">
              Sem nenhum dia marcado, os lembretes não saem.
            </p>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">
          Feriados não são considerados. Cada pessoa pode desligar os lembretes no app, em Mais ›
          Notificações.
        </p>
        <Button size="sm" disabled={!canWrite || !dirty || invalid || saving} onClick={() => void save()}>
          Salvar
        </Button>
      </CardContent>
    </Card>
  );
}

function ReminderRow(props: {
  id: string;
  label: string;
  on: boolean;
  time: string;
  disabled: boolean;
  error: string | null;
  onToggle: (on: boolean) => void;
  onTime: (time: string) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Checkbox
          id={`${props.id}-on`}
          disabled={props.disabled}
          checked={props.on}
          onCheckedChange={(checked) => props.onToggle(checked === true)}
        />
        <Label htmlFor={`${props.id}-on`}>{props.label}</Label>
        <Input
          id={props.id}
          aria-label={props.label}
          type="time"
          min={REMINDER_EARLIEST}
          max={REMINDER_LATEST}
          step={300}
          className="w-28"
          disabled={props.disabled || !props.on}
          value={props.time}
          onChange={(event) => props.onTime(event.target.value)}
        />
      </div>
      {props.error ? <p className="text-xs text-destructive">{props.error}</p> : null}
    </div>
  );
}
