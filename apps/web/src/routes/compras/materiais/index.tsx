import { api } from "@rlpapp/backend/convex/_generated/api";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { FileUp, Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { AuthShell } from "@/components/auth-shell";
import { CsvImportDialog } from "@/components/compras/csv-import-dialog";
import { MaterialDetailSheet } from "@/components/compras/material-detail-sheet";
import {
  MaterialFormDialog,
  type MaterialCatalogRow,
} from "@/components/compras/material-form-dialog";
import { MaterialsDataTable } from "@/components/compras/materials-table/materials-data-table";
import { Button } from "@/components/ui/button";
import { getErrorMessage } from "@/lib/errors";
import { splitList } from "@/lib/csv";
import {
  parseCatalogRowAttributes,
  type MaterialDimensions,
} from "@/lib/material-import";

const MATERIAL_COLUMN_ALIASES = {
  name: ["name", "nome", "material", "descrição", "descricao"],
  variantLabel: ["variantlabel", "variante", "detalhe"],
  sourceMaterialId: ["sourcematerialid", "id"],
  sourceDetailId: ["sourcedetailid", "id detalhe", "iddetalhe"],
  quantity: ["quantity", "quantidade", "qtd"],
  unitCost: ["unitcost", "custo unitário", "custo unitario", "valor"],
  category: ["category", "categoria"],
  unit: ["unit", "unidade", "un"],
  spec: ["spec", "especificacao", "especificação", "specification"],
  brandPreference: ["brandpreference", "marca", "brand", "preferencia_marca"],
  aliases: ["aliases", "alias", "apelidos", "sinonimos"],
  widthMm: ["widthmm", "largura", "larguramm"],
  heightMm: ["heightmm", "altura", "alturamm"],
  lengthMm: ["lengthmm", "comprimento", "comprimentomm"],
  thicknessMm: ["thicknessmm", "espessura", "espessuramm"],
  diameterMm: ["diametermm", "diametro", "diâmetro"],
  finish: ["finish", "acabamento"],
  tubeSize: ["tubesize", "bitola", "diametro_tubo"],
  application: ["application", "aplicacao", "aplicação"],
  attributesJson: ["attributesjson", "atributos", "attributes"],
} as const;

const MATERIAL_TEMPLATE_HEADERS = [
  "name",
  "variantLabel",
  "category",
  "unit",
  "widthMm",
  "heightMm",
  "lengthMm",
  "thicknessMm",
  "diameterMm",
  "finish",
  "tubeSize",
  "application",
  "spec",
  "aliases",
  "quantity",
  "unitCost",
];

type MaterialImportItem = {
  name: string;
  variantLabel?: string;
  dimensions?: MaterialDimensions;
  technicalAttributes?: Array<{ key: string; value: string }>;
  sourceMaterialId?: string;
  sourceDetailId?: string;
  sourceRowNumber: number;
  quantity?: number;
  unitCostCents?: number;
  category?: string;
  unit?: string;
  spec?: string;
  brandPreference?: string;
  aliases?: string[];
};

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

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
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [category, setCategory] = useState("");
  const [activeOnly, setActiveOnly] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editMaterial, setEditMaterial] = useState<MaterialCatalogRow | null>(
    null
  );
  const [detailMaterial, setDetailMaterial] =
    useState<MaterialCatalogRow | null>(null);
  const updateMaterial = useMutation(api.materials.update);
  const bulkCreateMaterials = useMutation(api.materials.bulkCreate);
  const categories = useQuery(api.materials.listCategories) ?? [];

  const catalog = usePaginatedQuery(
    api.materials.listCatalog,
    {
      search: debouncedSearch.trim() || undefined,
      category: category || undefined,
      activeOnly: activeOnly || undefined,
    },
    { initialNumItems: 25 }
  );

  const toggleActive = useCallback(
    async (material: MaterialCatalogRow) => {
      try {
        await updateMaterial({
          materialId: material._id,
          active: !material.active,
        });
        toast.success(
          material.active ? "Material arquivado" : "Material reativado"
        );
      } catch (error) {
        toast.error(getErrorMessage(error, "Erro ao atualizar"));
      }
    },
    [updateMaterial]
  );

  const openCreate = useCallback(() => {
    setEditMaterial(null);
    setFormOpen(true);
  }, []);

  const openEdit = useCallback((material: MaterialCatalogRow) => {
    setDetailMaterial(null);
    setEditMaterial(material);
    setFormOpen(true);
  }, []);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Materiais</h1>
          <p className="text-sm text-muted-foreground">
            Catálogo interno com SKU, identificação e políticas de reposição.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <CsvImportDialog<MaterialImportItem>
            title="Importar materiais (CSV ou Excel)"
            templateFilename="materiais.csv"
            templateHeaders={[...MATERIAL_TEMPLATE_HEADERS]}
            templateSampleRow={[
              "Tubo de Cobre",
              'Split – 1/4"',
              "Ar Condicionado",
              "m",
              "",
              "",
              "",
              "",
              "",
              "",
              '1/4"',
              "Split",
              '1/4"; aplicação Split',
              "cobre de 1/4",
              "",
              "",
            ]}
            requiredColumns={["name"]}
            columnAliases={MATERIAL_COLUMN_ALIASES}
            previewColumns={["name", "variantLabel", "category", "unit"]}
            mapRow={(row, rowNumber) => {
              const name = row.name?.trim();
              if (!name) {
                return { ok: false, row: rowNumber, error: "Nome obrigatório" };
              }
              const variantLabel = row.variantLabel?.trim() || undefined;
              const parsed = parseCatalogRowAttributes(row);
              if (
                variantLabel &&
                /\d+\s*[x×]\s*\d+/i.test(variantLabel) &&
                !/mm[²2]/i.test(variantLabel) &&
                !parsed.dimensions?.widthMm
              ) {
                return {
                  ok: false,
                  row: rowNumber,
                  error:
                    "Dimensão ambígua. Revise e informe largura x altura em mm.",
                };
              }
              return {
                ok: true,
                row: rowNumber,
                item: {
                  name,
                  variantLabel,
                  dimensions: parsed.dimensions,
                  technicalAttributes: parsed.technicalAttributes,
                  sourceMaterialId: row.sourceMaterialId?.trim() || undefined,
                  sourceDetailId: row.sourceDetailId?.trim() || undefined,
                  sourceRowNumber: rowNumber,
                  quantity: row.quantity?.trim()
                    ? Number.parseFloat(row.quantity.replace(",", "."))
                    : undefined,
                  unitCostCents: row.unitCost?.trim()
                    ? Math.round(
                        Number.parseFloat(row.unitCost.replace(",", ".")) * 100
                      )
                    : undefined,
                  category: row.category?.trim() || undefined,
                  unit: row.unit?.trim() || undefined,
                  spec: row.spec?.trim() || undefined,
                  brandPreference: row.brandPreference?.trim() || undefined,
                  aliases: splitList(row.aliases),
                },
              };
            }}
            onImportBatch={(items) =>
              bulkCreateMaterials({
                items,
                source: "material-catalog-ui",
              })
            }
            trigger={
              <Button variant="outline">
                <FileUp className="mr-2 size-4" />
                Importar CSV
              </Button>
            }
          />
          <Button onClick={openCreate}>
            <Plus className="mr-2 size-4" />
            Novo material
          </Button>
        </div>
      </div>

      <MaterialsDataTable
        data={catalog.results}
        status={catalog.status}
        search={search}
        onSearchChange={setSearch}
        category={category}
        onCategoryChange={setCategory}
        categories={categories}
        activeOnly={activeOnly}
        onActiveOnlyChange={setActiveOnly}
        onLoadMore={() => catalog.loadMore(25)}
        onCreate={openCreate}
        hasActiveFilters={
          Boolean(debouncedSearch.trim()) || Boolean(category)
        }
        onOpenDetail={setDetailMaterial}
        onEdit={openEdit}
        onToggleActive={(material) => void toggleActive(material)}
      />

      <MaterialFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        material={editMaterial}
      />

      <MaterialDetailSheet
        material={detailMaterial}
        onOpenChange={(open) => {
          if (!open) setDetailMaterial(null);
        }}
        onEdit={openEdit}
      />
    </div>
  );
}
