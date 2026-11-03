import {
  DIAMETERS,
  type Diameter,
  type HpRow,
  type VrfBrand,
  type VrfRole,
} from "@rlpapp/shared/takeoff/vrfBrands";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ROLE_LABELS: Record<VrfRole, string> = {
  main: "Saída da condensadora",
  trunk: "Trecho intermediário",
  branch: "Ramal da evaporadora",
};
const ROLE_NOTE: Record<VrfRole, string> = {
  main: "pela capacidade da condensadora",
  trunk: "pela soma das evaporadoras a jusante",
  branch: "pela capacidade da evaporadora",
};

const num = (v: string) => Math.max(0, Number(v.replace(",", ".")) || 0);

function DiameterSelect({ value, onChange }: { value: Diameter; onChange: (d: Diameter) => void }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as Diameter)}>
      <SelectTrigger className="min-w-24 font-mono">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {DIAMETERS.map((d) => (
          <SelectItem key={d} value={d}>
            {d}&quot;
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * The rules of one VRF maker, as the desktop app's "Marcas de VRF" dialog edits them: three
 * tube-sizing tables (gas/liquid pair from a minimum HP, by the role of the run) and the Y-kit
 * models by downstream HP. Each row holds from its HP up to the next row (the workbook's
 * approximate VLOOKUP).
 */
export function VrfBrandEditor({
  brand,
  onChange,
}: {
  brand: VrfBrand;
  onChange: (brand: VrfBrand) => void;
}) {
  const update = (patch: Partial<VrfBrand>) => onChange({ ...brand, ...patch });
  const updateRow = (role: VrfRole, i: number, patch: Partial<HpRow>) =>
    update({ [role]: brand[role].map((r, j) => (j === i ? { ...r, ...patch } : r)) });

  return (
    <div className="space-y-4">
      <div className="max-w-sm space-y-1.5">
        <Label htmlFor="brand-name">Marca</Label>
        <Input
          id="brand-name"
          value={brand.name}
          onChange={(e) => update({ name: e.target.value })}
          placeholder="ex.: Daikin"
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Cada linha vale a partir do HP mínimo até a linha seguinte, como o VLOOKUP da planilha
        Levantamento VRF.
      </p>
      <div className="grid gap-6 lg:grid-cols-2">
        {(["main", "trunk", "branch"] as VrfRole[]).map((role) => (
          <div key={role} className="space-y-2">
            <div>
              <div className="text-sm font-medium">{ROLE_LABELS[role]}</div>
              <div className="text-xs text-muted-foreground">{ROLE_NOTE[role]}</div>
            </div>
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="w-24 pb-1 text-left font-medium">HP mín.</th>
                  <th className="pb-1 text-left font-medium">Gás</th>
                  <th className="pb-1 text-left font-medium">Líquido</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {brand[role].map((r, i) => (
                  <tr key={i}>
                    <td className="p-0.5">
                      <Input
                        type="number"
                        min={0}
                        step="any"
                        value={r.hp}
                        onChange={(e) => updateRow(role, i, { hp: num(e.target.value) })}
                        className="w-24 text-right font-mono"
                      />
                    </td>
                    <td className="p-0.5">
                      <DiameterSelect value={r.gas} onChange={(gas) => updateRow(role, i, { gas })} />
                    </td>
                    <td className="p-0.5">
                      <DiameterSelect value={r.liquid} onChange={(liquid) => updateRow(role, i, { liquid })} />
                    </td>
                    <td className="p-0.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Remover linha"
                        onClick={() => update({ [role]: brand[role].filter((_, j) => j !== i) })}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() => {
                const last = brand[role][brand[role].length - 1];
                update({
                  [role]: [
                    ...brand[role],
                    last ? { ...last, hp: last.hp + 2 } : { hp: 0, gas: "1/2", liquid: "1/4" },
                  ],
                });
              }}
            >
              <Plus className="size-3" /> Linha
            </Button>
          </div>
        ))}
        <div className="space-y-2">
          <div>
            <div className="text-sm font-medium">Y-kit (kit de derivação)</div>
            <div className="text-xs text-muted-foreground">pela capacidade a jusante do kit</div>
          </div>
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="w-24 pb-1 text-left font-medium">HP mín.</th>
                <th className="pb-1 text-left font-medium">Modelo</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {brand.ykit.map((r, i) => (
                <tr key={i}>
                  <td className="p-0.5">
                    <Input
                      type="number"
                      min={0}
                      step="any"
                      value={r.hp}
                      onChange={(e) =>
                        update({ ykit: brand.ykit.map((y, j) => (j === i ? { ...y, hp: num(e.target.value) } : y)) })
                      }
                      className="w-24 text-right font-mono"
                    />
                  </td>
                  <td className="p-0.5">
                    <Input
                      value={r.model}
                      onChange={(e) =>
                        update({ ykit: brand.ykit.map((y, j) => (j === i ? { ...y, model: e.target.value } : y)) })
                      }
                      className="font-mono"
                      placeholder="ex.: KHRP26A33T"
                    />
                  </td>
                  <td className="p-0.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Remover Y-kit"
                      onClick={() => update({ ykit: brand.ykit.filter((_, j) => j !== i) })}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() => {
              const last = brand.ykit[brand.ykit.length - 1];
              update({ ykit: [...brand.ykit, { hp: last ? last.hp + 4 : 0, model: "" }] });
            }}
          >
            <Plus className="size-3" /> Y-kit
          </Button>
        </div>
      </div>
    </div>
  );
}
