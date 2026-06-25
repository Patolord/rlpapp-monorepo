import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Download, Search } from "lucide-react";

import { AuthShell } from "@/components/auth-shell";
import {
  TYPE_LABELS,
  type GridUnit,
} from "@/components/engenharia/building";
import {
  ProjectShell,
  type ProjectOverview,
} from "@/components/engenharia/project-shell";
import { StatusBadge } from "@/components/engenharia/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute(
  "/engenharia/relatorios/$projectId/global"
)({
  component: () => (
    <AuthShell>
      <GlobalPage />
    </AuthShell>
  ),
});

type Row = {
  unidade: string;
  final: number;
  floor: number;
  type: GridUnit["type"];
  system: string;
  ambiente: string;
  kind: "condensadora" | "evaporadora";
  modelo: string;
  capacidade: string;
  status: "installing" | "operational" | "warning" | "error";
  obs: string;
};

const ALL = "__all__";

function GlobalPage() {
  const { projectId } = Route.useParams();
  return (
    <ProjectShell projectId={projectId} tab="global">
      {(project) => <GlobalContent project={project} />}
    </ProjectShell>
  );
}

function GlobalContent({ project }: { project: ProjectOverview }) {
  const [search, setSearch] = useState("");
  const [floor, setFloor] = useState(ALL);
  const [type, setType] = useState(ALL);
  const [status, setStatus] = useState(ALL);

  const rows: Row[] = useMemo(
    () =>
      project.units.flatMap((u) =>
        u.equipment.map((e) => ({
          unidade: u.label,
          final: u.final,
          floor: u.floor,
          type: u.type,
          system: e.system,
          ambiente: e.ambiente,
          kind: e.kind,
          modelo: e.modelo,
          capacidade: e.capacidade,
          status: e.status,
          obs: e.obs ?? "",
        }))
      ),
    [project.units]
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows
      .filter((r) => floor === ALL || String(r.floor) === floor)
      .filter((r) => type === ALL || r.type === type)
      .filter((r) => status === ALL || r.status === status)
      .filter(
        (r) =>
          !term ||
          r.unidade.toLowerCase().includes(term) ||
          r.modelo.toLowerCase().includes(term) ||
          r.ambiente.toLowerCase().includes(term) ||
          r.system.toLowerCase().includes(term)
      )
      .sort(
        (a, b) =>
          a.floor - b.floor ||
          a.final - b.final ||
          a.system.localeCompare(b.system)
      );
  }, [rows, search, floor, type, status]);

  return (
    <div className="space-y-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:flex-wrap">
                <div className="relative sm:w-64">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="Buscar apto, modelo, ambiente..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <FilterSelect
                  value={floor}
                  onChange={setFloor}
                  placeholder="Andar"
                  options={[
                    { value: ALL, label: "Todos os andares" },
                    ...project.floors
                      .slice()
                      .sort((a, b) => a.number - b.number)
                      .map((f) => ({
                        value: String(f.number),
                        label: f.label,
                      })),
                  ]}
                />
                <FilterSelect
                  value={type}
                  onChange={setType}
                  placeholder="Tipo"
                  options={[
                    { value: ALL, label: "VRF e Split" },
                    { value: "vrf", label: "VRF" },
                    { value: "split", label: "Split" },
                  ]}
                />
                <FilterSelect
                  value={status}
                  onChange={setStatus}
                  placeholder="Status"
                  options={[
                    { value: ALL, label: "Todos os status" },
                    { value: "operational", label: "Operacional" },
                    { value: "installing", label: "Em instalação" },
                    { value: "warning", label: "Alerta" },
                    { value: "error", label: "Erro" },
                  ]}
                />
              </div>
              <Button
                variant="outline"
                onClick={() => exportCsv(filtered, project.name)}
                disabled={filtered.length === 0}
              >
                <Download className="mr-1.5 size-4" />
                Exportar CSV
              </Button>
            </div>

            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Unidade</TableHead>
                      <TableHead>Final</TableHead>
                      <TableHead>Sistema</TableHead>
                      <TableHead>Ambiente</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Modelo</TableHead>
                      <TableHead>Capacidade</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Obs</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={9}
                          className="py-10 text-center text-muted-foreground"
                        >
                          Nenhum equipamento encontrado.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filtered.map((r, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-semibold tabular-nums">
                            {r.unidade}
                          </TableCell>
                          <TableCell className="tabular-nums">
                            {r.final}
                          </TableCell>
                          <TableCell>{r.system}</TableCell>
                          <TableCell>{r.ambiente}</TableCell>
                          <TableCell>{TYPE_LABELS[r.type]}</TableCell>
                          <TableCell>{r.modelo || "—"}</TableCell>
                          <TableCell>{r.capacidade || "—"}</TableCell>
                          <TableCell>
                            <StatusBadge status={r.status} />
                          </TableCell>
                          <TableCell className="max-w-40 truncate text-muted-foreground">
                            {r.obs || "—"}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

      <p className="text-right text-xs text-muted-foreground">
        {filtered.length} de {rows.length} equipamentos
      </p>
    </div>
  );
}

function FilterSelect({
  value,
  onChange,
  placeholder,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: { value: string; label: string }[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="sm:w-44">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const STATUS_LABELS_CSV: Record<Row["status"], string> = {
  installing: "Em instalação",
  operational: "Operacional",
  warning: "Alerta",
  error: "Erro",
};

function exportCsv(rows: Row[], projectName: string) {
  const header = [
    "Unidade",
    "Final",
    "Sistema",
    "Ambiente",
    "Tipo",
    "Modelo",
    "Capacidade",
    "Status",
    "Obs",
  ];
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = [
    header.join(";"),
    ...rows.map((r) =>
      [
        r.unidade,
        String(r.final),
        r.system,
        r.ambiente,
        TYPE_LABELS[r.type],
        r.modelo,
        r.capacidade,
        STATUS_LABELS_CSV[r.status],
        r.obs,
      ]
        .map(esc)
        .join(";")
    ),
  ];
  const blob = new Blob(["\uFEFF" + lines.join("\n")], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${projectName} - Global.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
