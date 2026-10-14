import { useCallback, useEffect, useState } from "react";

import {
  listPendingRecords,
  subscribeQueue,
  type PendingRecord,
} from "@/lib/offline-queue";

/**
 * Registros da fila offline, atualizados sempre que a fila muda.
 * `undefined` enquanto a primeira leitura não terminou.
 */
export function usePendingRecords(): PendingRecord[] | undefined {
  const [records, setRecords] = useState<PendingRecord[] | undefined>(
    undefined
  );

  const refresh = useCallback(() => {
    void listPendingRecords().then(setRecords);
  }, []);

  useEffect(() => {
    refresh();
    const unsubscribe = subscribeQueue(refresh);
    return () => unsubscribe();
  }, [refresh]);

  return records;
}

export function usePendingCount(): number {
  return usePendingRecords()?.length ?? 0;
}
