import { getTauriVersion, getVersion } from "@tauri-apps/api/app";
import { useEffect, useState } from "react";
import { checkForUpdate, installUpdate, useUpdate } from "../lib/updater";
import { useStore } from "../store";
import { Button } from "./ui";

const RELEASES_URL = "https://github.com/Patolord/takeoff-releases/releases/latest";

/** "Sobre": app version, update status and links. */
export function AboutDialog() {
  const open = useStore((s) => s.aboutOpen);
  const setAboutOpen = useStore((s) => s.setAboutOpen);
  const update = useUpdate();
  const [version, setVersion] = useState<string>(import.meta.env.VITE_APP_VERSION ?? "");
  const [tauri, setTauri] = useState<string>("");
  const [checking, setChecking] = useState(false);
  useEffect(() => {
    if (!open || !("__TAURI_INTERNALS__" in window)) return;
    getVersion()
      .then(setVersion)
      .catch(() => {});
    getTauriVersion()
      .then(setTauri)
      .catch(() => {});
  }, [open]);
  if (!open) return null;

  const check = async () => {
    setChecking(true);
    await checkForUpdate();
    setChecking(false);
  };
  const status = update.installing
    ? update.progress === null
      ? "Instalando…"
      : `Baixando ${Math.round(update.progress * 100)}%`
    : update.available
      ? `Nova versão disponível: ${update.available.version}`
      : update.error
        ? `Não foi possível verificar: ${update.error}`
        : update.checkedAt
          ? "Você está na versão mais recente."
          : "";

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop click closes the dialog
    <div
      className="absolute inset-0 z-40 flex items-center justify-center bg-black/40"
      onClick={() => setAboutOpen(false)}
    >
      <div
        className="w-[26rem] rounded-lg border border-neutral-700 bg-neutral-900 p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <img src="/logo-rlp.png" alt="RLP Engenharia" className="h-10 w-auto" draggable={false} />
          <div>
            <div className="text-base font-semibold text-neutral-100">RLP Takeoff</div>
            <div className="font-mono text-xs text-neutral-400">
              versão {version || "—"}
              {tauri ? ` · Tauri ${tauri}` : ""}
            </div>
          </div>
        </div>
        <p className="mt-3 text-xs text-neutral-400">
          Takeoff e orçamento a partir de PDF. RLP Engenharia e Instalações Ltda.
        </p>
        <div className="mt-4 flex items-center gap-2">
          {update.available ? (
            <Button
              variant="primary"
              onClick={() => void installUpdate()}
              disabled={update.installing}
            >
              Atualizar para {update.available.version}
            </Button>
          ) : (
            <Button onClick={() => void check()} disabled={checking}>
              {checking ? "Verificando…" : "Verificar atualizações"}
            </Button>
          )}
          <span className="min-w-0 flex-1 truncate text-[12px] text-neutral-500">{status}</span>
        </div>
        <div className="mt-4 flex items-center justify-between text-[12px] text-neutral-500">
          <a
            href={RELEASES_URL}
            target="_blank"
            rel="noreferrer"
            className="text-orange-300 hover:underline"
          >
            Versões publicadas
          </a>
          <Button onClick={() => setAboutOpen(false)}>Fechar</Button>
        </div>
      </div>
    </div>
  );
}
