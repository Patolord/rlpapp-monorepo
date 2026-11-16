import { api } from "@rlpapp/backend/convex/_generated/api";
import { useAction } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useCallback, useEffect, useState } from "react";

import { getErrorMessage } from "@/lib/errors";

export type FolderCheck = FunctionReturnType<typeof api.budgetBoard.checkFolders>;

/**
 * Conferência das pastas da TRELLO com o quadro de orçamentos. Roda ao abrir
 * a página (grava em cada card onde a pasta está, o que o quadro mostra) e
 * quando `refresh` é chamado. As pastas sem card só existem neste resultado.
 */
export function useFolderCheck() {
  const runCheck = useAction(api.budgetBoard.checkFolders);
  const [result, setResult] = useState<FolderCheck | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setResult(await runCheck({}));
    } catch (err) {
      setError(getErrorMessage(err, "Não foi possível conferir as pastas da TRELLO."));
    } finally {
      setLoading(false);
    }
  }, [runCheck]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { result, error, loading, refresh };
}
