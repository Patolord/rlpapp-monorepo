import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { formatCurrency } from "@rlpapp/shared";
import { toast } from "sonner";

import { AuthShell } from "@/components/auth-shell";
import { PriceFreshnessBadge } from "@/components/compras/price-freshness-badge";
import { ProjectShell } from "@/components/engenharia/project-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Badge } from "@/components/ui/badge";
import { getErrorMessage } from "@/lib/errors";
import { useObraProjectId } from "@/lib/engenharia/obra-context";

export const Route = createFileRoute("/engenharia/obras/$obraSlug/orcamento")({
  component: OrcamentoPage,
});

function OrcamentoPage() {
  const projectId = useObraProjectId();
  return (
    <AuthShell>
      <ProjectShell projectId={projectId}>
        {() => <OrcamentoContent projectId={projectId as Id<"projects">} />}
      </ProjectShell>
    </AuthShell>
  );
}

function OrcamentoContent({ projectId }: { projectId: Id<"projects"> }) {
  const [now] = useState(() => Date.now());
  const takeoffs = useQuery(api.takeoffs.list, { projectId });
  const createTakeoff = useMutation(api.takeoffs.create);
  const addItem = useMutation(api.takeoffs.addItem);
  const removeItem = useMutation(api.takeoffs.removeItem);
  const applyPrice = useMutation(api.takeoffs.applySuggestedPrice);
  const promoteItem = useMutation(api.takeoffs.promoteItemToMaterial);

  const [activeTakeoffId, setActiveTakeoffId] = useState<Id<"takeoffs"> | null>(null);
  const takeoffDetail = useQuery(
    api.takeoffs.get,
    activeTakeoffId ? { takeoffId: activeTakeoffId, now } : "skip"
  );

  const [newLine, setNewLine] = useState({
    rawDescription: "",
    quantity: "",
    unit: "",
    widthMm: "",
    heightMm: "",
    customSpecification: "",
  });
  const suggestions = useQuery(
    api.materials.suggest,
    newLine.rawDescription.trim().length >= 2
      ? { term: newLine.rawDescription, limit: 5 }
      : "skip"
  );

  useEffect(() => {
    if (takeoffs && takeoffs.length > 0 && !activeTakeoffId) {
      setActiveTakeoffId(takeoffs[0]._id);
    }
  }, [takeoffs, activeTakeoffId]);

  async function ensureTakeoff(): Promise<Id<"takeoffs"> | null> {
    if (activeTakeoffId) return activeTakeoffId;
    try {
      const id = await createTakeoff({
        projectId,
        name: `Orçamento ${new Date().toLocaleDateString("pt-BR")}`,
      });
      setActiveTakeoffId(id);
      return id;
    } catch (error) {
      toast.error(getErrorMessage(error, "Erro ao criar takeoff"));
      return null;
    }
  }

  async function handleAddLine(materialId?: Id<"materials">) {
    if (!newLine.rawDescription.trim()) {
      toast.error("Informe a descrição");
      return;
    }
    const takeoffId = await ensureTakeoff();
    if (!takeoffId) return;

    try {
      await addItem({
        takeoffId,
        rawDescription: newLine.rawDescription,
        quantity: newLine.quantity ? Number.parseFloat(newLine.quantity) : undefined,
        unit: newLine.unit || undefined,
        materialId,
        customDimensions:
          newLine.widthMm || newLine.heightMm
            ? {
                widthMm: newLine.widthMm
                  ? Number.parseFloat(newLine.widthMm.replace(",", "."))
                  : undefined,
                heightMm: newLine.heightMm
                  ? Number.parseFloat(newLine.heightMm.replace(",", "."))
                  : undefined,
              }
            : undefined,
        customSpecification: newLine.customSpecification || undefined,
      });
      setNewLine({
        rawDescription: "",
        quantity: "",
        unit: "",
        widthMm: "",
        heightMm: "",
        customSpecification: "",
      });
      toast.success("Item adicionado");
    } catch (error) {
      toast.error(getErrorMessage(error, "Erro ao adicionar item"));
    }
  }

  async function handleSuggest(term: string) {
    setNewLine((prev) => ({ ...prev, rawDescription: term }));
  }

  const totalEstimate = (takeoffDetail?.items ?? []).reduce((sum, item) => {
    const qty = item.quantity ?? 1;
    const price = item.estimatedUnitPriceCents ?? 0;
    return sum + qty * price;
  }, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold">Orçamento / Takeoff</h2>
          <p className="text-sm text-muted-foreground">
            Entrada livre — preços da Compras são opcionais e servem apenas como referência.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={async () => {
            const id = await createTakeoff({
              projectId,
              name: `Takeoff ${new Date().toLocaleDateString("pt-BR")}`,
            });
            setActiveTakeoffId(id);
            toast.success("Novo takeoff criado");
          }}
        >
          <Plus className="mr-2 size-4" />
          Novo takeoff
        </Button>
      </div>

      {takeoffs && takeoffs.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {takeoffs.map((t) => (
            <Button
              key={t._id}
              size="sm"
              variant={activeTakeoffId === t._id ? "default" : "outline"}
              onClick={() => setActiveTakeoffId(t._id)}
            >
              {t.name} ({t.itemCount})
            </Button>
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Adicionar item</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Descrição livre</Label>
            <Input
              value={newLine.rawDescription}
              onChange={(e) => void handleSuggest(e.target.value)}
              placeholder="Tubo cobre 1/4 - 300m"
            />
          </div>
          {suggestions && suggestions.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {suggestions.map((s) => (
                <Button
                  key={s._id}
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setNewLine((prev) => ({
                      ...prev,
                      rawDescription: s.name,
                      unit: prev.unit || s.unit || "",
                    }));
                    void handleAddLine(s._id);
                  }}
                >
                  {s.name}
                </Button>
              ))}
              <Button size="sm" variant="ghost" onClick={() => void handleAddLine()}>
                Manter texto livre
              </Button>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Quantidade (opcional)</Label>
              <Input
                value={newLine.quantity}
                onChange={(e) => setNewLine({ ...newLine, quantity: e.target.value })}
              />
            </div>
            <div>
              <Label>Unidade (opcional)</Label>
              <Input
                value={newLine.unit}
                onChange={(e) => setNewLine({ ...newLine, unit: e.target.value })}
                placeholder="m, un..."
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label>Largura personalizada (mm)</Label>
              <Input
                type="number"
                min="0"
                step="any"
                value={newLine.widthMm}
                onChange={(event) =>
                  setNewLine({ ...newLine, widthMm: event.target.value })
                }
              />
            </div>
            <div>
              <Label>Altura personalizada (mm)</Label>
              <Input
                type="number"
                min="0"
                step="any"
                value={newLine.heightMm}
                onChange={(event) =>
                  setNewLine({ ...newLine, heightMm: event.target.value })
                }
              />
            </div>
            <div>
              <Label>Detalhe personalizado</Label>
              <Input
                value={newLine.customSpecification}
                onChange={(event) =>
                  setNewLine({
                    ...newLine,
                    customSpecification: event.target.value,
                  })
                }
                placeholder="Cor, acabamento..."
              />
            </div>
          </div>
          <Button onClick={() => void handleAddLine()}>
            <Plus className="mr-2 size-4" />
            Adicionar linha
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Itens do takeoff</CardTitle>
          <p className="text-sm font-medium">
            Total estimado: {formatCurrency(totalEstimate)}
          </p>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Descrição</TableHead>
                <TableHead>Qtd</TableHead>
                <TableHead>Preço est.</TableHead>
                <TableHead>Referências</TableHead>
                <TableHead>Avisos</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(takeoffDetail?.items ?? []).map((item) => (
                <TableRow key={item._id}>
                  <TableCell>
                    <div className="font-medium">{item.rawDescription}</div>
                    {item.materialName && (
                      <div className="text-xs text-muted-foreground">{item.materialName}</div>
                    )}
                    {item.customDimensions ? (
                      <div className="text-xs text-muted-foreground">
                        {item.customDimensions.widthMm ?? "—"} ×{" "}
                        {item.customDimensions.heightMm ?? "—"} mm
                      </div>
                    ) : null}
                    {item.customSpecification ? (
                      <div className="text-xs text-muted-foreground">
                        {item.customSpecification}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    {item.quantity ?? "—"}
                    {item.unit ? ` ${item.unit}` : ""}
                  </TableCell>
                  <TableCell>
                    {item.estimatedUnitPriceCents != null
                      ? formatCurrency(item.estimatedUnitPriceCents)
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      {item.latestPrices.slice(0, 3).map((p) => (
                        <div key={`${p.supplierName}-${p.occurredAt}`} className="flex items-center gap-2 text-xs">
                          <span>
                            {p.supplierName}: {formatCurrency(p.unitPriceCents)}
                          </span>
                          <PriceFreshnessBadge freshness={p.freshness} />
                          {p.suggestedUnitPriceCents != null && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-2"
                              onClick={() =>
                                void applyPrice({
                                  itemId: item._id,
                                  unitPriceCents: p.suggestedUnitPriceCents!,
                                }).then(
                                  () => toast.success("Preço aplicado"),
                                  (e) => toast.error(getErrorMessage(e, "Erro"))
                                )
                              }
                            >
                              Usar
                            </Button>
                          )}
                        </div>
                      ))}
                      {item.latestPrices.length === 0 && (
                        <span className="text-xs text-muted-foreground">Sem referência</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {item.warnings.map((w) => (
                        <Badge key={w} variant="outline" className="text-xs font-normal">
                          {w}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      {!item.materialId ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            void promoteItem({ itemId: item._id }).then(
                              ({ created }) =>
                                toast.success(
                                  created
                                    ? "SKU criado e vinculado"
                                    : "SKU existente vinculado"
                                ),
                              (error) =>
                                toast.error(
                                  getErrorMessage(
                                    error,
                                    "Apenas Compras pode criar o SKU"
                                  )
                                )
                            )
                          }
                        >
                          Criar SKU
                        </Button>
                      ) : null}
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Remover item"
                        onClick={() =>
                          void removeItem({ itemId: item._id }).then(
                            () => toast.success("Item removido"),
                            (e) => toast.error(getErrorMessage(e, "Erro"))
                          )
                        }
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
