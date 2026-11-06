import { api } from "@rlpapp/backend/convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { useMutation } from "convex/react";
import { MapPin } from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
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
import { getErrorMessage } from "@/lib/errors";

const TimeClockMap = lazy(() => import("./time-clock-map"));

export type Worksite = FunctionReturnType<typeof api.timeClock.listWorksites>[number];

/** Raio inicial de uma cerca nova (metros). */
const DEFAULT_RADIUS_METERS = 200;
const MIN_RADIUS_METERS = 20;
const MAX_RADIUS_METERS = 5000;

type GeofenceDraft = { latitude: string; longitude: string; radius: string };

function parseCoordinate(text: string, limit: number): number | null {
  const value = Number(text.trim().replace(",", "."));
  return text.trim() !== "" && Number.isFinite(value) && Math.abs(value) <= limit ? value : null;
}

export function GeofenceDialog({
  worksite,
  onClose,
}: {
  worksite: Worksite;
  onClose: () => void;
}) {
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
