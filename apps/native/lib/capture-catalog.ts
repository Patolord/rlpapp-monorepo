/**
 * Cópia do catálogo de materiais no celular, para o cadastro em campo conferir
 * duplicatas sem sinal. Baixada em páginas (`materialCaptures.catalogPage`) e
 * guardada no AsyncStorage; atualizada ao abrir a tela com sinal.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "@rlpapp/backend/convex/_generated/api";
import type { CaptureCatalogItem } from "@rlpapp/shared/estoque/captureMatch";
import { useConvex } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useCallback, useEffect, useRef, useState } from "react";

import { listQueuedClientIds, PENDING_PREFIX } from "./capture-queue";

const CATALOG_KEY = "rlp-capture-catalog";
const PAGE_SIZE = 500;
/** Atualiza sozinho quando a cópia tem mais que isso. */
const STALE_AFTER_MS = 6 * 60 * 60 * 1000;

export type StoredCatalog = { savedAt: number; items: CaptureCatalogItem[] };

async function readCatalog(): Promise<StoredCatalog | null> {
  try {
    const raw = await AsyncStorage.getItem(CATALOG_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredCatalog;
    return Array.isArray(parsed.items) ? parsed : null;
  } catch {
    return null;
  }
}

async function writeCatalog(catalog: StoredCatalog): Promise<void> {
  try {
    await AsyncStorage.setItem(CATALOG_KEY, JSON.stringify(catalog));
  } catch {
    // Cópia local é melhor esforço: sem ela, a conferência fica só online.
  }
}

/**
 * Catálogo local + atualização. `addLocal` inclui na cópia um item cadastrado
 * sem sinal, para a próxima captura igual já reconhecê-lo.
 */
export function useCaptureCatalog(online: boolean, enabled: boolean) {
  const convex = useConvex();
  const [catalog, setCatalog] = useState<StoredCatalog | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    void readCatalog().then((stored) => {
      setCatalog(stored);
      setLoaded(true);
    });
  }, []);

  const refresh = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setRefreshing(true);
    setError(null);
    try {
      const items: CaptureCatalogItem[] = [];
      let cursor: string | null = null;
      for (;;) {
        const page: FunctionReturnType<typeof api.materialCaptures.catalogPage> = await convex.query(
          api.materialCaptures.catalogPage,
          { cursor, numItems: PAGE_SIZE }
        );
        items.push(...page.page);
        if (page.isDone) break;
        cursor = page.continueCursor;
      }
      // Itens ainda na fila do celular não estão no servidor: continuam na cópia
      // para a próxima captura igual reconhecê-los.
      const queued = await listQueuedClientIds();
      const stored = await readCatalog();
      const stillPending = (stored?.items ?? []).filter(
        (item) => item._id.startsWith(PENDING_PREFIX) && queued.has(item._id.slice(PENDING_PREFIX.length))
      );
      const next = { savedAt: Date.now(), items: [...items, ...stillPending] };
      setCatalog(next);
      await writeCatalog(next);
    } catch {
      setError("Não deu para baixar o catálogo agora.");
    } finally {
      busy.current = false;
      setRefreshing(false);
    }
  }, [convex]);

  useEffect(() => {
    if (!loaded || !online || !enabled) return;
    if (!catalog || Date.now() - catalog.savedAt > STALE_AFTER_MS) void refresh();
  }, [loaded, online, enabled, catalog, refresh]);

  const addLocal = useCallback((item: CaptureCatalogItem) => {
    setCatalog((current) => {
      // Sem cópia baixada, a data fica zerada: o próximo sinal baixa o catálogo.
      const next = { savedAt: current?.savedAt ?? 0, items: [...(current?.items ?? []), item] };
      void writeCatalog(next);
      return next;
    });
  }, []);

  return { catalog, loaded, refreshing, error, refresh, addLocal };
}
