import { RefreshCw, Send } from "lucide-react";
import { useEffect, useState } from "react";
import { CATALOG_URL } from "../lib/catalog";
import { BASE_MATERIALS } from "../lib/weights";
import { useStore } from "../store";
import { Dialog } from "./Dialog";
import { Button } from "./ui";

const input =
  "h-8 w-full rounded bg-neutral-800 px-2 text-xs text-neutral-100 ring-1 ring-neutral-700 outline-none focus:ring-orange-400";

/**
 * "Catálogo e preços": where the reference materials come from (company catalog, token) and how
 * prices are derived (R$/kg of base materials, weight table). Kept out of the Ctrl+K palette so
 * the palette stays a quick search.
 */
export function CatalogSettingsDialog() {
  const open = useStore((s) => s.catalogSettingsOpen);
  const catalog = useStore((s) => s.catalog);
  const {
    setCatalogSettingsOpen,
    setCatalogToken,
    refreshCatalog,
    flushProposals,
    setBasePrice,
    setWeightsEditorOpen,
  } = useStore.getState();
  const [token, setToken] = useState(catalog.remoteToken);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setToken(catalog.remoteToken);
      setBusy(null);
    }
  }, [open, catalog.remoteToken]);
  if (!open) return null;

  const refresh = async () => {
    setBusy("Buscando…");
    try {
      setCatalogToken(token);
      const n = await refreshCatalog();
      setBusy(`${n} materiais carregados`);
    } catch (e) {
      setBusy(`Falha: ${e instanceof Error ? e.message : String(e)}`);
    }
  };
  const resend = async () => {
    setBusy("Reenviando…");
    const n = await flushProposals();
    setBusy(n > 0 ? `${n} ${n === 1 ? "proposta aceita" : "propostas aceitas"}` : null);
  };
  const drafts = catalog.remote.filter((e) => e.status === "draft").length;
  const pending = catalog.outbox.length;
  const status = catalog.fetchedAt
    ? `${catalog.remote.length} materiais · catálogo de ${new Date(
        catalog.remoteGeneratedAt ?? catalog.fetchedAt,
      ).toLocaleString("pt-BR")}${drafts ? ` · ${drafts} em rascunho` : ""}`
    : "Ainda não carregado: o Ctrl+K usa as planilhas anteriores";

  const section = (title: string, hint: string, body: React.ReactNode) => (
    <section className="space-y-2 border-b border-neutral-800 px-4 py-3 last:border-b-0">
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-300">{title}</h3>
        <p className="text-[11px] text-neutral-500">{hint}</p>
      </div>
      {body}
    </section>
  );

  return (
    <Dialog
      title="Catálogo e preços"
      onClose={() => setCatalogSettingsOpen(false)}
      className="max-h-[85vh] w-[34rem] text-xs"
      bodyClassName="flex flex-col"
    >
      <div className="min-h-0 flex-1 overflow-y-auto">
        {section(
          "Catálogo da empresa",
          "De onde vêm os materiais e os preços de referência do Ctrl+K. Nada é enviado de volta sem você pedir.",
          <div className="space-y-1.5">
            <p className="truncate font-mono text-[11px] text-neutral-500" title={CATALOG_URL}>
              {CATALOG_URL}
            </p>
            <label className="block text-neutral-400">
              Token de acesso
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                autoComplete="off"
                placeholder="fornecido pela RLP; fica só neste computador"
                className={`${input} mt-0.5 font-mono`}
              />
            </label>
            <div className="flex items-center gap-2 pt-0.5">
              <Button onClick={() => void refresh()}>
                <RefreshCw size={14} /> Atualizar catálogo
              </Button>
              <span className="min-w-0 flex-1 truncate text-neutral-500">{busy ?? status}</span>
            </div>
            {pending > 0 && (
              <div className="flex items-center gap-2 rounded bg-amber-500/10 px-2 py-1.5 text-amber-300">
                <Send size={14} className="shrink-0" />
                <span className="min-w-0 flex-1">
                  {pending} {pending === 1 ? "proposta de material" : "propostas de material"}{" "}
                  aguardando envio para compras
                  {catalog.outbox[0]?.lastError ? ` (${catalog.outbox[0].lastError})` : ""}.
                </span>
                <Button onClick={() => void resend()}>Reenviar</Button>
              </div>
            )}
          </div>,
        )}
        {section(
          "Insumos (R$/kg)",
          "Tubos de cobre e a chapa dos dutos têm o preço derivado do peso × estes valores, no app todo. Um preço digitado numa linha sobrescreve só aquela linha.",
          <div className="grid grid-cols-[auto_6rem_1fr] items-center gap-x-3 gap-y-1.5">
            {BASE_MATERIALS.map((m) => (
              <div key={m.key} className="contents">
                <span className="text-neutral-300">{m.label}</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={catalog.basePrices[m.key] ?? ""}
                  placeholder={m.defaultPrice !== undefined ? String(m.defaultPrice) : "—"}
                  onChange={(e) =>
                    setBasePrice(m.key, e.target.value === "" ? undefined : Number(e.target.value))
                  }
                  className={`${input} text-right font-mono`}
                />
                <span className="text-[11px] text-neutral-500">
                  {m.defaultPrice !== undefined
                    ? `vazio = ${m.defaultPrice} (tabela do fornecedor)`
                    : "vazio = cada linha de chapa dos dutos mantém o próprio preço"}
                </span>
              </div>
            ))}
          </div>,
        )}
        {section(
          "Materiais por peso",
          "Quais materiais seguem os insumos acima e quantos quilos pesa cada unidade.",
          <div className="flex items-center gap-3">
            <span className="text-neutral-300">
              {catalog.weights.length} {catalog.weights.length === 1 ? "material" : "materiais"}{" "}
              (tubos de cobre do fornecedor)
            </span>
            <Button
              onClick={() => {
                setCatalogSettingsOpen(false);
                setWeightsEditorOpen(true);
              }}
            >
              Editar tabela…
            </Button>
          </div>,
        )}
      </div>
      <div className="flex items-center justify-end border-t border-neutral-800 px-4 py-2">
        <Button variant="primary" onClick={() => setCatalogSettingsOpen(false)}>
          Fechar
        </Button>
      </div>
    </Dialog>
  );
}
