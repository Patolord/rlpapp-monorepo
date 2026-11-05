import { api } from "@rlpapp/backend/convex/_generated/api";
import { createFileRoute } from "@tanstack/react-router";
import type { FunctionReturnType } from "convex/server";
import { useMutation, useQuery } from "convex/react";
import { Copy, Download, Link2, Monitor, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AuthShell } from "@/components/auth-shell";
import { KitCatalogLinkDialog } from "@/components/takeoff/kit-catalog-link-dialog";
import { type KitDraft, KitFormDialog, emptyKitDraft } from "@/components/takeoff/kit-form-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getErrorMessage } from "@/lib/errors";

type KitRow = FunctionReturnType<typeof api.takeoffKits.list>[number];

export const Route = createFileRoute("/takeoff/_painel/kits")({
  component: () => (
    <AuthShell>
      <KitsPage />
    </AuthShell>
  ),
});

/** "Tubulação de Cobre 1/4" · … · Cabo PP 5x1,5 mm² ×2", como no app. */
function summary(kit: KitRow): string {
  return kit.components
    .map((c) =>
      kit.mode === "count" && c.kind === "linear"
        ? `${c.name} ${c.factor} m`
        : c.factor !== 1
          ? `${c.name} ×${c.factor}`
          : c.name,
    )
    .join(" · ");
}

const dateFormat = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

function KitsPage() {
  const kits = useQuery(api.takeoffKits.list, {});
  const remove = useMutation(api.takeoffKits.remove);
  const seedDefaults = useMutation(api.takeoffKits.seedDefaults);
  // what "Carregar kits de fábrica" would add: a removed factory kit keeps its key and does not
  // come back, so the count comes from the backend, not from the active list
  const missingFactory = useQuery(api.takeoffKits.missingFactory, {}) ?? 0;
  const [draft, setDraft] = useState<KitDraft | null>(null);
  const [linking, setLinking] = useState(false);
  const [busy, setBusy] = useState(false);

  const edit = (kit: KitRow) =>
    setDraft({
      id: kit._id,
      name: kit.name,
      mode: kit.mode,
      label: kit.label ?? "",
      components: kit.components.map((c) => ({ ...c })),
    });
  const duplicate = (kit: KitRow) =>
    setDraft({
      name: `${kit.name} (cópia)`,
      mode: kit.mode,
      label: kit.label ?? "",
      components: kit.components.map((c) => ({ ...c })),
    });
  const confirmRemove = async (kit: KitRow) => {
    if (
      !window.confirm(
        `Remover "${kit.name}" dos padrões da empresa?\n\nEle some do app de quem não o alterou na próxima atualização do catálogo; quem o editou localmente continua com a própria versão.`,
      )
    ) {
      return;
    }
    try {
      await remove({ id: kit._id });
      toast.success("Kit removido dos padrões");
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível remover o kit"));
    }
  };
  const loadFactory = async () => {
    setBusy(true);
    try {
      const added = await seedDefaults({});
      toast.success(
        added === 0
          ? "Todos os kits de fábrica já estão cadastrados"
          : `${added} ${added === 1 ? "kit de fábrica carregado" : "kits de fábrica carregados"}`,
      );
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível carregar os kits de fábrica"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Kits (presets)</h1>
          <p className="text-sm text-muted-foreground">
            Padrões da empresa para a ferramenta Kit (T) do RLP Takeoff: um trecho desenhado ou um
            clique mede vários materiais de uma vez.
          </p>
        </div>
        <div className="flex gap-2">
          {missingFactory > 0 && (
            <Button variant="outline" onClick={() => void loadFactory()} disabled={busy}>
              <Download className="size-4" />
              Carregar kits de fábrica ({missingFactory})
            </Button>
          )}
          {kits && kits.length > 0 && (
            <Button
              variant="outline"
              onClick={() => setLinking(true)}
              title="Liga os componentes aos materiais de compras (código MAT) e ordena cobre, isolamento e cabo por bitola"
            >
              <Link2 className="size-4" /> Vincular ao catálogo
            </Button>
          )}
          <Button onClick={() => setDraft(emptyKitDraft())}>
            <Plus className="size-4" /> Novo kit
          </Button>
        </div>
      </div>

      <div className="flex gap-3 rounded-lg border border-status-info/30 bg-card px-4 py-3 text-sm">
        <Monitor className="mt-0.5 size-4 shrink-0 text-status-info" />
        <p>
          <span className="font-medium">Reflete no app desktop de todos os usuários.</span> O RLP
          Takeoff recebe estes kits junto com o catálogo (ao abrir, ao entrar com a conta e em
          &ldquo;Atualizar catálogo&rdquo;) e os usa como padrão. Cada usuário pode editar, remover
          ou criar kits no próprio computador; o que ele alterou lá não é substituído por mudanças
          feitas aqui, e um kit que ele não mexeu segue sempre esta versão.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Kits padrão da empresa</CardTitle>
          <CardDescription>
            {kits === undefined
              ? "Carregando…"
              : kits.length === 0
                ? "Nenhum kit publicado: o app usa os kits de fábrica embutidos nele. Carregue-os aqui para passar a editá-los."
                : `${kits.length} ${kits.length === 1 ? "kit publicado" : "kits publicados"} ao app.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Rótulo</TableHead>
                <TableHead>Componentes</TableHead>
                <TableHead title="Componentes com código MAT do catálogo de compras">Catálogo</TableHead>
                <TableHead>Atualizado</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(kits ?? []).map((kit) => (
                <TableRow key={kit._id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {kit.name}
                      {kit.factory && (
                        <Badge variant="muted" title="Um dos kits de fábrica do app, com a chave original">
                          fábrica
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{kit.mode === "count" ? "Contagem (clique)" : "Linear (trecho)"}</TableCell>
                  <TableCell className="font-mono text-xs">{kit.label ?? "—"}</TableCell>
                  <TableCell className="max-w-md truncate text-xs text-muted-foreground" title={summary(kit)}>
                    {summary(kit)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs">
                    <LinkedCount kit={kit} />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {dateFormat.format(kit.updatedAt)}
                    {kit.updatedBy ? ` · ${kit.updatedBy}` : ""}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => edit(kit)} aria-label="Editar">
                        <Pencil className="size-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => duplicate(kit)} aria-label="Duplicar">
                        <Copy className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => void confirmRemove(kit)}
                        aria-label="Remover dos padrões"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {kits && kits.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                    Nenhum kit cadastrado.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <KitFormDialog draft={draft} onClose={() => setDraft(null)} />
      <KitCatalogLinkDialog open={linking} onClose={() => setLinking(false)} />
    </div>
  );
}

/** Quantos componentes do kit têm código do catálogo de compras ("3/5"). */
function LinkedCount({ kit }: { kit: KitRow }) {
  const linked = kit.components.filter((c) => c.sku).length;
  const total = kit.components.length;
  const title = kit.components
    .map((c) => `${c.sku ?? "próprio"} · ${c.name}`)
    .join("\n");
  return (
    <Badge variant={linked === total ? "success" : linked === 0 ? "muted" : "warning"} title={title}>
      {linked}/{total}
    </Badge>
  );
}
