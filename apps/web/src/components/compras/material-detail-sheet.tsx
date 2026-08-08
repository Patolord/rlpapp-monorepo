import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { MaterialReplenishmentBadge } from "@/components/compras/material-replenishment-badge";
import type { MaterialCatalogRow } from "@/components/compras/material-form-dialog";
import { MaterialStockPolicySheet } from "@/components/compras/material-stock-policy-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { getErrorMessage } from "@/lib/errors";

type MaterialDetailSheetProps = {
  material: MaterialCatalogRow | null;
  onOpenChange: (open: boolean) => void;
  onEdit: (material: MaterialCatalogRow) => void;
};

type PolicyDraft = {
  locationId: Id<"inventoryLocations">;
  locationName: string;
  minimumQuantity: number;
  reorderPoint: number;
  targetQuantity: number;
  leadTimeDays: number | null;
};

export function MaterialDetailSheet({
  material,
  onOpenChange,
  onEdit,
}: MaterialDetailSheetProps) {
  const aliases = useQuery(
    api.materials.listAliases,
    material ? { materialId: material._id } : "skip"
  );
  const policies = useQuery(
    api.inventoryStockPolicies.listForMaterial,
    material ? { materialId: material._id } : "skip"
  );
  const addAlias = useMutation(api.materials.addAlias);
  const suppliers = useQuery(api.suppliers.list, { activeOnly: true });
  const offerings = useQuery(
    api.suppliers.listMaterialOfferings,
    material ? { materialId: material._id } : "skip"
  );
  const upsertOffering = useMutation(api.suppliers.upsertMaterialOffering);
  const ensureCentralLocation = useMutation(
    api.inventoryStockPolicies.ensureCentralLocation
  );

  const [aliasInput, setAliasInput] = useState("");
  const [submittingAlias, setSubmittingAlias] = useState(false);
  const [supplierId, setSupplierId] = useState("");
  const [supplierCode, setSupplierCode] = useState("");
  const [submittingOffering, setSubmittingOffering] = useState(false);
  const [policySheetOpen, setPolicySheetOpen] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<PolicyDraft | null>(null);

  useEffect(() => {
    if (!material) return;
    void ensureCentralLocation({}).catch(() => {
      // Engenharia só lê; Compras/Estoque cria o local central.
    });
  }, [material, ensureCentralLocation]);

  useEffect(() => {
    if (!material) {
      setPolicySheetOpen(false);
      setEditingPolicy(null);
    }
  }, [material]);

  if (!material) return null;

  async function handleAddAlias() {
    if (!aliasInput.trim()) return;
    setSubmittingAlias(true);
    try {
      await addAlias({ materialId: material!._id, alias: aliasInput });
      toast.success("Alias adicionado");
      setAliasInput("");
    } catch (error) {
      toast.error(getErrorMessage(error, "Erro ao adicionar alias"));
    } finally {
      setSubmittingAlias(false);
    }
  }

  async function handleAddOffering() {
    if (!supplierId) return;
    setSubmittingOffering(true);
    try {
      await upsertOffering({
        supplierId: supplierId as Id<"suppliers">,
        materialId: material!._id,
        supplierCode: supplierCode || undefined,
      });
      setSupplierId("");
      setSupplierCode("");
      toast.success("Fornecedor vinculado");
    } catch (error) {
      toast.error(getErrorMessage(error, "Erro ao vincular fornecedor"));
    } finally {
      setSubmittingOffering(false);
    }
  }

  return (
    <>
      <Sheet open={material !== null} onOpenChange={onOpenChange}>
        <SheetContent className="overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{material.name}</SheetTitle>
            <SheetDescription>
              {material.sku ?? "Sem SKU"} ·{" "}
              {material.category ?? "Sem categoria"}
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-6 px-4 pb-4">
            <section className="space-y-2">
              <h3 className="text-sm font-medium">Resumo</h3>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <DetailItem label="SKU" value={material.sku} />
                <DetailItem label="Variante" value={material.variantLabel} />
                <DetailItem label="Código de barras" value={material.barcode} />
                <DetailItem label="Fabricante" value={material.manufacturer} />
                <DetailItem
                  label="Cód. fabricante"
                  value={material.manufacturerPartNumber}
                />
                <DetailItem label="Unidade" value={material.unit} />
                <DetailItem label="Compra" value={material.purchaseUnit} />
                <DetailItem
                  label="Por embalagem"
                  value={
                    material.unitsPerPurchaseUnit != null
                      ? String(material.unitsPerPurchaseUnit)
                      : null
                  }
                />
                <DetailItem label="Especificação" value={material.spec} />
                <DetailItem
                  label="Dimensões"
                  value={formatDimensions(material.dimensions)}
                />
                <DetailItem
                  label="Marca preferida"
                  value={material.brandPreference}
                />
              </dl>
              <MaterialReplenishmentBadge
                state={material.centralReplenishmentState}
                quantity={material.centralQuantity}
              />
            </section>

            <section className="space-y-2">
              <h3 className="text-sm font-medium">Fornecedores</h3>
              <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                <select
                  className="h-9 rounded-md border bg-background px-3 text-sm"
                  value={supplierId}
                  onChange={(event) => setSupplierId(event.target.value)}
                  aria-label="Fornecedor"
                >
                  <option value="">Selecione...</option>
                  {(suppliers ?? []).map((supplier) => (
                    <option key={supplier._id} value={supplier._id}>
                      {supplier.name}
                    </option>
                  ))}
                </select>
                <Input
                  value={supplierCode}
                  onChange={(event) => setSupplierCode(event.target.value)}
                  placeholder="Código do fornecedor"
                />
                <Button
                  variant="outline"
                  onClick={() => void handleAddOffering()}
                  disabled={!supplierId || submittingOffering}
                >
                  Vincular
                </Button>
              </div>
              {(offerings ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum fornecedor vinculado.
                </p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {(offerings ?? []).map((offering) => {
                    const supplier = (suppliers ?? []).find(
                      (item) => item._id === offering.supplierId
                    );
                    return (
                      <li key={offering._id} className="rounded border px-2 py-1">
                        {supplier?.name ?? "Fornecedor"}
                        {offering.supplierCode
                          ? ` · ${offering.supplierCode}`
                          : ""}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section className="space-y-2">
              <h3 className="text-sm font-medium">Atributos técnicos</h3>
              {(material.technicalAttributes ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum atributo.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {(material.technicalAttributes ?? []).map((attribute) => (
                    <li key={attribute.key} className="rounded border px-2 py-1">
                      <span className="font-medium">{attribute.key}</span>={" "}
                      {attribute.value}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="space-y-2">
              <h3 className="text-sm font-medium">Aliases</h3>
              <div className="space-y-2">
                <Label htmlFor="material-alias">Novo alias</Label>
                <div className="flex gap-2">
                  <Input
                    id="material-alias"
                    value={aliasInput}
                    onChange={(event) => setAliasInput(event.target.value)}
                    placeholder="Nome alternativo"
                  />
                  <Button
                    variant="outline"
                    onClick={() => void handleAddAlias()}
                    disabled={submittingAlias}
                  >
                    <Plus className="size-4" />
                  </Button>
                </div>
              </div>
              <ul className="space-y-1 text-sm text-muted-foreground">
                {(aliases ?? []).map((alias) => (
                  <li key={alias._id}>{alias.alias}</li>
                ))}
              </ul>
            </section>

            <section className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-medium">Políticas por local</h3>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEditingPolicy(null);
                    setPolicySheetOpen(true);
                  }}
                >
                  <Plus className="mr-1 size-4" />
                  Nova política
                </Button>
              </div>
              {(policies ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhuma política configurada.
                </p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {(policies ?? []).map((policy) => (
                    <li key={policy._id} className="rounded border p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium">{policy.locationName}</p>
                          <p className="text-muted-foreground">
                            Mín. {policy.minimumQuantity} · Repor{" "}
                            {policy.reorderPoint} · Meta {policy.targetQuantity}
                            {policy.leadTimeDays != null
                              ? ` · ${policy.leadTimeDays} dias`
                              : ""}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditingPolicy({
                              locationId: policy.locationId,
                              locationName: policy.locationName,
                              minimumQuantity: policy.minimumQuantity,
                              reorderPoint: policy.reorderPoint,
                              targetQuantity: policy.targetQuantity,
                              leadTimeDays: policy.leadTimeDays,
                            });
                            setPolicySheetOpen(true);
                          }}
                        >
                          Editar
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <SheetFooter>
            <Button variant="outline" onClick={() => onEdit(material)}>
              Editar material
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <MaterialStockPolicySheet
        open={policySheetOpen}
        onOpenChange={(nextOpen) => {
          setPolicySheetOpen(nextOpen);
          if (!nextOpen) setEditingPolicy(null);
        }}
        materialId={material._id}
        materialName={material.name}
        existingPolicy={editingPolicy}
      />
    </>
  );
}

function formatDimensions(
  dimensions: MaterialCatalogRow["dimensions"]
): string | null {
  if (!dimensions) return null;
  if (dimensions.widthMm && dimensions.heightMm) {
    return `${dimensions.widthMm} × ${dimensions.heightMm} mm`;
  }
  if (dimensions.diameterMm) return `Ø ${dimensions.diameterMm} mm`;
  if (dimensions.lengthMm) return `${dimensions.lengthMm} mm`;
  return Object.entries(dimensions)
    .filter((entry): entry is [string, number] => entry[1] !== undefined)
    .map(([key, value]) => `${key}: ${value} mm`)
    .join(", ");
}

function DetailItem({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value?.trim() ? value : "—"}</dd>
    </>
  );
}
