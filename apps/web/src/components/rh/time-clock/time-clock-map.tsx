import "leaflet/dist/leaflet.css";

import type { LatLngBoundsExpression } from "leaflet";
import { useEffect, useMemo } from "react";
import {
  Circle,
  CircleMarker,
  MapContainer,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";

import { PUNCH_KIND_COLOR, PUNCH_KIND_LABEL, type PunchKind } from "@/lib/rh/time-clock";

export type MapPunch = {
  id: string;
  rhidPersonId: number;
  personName: string;
  timeLabel: string;
  kind: PunchKind;
  latitude: number;
  longitude: number;
  photoUrl: string | null;
  geofenceName: string | null;
};

export type MapWorksite = {
  rhidGeofenceId: number;
  name: string;
  latitude: number;
  longitude: number;
  radius: number;
  peopleCount: number;
  projectName: string | null;
};

export type TimeClockMapProps = {
  punches: MapPunch[];
  worksites: MapWorksite[];
  /** Pessoa em destaque: os demais pontos ficam esmaecidos. */
  highlightPersonId?: number | null;
  className?: string;
};

// Centro de São Paulo como fallback quando não há nada para mostrar.
const FALLBACK_CENTER: [number, number] = [-23.55052, -46.633308];

function FitBounds({ bounds }: { bounds: LatLngBoundsExpression | null }) {
  const map = useMap();
  useEffect(() => {
    if (bounds) {
      map.fitBounds(bounds, { padding: [32, 32], maxZoom: 16 });
    } else {
      map.setView(FALLBACK_CENTER, 11);
    }
  }, [map, bounds]);
  return null;
}

/**
 * Mapa do dia: cercas (obras) do RHID como círculos e marcações como pontos
 * coloridos por tipo. Só renderiza no cliente (Leaflet depende de `window`).
 */
export default function TimeClockMap({
  punches,
  worksites,
  highlightPersonId,
  className,
}: TimeClockMapProps) {
  const bounds = useMemo<LatLngBoundsExpression | null>(() => {
    const points: Array<[number, number]> = [
      ...worksites.map((w) => [w.latitude, w.longitude] as [number, number]),
      ...punches.map((p) => [p.latitude, p.longitude] as [number, number]),
    ];
    if (points.length === 0) return null;
    if (points.length === 1) {
      const [lat, lng] = points[0]!;
      return [
        [lat - 0.005, lng - 0.005],
        [lat + 0.005, lng + 0.005],
      ];
    }
    return points;
  }, [punches, worksites]);

  return (
    <MapContainer
      center={FALLBACK_CENTER}
      zoom={11}
      scrollWheelZoom={false}
      className={className ?? "h-[360px] w-full rounded-md"}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitBounds bounds={bounds} />

      {worksites.map((worksite) => (
        <Circle
          key={worksite.rhidGeofenceId}
          center={[worksite.latitude, worksite.longitude]}
          radius={Math.max(worksite.radius, 20)}
          pathOptions={{
            color: "#0f766e",
            weight: 1.5,
            fillColor: "#14b8a6",
            fillOpacity: 0.12,
          }}
        >
          <Tooltip direction="top" sticky>
            <strong>{worksite.name}</strong>
            {worksite.projectName ? <div>Obra: {worksite.projectName}</div> : null}
            <div>
              {worksite.peopleCount} {worksite.peopleCount === 1 ? "pessoa" : "pessoas"} hoje ·
              raio {Math.round(worksite.radius)} m
            </div>
          </Tooltip>
        </Circle>
      ))}

      {punches.map((punch) => {
        const dimmed =
          highlightPersonId !== null &&
          highlightPersonId !== undefined &&
          punch.rhidPersonId !== highlightPersonId;
        return (
          <CircleMarker
            key={punch.id}
            center={[punch.latitude, punch.longitude]}
            radius={dimmed ? 4 : 7}
            pathOptions={{
              color: "#ffffff",
              weight: 1.5,
              fillColor: PUNCH_KIND_COLOR[punch.kind],
              fillOpacity: dimmed ? 0.25 : 0.95,
            }}
          >
            <Popup>
              <div className="space-y-1 text-sm">
                <div className="font-semibold">{punch.personName}</div>
                <div>
                  {PUNCH_KIND_LABEL[punch.kind]} às {punch.timeLabel}
                </div>
                {punch.geofenceName ? <div>Local: {punch.geofenceName}</div> : null}
                {punch.photoUrl ? (
                  <a
                    href={punch.photoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary underline"
                  >
                    Ver foto
                  </a>
                ) : null}
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
