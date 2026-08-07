import { api } from "@rlpapp/backend/convex/_generated/api";
import { createFileRoute } from "@tanstack/react-router";
import type { FunctionReturnType } from "convex/server";
import { useMutation, useQuery } from "convex/react";
import { Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AuthShell } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { getErrorMessage } from "@/lib/errors";

export const Route = createFileRoute("/compras/materiais/")({
  component: MateriaisPage,
});

type MaterialRow = FunctionReturnType<typeof api.materials.list>[number];

function parseTechnicalAttributes(
  input: string
): Array<{ key: string; value: string }> {
  if (!input.trim()) return [];
  return input
    .split(/[;\n]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const separator = part.indexOf("=");
      if (separator <= 0 || separator === part.length - 1) {
        throw new Error(
          `Atributo inválido: "${part}". Use o formato chave=valor.`
        );
      }
      return {
        key: part.slice(0, separator).trim(),
        value: part.slice(separator + 1).trim(),
      };
    });
}

function MateriaisPage() {
  return (
    <AuthShell>
      <MateriaisContent />
    </AuthShell>
  );
}

function MateriaisContent() {
  const materials = useQuery(api.materials.list, {});
  const createMaterial = useMutation(api.materials.create);
  const updateMaterial = useMutation(api.materials.update);

  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    category: "",
    unit: "",
    spec: "",
    technicalAttributes: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [attributesMaterial, setAttributesMaterial] =
    useState<MaterialRow | null>(null);
  const [attributesText, setAttributesText] = useState("");

  const filtered = useMemo(() => {
    if (!materials) return [];
    if (!search.trim()) return materials;
    const term = search.toLowerCase();
    return materials.filter(
      (m) =>
        m.name.toLowerCase().includes(term) ||
        m.category?.toLowerCase().includes(term)
    );
  }, [materials, search]);

  async function handleCreate() {
    if (!form.name.trim()) {
      toast.error("Informe o nome");
      return;
    }
    setSubmitting(true);
    try {
      await createMaterial({
        name: form.name,
        category: form.category || undefined,
        unit: form.unit || undefined,
        spec: form.spec || undefined,
        technicalAttributes: parseTechnicalAttributes(
          form.technicalAttributes
        ),
      });
      toast.success("Material criado");
      setOpen(false);
      setForm({
        name: "",
        category: "",
        unit: "",
        spec: "",
        technicalAttributes: "",
      });
    } catch (error) {
      toast.error(getErrorMessage(error, "Erro ao criar material"));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUpdateAttributes() {
    if (!attributesMaterial) return;
    setSubmitting(true);
    try {
      await updateMaterial({
        materialId: attributesMaterial._id,
        technicalAttributes: parseTechnicalAttributes(attributesText),
      });
      toast.success("Atributos técnicos atualizados");
      setAttributesMaterial(null);
    } catch (error) {
      toast.error(getErrorMessage(error, "Erro ao atualizar atributos"));
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(materialId: typeof filtered[number]["_id"], active: boolean) {
    try {
      await updateMaterial({ materialId, active: !active });
      toast.success(active ? "Material arquivado" : "Material reativado");
    } catch (error) {
      toast.error(getErrorMessage(error, "Erro ao atualizar"));
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Materiais</h1>
          <p className="text-sm text-muted-foreground">
            Catálogo interno de materiais.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={<Button><Plus className="mr-2 size-4" />Novo material</Button>} />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Novo material</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Nome</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <Label>Categoria</Label>
                <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
              </div>
              <div>
                <Label>Unidade</Label>
                <Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="m, un, kg..." />
              </div>
              <div>
                <Label>Especificação</Label>
                <Input value={form.spec} onChange={(e) => setForm({ ...form, spec: e.target.value })} />
              </div>
              <div>
                <Label>Atributos técnicos</Label>
                <Textarea
                  value={form.technicalAttributes}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      technicalAttributes: e.target.value,
                    })
                  }
                  placeholder="tensao=220v; fase=trifasico"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Separe os atributos por ponto e vírgula ou uma linha por
                  atributo.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleCreate} disabled={submitting}>
                {submitting ? "Salvando..." : "Salvar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Buscar materiais..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Catálogo</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Unidade</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((m) => (
                <TableRow key={m._id}>
                  <TableCell className="font-medium">{m.name}</TableCell>
                  <TableCell>{m.category ?? "—"}</TableCell>
                  <TableCell>{m.unit ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={m.active ? "default" : "secondary"}>
                      {m.active ? "Ativo" : "Inativo"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setAttributesMaterial(m);
                          setAttributesText(
                            (m.technicalAttributes ?? [])
                              .map(
                                (attribute) =>
                                  `${attribute.key}=${attribute.value}`
                              )
                              .join("; ")
                          );
                        }}
                      >
                        Atributos
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void toggleActive(m._id, m.active)}
                      >
                        {m.active ? "Arquivar" : "Reativar"}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog
        open={attributesMaterial !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setAttributesMaterial(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Atributos técnicos — {attributesMaterial?.name}
            </DialogTitle>
          </DialogHeader>
          <div>
            <Label>Atributos</Label>
            <Textarea
              value={attributesText}
              onChange={(event) => setAttributesText(event.target.value)}
              placeholder="tensao=220v; fase=trifasico"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Estes valores são usados nas regras de compatibilidade do
              Estoque.
            </p>
          </div>
          <DialogFooter>
            <Button
              onClick={() => void handleUpdateAttributes()}
              disabled={submitting}
            >
              {submitting ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
