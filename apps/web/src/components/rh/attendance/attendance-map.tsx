import { useEffect, useState, type ComponentType } from "react";
import type { AttendancePunch, AttendanceWorksite } from "./types";

export interface AttendanceMapProps { punches: AttendancePunch[]; worksites: AttendanceWorksite[] }

/** Import Leaflet after mount: neither importing nor rendering it is safe in SSR. */
export function AttendanceMap(props: AttendanceMapProps) {
  const [Map, setMap] = useState<ComponentType<AttendanceMapProps> | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    void import("./attendance-map-client").then((module) => {
      if (active) setMap(() => module.AttendanceMapClient);
    }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, []);
  return <div className="relative z-0 min-h-80 overflow-hidden rounded-lg border border-slate-200 bg-slate-100" aria-label="Mapa da última marcação com localização">
    {Map ? <Map {...props} /> : <p role="status" className="flex h-80 items-center justify-center px-5 text-center text-sm text-slate-600">{error ? "Não foi possível carregar o mapa. As marcações continuam disponíveis na lista." : "Carregando mapa…"}</p>}
  </div>;
}
