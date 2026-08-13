import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import {
  BOM_ITEM_DEFS,
  BOM_SECTION_LABELS,
  computeDuctEstimate,
  emptyDuctLine,
  formatCurrency,
  MAX_DUCT_LINES,
  NORMA_LABELS,
  type BomPriceKey,
  type BomSectionId,
  type DuctLineInput,
  type NormaId,
} from "@rlpapp/shared";
import { MetricCard } from "@rlpapp/ui/web";
import {
  Check,
  ChevronDown,
  Info,
  Loader2,
  Plus,
  Printer,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { DuctLineRow, DuctLinesHeader } from "@/components/engenharia/dutos/duct-line-row";
import { getErrorMessage } from "@/lib/errors";
import type { ProjectOverview } from "@/components/engenharia/project-shell";

type DraftLine = DuctLineInput & { key: string };

type Draft = {
  system: string;
  budgetNumber: string;
  norma: NormaId;
  laborRatePerKg: number;
  insulationAllowancePct: number;
  supportAllowancePct: number;
  insulationThicknessMm: number;
  flangeSpacingM: number;
  recladThicknessMm: number;
  splitersQty: number;
  captorsQty: number;
  prices: Record<BomPriceKey, number>;
  lines: DraftLine[];
};

function newLineKey() {
  return crypto.randomUUID();
}

function withKey(line: DuctLineInput): DraftLine {
  return { ...emptyDuctLine(), ...line, key: newLineKey() };
}

function parseNum(value: string): number {
  const parsed = Number.parseFloat(value.replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function formatReais(value: number): string {
  return formatCurrency(Math.round(value * 100));
}

function formatQty(value: number): string {
  if (value === 0) return "—";
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(
    value
  );
}

function toSavePayload(draft: Draft) {
  return {
    system: draft.system,
    budgetNumber: draft.budgetNumber,
    norma: draft.norma,
    laborRatePerKg: draft.laborRatePerKg,
    insulationAllowancePct: draft.insulationAllowancePct,
    supportAllowancePct: draft.supportAllowancePct,
    insulationThicknessMm: draft.insulationThicknessMm,
    flangeSpacingM: draft.flangeSpacingM,
    recladThicknessMm: draft.recladThicknessMm,
    splitersQty: draft.splitersQty,
    captorsQty: draft.captorsQty,
    prices: draft.prices,
    lines: draft.lines.map((line) => ({
      tag: line.tag,
      largerSideCm: line.largerSideCm,
      smallerSideCm: line.smallerSideCm,
      lengthM: line.lengthM,
      externalInsulation: line.externalInsulation,
      internalInsulation: line.internalInsulation,
      flange: line.flange,
      reclad: line.reclad,
      paintReclad: line.paintReclad,
    })),
  };
}

function ParamHint({ label, hint }: { label: string; hint: string }) {
  return (
    <Label>
      {label}
      <Tooltip>
        <TooltipTrigger
          type="button"
          aria-label={`Sobre ${label}`}
          className="inline-flex size-4 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <Info className="size-3.5" />
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-left leading-relaxed">
          {hint}
        </TooltipContent>
      </Tooltip>
    </Label>
  );
}

const SECTION_ORDER: BomSectionId[] = [
  "sheets",
  "insulation",
  "paint",
  "supports",
  "accessories",
  "flanges",
];

const NORMA_ITEMS: Record<string, string> = {
  "1": NORMA_LABELS[1],
  "2": NORMA_LABELS[2],
  "3": NORMA_LABELS[3],
};

export function DuctEstimateWorkspace({
  project,
}: {
  project: ProjectOverview;
}) {
  const list = useQuery(api.ductEstimates.list, { projectId: project._id });
  const createEstimate = useMutation(api.ductEstimates.create);
  const saveEstimate = useMutation(api.ductEstimates.save);
  const renameEstimate = useMutation(api.ductEstimates.rename);
  const removeEstimate = useMutation(api.ductEstimates.remove);

  const [activeId, setActiveId] = useState<Id<"ductEstimates"> | null>(null);
  const estimate = useQuery(
    api.ductEstimates.get,
    activeId ? { estimateId: activeId } : "skip"
  );
  const [draft, setDraft] = useState<Draft | null>(null);
  const [name, setName] = useState("");
  const [saveState, setSaveState] = useState<"saved" | "saving" | "idle">(
    "idle"
  );
  const [pricesOpen, setPricesOpen] = useState(false);
  const snapshotRef = useRef<string | null>(null);
  const creatingRef = useRef(false);

  useEffect(() => {
    if (!list) return;
    if (list.length === 0) {
      if (creatingRef.current) return;
      creatingRef.current = true;
      void createEstimate({
        projectId: project._id,
        name: `Levantamento ${new Date().toLocaleDateString("pt-BR")}`,
      })
        .then((id) => setActiveId(id))
        .catch((error) => {
          toast.error(getErrorMessage(error, "Erro ao criar levantamento"));
        })
        .finally(() => {
          creatingRef.current = false;
        });
      return;
    }
    if (!activeId || !list.some((item) => item._id === activeId)) {
      const first = list[0];
      if (first) setActiveId(first._id);
    }
  }, [list, activeId, createEstimate, project._id]);

  useEffect(() => {
    snapshotRef.current = null;
    setDraft(null);
  }, [activeId]);

  useEffect(() => {
    if (!estimate || estimate._id !== activeId) return;
    const next: Draft = {
      system: estimate.system,
      budgetNumber: estimate.budgetNumber,
      norma: estimate.norma,
      laborRatePerKg: estimate.laborRatePerKg,
      insulationAllowancePct: estimate.insulationAllowancePct,
      supportAllowancePct: estimate.supportAllowancePct,
      insulationThicknessMm: estimate.insulationThicknessMm,
      flangeSpacingM: estimate.flangeSpacingM,
      recladThicknessMm: estimate.recladThicknessMm,
      splitersQty: estimate.splitersQty,
      captorsQty: estimate.captorsQty,
      prices: estimate.prices,
      lines:
        estimate.lines.length > 0
          ? estimate.lines.map(withKey)
          : [withKey(emptyDuctLine())],
    };
    setDraft(next);
    setName(estimate.name);
    snapshotRef.current = JSON.stringify(toSavePayload(next));
    setSaveState("saved");
  }, [estimate, activeId]);

  useEffect(() => {
    if (!draft || !activeId || snapshotRef.current === null) return;
    if (!estimate || estimate._id !== activeId) return;
    const payload = toSavePayload(draft);
    const serialized = JSON.stringify(payload);
    if (serialized === snapshotRef.current) return;

    setSaveState("idle");
    const timer = window.setTimeout(() => {
      setSaveState("saving");
      void saveEstimate({ estimateId: activeId, ...payload })
        .then(() => {
          snapshotRef.current = serialized;
          setSaveState("saved");
        })
        .catch((error) => {
          setSaveState("idle");
          toast.error(getErrorMessage(error, "Erro ao salvar levantamento"));
        });
    }, 600);
    return () => window.clearTimeout(timer);
  }, [draft, activeId, estimate, saveEstimate]);

  const result = useMemo(
    () => (draft ? computeDuctEstimate(draft) : null),
    [draft]
  );

  const updateDraft = useCallback((patch: Partial<Draft>) => {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  const updateLine = useCallback((key: string, patch: Partial<DuctLineInput>) => {
    setDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        lines: prev.lines.map((line) =>
          line.key === key ? { ...line, ...patch } : line
        ),
      };
    });
  }, []);

  async function handleCreate() {
    try {
      const id = await createEstimate({
        projectId: project._id,
        name: `Levantamento ${new Date().toLocaleDateString("pt-BR")}`,
      });
      setActiveId(id);
      toast.success("Novo levantamento criado");
    } catch (error) {
      toast.error(getErrorMessage(error, "Erro ao criar levantamento"));
    }
  }

  async function handleRename() {
    if (!activeId || !name.trim()) return;
    try {
      await renameEstimate({ estimateId: activeId, name: name.trim() });
    } catch (error) {
      toast.error(getErrorMessage(error, "Erro ao renomear"));
    }
  }

  async function handleRemove() {
    if (!activeId) return;
    if (!window.confirm("Excluir este levantamento?")) return;
    try {
      await removeEstimate({ estimateId: activeId });
      setActiveId(null);
      setDraft(null);
      snapshotRef.current = null;
      toast.success("Levantamento excluído");
    } catch (error) {
      toast.error(getErrorMessage(error, "Erro ao excluir"));
    }
  }

  if (!list || !draft || !result) {
    return (
      <div className="flex min-h-[30vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 print:hidden sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold">Dutos NBR 16401</h2>
          <p className="text-sm text-muted-foreground">
            Levantamento de rede de dutos, bitola pela norma e quantitativos.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {saveState === "saving" ? (
              "Salvando…"
            ) : saveState === "saved" ? (
              <span className="inline-flex items-center gap-1">
                <Check className="size-3.5" />
                Salvo
              </span>
            ) : (
              "Alterações não salvas"
            )}
          </span>
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="mr-2 size-4" />
            Imprimir
          </Button>
          <Button variant="outline" onClick={() => void handleCreate()}>
            <Plus className="mr-2 size-4" />
            Novo levantamento
          </Button>
        </div>
      </div>

      {list.length > 0 && (
        <div className="flex flex-wrap items-end gap-3 print:hidden">
          <div className="min-w-56 space-y-1">
            <Label>Levantamento</Label>
            <Select
              value={activeId ?? ""}
              items={Object.fromEntries(list.map((item) => [item._id, item.name]))}
              onValueChange={(value) =>
                setActiveId(value as Id<"ductEstimates">)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {list.map((item) => (
                  <SelectItem key={item._id} value={item._id}>
                    {item.name} ({item.lineCount})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-56 space-y-1">
            <Label>Nome</Label>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              onBlur={() => void handleRename()}
            />
          </div>
          <Button variant="ghost" size="sm" onClick={() => void handleRemove()}>
            <Trash2 className="mr-1.5 size-4" />
            Excluir
          </Button>
        </div>
      )}

      <Card className="print:hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Parâmetros
            <Tooltip>
              <TooltipTrigger
                type="button"
                aria-label="Sobre os parâmetros"
                className="inline-flex size-4 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
              >
                <Info className="size-3.5" />
              </TooltipTrigger>
              <TooltipContent className="max-w-sm text-left leading-relaxed">
                Valores globais do levantamento. A bitola de cada trecho vem da
                norma e do lado maior; folgas e espessuras entram no BOM de
                chapa, isolamento, flanges e suportes.
              </TooltipContent>
            </Tooltip>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1">
            <ParamHint
              label="Norma"
              hint="Tabela NBR 16401 que escolhe a bitola da chapa (#26 a #18) pelo lado maior do duto. ABNT é a mais conservadora em seções pequenas; v.2008 e c/ reforço TR permitem chapa mais fina em dutos maiores."
            />
            <Select
              value={String(draft.norma)}
              items={NORMA_ITEMS}
              onValueChange={(value) =>
                updateDraft({ norma: Number(value) as NormaId })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {([1, 2, 3] as const).map((id) => (
                <SelectItem key={id} value={String(id)}>
                  {NORMA_LABELS[id]}
                </SelectItem>
              ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <ParamHint
              label="Mão de obra (R$/kg)"
              hint="Preço da mão de obra por kg de chapa galvanizada. Se o total de chapa ficar abaixo de 500 kg, a taxa é cobrada em dobro (obra pequena)."
            />
            <Input
              type="number"
              min="0"
              step="0.01"
              value={draft.laborRatePerKg}
              onChange={(event) =>
                updateDraft({ laborRatePerKg: parseNum(event.target.value) })
              }
            />
          </div>
          <div className="space-y-1">
            <ParamHint
              label="Folga isolamento (%)"
              hint="Percentual extra sobre área de isolamento, flanges Powermatic e pintura, para recortes e perdas de aplicação. O padrão da planilha é 15%."
            />
            <Input
              type="number"
              min="0"
              step="0.1"
              value={draft.insulationAllowancePct}
              onChange={(event) =>
                updateDraft({
                  insulationAllowancePct: parseNum(event.target.value),
                })
              }
            />
          </div>
          <div className="space-y-1">
            <ParamHint
              label="Folga suportes (%)"
              hint="Percentual do peso total de chapa convertido em kg de suportes. O padrão da planilha é 30%."
            />
            <Input
              type="number"
              min="0"
              step="0.1"
              value={draft.supportAllowancePct}
              onChange={(event) =>
                updateDraft({
                  supportAllowancePct: parseNum(event.target.value),
                })
              }
            />
          </div>
          <div className="space-y-1">
            <ParamHint
              label="Espessura isolamento (mm)"
              hint="Espessura do isolamento externo. Entra no cálculo das cantoneiras de chapa #26 usadas com isopor ou placa de lã de vidro."
            />
            <Input
              type="number"
              min="0"
              step="1"
              value={draft.insulationThicknessMm}
              onChange={(event) =>
                updateDraft({
                  insulationThicknessMm: parseNum(event.target.value),
                })
              }
            />
          </div>
          <div className="space-y-1">
            <ParamHint
              label="Espaçamento flange (m)"
              hint="Distância entre juntas ao longo do duto. Define quantos metros de Powermatic ou cantoneira, cantos e grampos. O padrão é 1 m."
            />
            <Input
              type="number"
              min="0"
              step="0.1"
              value={draft.flangeSpacingM}
              onChange={(event) =>
                updateDraft({ flangeSpacingM: parseNum(event.target.value) })
              }
            />
          </div>
          <div className="space-y-1">
            <ParamHint
              label="Espessura rechapeado (mm)"
              hint="Folga de chapa somada à seção só nos trechos marcados como rechapeados. Em geral acompanha a espessura do isolamento."
            />
            <Input
              type="number"
              min="0"
              step="1"
              value={draft.recladThicknessMm}
              onChange={(event) =>
                updateDraft({ recladThicknessMm: parseNum(event.target.value) })
              }
            />
          </div>
          <div className="space-y-1">
            <ParamHint
              label="Folga chapa (%)"
              hint="Calculada automaticamente: 20% se o peso bruto de chapa for até 10.000 kg; 15% acima disso. Cobre perdas de corte e aproveitamento."
            />
            <Input value={result.sheetAllowancePct} disabled />
          </div>
          <div className="space-y-1">
            <ParamHint
              label="Spliters (pç)"
              hint="Quantidade lançada à mão. Não é calculada pelos trechos — use para registrar spliters previstos no projeto."
            />
            <Input
              type="number"
              min="0"
              step="1"
              value={draft.splitersQty}
              onChange={(event) =>
                updateDraft({ splitersQty: parseNum(event.target.value) })
              }
            />
          </div>
          <div className="space-y-1">
            <ParamHint
              label="Captores (pç)"
              hint="Quantidade lançada à mão de captores com haste articulada. Também não sai dos trechos."
            />
            <Input
              type="number"
              min="0"
              step="1"
              value={draft.captorsQty}
              onChange={(event) =>
                updateDraft({ captorsQty: parseNum(event.target.value) })
              }
            />
          </div>
        </CardContent>
      </Card>

      <Card className="print:hidden">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Trechos</CardTitle>
          <Button
            size="sm"
            variant="outline"
            disabled={draft.lines.length >= MAX_DUCT_LINES}
            onClick={() =>
              updateDraft({
                lines: [...draft.lines, withKey(emptyDuctLine())],
              })
            }
          >
            <Plus className="mr-1.5 size-4" />
            Adicionar trecho
          </Button>
        </CardHeader>
        <CardContent className="space-y-2 overflow-x-auto">
          <p className="text-xs text-muted-foreground">
            Seção como no desenho: 40 × 25 cm. Digite{" "}
            <kbd className="rounded border bg-muted px-1 font-mono text-[10px]">
              x
            </kbd>{" "}
            para ir ao lado menor, ou cole{" "}
            <span className="font-mono">40x25x3</span>.
          </p>
          <DuctLinesHeader />
          {draft.lines.map((line, index) => (
            <DuctLineRow
              key={line.key}
              line={line}
              gauge={result.lines[index]?.gauge}
              canRemove={draft.lines.length > 1}
              onChange={(patch) => updateLine(line.key, patch)}
              onRemove={() =>
                updateDraft({
                  lines: draft.lines.filter((row) => row.key !== line.key),
                })
              }
            />
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard
          title="Material"
          value={formatReais(result.materialTotal)}
          description={`${formatQty(result.sheetKg)} kg de chapa`}
        />
        <MetricCard
          title="Mão de obra"
          value={formatReais(result.laborTotal)}
          description={
            result.sheetKg < 500 && result.sheetKg > 0
              ? "Taxa dobrada abaixo de 500 kg"
              : `${formatReais(result.laborPerKg)} / kg`
          }
        />
        <MetricCard
          title="Total geral"
          value={formatReais(result.grandTotal)}
          description={`${formatReais(result.totalPerKg)} / kg`}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Resumo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {SECTION_ORDER.map((section) => {
            const rows = result.bom.filter((row) => row.section === section);
            return (
              <div key={section}>
                <h3 className="mb-2 text-sm font-semibold">
                  {BOM_SECTION_LABELS[section]}
                </h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead>Unid.</TableHead>
                      <TableHead className="text-right">Qtde</TableHead>
                      <TableHead className="text-right">Preço unit.</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => (
                      <TableRow key={row.key}>
                        <TableCell>{row.label}</TableCell>
                        <TableCell>{row.unit}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatQty(row.quantity)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatReais(row.unitPrice)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.quantity === 0 ? "—" : formatReais(row.total)}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow>
                      <TableCell colSpan={4} className="font-medium">
                        Subtotal
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatReais(result.sectionTotals[section])}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            );
          })}
          <div className="grid gap-1 text-sm sm:max-w-sm sm:ml-auto">
            <div className="flex justify-between">
              <span>Total materiais</span>
              <span className="font-semibold tabular-nums">
                {formatReais(result.materialTotal)}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Total mão de obra</span>
              <span className="font-semibold tabular-nums">
                {formatReais(result.laborTotal)}
              </span>
            </div>
            <div className="flex justify-between text-base">
              <span>Total geral</span>
              <span className="font-bold tabular-nums">
                {formatReais(result.grandTotal)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="print:hidden">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Tabela de preços</CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setPricesOpen((open) => !open)}
          >
            <ChevronDown
              className={`mr-1 size-4 transition ${pricesOpen ? "rotate-180" : ""}`}
            />
            {pricesOpen ? "Ocultar" : "Editar"}
          </Button>
        </CardHeader>
        {pricesOpen ? (
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Unid.</TableHead>
                  <TableHead className="text-right">Preço unitário (R$)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {BOM_ITEM_DEFS.map((item) => (
                  <TableRow key={item.key}>
                    <TableCell>{item.label}</TableCell>
                    <TableCell>{item.unit}</TableCell>
                    <TableCell className="text-right">
                      <Input
                        className="ml-auto max-w-32 text-right"
                        type="number"
                        min="0"
                        step="0.01"
                        value={draft.prices[item.key]}
                        onChange={(event) =>
                          updateDraft({
                            prices: {
                              ...draft.prices,
                              [item.key]: parseNum(event.target.value),
                            },
                          })
                        }
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        ) : null}
      </Card>
    </div>
  );
}
