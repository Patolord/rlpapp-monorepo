import { api } from "@rlpapp/backend/convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { useMutation } from "convex/react";
import { Receipt, Trash2 } from "lucide-react";
import { formatCurrency } from "@rlpapp/shared";
import { toast } from "sonner";

import { PriceFreshnessBadge } from "@/components/compras/price-freshness-badge";
import { TakeoffSavedQuotes } from "@/components/compras/takeoff-saved-quotes";
import { hasAnyDimension, SizeEstimateHint } from "@/components/compras/size-estimate-hint";
import type { TakeoffQuoteTarget } from "@/components/compras/takeoff-quote-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getErrorMessage } from "@/lib/errors";

type TakeoffItem = NonNullable<FunctionReturnType<typeof api.takeoffs.get>>["items"][number];

/** Itens do takeoff manual com referências de preço e ações por linha. */
export function TakeoffItemsCard({
  items,
  canEdit,
  canQuote,
  canPromoteMaterial,
  onQuote,
}: {
  items: TakeoffItem[];
  canEdit: boolean;
  canQuote: boolean;
  canPromoteMaterial: boolean;
  onQuote: (target: TakeoffQuoteTarget) => void;
}) {
  const removeItem = useMutation(api.takeoffs.removeItem);
  const applyPrice = useMutation(api.takeoffs.applySuggestedPrice);
  const promoteItem = useMutation(api.takeoffs.promoteItemToMaterial);

  const totalEstimate = items.reduce((sum, item) => {
    const qty = item.quantity ?? 1;
    const price = item.estimatedUnitPriceCents ?? 0;
    return sum + qty * price;
  }, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Itens do takeoff</CardTitle>
        <CardAction>
          <p className="text-sm font-medium">
            Total estimado: {formatCurrency(totalEstimate)}
          </p>
        </CardAction>
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
            {items.map((item) => (
              <TableRow key={item._id}>
                <TableCell>
                  <div className="font-medium">{item.rawDescription}</div>
                  {item.materialName && (
                    <div className="text-xs text-muted-foreground">{item.materialName}</div>
                  )}
                  {item.customDimensions ? (
                    <div className="text-xs text-muted-foreground">
                      {formatCustomDimensions(item.customDimensions)}
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
                  <div className="space-y-1">
                    <span className="tabular-nums">
                      {item.estimatedUnitPriceCents != null
                        ? formatCurrency(item.estimatedUnitPriceCents)
                        : "—"}
                    </span>
                    {item.customDimensions &&
                    hasAnyDimension(item.customDimensions) ? (
                      <SizeEstimateHint
                        compact
                        materialId={item.materialId}
                        familyName={item.rawDescription}
                        dimensions={item.customDimensions}
                        onApply={
                          canEdit
                            ? (unitPriceCents) =>
                                void applyPrice({
                                  itemId: item._id,
                                  unitPriceCents,
                                }).then(
                                  () => toast.success("Estimativa aplicada"),
                                  (e) => toast.error(getErrorMessage(e, "Erro"))
                                )
                            : undefined
                        }
                      />
                    ) : null}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="space-y-1">
                    <TakeoffSavedQuotes quotes={item.quotes} />
                    {item.latestPrices.slice(0, 3).map((p) => (
                      <div key={`${p.supplierName}-${p.occurredAt}`} className="flex items-center gap-2 text-xs">
                        <span>
                          {p.supplierName}: {formatCurrency(p.unitPriceCents)}
                        </span>
                        <PriceFreshnessBadge freshness={p.freshness} />
                        {canEdit && p.suggestedUnitPriceCents != null && (
                          <Button
                            size="xs"
                            variant="ghost"
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
                    {item.latestPrices.length === 0 && item.quotes.length === 0 && (
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
                    {canQuote ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onQuote(item)}
                      >
                        <Receipt />
                        Cotação
                      </Button>
                    ) : null}
                    {!item.materialId && canPromoteMaterial ? (
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
                    {canEdit && (
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
                      <Trash2 />
                    </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function formatCustomDimensions(dimensions: {
  widthMm?: number;
  heightMm?: number;
  lengthMm?: number;
  thicknessMm?: number;
  diameterMm?: number;
}) {
  const parts: string[] = [];
  if (dimensions.widthMm && dimensions.heightMm) {
    parts.push(`${dimensions.widthMm} × ${dimensions.heightMm} mm`);
  } else {
    if (dimensions.widthMm) parts.push(`L ${dimensions.widthMm} mm`);
    if (dimensions.heightMm) parts.push(`A ${dimensions.heightMm} mm`);
  }
  if (dimensions.lengthMm) parts.push(`C ${dimensions.lengthMm} mm`);
  if (dimensions.thicknessMm) parts.push(`E ${dimensions.thicknessMm} mm`);
  if (dimensions.diameterMm) parts.push(`Ø ${dimensions.diameterMm} mm`);
  return parts.join(" · ");
}
