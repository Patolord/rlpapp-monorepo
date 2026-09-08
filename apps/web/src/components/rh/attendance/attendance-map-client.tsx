import { useEffect, useMemo } from "react";
import { Circle, CircleMarker, MapContainer, Popup, TileLayer, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { formatTime, hasCoordinates } from "./format";
import type { AttendanceMapProps } from "./attendance-map";
import type { AttendancePunch } from "./types";

function FitMap({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length) map.fitBounds(points, { padding: [32, 32], maxZoom: 16 });
  }, [map, points]);
  useEffect(() => {
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);
  return null;
}

export function AttendanceMapClient({ punches, worksites }: AttendanceMapProps) {
  const latest = useMemo(() => {
    const byEmployee = new Map<string, AttendancePunch>();
    for (const punch of punches) {
      if (hasCoordinates(punch) && (!byEmployee.has(punch.employeeKey) || byEmployee.get(punch.employeeKey)!.timestamp < punch.timestamp)) byEmployee.set(punch.employeeKey, punch);
    }
    return [...byEmployee.values()].filter(hasCoordinates);
  }, [punches]);
  const points = useMemo<[number, number][]>(() => latest.map((punch) => [punch.latitude, punch.longitude]), [latest]);
  if (!latest.length) return <p className="flex h-80 items-center justify-center px-5 text-center text-sm text-slate-600">Nenhuma marcação com localização neste filtro. Consulte os horários na lista.</p>;
  return <MapContainer center={points[0]} zoom={12} scrollWheelZoom={false} style={{ height: 400, width: "100%" }}>
    <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
    <FitMap points={points} />
    {worksites.filter(hasCoordinates).filter((site) => site.radius !== null && site.radius > 0).map((site) => <Circle key={site.key} center={[site.latitude, site.longitude]} radius={site.radius!} pathOptions={{ color: "#64748b", weight: 1, fillOpacity: 0.06 }}><Popup>{site.name}</Popup></Circle>)}
    {latest.map((punch) => <CircleMarker key={punch._id} center={[punch.latitude, punch.longitude]} radius={8} pathOptions={{ color: "#ffffff", weight: 2, fillColor: "#4338ca", fillOpacity: 1 }}><Popup><strong>{punch.employeeName}</strong><br />Última marcação com localização: {formatTime(punch.timestamp)}<br />{punch.projectName ?? "Local sem vínculo com obra"}</Popup></CircleMarker>)}
  </MapContainer>;
}
