import { compareSuppliersByPeriod } from "@rlpapp/shared/compras/priceReference";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ExternalLink, TrendingUp } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { WEB_URL } from "../lib/account/config";
import { type FamilyPriceHistory, fetchFamilyHistoryAsUser } from "../lib/account/convex";
import { SignedOutError } from "../lib/account/session";
import type { CatalogEntry } from "../lib/catalog";
import { isTauri } from "../lib/platform";
import {
  describeReferenceStatus,
  offReference,
  type PriceReference,
  signedPercent,
} from "../lib/priceReference";
import type { Item } from "../lib/types";
import { useStore } from "../store";
import { Dialog } from "./Dialog";
import { Button } from "./ui";

/**
 * Small button next to a budget line's price: the reference of its company material, amber when
 * the quotes vary too much, are old, or the line is more than 10% away from the reference.
 */
export function PriceReferenceButton({
  price,
  reference,
  currency,
  onOpen,
}: {
  price: number;
  reference: PriceReference;
  currency: (value: number) => string;
  onOpen: () => void;
}) {
  const off = offReference(price, reference);
  const warn = reference.status !== "ok" || (off !== null && Math.abs(off) > 0.1);
  const title = [
    `Referência ${currency(reference.price)} (mediana de ${reference.count} cotações de ${reference.supplierCount} ${reference.supplierCount === 1 ? "fornecedor" : "fornecedores"})`,
    off !== null ? `Esta linha está ${signedPercent(off)} da referência` : null,
    describeReferenceStatus(reference),
    reference.truncated
      ? `Amostra: as ${reference.count} cotações mais recentes dos 6 meses`
      : null,
  ]
    .filter(Boolean)
    .join("\n");
  return (
    <button
      type="button"
      onClick={onOpen}
      title={title}
      aria-label="Preço de referência e cotações"
      className={
        warn
          ? "relative rounded p-0.5 text-amber-400 hover:bg-neutral-800"
          : "relative rounded p-0.5 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200"
      }
    >
      <TrendingUp size={12} />
    </button>
  );
}

const day = (ms: number) => new Date(ms).toLocaleDateString("pt-BR");
const WEEK_LABEL = (ms: number) =>
  new Date(ms).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

type Load =
  | { state: "loading" }
  | { state: "ready"; history: FamilyPriceHistory }
  | { state: "error"; message: string };

/**
 * The budget reference of a line's company material and where it comes from: every supplier's
 * quotes of the same weeks and the other variants of the same item. Applies the reference (or the
 * cheapest quote of the last week) as the line's material price.
 */
export function PriceReferenceDialog({
  item,
  entry,
  reference,
  currency,
  onClose,
}: {
  item: Item;
  entry: CatalogEntry;
  reference: PriceReference;
  currency: (value: number) => string;
  onClose: () => void;
}) {
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const materialId = entry.catalogId;

  useEffect(() => {
    if (!materialId) return;
    let alive = true;
    fetchFamilyHistoryAsUser(materialId)
      .then((history) => alive && setLoad({ state: "ready", history }))
      .catch((e: unknown) => {
        if (!alive) return;
        setLoad({
          state: "error",
          message:
            e instanceof SignedOutError
              ? "Entre na sua conta para ver as cotações de cada fornecedor."
              : "Sem conexão com o app da empresa: mostrando só a referência do catálogo.",
        });
      });
    return () => {
      alive = false;
    };
  }, [materialId]);

  const history = load.state === "ready" ? load.history : null;
  const weeks = useMemo(() => {
    if (!history || !materialId) return [];
    const quotes = history.quotes.filter((q) => q.materialId === materialId);
    return compareSuppliersByPeriod(quotes, "week").slice(0, 3);
  }, [history, materialId]);
  const latest = weeks[0];
  const others = (history?.variants ?? []).filter(
    (v) => v.materialId !== materialId && v.reference,
  );

  const apply = (price: number, priceDate: number) => {
    useStore.getState().updateItem(item.id, {
      materialPrice: Math.round(price * 100) / 100,
      priceSource: "catalog",
      priceDate,
    });
    onClose();
  };

  const openHistory = () => {
    if (!materialId) return;
    const url = `${WEB_URL}/compras/historico/${materialId}`;
    if (isTauri()) void openUrl(url);
    else window.open(url, "_blank", "noopener");
  };

  return (
    <Dialog title={`Preço de referência · ${item.name}`} onClose={onClose} className="w-[30rem]">
      <div className="space-y-4 text-sm">
        <section className="space-y-1">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-neutral-400">Referência (mediana de 6 meses)</span>
            <span className="font-mono text-lg font-semibold">{currency(reference.price)}</span>
          </div>
          <p className="text-xs text-neutral-400">
            {reference.count} cotações de {reference.supplierCount}{" "}
            {reference.supplierCount === 1 ? "fornecedor" : "fornecedores"}, de{" "}
            {currency(reference.minPrice)} a {currency(reference.maxPrice)} · última em{" "}
            {day(reference.lastAt)}
            {reference.monthlyChange !== undefined
              ? ` · ${signedPercent(reference.monthlyChange)} ao mês`
              : ""}
          </p>
          <p
            className={
              reference.status === "ok" ? "text-xs text-emerald-400" : "text-xs text-amber-400"
            }
          >
            {describeReferenceStatus(reference)}
            {reference.truncated ? ` (amostra: as ${reference.count} cotações mais recentes)` : ""}
          </p>
        </section>

        <section className="space-y-1.5">
          <h3 className="text-xs font-semibold text-neutral-300">Fornecedores na mesma semana</h3>
          {load.state === "loading" ? (
            <p className="text-xs text-neutral-500">Carregando cotações…</p>
          ) : load.state === "error" ? (
            <p className="text-xs text-neutral-500">{load.message}</p>
          ) : weeks.length === 0 ? (
            <p className="text-xs text-neutral-500">Nenhuma cotação desta variante em 12 meses.</p>
          ) : (
            <table className="w-full text-xs">
              <tbody>
                {weeks.map((week) => (
                  <tr key={week.periodStart} className="border-b border-neutral-800 align-top">
                    <td className="whitespace-nowrap py-1 pr-2 text-neutral-400">
                      sem. {WEEK_LABEL(week.periodStart)}
                    </td>
                    <td className="py-1">
                      {week.quotes.map((q) => (
                        <span
                          key={q.supplierKey}
                          className={
                            q.supplierKey === week.cheapestSupplierKey
                              ? "mr-3 inline-block font-semibold text-emerald-400"
                              : "mr-3 inline-block text-neutral-300"
                          }
                        >
                          {q.supplierName} {currency(q.unitPriceCents / 100)}
                        </span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {others.length > 0 ? (
          <section className="space-y-1.5">
            <h3 className="text-xs font-semibold text-neutral-300">Outras variantes do item</h3>
            <ul className="space-y-0.5 text-xs">
              {others.map((v) => (
                <li key={v.materialId} className="flex justify-between gap-3">
                  <span className="text-neutral-300">
                    {v.variantLabel ?? v.manufacturer ?? v.name}
                  </span>
                  <span className="font-mono text-neutral-400">
                    {currency((v.reference?.medianCents ?? 0) / 100)} (
                    {signedPercent(
                      ((v.reference?.medianCents ?? 0) / 100 - reference.price) / reference.price,
                    )}
                    )
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 border-t border-neutral-800 pt-3">
          <Button variant="primary" onClick={() => apply(reference.price, reference.lastAt)}>
            Usar referência {currency(reference.price)}
          </Button>
          {latest ? (
            <Button
              onClick={() =>
                apply(latest.minCents / 100, latest.quotes[0]?.occurredAt ?? latest.periodStart)
              }
              title={`Menor preço da semana de ${WEEK_LABEL(latest.periodStart)}: ${latest.quotes[0]?.supplierName ?? ""}`}
            >
              Menor da última semana {currency(latest.minCents / 100)}
            </Button>
          ) : null}
          <button
            type="button"
            onClick={openHistory}
            className="ml-auto inline-flex items-center gap-1 text-xs text-orange-300 hover:underline"
          >
            Histórico completo
            <ExternalLink size={12} />
          </button>
        </div>
      </div>
    </Dialog>
  );
}
