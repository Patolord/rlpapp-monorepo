import { api } from "@rlpapp/backend/convex/_generated/api";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, usePaginatedQuery } from "convex/react";
import { Plus, Search } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AuthShell } from "@/components/auth-shell";
import { MaterialDetailSheet } from "@/components/compras/material-detail-sheet";
import {
  MaterialFormDialog,
  type MaterialCatalogRow,
} from "@/components/compras/material-form-dialog";
import { MaterialReplenishmentBadge } from "@/components/compras/material-replenishment-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getErrorMessage } from "@/lib/errors";

export const Route = createFileRoute("/compras/materiais/")({
  component: MateriaisPage,
});

function MateriaisPage() {
  return (
    <AuthShell>
      <MateriaisContent />
    </AuthShell>
  );
}

function MateriaisContent() {
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editMaterial, setEditMaterial] = useState<MaterialCatalogRow | null>(
    null
  );
  const [detailMaterial, setDetailMaterial] =
    useState<MaterialCatalogRow | null>(null);
  const updateMaterial = useMutation(api.materials.update);

  const catalog = usePaginatedQuery(
    api.materials.listCatalog,
    { search: search.trim() || undefined },
    { initialNumItems: 25 }
  );

  async function toggleActive(material: MaterialCatalogRow) {
    try {
      await updateMaterial({
        materialId: material._id,
        active: !material.active,
      });
      toast.success(material.active ? "Material arquivado" : "Material reativado");
    } catch (error) {
      toast.error(getErrorMessage(error, "Erro ao atualizar"));
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Materiais</h1>
          <p className="text-sm text-muted-foreground">
            Catálogo interno com SKU, identificação e políticas de reposição.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditMaterial(null);
            setFormOpen(true);
          }}
        >
          <Plus className="mr-2 size-4" />
          Novo material
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Buscar por nome, SKU, fabricante..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Catálogo</CardTitle>
        </CardHeader>
        <CardContent>
          {catalog.status === "LoadingFirstPage" ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Carregando materiais...
            </p>
          ) : catalog.results.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhum material encontrado.
            </p>
          ) : (
            <>
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Material</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead>Unidade</TableHead>
                      <TableHead>Reposição</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {catalog.results.map((material) => (
                      <TableRow key={material._id}>
                        <TableCell>
                          <button
                            type="button"
                            className="text-left"
                            onClick={() => setDetailMaterial(material)}
                          >
                            <p className="font-medium">{material.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {material.sku ?? "Sem SKU"}
                            </p>
                          </button>
                        </TableCell>
                        <TableCell>{material.category ?? "—"}</TableCell>
                        <TableCell>{material.unit ?? "—"}</TableCell>
                        <TableCell>
                          <MaterialReplenishmentBadge
                            state={material.centralReplenishmentState}
                            quantity={material.centralQuantity}
                          />
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={material.active ? "default" : "secondary"}
                          >
                            {material.active ? "Ativo" : "Inativo"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDetailMaterial(material)}
                            >
                              Detalhes
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => void toggleActive(material)}
                            >
                              {material.active ? "Arquivar" : "Reativar"}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="space-y-3 md:hidden">
                {catalog.results.map((material) => (
                  <button
                    type="button"
                    key={material._id}
                    className="w-full rounded-xl border bg-white p-4 text-left shadow-sm"
                    onClick={() => setDetailMaterial(material)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">{material.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {material.sku ?? "Sem SKU"}
                        </p>
                      </div>
                      <Badge
                        variant={material.active ? "default" : "secondary"}
                      >
                        {material.active ? "Ativo" : "Inativo"}
                      </Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                      <span>{material.category ?? "Sem categoria"}</span>
                      <span>{material.unit ?? "—"}</span>
                      <MaterialReplenishmentBadge
                        state={material.centralReplenishmentState}
                        quantity={material.centralQuantity}
                      />
                    </div>
                  </button>
                ))}
              </div>

              {catalog.status === "CanLoadMore" && (
                <div className="mt-4 text-center">
                  <Button variant="outline" onClick={() => catalog.loadMore(25)}>
                    Carregar mais
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <MaterialFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        material={editMaterial}
      />

      <MaterialDetailSheet
        material={detailMaterial}
        onOpenChange={(open) => {
          if (!open) setDetailMaterial(null);
        }}
        onEdit={(material) => {
          setDetailMaterial(null);
          setEditMaterial(material);
          setFormOpen(true);
        }}
      />
    </div>
  );
}
