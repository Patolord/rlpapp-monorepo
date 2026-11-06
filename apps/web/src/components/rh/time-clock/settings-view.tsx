import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useCan } from "@/hooks/use-can";
import { getErrorMessage } from "@/lib/errors";

import { WorksitesCard } from "./worksites-card";

export function TimeClockSettingsView() {
  const canWrite = useCan("rh.ponto.write");
  return (
    <div className="space-y-6">
      {!canWrite ? (
        <p className="rounded-md border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          Você pode ver as configurações do ponto, mas só quem configura o ponto pode alterá-las.
        </p>
      ) : null}
      <ClockPeopleCard canWrite={canWrite} />
      <WorksitesCard canWrite={canWrite} />
      <PunchRulesCard canWrite={canWrite} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Quem bate ponto
// ---------------------------------------------------------------------------

function ClockPeopleCard({ canWrite }: { canWrite: boolean }) {
  const people = useQuery(api.timeClock.listClockPeople, {});
  const setClocksIn = useMutation(api.timeClock.setClocksIn);
  const [search, setSearch] = useState("");
  const [onlyClocking, setOnlyClocking] = useState(false);
  const [pending, setPending] = useState<Id<"users"> | null>(null);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (people ?? []).filter((person) => {
      if (onlyClocking && !person.clocksIn) return false;
      if (!term) return true;
      return (
        person.name.toLowerCase().includes(term) ||
        (person.login ?? "").toLowerCase().includes(term)
      );
    });
  }, [people, search, onlyClocking]);
  const clockingCount = (people ?? []).filter((person) => person.clocksIn).length;

  async function toggle(userId: Id<"users">, name: string, enabled: boolean) {
    setPending(userId);
    try {
      await setClocksIn({ userId, enabled });
      toast.success(enabled ? `${name} passa a bater ponto` : `${name} não bate mais ponto`);
    } catch (error) {
      toast.error(getErrorMessage(error, "Erro ao salvar"));
    } finally {
      setPending(null);
    }
  }

  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Quem bate ponto</CardTitle>
          <span className="text-sm text-muted-foreground">
            {people === undefined ? "…" : `${clockingCount} usuário(s)`}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          O ponto é do próprio usuário do app: quem está marcado aqui registra a marcação pelo
          celular e aparece no painel (inclusive como ausente). O cadastro de funcionários continua
          servindo só para a folha.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Buscar nome ou login…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Checkbox
              checked={onlyClocking}
              onCheckedChange={(checked) => setOnlyClocking(checked === true)}
            />
            Só quem bate ponto
          </label>
        </div>
      </CardHeader>
      <CardContent>
        {people === undefined ? (
          <p className="text-muted-foreground">Carregando...</p>
        ) : filtered.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">Ninguém corresponde ao filtro.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Usuário</TableHead>
                <TableHead>Login</TableHead>
                <TableHead className="text-right">Bate ponto</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((person) => (
                <TableRow key={person.userId}>
                  <TableCell className="font-medium">{person.name}</TableCell>
                  <TableCell className="text-muted-foreground">{person.login ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    <Checkbox
                      aria-label={`${person.name} bate ponto`}
                      checked={person.clocksIn}
                      disabled={!canWrite || pending === person.userId}
                      onCheckedChange={(checked) =>
                        void toggle(person.userId, person.name, checked === true)
                      }
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Regras da marcação pelo app
// ---------------------------------------------------------------------------

type PunchRules = {
  photoRequired: boolean;
  locationRequired: boolean;
  duplicateWindowMinutes: string;
};

function PunchRulesCard({ canWrite }: { canWrite: boolean }) {
  const settings = useQuery(api.timeClock.getTimeClockSettings, {});
  const update = useMutation(api.timeClock.updateTimeClockSettings);
  const [draft, setDraft] = useState<PunchRules | null>(null);
  const [saving, setSaving] = useState(false);
  // Último valor do servidor refletido no rascunho: só ressincroniza o que o
  // operador não editou, para outra gravação na página não apagar edições.
  const synced = useRef<PunchRules | null>(null);

  useEffect(() => {
    if (!settings) return;
    const fromServer: PunchRules = {
      photoRequired: settings.photoRequired,
      locationRequired: settings.locationRequired,
      duplicateWindowMinutes: String(settings.duplicateWindowMinutes),
    };
    const previous = synced.current;
    synced.current = fromServer;
    setDraft((current) => {
      if (!current || !previous) return fromServer;
      return {
        photoRequired:
          current.photoRequired === previous.photoRequired
            ? fromServer.photoRequired
            : current.photoRequired,
        locationRequired:
          current.locationRequired === previous.locationRequired
            ? fromServer.locationRequired
            : current.locationRequired,
        duplicateWindowMinutes:
          current.duplicateWindowMinutes === previous.duplicateWindowMinutes
            ? fromServer.duplicateWindowMinutes
            : current.duplicateWindowMinutes,
      };
    });
  }, [settings]);

  const minutesText = draft?.duplicateWindowMinutes.trim() ?? "";
  const minutes = minutesText === "" ? NaN : Number(minutesText);
  const minutesValid =
    /^\d+$/.test(minutesText) && Number.isInteger(minutes) && minutes >= 0 && minutes <= 60;
  const dirty =
    draft !== null &&
    settings !== undefined &&
    (draft.photoRequired !== settings.photoRequired ||
      draft.locationRequired !== settings.locationRequired ||
      minutes !== settings.duplicateWindowMinutes);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Marcação pelo app</CardTitle>
        <p className="text-sm text-muted-foreground">
          Regras aplicadas quando alguém registra o ponto pelo app RLP.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {draft === null ? (
          <p className="text-muted-foreground">Carregando...</p>
        ) : (
          <>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                disabled={!canWrite}
                checked={draft.locationRequired}
                onCheckedChange={(checked) =>
                  setDraft({ ...draft, locationRequired: checked === true })
                }
              />
              Exigir localização (GPS) na marcação
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                disabled={!canWrite}
                checked={draft.photoRequired}
                onCheckedChange={(checked) =>
                  setDraft({ ...draft, photoRequired: checked === true })
                }
              />
              Exigir foto na marcação
            </label>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Label htmlFor="punch-duplicate-window">Ignorar marcação repetida por</Label>
              <Input
                id="punch-duplicate-window"
                disabled={!canWrite}
                type="number"
                min={0}
                max={60}
                step={1}
                className="w-20 text-right"
                value={draft.duplicateWindowMinutes}
                onChange={(event) =>
                  setDraft({ ...draft, duplicateWindowMinutes: event.target.value })
                }
              />
              <span className="text-muted-foreground">minuto(s). 0 desliga a regra.</span>
            </div>
            {!minutesValid ? (
              <p className="text-xs text-destructive">Informe um valor entre 0 e 60.</p>
            ) : null}
            <Button
              size="sm"
              disabled={!canWrite || !dirty || !minutesValid || saving}
              onClick={async () => {
                setSaving(true);
                try {
                  await update({
                    photoRequired: draft.photoRequired,
                    locationRequired: draft.locationRequired,
                    duplicateWindowMinutes: minutes,
                  });
                  toast.success("Regras da marcação atualizadas");
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
