import { api } from "@rlpapp/backend/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { ArrowRight, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getErrorMessage } from "@/lib/errors";

const BY_LABEL = {
  sku: "pelo código",
  name: "pelo nome",
  size: "pela bitola",
} as const;

/**
 * "Vincular ao catálogo": mostra, kit a kit, que material de compras (código
 * MAT) cada componente passa a usar e se a ordem muda (cobre, isolamento, cabo,
 * por bitola), e aplica tudo de uma vez. O que não for encontrado fica como
 * está, para escolher no formulário do kit.
 */
export function KitCatalogLinkDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const plans = useQuery(api.takeoffKits.catalogLinkPlan, open ? {} : "skip");
  const apply = useMutation(api.takeoffKits.applyCatalogLinks);
  const [saving, setSaving] = useState(false);

  const pending = (plans ?? []).filter((p) => p.changes.length > 0 || p.reordered);
  const unlinked = (plans ?? []).filter((p) => p.unlinked.length > 0);
  const changeCount = pending.reduce((n, p) => n + p.changes.length, 0);

  const submit = async () => {
    setSaving(true);
    try {
      const result = await apply({});
      toast.success(
        result.kits === 0
          ? "Nada a mudar: os kits já estão vinculados"
          : `${result.kits} ${result.kits === 1 ? "kit atualizado" : "kits atualizados"}, ${result.components} ${result.components === 1 ? "componente vinculado" : "componentes vinculados"}`,
      );
      onClose();
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível vincular os kits"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Vincular kits ao catálogo de compras</DialogTitle>
          <DialogDescription>
            Cada componente passa a usar o código MAT e o nome do material de compras: pelo código
            que já tem, pelo nome exato ou, em cobre, isolamento e cabo, pela bitola. Os
            componentes ficam na ordem cobre, isolamento e cabo, por bitola crescente. O que não
            for encontrado continua como está (item próprio).
          </DialogDescription>
        </DialogHeader>

        {plans === undefined ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Comparando com o catálogo…
          </p>
        ) : (
          <div className="space-y-5 text-sm">
            {pending.length === 0 ? (
              <p className="text-muted-foreground">
                Nada a mudar: os componentes encontrados no catálogo já estão vinculados e em ordem.
              </p>
            ) : (
              <section className="space-y-3">
                <h3 className="font-medium">
                  {pending.length} {pending.length === 1 ? "kit muda" : "kits mudam"} ·{" "}
                  {changeCount} {changeCount === 1 ? "componente" : "componentes"}
                </h3>
                {pending.map((plan) => (
                  <div key={plan._id} className="rounded-md border border-control-border p-3">
                    <div className="mb-2 flex items-center gap-2 font-medium">
                      {plan.name}
                      {plan.reordered && <Badge variant="info">reordenado</Badge>}
                    </div>
                    {plan.changes.length > 0 && (
                      <ul className="space-y-1">
                        {plan.changes.map((c) => (
                          <li key={c.index} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                            <span className="text-muted-foreground">{c.fromName}</span>
                            <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
                            <span>{c.toName}</span>
                            <span className="font-mono text-xs">{c.toSku}</span>
                            <span className="text-xs text-muted-foreground">({BY_LABEL[c.by]})</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </section>
            )}

            {unlinked.length > 0 && (
              <section className="space-y-2">
                <h3 className="font-medium">Sem código (ficam como estão)</h3>
                <ul className="space-y-1">
                  {unlinked.map((plan) => (
                    <li key={plan._id}>
                      <span className="font-medium">{plan.name}:</span>{" "}
                      {plan.unlinked.map((u, i) => (
                        <span key={i}>
                          {i > 0 && " · "}
                          {u.name}
                          {u.candidates.length > 0 && (
                            <span className="text-muted-foreground">
                              {" "}
                              (mais de um no catálogo:{" "}
                              {u.candidates.map((m) => `${m.sku} ${m.name}`).join(", ")})
                            </span>
                          )}
                        </span>
                      ))}
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-muted-foreground">
                  Para estes, escolha o material no formulário do kit, ou deixe como item próprio
                  (mão de obra, itens fora do catálogo).
                </p>
              </section>
            )}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={() => void submit()}
            disabled={saving || plans === undefined || pending.length === 0}
          >
            {saving && <Loader2 className="size-4 animate-spin" />}
            Aplicar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
