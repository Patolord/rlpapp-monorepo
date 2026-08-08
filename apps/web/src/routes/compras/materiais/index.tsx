import { api } from "@rlpapp/backend/convex/_generated/api";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { FileUp, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AuthShell } from "@/components/auth-shell";
import { CsvImportDialog } from "@/components/compras/csv-import-dialog";
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
import { splitList } from "@/lib/csv";

const MATERIAL_COLUMN_ALIASES = {
  name: ["name", "nome", "material"],
  category: ["category", "categoria"],
  unit: ["unit", "unidade", "un"],
  spec: ["spec", "especificacao", "especificação", "specification"],
  brandPreference: ["brandpreference", "marca", "brand", "preferencia_marca"],
  aliases: ["aliases", "alias", "apelidos", "sinonimos"],
} as const;

const MATERIAL_TEMPLATE_HEADERS = [
  "name",
  "category",
  "unit",
  "spec",
  "brandPreference",
  "aliases",
];

type MaterialImportItem = {
  name: string;
  category?: string;
  unit?: string;
  spec?: string;
  brandPreference?: string;
  aliases?: string[];
};

export const Route = createFileRoute("/compras/materiais/")({
  component: MateriaisPage,
});

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
  const bulkCreateMaterials = useMutation(api.materials.bulkCreate);
  const updateMaterial = useMutation(api.materials.update);

  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    category: "",
    unit: "",
    spec: "",
  });
  const [submitting, setSubmitting] = useState(false);

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
      });
      toast.success("Material criado");
      setOpen(false);
      setForm({ name: "", category: "", unit: "", spec: "" });
    } catch (error) {
      toast.error(getErrorMessage(error, "Erro ao criar material"));
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
        <div className="flex flex-wrap gap-2">
          <CsvImportDialog<MaterialImportItem>
            title="Importar materiais (CSV)"
            templateFilename="materiais.csv"
            templateHeaders={[...MATERIAL_TEMPLATE_HEADERS]}
            templateSampleRow={[
              "Cabo PP 3x2.5",
              "Elétrica",
              "m",
              "Flexível",
              "",
              "pp 3x2.5;cabo pp",
            ]}
            requiredColumns={["name"]}
            columnAliases={MATERIAL_COLUMN_ALIASES}
            previewColumns={["name", "category", "unit", "spec"]}
            mapRow={(row, rowNumber) => {
              const name = row.name?.trim();
              if (!name) {
                return { ok: false, row: rowNumber, error: "Nome obrigatório" };
              }
              return {
                ok: true,
                row: rowNumber,
                item: {
                  name,
                  category: row.category?.trim() || undefined,
                  unit: row.unit?.trim() || undefined,
                  spec: row.spec?.trim() || undefined,
                  brandPreference: row.brandPreference?.trim() || undefined,
                  aliases: splitList(row.aliases),
                },
              };
            }}
            onImportBatch={(items) => bulkCreateMaterials({ items })}
            trigger={
              <Button variant="outline">
                <FileUp className="mr-2 size-4" />
                Importar CSV
              </Button>
            }
          />
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
            </div>
            <DialogFooter>
              <Button onClick={handleCreate} disabled={submitting}>
                {submitting ? "Salvando..." : "Salvar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </div>
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
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void toggleActive(m._id, m.active)}
                    >
                      {m.active ? "Arquivar" : "Reativar"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
