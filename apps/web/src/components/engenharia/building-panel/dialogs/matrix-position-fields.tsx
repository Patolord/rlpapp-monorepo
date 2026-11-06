import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Converte o texto de um input numérico em inteiro >= 1 (ou undefined). */
export function parseGridField(value: string): number | undefined {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n >= 1 ? n : undefined;
}

/** Converte o texto em inteiro >= min (ou undefined). */
function parseIntField(value: string, min: number): number | undefined {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n >= min ? n : undefined;
}

/**
 * Segmento extra (retângulo) do formulário, em texto bruto dos inputs.
 * Compõe regiões não-retangulares junto com o retângulo principal.
 */
export type SegmentDraft = {
  colOffset: string;
  colSpan: string;
  rowOffset: string;
  rowSpan: string;
};

const EMPTY_SEGMENT: SegmentDraft = {
  colOffset: "",
  colSpan: "",
  rowOffset: "",
  rowSpan: "",
};

type SegmentPayload = {
  colOffset: number;
  colSpan?: number;
  rowOffset?: number;
  rowSpan?: number;
};

/** Converte os rascunhos em payload da mutation (descarta linhas vazias). */
export function parseSegments(drafts: SegmentDraft[]): SegmentPayload[] {
  const segments: SegmentPayload[] = [];
  for (const d of drafts) {
    const colOffset = parseIntField(d.colOffset, Number.MIN_SAFE_INTEGER);
    const colSpan = parseGridField(d.colSpan);
    const rowOffset = parseIntField(d.rowOffset, 0);
    const rowSpan = parseGridField(d.rowSpan);
    // Linha totalmente vazia é ignorada silenciosamente.
    if (
      colOffset === undefined &&
      colSpan === undefined &&
      rowOffset === undefined &&
      rowSpan === undefined
    ) {
      continue;
    }
    segments.push({ colOffset: colOffset ?? 0, colSpan, rowOffset, rowSpan });
  }
  return segments;
}

/**
 * Campos opcionais de posição esquemática do ambiente na matriz do prédio:
 * coluna explícita, largura em colunas, altura em andares (duplex/triplex) e
 * segmentos extras para regiões não-retangulares (ex: forma em "L").
 */
export function MatrixPositionFields({
  idPrefix,
  col,
  colSpan,
  rowSpan,
  segments,
  onColChange,
  onColSpanChange,
  onRowSpanChange,
  onSegmentsChange,
}: {
  idPrefix: string;
  col: string;
  colSpan: string;
  rowSpan: string;
  segments: SegmentDraft[];
  onColChange: (v: string) => void;
  onColSpanChange: (v: string) => void;
  onRowSpanChange: (v: string) => void;
  onSegmentsChange: (segments: SegmentDraft[]) => void;
}) {
  function updateSegment(index: number, patch: Partial<SegmentDraft>) {
    onSegmentsChange(
      segments.map((s, i) => (i === index ? { ...s, ...patch } : s))
    );
  }

  return (
    <fieldset className="space-y-2 rounded-lg border p-3">
      <legend className="px-1 text-xs font-medium text-muted-foreground">
        Posição na matriz (opcional)
      </legend>
      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-col`} className="text-xs">
            Coluna
          </Label>
          <Input
            id={`${idPrefix}-col`}
            type="number"
            min={1}
            placeholder="Auto"
            value={col}
            onChange={(e) => onColChange(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-colspan`} className="text-xs">
            Largura
          </Label>
          <Input
            id={`${idPrefix}-colspan`}
            type="number"
            min={1}
            placeholder="1"
            value={colSpan}
            onChange={(e) => onColSpanChange(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-rowspan`} className="text-xs">
            Andares
          </Label>
          <Input
            id={`${idPrefix}-rowspan`}
            type="number"
            min={1}
            placeholder="1"
            value={rowSpan}
            onChange={(e) => onRowSpanChange(e.target.value)}
          />
        </div>
      </div>
      <p className="text-[0.6875rem] leading-snug text-muted-foreground">
        Andares: 2 = duplex, 3 = triplex (o ambiente sobe a partir deste
        andar). Largura: quantas colunas a célula ocupa.
      </p>

      {segments.length > 0 && (
        <div className="space-y-2 border-t pt-2">
          <p className="text-[0.6875rem] font-medium text-muted-foreground">
            Segmentos extras (formas não-retangulares, ex: em "L"). Posições
            relativas ao retângulo acima: coluna 0 = mesma coluna (negativo =
            à esquerda); andar 0 = mesmo andar (1 = um andar acima).
          </p>
          {segments.map((seg, idx) => (
            <div key={idx} className="flex items-end gap-2">
              <div className="grid flex-1 grid-cols-4 gap-2">
                <div className="space-y-1">
                  <Label
                    htmlFor={`${idPrefix}-seg-${idx}-coloffset`}
                    className="text-xs"
                  >
                    Coluna
                  </Label>
                  <Input
                    id={`${idPrefix}-seg-${idx}-coloffset`}
                    type="number"
                    placeholder="0"
                    value={seg.colOffset}
                    onChange={(e) =>
                      updateSegment(idx, { colOffset: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label
                    htmlFor={`${idPrefix}-seg-${idx}-colspan`}
                    className="text-xs"
                  >
                    Largura
                  </Label>
                  <Input
                    id={`${idPrefix}-seg-${idx}-colspan`}
                    type="number"
                    min={1}
                    placeholder="1"
                    value={seg.colSpan}
                    onChange={(e) =>
                      updateSegment(idx, { colSpan: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label
                    htmlFor={`${idPrefix}-seg-${idx}-rowoffset`}
                    className="text-xs"
                  >
                    Andar
                  </Label>
                  <Input
                    id={`${idPrefix}-seg-${idx}-rowoffset`}
                    type="number"
                    min={0}
                    placeholder="0"
                    value={seg.rowOffset}
                    onChange={(e) =>
                      updateSegment(idx, { rowOffset: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label
                    htmlFor={`${idPrefix}-seg-${idx}-rowspan`}
                    className="text-xs"
                  >
                    Andares
                  </Label>
                  <Input
                    id={`${idPrefix}-seg-${idx}-rowspan`}
                    type="number"
                    min={1}
                    placeholder="1"
                    value={seg.rowSpan}
                    onChange={(e) =>
                      updateSegment(idx, { rowSpan: e.target.value })
                    }
                  />
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0 text-destructive hover:text-destructive"
                onClick={() =>
                  onSegmentsChange(segments.filter((_, i) => i !== idx))
                }
                aria-label={`Remover segmento ${idx + 1}`}
              >
                <Trash2 />
              </Button>
            </div>
          ))}
        </div>
      )}
      <Button
        type="button"
        variant="outline"
        size="xs"
        onClick={() => onSegmentsChange([...segments, { ...EMPTY_SEGMENT }])}
      >
        <Plus />
        Segmento extra
      </Button>
    </fieldset>
  );
}
