import { api } from "@rlpapp/backend/convex/_generated/api";
import { formatCurrency, formatNumber } from "@rlpapp/shared";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Receipt } from "lucide-react";
import { Fragment, useMemo } from "react";
import { toast } from "sonner";

import { PriceFreshnessBadge } from "@/components/compras/price-freshness-badge";
import {
  publishedLabel,
  TakeoffSourceBadge,
} from "@/components/compras/takeoff-source-badge";
import type { TakeoffQuoteTarget } from "@/components/compras/takeoff-quote-dialog";
import { TakeoffSavedQuotes } from "@/components/compras/takeoff-saved-quotes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  formatBdi,
  groupDesktopBudget,
  lineLaborCents,
  lineMaterialCents,
} from "@/lib/engenharia/desktop-budget";
import { getErrorMessage } from "@/lib/errors";

type TakeoffDetail = NonNullable<FunctionReturnType<typeof api.takeoffs.get>>;
type TakeoffItem = TakeoffDetail["items"][number];

const COLUMNS = 9;

/**
 * Orçamento publicado pelo app desktop: abas (disciplina) → seções (local ou
 * grupo) → linhas, com preços de material e mão de obra, subtotais, extras,
 * BDI e total por aba. As ações por linha (usar preço de referência, cotação,
 * criar SKU) são as mesmas do takeoff manual; as linhas em si são editadas no
 * desktop e publicadas de novo.
 */
export function DesktopBudgetView({
  detail,
  canPromoteMaterial,
  onQuote,
}: {
  detail: TakeoffDetail;
  canPromoteMaterial: boolean;
  onQuote: (item: TakeoffQuoteTarget) => void;
}) {
  const { takeoff, items } = detail;
  const budget = takeoff.budget;
  const sheets = useMemo(
    () => groupDesktopBudget(items, budget?.sheets ?? []),
    [items, budget]
  );
  const grandTotal = sheets.reduce((s, sheet) => s + sheet.proposalCents, 0);
  const published = publishedLabel(takeoff);
  const header = [
    budget?.proposalNumber ? `Proposta ${budget.proposalNumber}` : null,
    budget?.client,
    budget?.site,
    budget?.estimator ? `Orçamentista: ${budget.estimator}` : null,
  ].filter(Boolean);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>{takeoff.name}</CardTitle>
            <TakeoffSourceBadge takeoff={takeoff} />
          </div>
          {header.length > 0 ? (
            <p className="text-sm text-muted-foreground">{header.join(" · ")}</p>
          ) : null}
          {published ? (
            <p className="text-xs text-muted-foreground">{published}</p>
          ) : null}
        </CardHeader>
        <CardContent className="flex flex-wrap items-end justify-between gap-3">
          <p className="max-w-xl text-sm text-muted-foreground">
            As linhas vêm do app desktop: para mudar quantidades ou itens, edite
            o projeto lá e publique de novo. Cotações registradas aqui ficam; um
            preço aplicado aqui volta ao do desktop na próxima publicação.
          </p>
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Total com BDI</div>
            <div className="text-lg font-semibold tabular-nums">
              {formatCurrency(grandTotal)}
            </div>
          </div>
        </CardContent>
      </Card>

      {sheets.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Este orçamento não tem linhas.
          </CardContent>
        </Card>
      ) : null}

      {sheets.map((sheet) => (
        <Card key={sheet.name}>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">{sheet.name}</CardTitle>
            <div className="text-sm">
              BDI {formatBdi(sheet.bdi)} ·{" "}
              <span className="font-semibold tabular-nums">
                {formatCurrency(sheet.proposalCents)}
              </span>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="text-right">Qtd</TableHead>
                  <TableHead className="text-right">Material (un.)</TableHead>
                  <TableHead className="text-right">M. obra (un.)</TableHead>
                  <TableHead className="text-right">Material</TableHead>
                  <TableHead className="text-right">M. obra</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Referências</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sheet.sections.map((section) => (
                  <Fragment key={section.name}>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableCell colSpan={COLUMNS} className="font-medium">
                        {section.name}
                      </TableCell>
                    </TableRow>
                    {section.lines.map((item) => (
                      <DesktopBudgetLine
                        key={item._id}
                        item={item}
                        canPromoteMaterial={canPromoteMaterial}
                        onQuote={onQuote}
                      />
                    ))}
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        className="text-right text-xs text-muted-foreground"
                      >
                        Subtotal {section.name}
                      </TableCell>
                      <MoneyCell cents={section.materialCents} />
                      <MoneyCell cents={section.laborCents} />
                      <MoneyCell
                        cents={section.materialCents + section.laborCents}
                        strong
                      />
                      <TableCell colSpan={2} />
                    </TableRow>
                  </Fragment>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={4} className="text-right">
                    Itens
                  </TableCell>
                  <MoneyCell cents={sheet.materialCents} />
                  <MoneyCell cents={sheet.laborCents} />
                  <MoneyCell cents={sheet.materialCents + sheet.laborCents} />
                  <TableCell colSpan={2} />
                </TableRow>
                {sheet.extrasPct > 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-right">
                      Diversos, Transportes e Supervisão ({formatNumber(sheet.extrasPct)} %)
                    </TableCell>
                    <MoneyCell cents={sheet.extrasEachCents} />
                    <MoneyCell cents={sheet.extrasEachCents * 2} />
                    <MoneyCell cents={sheet.extrasEachCents * 3} />
                    <TableCell colSpan={2} />
                  </TableRow>
                ) : null}
                <TableRow>
                  <TableCell colSpan={6} className="text-right font-semibold">
                    TOTAL GERAL
                  </TableCell>
                  <MoneyCell cents={sheet.totalCents} strong />
                  <TableCell colSpan={2} />
                </TableRow>
                <TableRow>
                  <TableCell colSpan={6} className="text-right font-semibold">
                    Preço com BDI ({formatBdi(sheet.bdi)})
                  </TableCell>
                  <MoneyCell cents={sheet.proposalCents} strong />
                  <TableCell colSpan={2} className="text-xs text-muted-foreground">
                    {sheet.publishedProposalCents !== null &&
                    Math.abs(sheet.publishedProposalCents - sheet.proposalCents) >= 100
                      ? `Publicado: ${formatCurrency(sheet.publishedProposalCents)}`
                      : null}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function MoneyCell({ cents, strong }: { cents: number; strong?: boolean }) {
  return (
    <TableCell
      className={`text-right tabular-nums${strong ? " font-semibold" : ""}`}
    >
      {formatCurrency(cents)}
    </TableCell>
  );
}

function DesktopBudgetLine({
  item,
  canPromoteMaterial,
  onQuote,
}: {
  item: TakeoffItem;
  canPromoteMaterial: boolean;
  onQuote: (item: TakeoffQuoteTarget) => void;
}) {
  const applyPrice = useMutation(api.takeoffs.applySuggestedPrice);
  const promoteItem = useMutation(api.takeoffs.promoteItemToMaterial);
  const removed = item.externalRemovedAt !== null;
  const material = lineMaterialCents(item);
  const labor = lineLaborCents(item);

  return (
    <TableRow className={removed ? "opacity-60" : undefined}>
      <TableCell>
        <div className="font-medium">{item.rawDescription}</div>
        {item.materialName && item.materialName !== item.rawDescription ? (
          <div className="text-xs text-muted-foreground">{item.materialName}</div>
        ) : null}
        <div className="mt-1 flex flex-wrap gap-1">
          {removed ? (
            <Badge variant="warning" className="text-xs font-normal">
              Removido no desktop · mantido pela Compras
            </Badge>
          ) : null}
          {item.warnings
            .filter((w) => w !== "Sem preço estimado")
            .map((w) => (
              <Badge key={w} variant="outline" className="text-xs font-normal">
                {w}
              </Badge>
            ))}
        </div>
      </TableCell>
      <TableCell className="text-right tabular-nums whitespace-nowrap">
        {item.quantity !== null ? formatNumber(item.quantity) : "—"}
        {item.unit ? ` ${item.unit}` : ""}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {item.estimatedUnitPriceCents !== null
          ? formatCurrency(item.estimatedUnitPriceCents)
          : "—"}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {item.laborUnitPriceCents !== null
          ? formatCurrency(item.laborUnitPriceCents)
          : "—"}
      </TableCell>
      <MoneyCell cents={material} />
      <MoneyCell cents={labor} />
      <MoneyCell cents={material + labor} />
      <TableCell>
        <div className="space-y-1">
          <TakeoffSavedQuotes quotes={item.quotes} />
          {item.latestPrices.slice(0, 2).map((p) => (
            <div
              key={`${p.supplierName}-${p.occurredAt}`}
              className="flex items-center gap-2 text-xs"
            >
              <span>
                {p.supplierName}: {formatCurrency(p.unitPriceCents)}
              </span>
              <PriceFreshnessBadge freshness={p.freshness} />
              {p.suggestedUnitPriceCents !== null ? (
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
              ) : null}
            </div>
          ))}
          {item.latestPrices.length === 0 && item.quotes.length === 0 ? (
            <span className="text-xs text-muted-foreground">Sem referência</span>
          ) : null}
        </div>
      </TableCell>
      <TableCell>
        {canPromoteMaterial ? (
          <div className="flex justify-end gap-1">
            <Button variant="outline" size="sm" onClick={() => onQuote(item)}>
              <Receipt className="mr-1 size-3.5" />
              Cotação
            </Button>
            {!item.materialId ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  void promoteItem({ itemId: item._id }).then(
                    ({ created }) =>
                      toast.success(
                        created ? "SKU criado e vinculado" : "SKU existente vinculado"
                      ),
                    (error) =>
                      toast.error(
                        getErrorMessage(error, "Apenas Compras pode criar o SKU")
                      )
                  )
                }
              >
                Criar SKU
              </Button>
            ) : null}
          </div>
        ) : null}
      </TableCell>
    </TableRow>
  );
}
