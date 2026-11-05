import { Download } from "lucide-react";
import { installUpdate, useUpdate } from "../lib/updater";

/** Shows up in the top bar when a newer version is available; one click installs and restarts. */
export function UpdateButton() {
  const available = useUpdate((s) => s.available);
  const progress = useUpdate((s) => s.progress);
  const installing = useUpdate((s) => s.installing);
  const error = useUpdate((s) => s.error);
  if (!available) return null;
  const label = installing
    ? progress === null
      ? "Instalando…"
      : `Baixando ${Math.round(progress * 100)}%`
    : `Atualizar para ${available.version}`;
  return (
    <button
      type="button"
      onClick={() => void installUpdate()}
      disabled={installing}
      title={error ?? available.notes ?? "Nova versão disponível"}
      className="inline-flex h-7 items-center gap-1 rounded-md bg-orange-500 px-2 text-xs font-medium text-neutral-950 hover:bg-orange-600 disabled:opacity-60"
    >
      <Download size={15} />
      {label}
    </button>
  );
}
