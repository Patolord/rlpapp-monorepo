/** After this long without a refresh, the company catalog counts as out of date. */
export const CATALOG_STALE_MS = 24 * 60 * 60 * 1000;

export interface CatalogSyncInput {
  /** When the company catalog last arrived (ISO), null if never on this machine. */
  fetchedAt: string | null;
  signedIn: boolean;
  /** Why the last refresh failed, null when it worked (or none ran). */
  error: string | null;
  /** Proposals waiting to be sent. */
  pending: number;
  now: number;
}

export interface CatalogSyncState {
  /** Short text for the status bar: "há 5 min", "nunca". */
  label: string;
  /** Tooltip: when, and why it counts as out of date. */
  title: string;
  /** Out of date: shown in a warning colour. */
  stale: boolean;
}

/** "agora", "há 5 min", "há 3 h", "há 2 dias". */
export function sinceLabel(ms: number): string {
  const min = Math.floor(Math.max(0, ms) / 60_000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  return `há ${d} ${d === 1 ? "dia" : "dias"}`;
}

/**
 * How current the company catalog is, for the status bar. Out of date when it never arrived,
 * the last refresh failed, the user is signed out (it cannot refresh) or it is older than a day.
 */
export function catalogSyncState(s: CatalogSyncInput): CatalogSyncState {
  const at = s.fetchedAt ? Date.parse(s.fetchedAt) : Number.NaN;
  const known = Number.isFinite(at);
  const label = known ? sinceLabel(s.now - at) : "nunca";
  const lines = [
    known
      ? `Catálogo da empresa atualizado ${label} (${new Date(at).toLocaleString("pt-BR")})`
      : "Catálogo da empresa ainda não baixado neste computador",
  ];
  let stale = !known;
  if (s.error) {
    stale = true;
    lines.push(`Falha na última atualização: ${s.error}`);
  }
  if (!s.signedIn) {
    stale = true;
    lines.push("Entre com a conta da empresa para atualizar");
  } else if (known && s.now - at > CATALOG_STALE_MS) {
    stale = true;
    lines.push("Mais de um dia sem atualizar: preços e kits podem ter mudado");
  }
  if (s.pending > 0) {
    lines.push(
      `${s.pending} ${s.pending === 1 ? "proposta aguardando envio" : "propostas aguardando envio"}`,
    );
  }
  if (s.signedIn) lines.push("Clique para atualizar agora");
  return { label, title: lines.join("\n"), stale };
}
