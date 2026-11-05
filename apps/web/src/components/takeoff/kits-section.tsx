import { api } from "@rlpapp/backend/convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { useMutation, useQuery } from "convex/react";
import { Copy, Download, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

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


/** "Cobre de 1/4" · Cobre de 3/8" · Cabo PP 5 x 1,5 mm² ×2", como no app. */
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

/** Kits (presets) padrão da empresa para a ferramenta Kit (T) do app: lista, edição e kits de fábrica. */
export function KitsSection() {
  const kits = useQuery(api.takeoffKits.list, {});
  const remove = useMutation(api.takeoffKits.remove);
  const seedDefaults = useMutation(api.takeoffKits.seedDefaults);
  // what "Carregar kits de fábrica" would add: a removed factory kit keeps its key and does not
  // come back, so the count comes from the backend, not from the active list
  const missingFactory = useQuery(api.takeoffKits.missingFactory, {}) ?? 0;
  const [draft, setDraft] = useState<KitDraft | null>(null);
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
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Presets (kits)</CardTitle>
              <CardDescription>
                Ferramenta Kit (T): um trecho desenhado ou um clique mede vários materiais de uma
                vez. Cada kit é salvo ao confirmar o formulário.{" "}
                {kits === undefined
                  ? "Carregando…"
                  : kits.length === 0
                    ? "Nenhum kit publicado: o app usa os kits de fábrica embutidos nele."
                    : `${kits.length} ${kits.length === 1 ? "kit publicado" : "kits publicados"}.`}
              </CardDescription>
            </div>
            <div className="flex gap-2">
              {missingFactory > 0 && (
                <Button variant="outline" onClick={() => void loadFactory()} disabled={busy}>
                  <Download className="size-4" />
                  Carregar kits de fábrica ({missingFactory})
                </Button>
              )}
              <Button onClick={() => setDraft(emptyKitDraft())}>
                <Plus className="size-4" /> Novo kit
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Rótulo</TableHead>
                <TableHead>Componentes</TableHead>
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
                  <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                    Nenhum kit cadastrado.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <KitFormDialog draft={draft} onClose={() => setDraft(null)} />
    </>
  );
}
