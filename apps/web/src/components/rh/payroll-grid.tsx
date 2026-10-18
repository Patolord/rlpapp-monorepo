import type { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";

import {
  formatCentsInput,
  parseDays,
  parsePayrollAmountToCents,
} from "@/lib/rh/money";
import { cn } from "@/lib/utils";

type Workspace = FunctionReturnType<typeof api.payroll.getWorkspace>;
export type PayrollLine = Workspace["lines"][number];
export type PayrollTotals = Workspace["totals"];
export type PayrollLinePatch = Omit<
  FunctionArgs<typeof api.payroll.updateLine>,
  "lineId"
>;

type Align = "left" | "right" | "center";

interface Column {
  key: string;
  /** `\n` quebra o rótulo em duas linhas no cabeçalho. */
  label: string;
  /** Largura fixa em px. A coluna sem largura (Funcionário) absorve o resto. */
  width?: number;
  align: Align;
  /** Tooltip com o nome completo quando o rótulo é abreviado. */
  title?: string;
}

/**
 * Larguras calibradas para a grade caber inteira ao lado da sidebar em uma
 * tela de notebook (~1380px úteis) com Inter 12px: cada coluna numérica
 * comporta valores de 5 dígitos ("12.345,67") e o rótulo do cabeçalho.
 */
const COLUMNS: Column[] = [
  { key: "employee", label: "Funcionário", align: "left" },
  { key: "baseSalary", label: "Sal. base", width: 76, align: "right" },
  { key: "earnings", label: "Proventos", width: 76, align: "right" },
  { key: "deductions", label: "Descontos", width: 76, align: "right" },
  {
    key: "foodBasket",
    label: "Cesta ✓",
    width: 64,
    align: "center",
    title: "Cesta básica (valor do parâmetro quando marcada)",
  },
  {
    key: "days",
    label: "Dias",
    width: 36,
    align: "right",
    title: "Dias de transporte/alimentação",
  },
  {
    key: "dailyTransit",
    label: "Pass./\ndia",
    width: 52,
    align: "right",
    title: "Passagem por dia",
  },
  {
    key: "mealVoucher",
    label: "Vale\nalim. ⚙",
    width: 66,
    align: "right",
    title: "Vale alimentação = dias × VA/dia",
  },
  {
    key: "transitVoucher",
    label: "Vale\ntransp. ⚙",
    width: 68,
    align: "right",
    title: "Vale transporte = dias × passagem/dia",
  },
  {
    key: "supplement",
    label: "Complem.",
    width: 72,
    align: "right",
    title: "Complemento",
  },
  { key: "thirteenthFirst", label: "13º P1", width: 68, align: "right" },
  { key: "thirteenthSecond", label: "13º P2", width: 68, align: "right" },
  {
    key: "loan",
    label: "Emprést. ⚙",
    width: 84,
    align: "right",
    title: "Parcelas de empréstimo ativas no mês (clique para gerenciar)",
  },
  { key: "total", label: "Pagamento\ntotal ⚙", width: 80, align: "right" },
  {
    key: "paymentMethod",
    label: "F. pag.",
    width: 64,
    align: "left",
    title: "Forma de pagamento",
  },
  { key: "away", label: "Afast.", width: 56, align: "left", title: "Afastado" },
  { key: "paid", label: "Pago", width: 52, align: "center" },
  { key: "notes", label: "Observações", width: 110, align: "left" },
  { key: "actions", label: "", width: 28, align: "center" },
];

const FIXED_WIDTH = COLUMNS.reduce(
  (sum, column) => sum + (column.width ?? 0),
  0,
);
/**
 * Abaixo desta largura a coluna Funcionário ficaria ilegível, então a grade
 * passa a rolar horizontalmente dentro do próprio card (nunca por baixo da
 * sidebar, que é `position: fixed`).
 */
const MIN_TABLE_WIDTH = FIXED_WIDTH + 160;

const ALIGN: Record<Align, string> = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
};

const CELL = "border-b border-border px-0.5 py-[2px]";
const TEXT_CELL =
  "border-b border-border px-1 py-[2px] text-right tabular-nums";
const STICKY_SHADOW = "shadow-[inset_-1px_0_var(--border)]";

export interface PayrollGridProps {
  /** Linhas já filtradas pela busca. */
  lines: PayrollLine[];
  /** Total de linhas da competência (antes do filtro). */
  totalCount: number;
  totals?: PayrollTotals;
  status: "loading" | "no-run" | "ready";
  closed: boolean;
  onCommit: (lineId: Id<"payrollLines">, patch: PayrollLinePatch) => void;
  onTogglePaid: (line: PayrollLine) => void;
  onRemove: (line: PayrollLine) => void;
  onOpenLoans: (line: PayrollLine) => void;
}

/**
 * Grade da folha de pagamento. `table-fixed` + `<colgroup>` garante que a
 * tabela ocupe exatamente a largura do card: nada vaza para fora da área de
 * conteúdo nem passa por baixo da sidebar.
 */
export function PayrollGrid({
  lines,
  totalCount,
  totals,
  status,
  closed,
  onCommit,
  onTogglePaid,
  onRemove,
  onOpenLoans,
}: PayrollGridProps) {
  const emptyMessage =
    status === "loading"
      ? "Carregando folha..."
      : status === "no-run"
        ? "Nenhuma competência aberta. Use Abrir competência para iniciar esta folha."
        : lines.length === 0
          ? totalCount === 0
            ? "Nenhum funcionário nesta competência. Use + Funcionário para incluir."
            : "Nenhum funcionário corresponde à busca."
          : null;

  return (
    <div className="min-h-[220px] min-w-0 flex-1 overflow-auto rounded-[var(--radius)] border border-border bg-card">
      <table
        className="w-full table-fixed border-separate border-spacing-0 text-[12px]"
        style={{ minWidth: MIN_TABLE_WIDTH }}
      >
        <colgroup>
          {COLUMNS.map((column) => (
            <col
              key={column.key}
              style={column.width ? { width: column.width } : undefined}
            />
          ))}
        </colgroup>
        <thead>
          <tr>
            {COLUMNS.map((column) => (
              <th
                key={column.key}
                title={column.title}
                className={cn(
                  "sticky top-0 z-30 border-b border-border bg-muted px-1 py-1.5 align-bottom text-[10px] leading-[1.2] font-semibold tracking-[0.04em] whitespace-pre-line text-muted-foreground uppercase",
                  ALIGN[column.align],
                  column.key === "employee" && `left-0 z-40 ${STICKY_SHADOW}`,
                )}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {emptyMessage ? (
            <tr>
              <td
                colSpan={COLUMNS.length}
                className="px-4 py-8 text-muted-foreground"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            lines.map((line) => {
              const bg = !line.paid
                ? "color-mix(in oklab, var(--primary) 6%, var(--card))"
                : "var(--card)";
              return (
                <tr key={line._id} style={{ background: bg }}>
                  {/* Funcionário: nome em cima, código · cargo embaixo */}
                  <td
                    className={cn(
                      "sticky left-0 z-20 border-b border-border px-1 py-[2px]",
                      STICKY_SHADOW,
                    )}
                    style={{ background: bg }}
                  >
                    <GridInput
                      disabled={closed}
                      align="left"
                      className="h-[19px] font-semibold"
                      placeholder="Nome"
                      value={line.name}
                      onCommit={(value) => onCommit(line._id, { name: value })}
                    />
                    <div className="flex items-center">
                      <GridInput
                        disabled={closed}
                        align="left"
                        className="h-[15px] w-10 shrink-0 text-[11px] text-muted-foreground"
                        placeholder="cód."
                        value={line.code ?? ""}
                        onCommit={(value) =>
                          onCommit(line._id, { code: value || null })
                        }
                      />
                      <GridInput
                        disabled={closed}
                        align="left"
                        className="h-[15px] text-[11px] text-muted-foreground"
                        placeholder="cargo"
                        value={line.jobTitle ?? ""}
                        onCommit={(value) =>
                          onCommit(line._id, { jobTitle: value || null })
                        }
                      />
                    </div>
                  </td>
                  <MoneyCell
                    disabled={closed}
                    cents={line.baseSalaryCents}
                    onCommit={(cents) =>
                      onCommit(line._id, { baseSalaryCents: cents })
                    }
                  />
                  <MoneyCell
                    disabled={closed}
                    cents={line.earningsCents}
                    onCommit={(cents) =>
                      onCommit(line._id, { earningsCents: cents })
                    }
                  />
                  <MoneyCell
                    disabled={closed}
                    cents={line.deductionsCents}
                    className="text-destructive"
                    onCommit={(cents) =>
                      onCommit(line._id, { deductionsCents: cents })
                    }
                  />
                  <td className={cn(CELL, "text-center")}>
                    <input
                      type="checkbox"
                      disabled={closed}
                      checked={line.foodBasketEnabled}
                      onChange={(event) =>
                        onCommit(line._id, {
                          foodBasketEnabled: event.target.checked,
                        })
                      }
                      className="size-[15px] align-middle accent-primary"
                    />
                  </td>
                  <td className={CELL}>
                    <GridInput
                      disabled={closed}
                      value={String(line.transportFoodDays)}
                      onCommit={(value) =>
                        onCommit(line._id, {
                          transportFoodDays: parseDays(value),
                        })
                      }
                    />
                  </td>
                  <MoneyCell
                    disabled={closed}
                    cents={line.dailyTransitCents}
                    onCommit={(cents) =>
                      onCommit(line._id, { dailyTransitCents: cents })
                    }
                  />
                  <td className={cn(TEXT_CELL, "text-muted-foreground")}>
                    {formatCentsInput(line.mealVoucherCents)}
                  </td>
                  <td className={cn(TEXT_CELL, "text-muted-foreground")}>
                    {formatCentsInput(line.transitVoucherCents)}
                  </td>
                  <MoneyCell
                    disabled={closed}
                    cents={line.supplementCents}
                    onCommit={(cents) =>
                      onCommit(line._id, { supplementCents: cents })
                    }
                  />
                  <MoneyCell
                    disabled={closed}
                    cents={line.thirteenthFirstCents}
                    onCommit={(cents) =>
                      onCommit(line._id, { thirteenthFirstCents: cents })
                    }
                  />
                  <MoneyCell
                    disabled={closed}
                    cents={line.thirteenthSecondCents}
                    onCommit={(cents) =>
                      onCommit(line._id, { thirteenthSecondCents: cents })
                    }
                  />
                  <td className="border-b border-border p-0">
                    <button
                      type="button"
                      title="Empréstimos — clique para gerenciar"
                      onClick={() => onOpenLoans(line)}
                      className={cn(
                        "flex h-[26px] w-full items-center justify-end gap-1 rounded-[4px] px-1 tabular-nums hover:bg-muted",
                        line.totalLoanDeductionCents > 0
                          ? "text-destructive"
                          : "text-muted-foreground",
                      )}
                    >
                      {formatCentsInput(line.totalLoanDeductionCents)}
                      {line.activeLoanCount ? (
                        <span
                          className="rounded-full bg-destructive/10 px-1 text-[9px] leading-4 font-bold"
                          title={`${line.activeLoanCount} empréstimo${line.activeLoanCount > 1 ? "s" : ""} ativo${line.activeLoanCount > 1 ? "s" : ""}`}
                        >
                          {line.activeLoanCount}
                        </span>
                      ) : (
                        <span className="text-[11px] leading-none font-bold">
                          +
                        </span>
                      )}
                    </button>
                  </td>
                  <td className={cn(TEXT_CELL, "font-bold")}>
                    {formatCentsInput(line.totalPaymentCents)}
                  </td>
                  <td className={CELL}>
                    <div className="relative">
                      <select
                        disabled={closed}
                        value={line.paymentMethod}
                        onChange={(event) =>
                          onCommit(line._id, {
                            paymentMethod: event.target.value as
                              "pix" | "tbi" | "other",
                          })
                        }
                        className="h-[26px] w-full appearance-none rounded-[4px] border border-transparent bg-transparent pr-4 pl-1 text-[12px] hover:border-border focus:border-ring focus:outline-none disabled:opacity-70"
                      >
                        <option value="pix">PIX</option>
                        <option value="tbi">TBI</option>
                        <option value="other">Outro</option>
                      </select>
                      <ChevronDown className="pointer-events-none absolute top-1/2 right-1 size-3 -translate-y-1/2 text-muted-foreground" />
                    </div>
                  </td>
                  <td className={CELL}>
                    <GridInput
                      disabled={closed}
                      align="left"
                      title={line.awayNotes ?? undefined}
                      value={line.awayNotes ?? ""}
                      onCommit={(value) =>
                        onCommit(line._id, { awayNotes: value || null })
                      }
                    />
                  </td>
                  <td className={cn(CELL, "text-center")}>
                    <button
                      type="button"
                      disabled={closed}
                      onClick={() => onTogglePaid(line)}
                      className={cn(
                        "h-[22px] min-w-[44px] rounded-full border px-1.5 text-[10.5px] font-bold tracking-[0.03em]",
                        line.paid
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-transparent text-muted-foreground",
                      )}
                    >
                      {line.paid ? "PAGO" : "—"}
                    </button>
                  </td>
                  <td className={CELL}>
                    <GridInput
                      disabled={closed}
                      align="left"
                      className="text-muted-foreground"
                      title={line.notes ?? undefined}
                      value={line.notes ?? ""}
                      onCommit={(value) =>
                        onCommit(line._id, { notes: value || null })
                      }
                    />
                  </td>
                  <td className={cn(CELL, "text-center")}>
                    {!closed && (
                      <button
                        type="button"
                        title="Excluir linha"
                        onClick={() => onRemove(line)}
                        className="size-5 rounded-[4px] text-[11px] text-muted-foreground hover:bg-destructive hover:text-white"
                      >
                        ✕
                      </button>
                    )}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
        <tfoot>
          <tr>
            <td
              className={cn(
                "sticky bottom-0 left-0 z-40 border-t border-border bg-muted px-1 py-1.5 text-[10px] font-semibold tracking-[0.04em] whitespace-nowrap text-muted-foreground uppercase",
                STICKY_SHADOW,
              )}
            >
              Totais (
              {lines.length === totalCount
                ? totalCount
                : `${lines.length} de ${totalCount}`}
              ) · R$
            </td>
            <FootCell value={totals?.baseSalaryCents} />
            <FootCell value={totals?.earningsCents} />
            <FootCell
              value={totals?.deductionsCents}
              className="text-destructive"
            />
            <FootCell value={totals?.foodBasketCents} />
            <FootCell />
            <FootCell />
            <FootCell value={totals?.mealVoucherCents} />
            <FootCell value={totals?.transitVoucherCents} />
            <FootCell value={totals?.supplementCents} />
            <FootCell value={totals?.thirteenthFirstCents} />
            <FootCell value={totals?.thirteenthSecondCents} />
            <FootCell
              value={totals?.totalLoanDeductionCents}
              className="text-destructive"
            />
            <FootCell
              value={totals?.totalPaymentCents}
              className="font-extrabold"
            />
            <FootCell />
            <FootCell />
            <FootCell />
            <FootCell />
            <FootCell />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function GridInput({
  value,
  disabled,
  className,
  placeholder,
  title,
  onCommit,
  align = "right",
}: {
  value: string;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  /** Tooltip com o texto completo (colunas estreitas de texto livre). */
  title?: string;
  onCommit: (value: string) => void;
  align?: "left" | "right";
}) {
  const [text, setText] = useState(value);
  useEffect(() => {
    setText(value);
  }, [value]);
  return (
    <input
      disabled={disabled}
      value={text}
      placeholder={placeholder}
      title={title}
      onChange={(event) => setText(event.target.value)}
      onBlur={() => {
        if (text !== value) onCommit(text);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.currentTarget.blur();
        }
      }}
      className={cn(
        "h-[26px] w-full min-w-0 rounded-[4px] border border-transparent bg-transparent px-1 text-[12px] leading-none placeholder:text-muted-foreground/60 hover:border-border focus:border-ring focus:outline-none disabled:opacity-70",
        align === "right" && "text-right tabular-nums",
        className,
      )}
    />
  );
}

function MoneyCell({
  cents,
  disabled,
  onCommit,
  className,
}: {
  cents: number;
  disabled?: boolean;
  onCommit: (cents: number) => void;
  className?: string;
}) {
  return (
    <td className={CELL}>
      <GridInput
        disabled={disabled}
        className={className}
        value={formatCentsInput(cents)}
        onCommit={(value) => onCommit(parsePayrollAmountToCents(value || "0"))}
      />
    </td>
  );
}

/** Célula do rodapé de totais; sem `value` vira só um espaçador. */
function FootCell({
  value,
  className,
}: {
  value?: number;
  className?: string;
}) {
  return (
    <td
      className={cn(
        "sticky bottom-0 z-30 border-t border-border bg-muted px-1 py-1.5 text-right text-[12px] font-semibold tabular-nums",
        className,
      )}
    >
      {value === undefined ? null : formatCentsInput(value)}
    </td>
  );
}
