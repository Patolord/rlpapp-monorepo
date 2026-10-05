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

/** Ponto no mapa (uma marcação ou a posição atual de uma pessoa). */
export type MapMarker = {
  id: string;
  /** Agrupa marcadores da mesma pessoa para destaque. */
  groupId: number;
  latitude: number;
  longitude: number;
  color: string;
  title: string;
  lines: string[];
  photoUrl?: string | null;
};

export type MapWorksite = {
  rhidGeofenceId: number;
  name: string;
  latitude: number;
  longitude: number;
  radius: number;
  /** Texto curto exibido no tooltip (ex.: "3 pessoas hoje"). */
  caption: string;
  projectName: string | null;
  /** Realça a cerca (ex.: obra selecionada). */
  highlighted?: boolean;
};

export type TimeClockMapProps = {
  markers: MapMarker[];
  worksites: MapWorksite[];
  /** Grupo (pessoa) em destaque: os demais pontos ficam esmaecidos. */
  highlightGroupId?: number | null;
  /** Cerca em foco: o mapa centraliza nela. */
  focusWorksiteId?: number | null;
  className?: string;
};

// Centro de São Paulo como fallback quando não há nada para mostrar.
const FALLBACK_CENTER: [number, number] = [-23.55052, -46.633308];

function FitBounds({
  bounds,
  focus,
}: {
  bounds: LatLngBoundsExpression | null;
  focus: { latitude: number; longitude: number; radius: number } | null;
}) {
  const map = useMap();
  useEffect(() => {
    if (focus) {
      const zoom = focus.radius > 400 ? 15 : focus.radius > 150 ? 16 : 17;
      map.flyTo([focus.latitude, focus.longitude], zoom, { duration: 0.6 });
      return;
    }
    if (bounds) {
      map.fitBounds(bounds, { padding: [32, 32], maxZoom: 16 });
    } else {
      map.setView(FALLBACK_CENTER, 11);
    }
  }, [map, bounds, focus]);
  return null;
}

/**
 * Mapa compartilhado do ponto: cercas (obras) do RHID como círculos e
 * marcadores coloridos. Só renderiza no cliente (Leaflet depende de `window`).
 */
export default function TimeClockMap({
  markers,
  worksites,
  highlightGroupId,
  focusWorksiteId,
  className,
}: TimeClockMapProps) {
  const bounds = useMemo<LatLngBoundsExpression | null>(() => {
    const points: Array<[number, number]> = [
      ...worksites.map((w) => [w.latitude, w.longitude] as [number, number]),
      ...markers.map((m) => [m.latitude, m.longitude] as [number, number]),
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
  }, [markers, worksites]);

  const focus = useMemo(() => {
    if (focusWorksiteId === null || focusWorksiteId === undefined) return null;
    const worksite = worksites.find((w) => w.rhidGeofenceId === focusWorksiteId);
    return worksite
      ? { latitude: worksite.latitude, longitude: worksite.longitude, radius: worksite.radius }
      : null;
  }, [focusWorksiteId, worksites]);

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
      <FitBounds bounds={bounds} focus={focus} />

      {worksites.map((worksite) => (
        <Circle
          key={worksite.rhidGeofenceId}
          center={[worksite.latitude, worksite.longitude]}
          radius={Math.max(worksite.radius, 20)}
          pathOptions={{
            color: "#0f766e",
            weight: worksite.highlighted ? 3 : 1.5,
            fillColor: "#14b8a6",
            fillOpacity: worksite.highlighted ? 0.28 : 0.12,
          }}
        >
          <Tooltip direction="top" sticky>
            <strong>{worksite.name}</strong>
            {worksite.projectName ? <div>Obra: {worksite.projectName}</div> : null}
            <div>
              {worksite.caption} · raio {Math.round(worksite.radius)} m
            </div>
          </Tooltip>
        </Circle>
      ))}

      {markers.map((marker) => {
        const dimmed =
          highlightGroupId !== null &&
          highlightGroupId !== undefined &&
          marker.groupId !== highlightGroupId;
        return (
          <CircleMarker
            key={marker.id}
            center={[marker.latitude, marker.longitude]}
            radius={dimmed ? 4 : 7}
            pathOptions={{
              color: "#ffffff",
              weight: 1.5,
              fillColor: marker.color,
              fillOpacity: dimmed ? 0.25 : 0.95,
            }}
          >
            <Popup>
              <div className="space-y-1 text-sm">
                <div className="font-semibold">{marker.title}</div>
                {marker.lines.map((line, index) => (
                  <div key={index}>{line}</div>
                ))}
                {marker.photoUrl ? (
                  <a
                    href={marker.photoUrl}
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
