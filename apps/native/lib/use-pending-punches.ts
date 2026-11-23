import { useEffect, useState } from "react";

import { listPendingPunches, subscribePunchQueue, type PendingPunch } from "@/lib/punch-queue";

/** Fila offline de marcações deste aparelho (só as do usuário), sempre atual. */
export function usePendingPunches(userId: string | null | undefined): PendingPunch[] {
  const [pending, setPending] = useState<PendingPunch[]>([]);
  useEffect(() => {
    let alive = true;
    const refresh = () => {
      void listPendingPunches(userId ?? "__none__").then((items) => {
        if (alive) setPending(items);
      });
    };
    refresh();
    const unsubscribe = subscribePunchQueue(refresh);
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [userId]);
  return pending;
}
