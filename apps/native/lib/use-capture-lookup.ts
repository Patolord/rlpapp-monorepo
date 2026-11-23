import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { matchCapturedItem, type CaptureCatalogItem } from "@rlpapp/shared/estoque/captureMatch";
import { useQuery } from "convex/react";
import { useMemo } from "react";

export type CaptureCandidate = {
  materialId: string;
  name: string;
  variantLabel: string | null;
  sku: string | null;
  unit: string | null;
  category: string | null;
  barcode: string | null;
  status: "draft" | "active" | "archived";
  reason: "barcode" | "sku" | "identity" | "alias" | "similar";
  /** Saldo no local escolhido (só com sinal). */
  quantityHere: number | null;
  physicalAddress: string | null;
  imageUrl: string | null;
};

export type CaptureLookup = {
  exact: CaptureCandidate | null;
  similar: CaptureCandidate[];
  /** "server": conferido no catálogo atual; "device": na cópia do celular. */
  source: "server" | "device";
  loading: boolean;
};

function fromCatalog(item: CaptureCatalogItem, reason: CaptureCandidate["reason"]): CaptureCandidate {
  return {
    materialId: item._id,
    name: item.name,
    variantLabel: item.variantLabel,
    sku: item.sku,
    unit: item.unit,
    category: item.category,
    barcode: item.barcode,
    status: "active",
    reason,
    quantityHere: null,
    physicalAddress: null,
    imageUrl: null,
  };
}

/**
 * O item já existe? Com sinal, pergunta ao servidor (catálogo inteiro e saldo
 * no local); sem sinal, ou enquanto a resposta não chega, usa a cópia local.
 */
export function useCaptureLookup(input: {
  online: boolean;
  projectId: string | null;
  code: string | null;
  name: string;
  catalog: readonly CaptureCatalogItem[];
}): CaptureLookup {
  const name = input.name.trim();
  const active = Boolean(input.code) || name.length >= 2;
  const server = useQuery(
    api.materialCaptures.lookup,
    input.online && active
      ? {
          projectId: (input.projectId ?? undefined) as Id<"projects"> | undefined,
          code: input.code ?? undefined,
          item: name ? { name } : undefined,
        }
      : "skip"
  );

  const local = useMemo(() => {
    if (!active) return { exact: null, similar: [] as CaptureCandidate[] };
    const result = matchCapturedItem(input.catalog, { code: input.code, name });
    return {
      exact: result.exact ? fromCatalog(result.exact.item, result.exact.reason) : null,
      similar: result.similar.map((item) => fromCatalog(item, "similar")),
    };
  }, [active, input.catalog, input.code, name]);

  if (server) return { ...server, source: "server", loading: false };
  return { ...local, source: "device", loading: input.online && active };
}
