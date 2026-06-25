import { useState } from "react";
import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { Loader2, Plus, Trash2 } from "lucide-react";

import { AuthShell } from "@/components/auth-shell";
import {
  ProjectShell,
  type ProjectOverview,
} from "@/components/engenharia/project-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { cn } from "@/lib/utils";
import { runWithToast } from "@/lib/errors";

export const Route = createFileRoute(
  "/engenharia/relatorios/$projectId/entregas"
)({
  component: () => (
    <AuthShell>
      <EntregasPage />
    </AuthShell>
  ),
});

function EntregasPage() {
  const { projectId } = Route.useParams();
  return (
    <ProjectShell projectId={projectId} tab="entregas">
      {(project) => <EntregasContent project={project} />}
    </ProjectShell>
  );
}

function EntregasContent({ project }: { project: ProjectOverview }) {
  const summary = useQuery(api.deliveries.summary, { projectId: project._id });
  const deliveries = useQuery(api.deliveries.list, { projectId: project._id });
  const remove = useMutation(api.deliveries.remove);

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <div className="space-y-3 lg:col-span-3">
        <h2 className="text-lg font-semibold">Necessário × Entregue × Saldo</h2>
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Modelo</TableHead>
                  <TableHead>Capacidade</TableHead>
                  <TableHead className="text-right">Necessário</TableHead>
                  <TableHead className="text-right">Instalado</TableHead>
                  <TableHead className="text-right">Entregue</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary === undefined ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center">
                      <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : summary.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="py-10 text-center text-muted-foreground"
                    >
                      Nenhum modelo definido nos equipamentos previstos.
                    </TableCell>
                  </TableRow>
                ) : (
                  summary.map((r) => (
                    <TableRow key={r.modelo}>
                      <TableCell className="font-medium">{r.modelo}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {r.capacidade ?? "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.needed}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-green-700">
                        {r.installed}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.delivered}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right font-semibold tabular-nums",
                          r.saldo > 0
                            ? "text-red-600"
                            : "text-muted-foreground"
                        )}
                      >
                        {r.saldo}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4 lg:col-span-2">
        <AddDeliveryForm projectId={project._id} />

        <div className="space-y-2">
          <h2 className="text-lg font-semibold">Entregas lançadas</h2>
          {deliveries === undefined ? (
            <div className="flex justify-center py-6">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : deliveries.length === 0 ? (
            <p className="rounded-lg border border-dashed py-6 text-center text-sm text-muted-foreground">
              Nenhuma entrega lançada.
            </p>
          ) : (
            <div className="space-y-2">
              {deliveries.map((d) => (
                <div
                  key={d._id}
                  className="flex items-center justify-between gap-2 rounded-lg border p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {d.qty > 0 ? "+" : ""}
                      {d.qty} · {d.modelo}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(d.date).toLocaleDateString("pt-BR")}
                      {d.note ? ` · ${d.note}` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label="Remover entrega"
                    onClick={() =>
                      runWithToast(
                        () => remove({ deliveryId: d._id }),
                        "Entrega removida",
                        "Não foi possível remover"
                      )
                    }
                    className="shrink-0 text-muted-foreground transition-colors hover:text-destructive"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AddDeliveryForm({ projectId }: { projectId: Id<"projects"> }) {
  const add = useMutation(api.deliveries.add);
  const [modelo, setModelo] = useState("");
  const [qty, setQty] = useState("");
  const [date, setDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const qtyNum = Math.floor(Number(qty));
    if (!modelo.trim() || !qtyNum) return;
    setSaving(true);
    const ok = await runWithToast(
      () =>
        add({
          projectId,
          modelo: modelo.trim(),
          qty: qtyNum,
          date: new Date(`${date}T12:00:00`).getTime(),
          note: note.trim() || undefined,
        }),
      "Entrega lançada",
      "Não foi possível lançar a entrega"
    );
    setSaving(false);
    if (ok) {
      setModelo("");
      setQty("");
      setNote("");
    }
  }

  return (
    <Card>
      <CardContent className="py-5">
        <h2 className="mb-3 text-lg font-semibold">Lançar entrega</h2>
        <form onSubmit={handleAdd} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="d-modelo">Modelo</Label>
            <Input
              id="d-modelo"
              value={modelo}
              onChange={(e) => setModelo(e.target.value)}
              placeholder="Ex: AM040KXMDCH/AZ"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="d-qty">Quantidade</Label>
              <Input
                id="d-qty"
                type="number"
                inputMode="numeric"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                placeholder="Ex: 22"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="d-date">Data</Label>
              <Input
                id="d-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="d-note">Observação (opcional)</Label>
            <Input
              id="d-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ex: 1ª entrega"
            />
          </div>
          <Button
            type="submit"
            className="w-full"
            disabled={saving || !modelo.trim() || !qty}
          >
            {saving ? (
              <Loader2 className="mr-1.5 size-4 animate-spin" />
            ) : (
              <Plus className="mr-1.5 size-4" />
            )}
            Lançar entrega
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
