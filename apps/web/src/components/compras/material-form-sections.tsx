import { api } from "@rlpapp/backend/convex/_generated/api";
import { formatDate } from "@rlpapp/shared";
import type { FunctionReturnType } from "convex/server";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import type { MaterialFormValues } from "./material-form-dialog";

const UNIT_SUGGESTIONS = ["un", "m", "kg", "cx", "pct", "rolo", "m²", "L"];

type MaterialFamily = FunctionReturnType<typeof api.materials.listFamilies>[number];
type DuplicateCandidate = FunctionReturnType<
  typeof api.materials.findDuplicateCandidates
>[number];

type FormProps = {
  form: MaterialFormValues;
  setForm: (form: MaterialFormValues) => void;
};

/** Campos de identificação: família, variante, possíveis duplicatas, códigos e categoria. */
export function MaterialIdentificationFields({
  form,
  setForm,
  families,
  duplicateCandidates,
  isEdit,
}: FormProps & {
  families: MaterialFamily[] | undefined;
  duplicateCandidates: DuplicateCandidate[] | undefined;
  isEdit: boolean;
}) {
  return (
    <>
      <div>
        <Label>Família / nome-base</Label>
        <Input
          value={form.name}
          onChange={(event) =>
            setForm({ ...form, name: event.target.value })
          }
          list="material-family-suggestions"
        />
        <datalist id="material-family-suggestions">
          {(families ?? []).map((family) => (
            <option key={family._id} value={family.name} />
          ))}
        </datalist>
      </div>
      <div>
        <Label>Detalhe da variante</Label>
        <Input
          value={form.variantLabel}
          onChange={(event) =>
            setForm({ ...form, variantLabel: event.target.value })
          }
          placeholder="Ex.: Branca, MAXX 150, 3x2,5 mm²"
        />
      </div>
      {(duplicateCandidates ?? []).length > 0 ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
          <p className="font-medium">Materiais semelhantes encontrados</p>
          <ul className="mt-1 space-y-1">
            {(duplicateCandidates ?? []).map((candidate) => (
              <li key={candidate.materialId}>
                {candidate.name}
                {candidate.variantLabel
                  ? ` — ${candidate.variantLabel}`
                  : ""}{" "}
                ({candidate.sku ?? "sem SKU"})
                {candidate.exact ? " · duplicata exata" : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>SKU</Label>
          <Input
            value={form.sku}
            onChange={(event) =>
              setForm({ ...form, sku: event.target.value })
            }
            placeholder={isEdit ? undefined : "Gerado automaticamente"}
          />
        </div>
        <div>
          <Label>Código de barras</Label>
          <Input
            value={form.barcode}
            onChange={(event) =>
              setForm({ ...form, barcode: event.target.value })
            }
          />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>Fabricante</Label>
          <Input
            value={form.manufacturer}
            onChange={(event) =>
              setForm({ ...form, manufacturer: event.target.value })
            }
          />
        </div>
        <div>
          <Label>Código do fabricante</Label>
          <Input
            value={form.manufacturerPartNumber}
            onChange={(event) =>
              setForm({
                ...form,
                manufacturerPartNumber: event.target.value,
              })
            }
          />
        </div>
      </div>
      <div>
        <Label>Categoria</Label>
        <Input
          value={form.category}
          onChange={(event) =>
            setForm({ ...form, category: event.target.value })
          }
        />
      </div>
    </>
  );
}

export function MaterialUnitsSection({ form, setForm }: FormProps) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-medium">Unidades e embalagem</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>Unidade de estoque</Label>
          <Input
            value={form.unit}
            onChange={(event) =>
              setForm({ ...form, unit: event.target.value })
            }
            placeholder="un, m, kg..."
            list="material-unit-suggestions"
          />
        </div>
        <div>
          <Label>Unidade de compra</Label>
          <Input
            value={form.purchaseUnit}
            onChange={(event) =>
              setForm({ ...form, purchaseUnit: event.target.value })
            }
            placeholder="cx, rolo..."
            list="material-unit-suggestions"
          />
        </div>
      </div>
      <datalist id="material-unit-suggestions">
        {UNIT_SUGGESTIONS.map((unit) => (
          <option key={unit} value={unit} />
        ))}
      </datalist>
      <div>
        <Label>Unidades por embalagem</Label>
        <Input
          type="number"
          min="0"
          step="any"
          value={form.unitsPerPurchaseUnit}
          onChange={(event) =>
            setForm({
              ...form,
              unitsPerPurchaseUnit: event.target.value,
            })
          }
          placeholder="Ex.: 100"
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={form.trackInventory}
          onChange={(event) =>
            setForm({ ...form, trackInventory: event.target.checked })
          }
        />
        Controlar estoque deste material
      </label>
    </section>
  );
}

export function MaterialBudgetSection({
  form,
  setForm,
  laborPriceUpdatedAt,
}: FormProps & { laborPriceUpdatedAt: number | null | undefined }) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-medium">Orçamento</h3>
      <div>
        <Label htmlFor="material-labor-price">
          Mão de obra (R$ por {form.unit.trim() || "unidade"})
        </Label>
        <Input
          id="material-labor-price"
          inputMode="decimal"
          value={form.laborPrice}
          onChange={(event) =>
            setForm({ ...form, laborPrice: event.target.value })
          }
          placeholder="Ex.: 45,50"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Enviado ao RLP Takeoff junto com o preço do material. Deixe em
          branco quando não houver mão de obra.
          {laborPriceUpdatedAt
            ? ` Atualizado em ${formatDate(laborPriceUpdatedAt)}.`
            : ""}
        </p>
      </div>
    </section>
  );
}

export function MaterialTechnicalSection({ form, setForm }: FormProps) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-medium">Dados técnicos</h3>
      <div>
        <Label>Dimensões padronizadas (mm)</Label>
        <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-5">
          {[
            ["widthMm", "Largura"],
            ["heightMm", "Altura"],
            ["lengthMm", "Comprimento"],
            ["thicknessMm", "Espessura"],
            ["diameterMm", "Diâmetro"],
          ].map(([field, label]) => (
            <Input
              key={field}
              type="number"
              min="0"
              step="any"
              aria-label={`${label} em milímetros`}
              placeholder={label}
              value={form[field as keyof MaterialFormValues] as string}
              onChange={(event) =>
                setForm({ ...form, [field]: event.target.value })
              }
            />
          ))}
        </div>
      </div>
      <div>
        <Label>Especificação</Label>
        <Input
          value={form.spec}
          onChange={(event) =>
            setForm({ ...form, spec: event.target.value })
          }
        />
      </div>
      <div>
        <Label>Marca preferida</Label>
        <Input
          value={form.brandPreference}
          onChange={(event) =>
            setForm({ ...form, brandPreference: event.target.value })
          }
        />
      </div>
      <div>
        <Label>Atributos técnicos</Label>
        <Textarea
          value={form.technicalAttributes}
          onChange={(event) =>
            setForm({
              ...form,
              technicalAttributes: event.target.value,
            })
          }
          placeholder="tensao=220v; fase=trifasico"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Usados nas regras de compatibilidade do Estoque.
        </p>
      </div>
    </section>
  );
}
