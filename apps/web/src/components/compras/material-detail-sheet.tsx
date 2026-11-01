import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { formatCurrency } from "@rlpapp/shared";
import { useMutation, useQuery } from "convex/react";
import { Plus, Star, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { MaterialReplenishmentBadge } from "@/components/compras/material-replenishment-badge";
import type { MaterialCatalogRow } from "@/components/compras/material-form-dialog";
import { MaterialMergeDialog } from "@/components/compras/material-merge-dialog";
import { MaterialPriceHistory } from "@/components/compras/material-price-history";
import { MaterialStockPolicySheet } from "@/components/compras/material-stock-policy-sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  onMerged?: (targetId: Id<"materials">) => void;
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
  onMerged,
}: MaterialDetailSheetProps) {
  const aliases = useQuery(
    api.materials.listAliases,
    material ? { materialId: material._id } : "skip"
  );
  const policies = useQuery(
    api.inventoryStockPolicies.listForMaterial,
    material ? { materialId: material._id } : "skip"
  );
  const variants = useQuery(
    api.materials.listVariants,
    material?.familyId ? { familyId: material.familyId } : "skip"
  );
  const addAlias = useMutation(api.materials.addAlias);
  const suppliers = useQuery(api.suppliers.list, { activeOnly: true });
  const offerings = useQuery(
    api.suppliers.listMaterialOfferings,
    material ? { materialId: material._id } : "skip"
  );
  const upsertOffering = useMutation(api.suppliers.upsertMaterialOffering);
  const removeOffering = useMutation(api.suppliers.removeMaterialOffering);
  const ensureCentralLocation = useMutation(
    api.inventoryStockPolicies.ensureCentralLocation
  );

  const [aliasInput, setAliasInput] = useState("");
  const [submittingAlias, setSubmittingAlias] = useState(false);
  const [supplierId, setSupplierId] = useState("");
  const [supplierCode, setSupplierCode] = useState("");
  const [supplierPurchaseUnit, setSupplierPurchaseUnit] = useState("");
  const [supplierLeadTimeDays, setSupplierLeadTimeDays] = useState("");
  const [preferredSupplier, setPreferredSupplier] = useState(false);
  const [submittingOffering, setSubmittingOffering] = useState(false);
  const [policySheetOpen, setPolicySheetOpen] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<PolicyDraft | null>(null);
  const [mergeOpen, setMergeOpen] = useState(false);

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
      setMergeOpen(false);
    }
  }, [material]);

  if (!material) return null;

  const selectedSupplier =
    (suppliers ?? []).find((supplier) => supplier._id === supplierId) ?? null;

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
        purchaseUnit: supplierPurchaseUnit || undefined,
        leadTimeDays: supplierLeadTimeDays
          ? Number.parseInt(supplierLeadTimeDays, 10)
          : undefined,
        preferred: preferredSupplier,
      });
      setSupplierId("");
      setSupplierCode("");
      setSupplierPurchaseUnit("");
      setSupplierLeadTimeDays("");
      setPreferredSupplier(false);
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
            {material.imageUrl ? (
              <img
                src={material.imageUrl}
                alt={material.name}
                className="h-40 w-40 rounded-md border object-cover"
              />
            ) : null}
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
                <DetailItem
                  label="Mão de obra"
                  value={
                    material.laborPriceCents != null
                      ? `${formatCurrency(material.laborPriceCents)}${material.unit ? ` / ${material.unit}` : ""}`
                      : null
                  }
                />
              </dl>
              <MaterialReplenishmentBadge
                state={material.centralReplenishmentState}
                quantity={material.centralQuantity}
              />
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-medium">Preços</h3>
              <MaterialPriceHistory materialId={material._id} />
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-medium">Fornecedores</h3>
              {(offerings ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum fornecedor vinculado.
                </p>
              ) : (
                <ul className="divide-y rounded-md border text-sm">
                  {(offerings ?? []).map((offering) => {
                    const leadTimeFromSupplier =
                      offering.leadTimeDays == null &&
                      offering.effectiveLeadTimeDays != null;
                    const details = [
                      offering.supplierCode
                        ? `Cód. ${offering.supplierCode}`
                        : null,
                      offering.purchaseUnit,
                      offering.effectiveLeadTimeDays != null
                        ? `${offering.effectiveLeadTimeDays} dia${
                            offering.effectiveLeadTimeDays === 1 ? "" : "s"
                          }${leadTimeFromSupplier ? " (padrão)" : ""}`
                        : null,
                      offering.supplierPaymentTerms,
                    ].filter(Boolean);
                    return (
                      <li
                        key={offering._id}
                        className="flex items-center justify-between gap-2 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-medium">
                              {offering.supplierName}
                            </span>
                            {offering.preferred ? (
                              <Badge variant="outline" className="gap-1">
                                <Star className="size-3" />
                                Preferido
                              </Badge>
                            ) : null}
                            {!offering.supplierActive ? (
                              <Badge variant="secondary">
                                Fornecedor inativo
                              </Badge>
                            ) : null}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {details.length > 0
                              ? details.join(" · ")
                              : "Sem detalhes"}
                          </p>
                        </div>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label="Remover fornecedor"
                          title="Remover fornecedor"
                          onClick={() =>
                            void removeOffering({
                              offeringId: offering._id,
                            }).catch((error) =>
                              toast.error(
                                getErrorMessage(
                                  error,
                                  "Erro ao remover fornecedor"
                                )
                              )
                            )
                          }
                        >
                          <Trash2 />
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              )}

              <div className="grid gap-2 rounded-md bg-muted/40 p-3 sm:grid-cols-2">
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="offering-supplier">Fornecedor</Label>
                  <Select
                    value={supplierId || "__none__"}
                    onValueChange={(value) =>
                      setSupplierId(value === "__none__" ? "" : value)
                    }
                  >
                    <SelectTrigger id="offering-supplier" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Selecione...</SelectItem>
                      {(suppliers ?? []).map((supplier) => (
                        <SelectItem key={supplier._id} value={supplier._id}>
                          {supplier.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="offering-code">Código no fornecedor</Label>
                  <Input
                    id="offering-code"
                    value={supplierCode}
                    onChange={(event) => setSupplierCode(event.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="offering-unit">Unidade de compra</Label>
                  <Input
                    id="offering-unit"
                    value={supplierPurchaseUnit}
                    placeholder={material.purchaseUnit ?? material.unit ?? ""}
                    onChange={(event) =>
                      setSupplierPurchaseUnit(event.target.value)
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="offering-lead-time">Prazo (dias)</Label>
                  <Input
                    id="offering-lead-time"
                    type="number"
                    min="0"
                    value={supplierLeadTimeDays}
                    placeholder={
                      selectedSupplier?.defaultLeadTimeDays != null
                        ? `Padrão: ${selectedSupplier.defaultLeadTimeDays}`
                        : ""
                    }
                    onChange={(event) =>
                      setSupplierLeadTimeDays(event.target.value)
                    }
                  />
                  {selectedSupplier?.defaultLeadTimeDays != null &&
                  !supplierLeadTimeDays ? (
                    <p className="text-xs text-muted-foreground">
                      Vazio usa o prazo padrão do fornecedor (
                      {selectedSupplier.defaultLeadTimeDays} dias).
                    </p>
                  ) : null}
                </div>
                <div className="flex items-end pb-2">
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={preferredSupplier}
                      onCheckedChange={(checked) =>
                        setPreferredSupplier(checked === true)
                      }
                    />
                    Fornecedor preferido
                  </label>
                </div>
                {selectedSupplier?.paymentTerms ? (
                  <p className="text-xs text-muted-foreground sm:col-span-2">
                    Condições de pagamento do fornecedor:{" "}
                    {selectedSupplier.paymentTerms}
                  </p>
                ) : null}
                <div className="flex justify-end sm:col-span-2">
                  <Button
                    variant="outline"
                    onClick={() => void handleAddOffering()}
                    disabled={!supplierId || submittingOffering}
                  >
                    <Plus />
                    Vincular fornecedor
                  </Button>
                </div>
              </div>
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

            {variants && variants.length > 1 ? (
              <section className="space-y-2">
                <h3 className="text-sm font-medium">
                  Variantes desta família ({variants.length})
                </h3>
                <ul className="space-y-1 text-sm">
                  {variants.map((variant) => (
                    <li
                      key={variant._id}
                      className={
                        variant._id === material._id
                          ? "rounded border bg-muted px-2 py-1 font-medium"
                          : "rounded border px-2 py-1"
                      }
                    >
                      {variant.variantLabel ?? "Sem detalhe"} ·{" "}
                      {variant.sku ?? "sem SKU"}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

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
                    <Plus />
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
                  <Plus />
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

          <SheetFooter className="gap-2 sm:justify-between">
            {material.active ? (
              <Button variant="outline" onClick={() => setMergeOpen(true)}>
                Mesclar com…
              </Button>
            ) : null}
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

      <MaterialMergeDialog
        open={mergeOpen}
        onOpenChange={setMergeOpen}
        current={{
          _id: material._id,
          name: material.name,
          variantLabel: material.variantLabel,
          sku: material.sku,
        }}
        onMerged={(targetId) => {
          setMergeOpen(false);
          onMerged?.(targetId);
        }}
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
