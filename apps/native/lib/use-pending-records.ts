import { useCallback, useEffect, useState } from "react";

import {
  listPendingRecords,
  subscribeQueue,
  type PendingRecord,
} from "@/lib/offline-queue";
import { listPendingPunches, subscribePunchQueue, type PendingPunch } from "@/lib/punch-queue";

/**
 * Registros da fila offline, atualizados sempre que a fila muda.
 * `undefined` enquanto a primeira leitura não terminou.
 */
export function usePendingRecords(): PendingRecord[] | undefined {
  const [records, setRecords] = useState<PendingRecord[] | undefined>(
    undefined
  );

  const refresh = useCallback(() => {
    listPendingRecords()
      .then(setRecords)
      .catch(() => setRecords((prev) => prev ?? []));
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

/**
 * Marcações de ponto na fila do aparelho, só as do usuário que entrou (a fila
 * guarda o `userId` do Clerk de quem marcou).
 */
export function usePendingPunches(clerkUserId: string | null | undefined): PendingPunch[] | undefined {
  const [punches, setPunches] = useState<PendingPunch[] | undefined>(undefined);

  const refresh = useCallback(() => {
    if (!clerkUserId) {
      setPunches([]);
      return;
    }
    listPendingPunches(clerkUserId)
      .then(setPunches)
      .catch(() => setPunches((prev) => prev ?? []));
  }, [clerkUserId]);

  useEffect(() => {
    refresh();
    const unsubscribe = subscribePunchQueue(refresh);
    return () => unsubscribe();
  }, [refresh]);

  return punches;
}
