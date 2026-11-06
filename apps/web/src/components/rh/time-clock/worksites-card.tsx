import { api } from "@rlpapp/backend/convex/_generated/api";
import { useQuery } from "convex/react";
import { MapPin, MapPinOff, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { GeofenceDialog, type Worksite } from "./geofence-dialog";

// ---------------------------------------------------------------------------
// Cercas das obras
// ---------------------------------------------------------------------------

export function WorksitesCard({ canWrite }: { canWrite: boolean }) {
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
