import type { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import type { FunctionReturnType } from "convex/server";
import { Plus } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";

import {
  type Dimensions,
  hasAnyDimension,
  SizeEstimateHint,
} from "@/components/compras/size-estimate-hint";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Linha nova do takeoff manual, como digitada no formulário. */
export type NewTakeoffLine = {
  rawDescription: string;
  quantity: string;
  unit: string;
  widthMm: string;
  heightMm: string;
  lengthMm: string;
  thicknessMm: string;
  diameterMm: string;
  customSpecification: string;
};

type MaterialSuggestion = FunctionReturnType<typeof api.materials.suggest>[number];

function parseMm(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number.parseFloat(value.replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

/** Medidas digitadas na linha nova; null quando nenhuma foi informada. */
export function parseDimensions(line: {
  widthMm: string;
  heightMm: string;
  lengthMm: string;
  thicknessMm: string;
  diameterMm: string;
}): Dimensions | null {
  const dimensions: Dimensions = {
    widthMm: parseMm(line.widthMm),
    heightMm: parseMm(line.heightMm),
    lengthMm: parseMm(line.lengthMm),
    thicknessMm: parseMm(line.thicknessMm),
    diameterMm: parseMm(line.diameterMm),
  };
  return hasAnyDimension(dimensions) ? dimensions : null;
}

/** Formulário de entrada livre de um item no takeoff manual. */
export function AddTakeoffItemCard({
  newLine,
  setNewLine,
  newLineDimensions,
  suggestions,
  onAddLine,
}: {
  newLine: NewTakeoffLine;
  setNewLine: Dispatch<SetStateAction<NewTakeoffLine>>;
  newLineDimensions: Dimensions | null;
  suggestions: MaterialSuggestion[] | undefined;
  onAddLine: (materialId?: Id<"materials">) => Promise<void>;
}) {
  async function handleSuggest(term: string) {
    setNewLine((prev) => ({ ...prev, rawDescription: term }));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Adicionar item</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <Label>Descrição livre</Label>
          <Input
            value={newLine.rawDescription}
            onChange={(e) => void handleSuggest(e.target.value)}
            placeholder="Tubo cobre 1/4 - 300m"
          />
        </div>
        {suggestions && suggestions.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <Button
                key={s._id}
                size="sm"
                variant="secondary"
                onClick={() => {
                  setNewLine((prev) => ({
                    ...prev,
                    rawDescription: s.name,
                    unit: prev.unit || s.unit || "",
                  }));
                  void onAddLine(s._id);
                }}
              >
                {s.name}
                {s.variantLabel ? ` — ${s.variantLabel}` : ""}
              </Button>
            ))}
            <Button size="sm" variant="ghost" onClick={() => void onAddLine()}>
              Manter texto livre
            </Button>
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Quantidade (opcional)</Label>
            <Input
              value={newLine.quantity}
              onChange={(e) => setNewLine({ ...newLine, quantity: e.target.value })}
            />
          </div>
          <div>
            <Label>Unidade (opcional)</Label>
            <Input
              value={newLine.unit}
              onChange={(e) => setNewLine({ ...newLine, unit: e.target.value })}
              placeholder="m, un..."
            />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-5">
          <div>
            <Label>Largura personalizada (mm)</Label>
            <Input
              type="number"
              min="0"
              step="any"
              value={newLine.widthMm}
              onChange={(event) =>
                setNewLine({ ...newLine, widthMm: event.target.value })
              }
            />
          </div>
          <div>
            <Label>Altura personalizada (mm)</Label>
            <Input
              type="number"
              min="0"
              step="any"
              value={newLine.heightMm}
              onChange={(event) =>
                setNewLine({ ...newLine, heightMm: event.target.value })
              }
            />
          </div>
          <div>
            <Label>Comprimento (mm)</Label>
            <Input
              type="number"
              min="0"
              step="any"
              value={newLine.lengthMm}
              onChange={(event) =>
                setNewLine({ ...newLine, lengthMm: event.target.value })
              }
            />
          </div>
          <div>
            <Label>Espessura (mm)</Label>
            <Input
              type="number"
              min="0"
              step="any"
              value={newLine.thicknessMm}
              onChange={(event) =>
                setNewLine({ ...newLine, thicknessMm: event.target.value })
              }
            />
          </div>
          <div>
            <Label>Diâmetro (mm)</Label>
            <Input
              type="number"
              min="0"
              step="any"
              value={newLine.diameterMm}
              onChange={(event) =>
                setNewLine({ ...newLine, diameterMm: event.target.value })
              }
            />
          </div>
        </div>
        {newLineDimensions ? (
          <SizeEstimateHint
            familyName={newLine.rawDescription}
            dimensions={newLineDimensions}
          />
        ) : null}
        <div>
          <Label>Detalhe personalizado</Label>
          <Input
            value={newLine.customSpecification}
            onChange={(event) =>
              setNewLine({
                ...newLine,
                customSpecification: event.target.value,
              })
            }
            placeholder="Cor, acabamento..."
          />
        </div>
        <Button onClick={() => void onAddLine()}>
          <Plus />
          Adicionar linha
        </Button>
      </CardContent>
    </Card>
  );
}
