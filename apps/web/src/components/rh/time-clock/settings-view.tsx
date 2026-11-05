import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import type { FunctionReturnType } from "convex/server";
import { useMutation, useQuery } from "convex/react";
import { MapPin, MapPinOff, Search } from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useCan } from "@/hooks/use-can";
import { getErrorMessage } from "@/lib/errors";

const TimeClockMap = lazy(() => import("./time-clock-map"));

type Worksite = FunctionReturnType<typeof api.timeClock.listWorksites>[number];

/** Raio inicial de uma cerca nova (metros). */
const DEFAULT_RADIUS_METERS = 200;
const MIN_RADIUS_METERS = 20;
const MAX_RADIUS_METERS = 5000;

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
// Cercas das obras
// ---------------------------------------------------------------------------

function WorksitesCard({ canWrite }: { canWrite: boolean }) {
  const worksites = useQuery(api.timeClock.listWorksites, {});
  const [search, setSearch] = useState("");
  const [onlyWithFence, setOnlyWithFence] = useState(false);
  const [editing, setEditing] = useState<Worksite | null>(null);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (worksites ?? []).filter((worksite) => {
      if (onlyWithFence && !worksite.geofence) return false;
      if (!term) return true;
      return (
        worksite.name.toLowerCase().includes(term) ||
        (worksite.address ?? "").toLowerCase().includes(term)
      );
    });
  }, [worksites, search, onlyWithFence]);
  const withFence = (worksites ?? []).filter((worksite) => worksite.geofence).length;

  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Cercas das obras</CardTitle>
          <span className="text-sm text-muted-foreground">
            {worksites === undefined ? "…" : `${withFence} de ${worksites.length} obras com cerca`}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          As obras são as cadastradas no sistema. A marcação feita dentro da cerca de uma obra conta
          para ela; fora de todas, fica como “fora de cerca” com a obra mais próxima como referência.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Buscar obra ou endereço…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Checkbox
              checked={onlyWithFence}
              onCheckedChange={(checked) => setOnlyWithFence(checked === true)}
            />
            Só com cerca
          </label>
        </div>
      </CardHeader>
      <CardContent>
        {worksites === undefined ? (
          <p className="text-muted-foreground">Carregando...</p>
        ) : filtered.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">
            {worksites.length === 0 ? "Nenhuma obra cadastrada." : "Nenhuma obra corresponde ao filtro."}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Obra</TableHead>
                <TableHead>Cerca</TableHead>
                <TableHead className="text-right">
                  <span className="sr-only">Ações</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((worksite) => (
                <TableRow key={worksite.projectId}>
                  <TableCell>
                    <div className="font-medium">{worksite.name}</div>
                    {worksite.address ? (
                      <div className="text-xs text-muted-foreground">{worksite.address}</div>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    {worksite.geofence ? (
                      <a
                        href={`https://www.openstreetmap.org/?mlat=${worksite.geofence.latitude}&mlon=${worksite.geofence.longitude}#map=17/${worksite.geofence.latitude}/${worksite.geofence.longitude}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-sm hover:underline"
                      >
                        <MapPin className="size-3.5 text-teal-700" />
                        raio {worksite.geofence.radiusMeters} m
                      </a>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground">
                        <MapPinOff className="mr-1 size-3" />
                        sem cerca
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {canWrite ? (
                      <Button size="xs" variant="outline" onClick={() => setEditing(worksite)}>
                        {worksite.geofence ? "Editar" : "Definir cerca"}
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
      {editing ? (
        <GeofenceDialog
          key={editing.projectId}
          worksite={editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </Card>
  );
}

type GeofenceDraft = { latitude: string; longitude: string; radius: string };

function parseCoordinate(text: string, limit: number): number | null {
  const value = Number(text.trim().replace(",", "."));
  return text.trim() !== "" && Number.isFinite(value) && Math.abs(value) <= limit ? value : null;
}

function GeofenceDialog({ worksite, onClose }: { worksite: Worksite; onClose: () => void }) {
  const setGeofence = useMutation(api.timeClock.setProjectGeofence);
  const [draft, setDraft] = useState<GeofenceDraft>(() => ({
    latitude: worksite.geofence ? String(worksite.geofence.latitude) : "",
    longitude: worksite.geofence ? String(worksite.geofence.longitude) : "",
    radius: String(worksite.geofence?.radiusMeters ?? DEFAULT_RADIUS_METERS),
  }));
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  // Muda quando o centro vem de fora do mapa (digitado ou "minha localização"):
  // o mapa recentraliza. Cliques no próprio mapa não mexem na vista.
  const [recenterKey, setRecenterKey] = useState(0);
  const recenter = () => setRecenterKey((key) => key + 1);

  const latitude = parseCoordinate(draft.latitude, 90);
  const longitude = parseCoordinate(draft.longitude, 180);
  const radius = Number(draft.radius);
  const radiusValid =
    Number.isFinite(radius) && radius >= MIN_RADIUS_METERS && radius <= MAX_RADIUS_METERS;
  const valid = latitude !== null && longitude !== null && radiusValid;

  function useMyLocation() {
    if (!("geolocation" in navigator)) {
      toast.error("Este navegador não informa a localização.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        setDraft((current) => ({
          ...current,
          latitude: position.coords.latitude.toFixed(6),
          longitude: position.coords.longitude.toFixed(6),
        }));
        recenter();
      },
      () => {
        setLocating(false);
        toast.error("Não foi possível obter sua localização.");
      },
      { enableHighAccuracy: true, timeout: 15_000 }
    );
  }

  async function save(remove: boolean) {
    setSaving(true);
    try {
      await setGeofence({
        projectId: worksite.projectId,
        geofence: remove || !valid ? null : { latitude, longitude, radiusMeters: radius },
      });
      toast.success(remove ? "Cerca removida" : "Cerca salva");
      onClose();
    } catch (error) {
      toast.error(getErrorMessage(error, "Erro ao salvar a cerca"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Cerca do ponto · {worksite.name}</DialogTitle>
          <DialogDescription>
            Clique no mapa para escolher o centro da obra, ou informe as coordenadas.
          </DialogDescription>
        </DialogHeader>
        <GeofenceMap
          latitude={latitude}
          longitude={longitude}
          radius={radiusValid ? radius : DEFAULT_RADIUS_METERS}
          name={worksite.name}
          recenterKey={recenterKey}
          onPick={(position) =>
            setDraft((current) => ({
              ...current,
              latitude: position.latitude.toFixed(6),
              longitude: position.longitude.toFixed(6),
            }))
          }
        />
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="geofence-latitude">Latitude</Label>
            <Input
              id="geofence-latitude"
              inputMode="decimal"
              value={draft.latitude}
              onChange={(event) => setDraft({ ...draft, latitude: event.target.value })}
              onBlur={recenter}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="geofence-longitude">Longitude</Label>
            <Input
              id="geofence-longitude"
              inputMode="decimal"
              value={draft.longitude}
              onChange={(event) => setDraft({ ...draft, longitude: event.target.value })}
              onBlur={recenter}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="geofence-radius">Raio (m)</Label>
            <Input
              id="geofence-radius"
              type="number"
              min={MIN_RADIUS_METERS}
              max={MAX_RADIUS_METERS}
              step={10}
              value={draft.radius}
              onChange={(event) => setDraft({ ...draft, radius: event.target.value })}
              onBlur={recenter}
            />
          </div>
        </div>
        {!radiusValid ? (
          <p className="text-xs text-destructive">
            Raio entre {MIN_RADIUS_METERS} e {MAX_RADIUS_METERS} m.
          </p>
        ) : null}
        <DialogFooter className="gap-2 sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={useMyLocation} disabled={locating}>
              <MapPin />
              {locating ? "Localizando…" : "Usar minha localização"}
            </Button>
            {worksite.geofence ? (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive"
                onClick={() => void save(true)}
                disabled={saving}
              >
                Remover cerca
              </Button>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
            <Button size="sm" onClick={() => void save(false)} disabled={!valid || saving}>
              Salvar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const NO_MARKERS: [] = [];

function GeofenceMap({
  latitude,
  longitude,
  radius,
  name,
  recenterKey,
  onPick,
}: {
  latitude: number | null;
  longitude: number | null;
  radius: number;
  name: string;
  recenterKey: number;
  onPick: (position: { latitude: number; longitude: number }) => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const worksites = useMemo(
    () =>
      latitude !== null && longitude !== null
        ? [
            {
              projectId: "draft",
              name,
              latitude,
              longitude,
              radiusMeters: radius,
              caption: "Centro da cerca",
              highlighted: true,
            },
          ]
        : [],
    [latitude, longitude, radius, name]
  );
  if (!mounted) return <div className="h-[320px] rounded-md bg-muted" />;
  return (
    <Suspense
      fallback={
        <div className="flex h-[320px] items-center justify-center rounded-md bg-muted text-sm text-muted-foreground">
          Carregando mapa…
        </div>
      }
    >
      <TimeClockMap
        markers={NO_MARKERS}
        worksites={worksites}
        onPick={onPick}
        recenterKey={recenterKey}
        className="h-[320px] w-full cursor-crosshair rounded-md"
      />
    </Suspense>
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
