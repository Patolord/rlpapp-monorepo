import { useEffect, useState } from "react";

import { minuteCutoff } from "@/lib/quote-weeks";

/**
 * O `now` das consultas de histórico de preços, atualizado a cada minuto: um
 * preço lançado agora, por qualquer pessoa, entra sem recarregar a página, e
 * um com horário futuro só entra quando a hora dele chega.
 */
export function useNow(): number {
  const [now, setNow] = useState(() => minuteCutoff(Date.now()));
  useEffect(() => {
    const timer = window.setInterval(() => setNow(minuteCutoff(Date.now())), 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}
