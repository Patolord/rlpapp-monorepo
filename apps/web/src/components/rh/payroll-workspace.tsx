import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { formatCurrency } from "@rlpapp/shared";
import { MetricCard } from "@rlpapp/ui/web";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { PayrollLoanDialog } from "@/components/rh/payroll-loan-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { getErrorMessage } from "@/lib/errors";
import { formatPayrollRunLabel } from "@/lib/rh/labels";
import {
  formatCentsInput,
  parseDays,
  parsePayrollAmountToCents,
} from "@/lib/rh/money";

type Workspace = FunctionReturnType<typeof api.payroll.getWorkspace>;
type Line = Workspace["lines"][number];

function monthKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function currentMonth() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

function runOptions(centerYear: number) {
  return [centerYear - 1, centerYear, centerYear + 1].flatMap((year) =>
    Array.from({ length: 12 }, (_, index) => {
      const paymentMonth = index + 1;
      const referenceMonth = paymentMonth === 1 ? 12 : paymentMonth - 1;
      const referenceYear = paymentMonth === 1 ? year - 1 : year;
      return {
        value: monthKey(year, paymentMonth),
        year,
        paymentMonth,
        label: formatPayrollRunLabel({
          paymentDay: 5,
          paymentMonth,
          year,
          referenceMonth,
          referenceYear,
        }),
      };
    })
  );
}

function exportCsv(lines: Line[], key: string) {
  const esc = (value: string) => {
    const neutralized = /^[=+\-@]/.test(value) ? `'${value}` : value;
    return `"${neutralized.replace(/"/g, '""')}"`;
  };
  const num = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");
  const head = [
    "Cod",
    "Nome",
    "Cargo",
    "Salario Base",
    "Proventos",
    "Descontos",
    "Cesta Basica",
    "Dias",
    "Passagem Diaria",
    "Vale Alimentacao",
    "Vale Transporte",
    "Complemento",
    "13o Parcela 1",
    "13o Parcela 2",
    "Desc. Emprestimo",
    "Pagamento Total",
    "F. Pag.",
    "Afastado",
    "Pago",
    "Observacoes",
  ];
  const rows = lines.map((line) =>
    [
      esc(line.code ?? ""),
      esc(line.name),
      esc(line.jobTitle ?? ""),
      num(line.baseSalaryCents),
      num(line.earningsCents),
      num(line.deductionsCents),
      num(line.foodBasketCents),
      String(line.transportFoodDays),
      num(line.dailyTransitCents),
      num(line.mealVoucherCents),
      num(line.transitVoucherCents),
      num(line.supplementCents),
      num(line.thirteenthFirstCents),
      num(line.thirteenthSecondCents),
      num(line.totalLoanDeductionCents),
      num(line.totalPaymentCents),
      line.paymentMethod.toUpperCase(),
      esc(line.awayNotes ?? ""),
      line.paid ? "SIM" : "NAO",
      esc(line.notes ?? ""),
    ].join(";")
  );
  const blob = new Blob(["\ufeff" + [head.join(";"), ...rows].join("\r\n")], {
    type: "text/csv;charset=utf-8",
  });
  const anchor = document.createElement("a");
  anchor.href = URL.createObjectURL(blob);
  anchor.download = `folha-pagto-${key}.csv`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(anchor.href), 5000);
}

function GridInput({
  value,
  disabled,
  className,
  onCommit,
  align = "right",
}: {
  value: string;
  disabled?: boolean;
  className?: string;
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
      onChange={(event) => setText(event.target.value)}
      onBlur={() => {
        if (text !== value) onCommit(text);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.currentTarget.blur();
        }
      }}
      className={`w-full rounded-md border border-transparent bg-transparent px-1.5 py-1 text-[12.5px] hover:border-border focus:border-ring disabled:opacity-70 ${
        align === "right" ? "text-right tabular-nums" : ""
      } ${className ?? ""}`}
    />
  );
}

export function PayrollWorkspace() {
  const initial = currentMonth();
  const [year, setYear] = useState(initial.year);
  const [paymentMonth, setPaymentMonth] = useState(initial.month);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [loanLine, setLoanLine] = useState<Line | null>(null);

  const workspace = useQuery(api.payroll.getWorkspace, {
    year,
    paymentMonth,
  });
  const createRun = useMutation(api.payroll.createRun);
  const updateRunParameters = useMutation(api.payroll.updateRunParameters);
  const updateLine = useMutation(api.payroll.updateLine);
  const togglePaid = useMutation(api.payroll.togglePaid);
  const removeLine = useMutation(api.payroll.removeLine);
  const addEmployeeToRun = useMutation(api.payroll.addEmployeeToRun);
  const closeRun = useMutation(api.payroll.closeRun);
  const reopenRun = useMutation(api.payroll.reopenRun);
  const run = workspace?.run ?? null;
  const closed = run?.status === "closed";
  const lines = useMemo(() => workspace?.lines ?? [], [workspace?.lines]);
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return lines;
    return lines.filter((line) =>
      `${line.name} ${line.jobTitle ?? ""}`.toLowerCase().includes(term)
    );
  }, [lines, search]);

  function commitLine(
    lineId: Id<"payrollLines">,
    patch: Omit<Parameters<typeof updateLine>[0], "lineId">
  ) {
    void updateLine({ ...patch, lineId }).catch((error) =>
      toast.error(getErrorMessage(error, "Erro ao salvar linha"))
    );
  }

  const options = runOptions(year);

  return (
    <div className="flex min-h-[calc(100vh-6rem)] flex-col gap-3.5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-0.5">
          <div className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
            RLP Engenharia · RH
          </div>
          <h1 className="text-[22px] font-bold tracking-[-0.01em]">
            Folha de Pagamento {year}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="h-9 rounded-md border border-border bg-card px-2.5 text-[13px] font-semibold"
            value={monthKey(year, paymentMonth)}
            onChange={(event) => {
              const [nextYear, nextMonth] = event.target.value
                .split("-")
                .map(Number);
              setYear(nextYear);
              setPaymentMonth(nextMonth);
            }}
          >
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.year} · {option.label}
              </option>
            ))}
          </select>
          <Input
            className="h-9 w-[210px] text-[13px]"
            placeholder="Buscar nome ou cargo…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportCsv(filtered, monthKey(year, paymentMonth))}
            disabled={lines.length === 0}
          >
            Exportar CSV
          </Button>
          {!run && (
            <Button
              size="sm"
              disabled={creating || workspace === undefined}
              onClick={() => {
                setCreating(true);
                void createRun({ year, paymentMonth })
                  .catch((error) =>
                    toast.error(
                      getErrorMessage(error, "Erro ao abrir a competência")
                    )
                  )
                  .finally(() => setCreating(false));
              }}
            >
              Abrir competência
            </Button>
          )}
          <Button
            size="sm"
            disabled={!run || closed}
            onClick={() => setAddOpen(true)}
          >
            + Funcionário
          </Button>
          {run && (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                void (closed
                  ? reopenRun({ runId: run._id })
                  : closeRun({ runId: run._id })
                ).catch((error) =>
                  toast.error(getErrorMessage(error, "Erro ao atualizar folha"))
                )
              }
            >
              {closed ? "Reabrir folha" : "Fechar folha"}
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Total da folha"
          value={formatCurrency(workspace?.kpis.totalPaymentCents ?? 0)}
          description={`${workspace?.kpis.lineCount ?? 0} pessoas na folha`}
        />
        <MetricCard
          title="Total via PIX"
          value={formatCurrency(workspace?.kpis.pixTotalCents ?? 0)}
          description={`${workspace?.kpis.pixCount ?? 0} pagamentos via PIX`}
        />
        <MetricCard
          title="Empréstimos em aberto"
          value={formatCurrency(workspace?.kpis.outstandingLoanCents ?? 0)}
          description={`${workspace?.kpis.activeLoanCount ?? 0} empréstimos ativos · desc. do mês ${formatCurrency(workspace?.kpis.monthLoanDeductionCents ?? 0)}`}
        />
        <MetricCard
          title="Pagamentos confirmados"
          value={`${workspace?.kpis.paidCount ?? 0} / ${workspace?.kpis.lineCount ?? 0}`}
          description={`${formatCurrency(workspace?.kpis.paidTotalCents ?? 0)} já confirmados`}
        />
      </div>

      <div className="flex flex-wrap items-center gap-5 rounded-[var(--radius)] border border-border bg-card px-4 py-3">
        <div className="flex min-w-[150px] flex-col gap-0.5">
          <span className="text-[11px] font-bold tracking-[0.06em] text-muted-foreground uppercase">
            Parâmetros do mês
          </span>
          <span className="text-[11.5px] text-muted-foreground">
            Aplicados a todos os cálculos deste mês
          </span>
        </div>
        <ParamField
          label="Vale alimentação (R$/dia)"
          value={run ? formatCentsInput(run.mealVoucherPerDayCents) : ""}
          disabled={!run || closed}
          onCommit={(value) =>
            run &&
            void updateRunParameters({
              runId: run._id,
              mealVoucherPerDayCents: parsePayrollAmountToCents(value || "0"),
            })
          }
        />
        <ParamField
          label="Cesta básica (R$)"
          value={run ? formatCentsInput(run.foodBasketCents) : ""}
          disabled={!run || closed}
          onCommit={(value) =>
            run &&
            void updateRunParameters({
              runId: run._id,
              foodBasketCents: parsePayrollAmountToCents(value || "0"),
            })
          }
        />
        <ParamField
          label="Passagem padrão (R$/dia)"
          value={run ? formatCentsInput(run.defaultDailyTransitCents) : ""}
          disabled={!run || closed}
          onCommit={(value) =>
            run &&
            void updateRunParameters({
              runId: run._id,
              defaultDailyTransitCents: parsePayrollAmountToCents(value || "0"),
            })
          }
        />
        <ParamField
          label="Dias padrão (transp./alim.)"
          value={run ? String(run.defaultTransportFoodDays) : ""}
          disabled={!run || closed}
          onCommit={(value) =>
            run &&
            void updateRunParameters({
              runId: run._id,
              defaultTransportFoodDays: parseDays(value),
            })
          }
        />
        <span className="max-w-[320px] text-[11.5px] text-muted-foreground">
          Passagem e dias padrão preenchem novos funcionários; cada linha ainda
          pode ter valor individual.
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-[var(--radius)] border border-border bg-card">
        <table className="w-full min-w-[1900px] border-separate border-spacing-0 text-[12.5px]">
          <thead>
            <tr>
              {[
                ["Cód.", "left sticky left-0 z-40 w-11"],
                ["Nome", "left sticky left-11 z-40 min-w-[230px] shadow-[inset_-1px_0_var(--border)]"],
                ["Cargo", "left min-w-[150px]"],
                ["Sal. Base", "right"],
                ["Proventos", "right"],
                ["Descontos", "right"],
                ["Cesta ✓", "center"],
                ["Dias", "right"],
                ["Passagem/dia", "right"],
                ["V. Alim. ⚙", "right"],
                ["V. Transp. ⚙", "right"],
                ["Complemento", "right"],
                ["13º P1", "right"],
                ["13º P2", "right"],
                ["Emprést. ⚙", "right"],
                ["Pagamento Total ⚙", "right"],
                ["F. Pag.", "left"],
                ["Afastado", "left"],
                ["Pago", "center"],
                ["Observações", "left min-w-[200px]"],
                ["", "w-9"],
              ].map(([label, extra]) => (
                <th
                  key={label || "actions"}
                  className={`sticky top-0 z-30 bg-muted px-2 py-2 text-[10.5px] font-medium tracking-[0.05em] text-muted-foreground uppercase border-b border-border ${extra}`}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {workspace === undefined || creating ? (
              <tr>
                <td colSpan={21} className="px-4 py-8 text-muted-foreground">
                  Carregando folha...
                </td>
              </tr>
            ) : !run ? (
              <tr>
                <td colSpan={21} className="px-4 py-8 text-muted-foreground">
                  Nenhuma competência aberta. Use Abrir competência para iniciar
                  esta folha.
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={21} className="px-4 py-8 text-muted-foreground">
                  {lines.length === 0
                    ? "Nenhum funcionário nesta competência. Use + Funcionário para incluir."
                    : "Nenhum funcionário corresponde à busca."}
                </td>
              </tr>
            ) : (
              filtered.map((line) => {
                const bg = !line.paid
                  ? "color-mix(in oklab, var(--primary) 6%, var(--card))"
                  : "var(--card)";
                return (
                  <tr key={line._id} style={{ background: bg }}>
                    <td
                      className="sticky left-0 z-20 border-b border-border px-1 py-0.5"
                      style={{ background: bg }}
                    >
                      <GridInput
                        disabled={closed}
                        align="left"
                        className="w-9 text-muted-foreground"
                        value={line.code ?? ""}
                        onCommit={(value) =>
                          commitLine(line._id, { code: value || null })
                        }
                      />
                    </td>
                    <td
                      className="sticky left-11 z-20 border-b border-border px-1 py-0.5 shadow-[inset_-1px_0_var(--border)]"
                      style={{ background: bg }}
                    >
                      <GridInput
                        disabled={closed}
                        align="left"
                        className="w-[215px] font-semibold"
                        value={line.name}
                        onCommit={(value) =>
                          commitLine(line._id, { name: value })
                        }
                      />
                    </td>
                    <td className="border-b border-border px-1 py-0.5">
                      <GridInput
                        disabled={closed}
                        align="left"
                        className="w-[140px] text-muted-foreground"
                        value={line.jobTitle ?? ""}
                        onCommit={(value) =>
                          commitLine(line._id, { jobTitle: value || null })
                        }
                      />
                    </td>
                    <MoneyCell
                      disabled={closed}
                      cents={line.baseSalaryCents}
                      onCommit={(cents) =>
                        commitLine(line._id, { baseSalaryCents: cents })
                      }
                    />
                    <MoneyCell
                      disabled={closed}
                      cents={line.earningsCents}
                      onCommit={(cents) =>
                        commitLine(line._id, { earningsCents: cents })
                      }
                    />
                    <MoneyCell
                      disabled={closed}
                      cents={line.deductionsCents}
                      className="text-destructive"
                      onCommit={(cents) =>
                        commitLine(line._id, { deductionsCents: cents })
                      }
                    />
                    <td className="border-b border-border px-1 py-0.5 text-center">
                      <input
                        type="checkbox"
                        disabled={closed}
                        checked={line.foodBasketEnabled}
                        onChange={(event) =>
                          commitLine(line._id, {
                            foodBasketEnabled: event.target.checked,
                          })
                        }
                        className="size-[15px] accent-primary"
                      />
                    </td>
                    <td className="border-b border-border px-1 py-0.5">
                      <GridInput
                        disabled={closed}
                        className="w-[38px]"
                        value={String(line.transportFoodDays)}
                        onCommit={(value) =>
                          commitLine(line._id, {
                            transportFoodDays: parseDays(value),
                          })
                        }
                      />
                    </td>
                    <MoneyCell
                      disabled={closed}
                      cents={line.dailyTransitCents}
                      width="w-14"
                      onCommit={(cents) =>
                        commitLine(line._id, { dailyTransitCents: cents })
                      }
                    />
                    <td className="border-b border-border px-2.5 py-1 text-right tabular-nums text-muted-foreground">
                      {formatCurrency(line.mealVoucherCents)}
                    </td>
                    <td className="border-b border-border px-2.5 py-1 text-right tabular-nums text-muted-foreground">
                      {formatCurrency(line.transitVoucherCents)}
                    </td>
                    <MoneyCell
                      disabled={closed}
                      cents={line.supplementCents}
                      onCommit={(cents) =>
                        commitLine(line._id, { supplementCents: cents })
                      }
                    />
                    <MoneyCell
                      disabled={closed}
                      cents={line.thirteenthFirstCents}
                      width="w-[62px]"
                      onCommit={(cents) =>
                        commitLine(line._id, { thirteenthFirstCents: cents })
                      }
                    />
                    <MoneyCell
                      disabled={closed}
                      cents={line.thirteenthSecondCents}
                      width="w-[62px]"
                      onCommit={(cents) =>
                        commitLine(line._id, { thirteenthSecondCents: cents })
                      }
                    />
                    <td className="border-b border-border px-1 py-0.5 text-right">
                      <button
                        type="button"
                        onClick={() => setLoanLine(line)}
                        className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-border px-2 py-1 text-xs tabular-nums hover:bg-muted ${
                          line.totalLoanDeductionCents > 0
                            ? "text-destructive"
                            : "text-muted-foreground"
                        }`}
                      >
                        {formatCurrency(line.totalLoanDeductionCents)}
                        <span className="text-[10px] font-bold text-muted-foreground">
                          {line.activeLoanCount
                            ? `${line.activeLoanCount} ativo${line.activeLoanCount > 1 ? "s" : ""}`
                            : "+"}
                        </span>
                      </button>
                    </td>
                    <td className="border-b border-border px-2.5 py-1 text-right font-bold whitespace-nowrap tabular-nums">
                      {formatCurrency(line.totalPaymentCents)}
                    </td>
                    <td className="border-b border-border px-1 py-0.5">
                      <select
                        disabled={closed}
                        value={line.paymentMethod}
                        onChange={(event) =>
                          commitLine(line._id, {
                            paymentMethod: event.target.value as
                              | "pix"
                              | "tbi"
                              | "other",
                          })
                        }
                        className="rounded-md border border-border bg-transparent px-1.5 py-1 text-xs"
                      >
                        <option value="pix">PIX</option>
                        <option value="tbi">TBI</option>
                        <option value="other">OUTRO</option>
                      </select>
                    </td>
                    <td className="border-b border-border px-1 py-0.5">
                      <GridInput
                        disabled={closed}
                        align="left"
                        className="w-12"
                        value={line.awayNotes ?? ""}
                        onCommit={(value) =>
                          commitLine(line._id, { awayNotes: value || null })
                        }
                      />
                    </td>
                    <td className="border-b border-border px-1 py-0.5 text-center">
                      <button
                        type="button"
                        disabled={closed}
                        onClick={() =>
                          void togglePaid({
                            lineId: line._id,
                            paid: !line.paid,
                          })
                        }
                        className={`min-w-11 rounded-full border px-2 py-1 text-[11px] font-bold tracking-[0.03em] ${
                          line.paid
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-transparent text-muted-foreground"
                        }`}
                      >
                        {line.paid ? "PAGO" : "—"}
                      </button>
                    </td>
                    <td className="border-b border-border px-1 py-0.5">
                      <GridInput
                        disabled={closed}
                        align="left"
                        className="w-[220px] text-muted-foreground"
                        value={line.notes ?? ""}
                        onCommit={(value) =>
                          commitLine(line._id, { notes: value || null })
                        }
                      />
                    </td>
                    <td className="border-b border-border px-1 py-0.5 text-center">
                      {!closed && (
                        <button
                          type="button"
                          title="Excluir linha"
                          onClick={() => {
                            if (
                              !confirm(
                                `Excluir ${line.name || "esta linha"} deste mês?`
                              )
                            ) {
                              return;
                            }
                            void removeLine({ lineId: line._id });
                          }}
                          className="size-6 rounded-md text-muted-foreground hover:bg-destructive hover:text-white"
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
              <td className="sticky bottom-0 left-0 z-40 border-t border-border bg-muted px-2 py-2" />
              <td className="sticky bottom-0 left-11 z-40 border-t border-border bg-muted px-2 py-2 text-[11px] font-bold tracking-[0.05em] text-muted-foreground uppercase shadow-[inset_-1px_0_var(--border)]">
                Totais (
                {filtered.length === lines.length
                  ? lines.length
                  : `${filtered.length} de ${lines.length}`}
                )
              </td>
              <td className="sticky bottom-0 z-30 border-t border-border bg-muted" />
              <FootCell value={workspace?.totals.baseSalaryCents} />
              <FootCell value={workspace?.totals.earningsCents} />
              <FootCell
                value={workspace?.totals.deductionsCents}
                className="text-destructive"
              />
              <FootCell value={workspace?.totals.foodBasketCents} />
              <td className="sticky bottom-0 z-30 border-t border-border bg-muted" />
              <td className="sticky bottom-0 z-30 border-t border-border bg-muted" />
              <FootCell value={workspace?.totals.mealVoucherCents} />
              <FootCell value={workspace?.totals.transitVoucherCents} />
              <FootCell value={workspace?.totals.supplementCents} />
              <FootCell value={workspace?.totals.thirteenthFirstCents} />
              <FootCell value={workspace?.totals.thirteenthSecondCents} />
              <FootCell
                value={workspace?.totals.totalLoanDeductionCents}
                className="text-destructive"
              />
              <FootCell
                value={workspace?.totals.totalPaymentCents}
                className="font-extrabold"
              />
              <td className="sticky bottom-0 z-30 border-t border-border bg-muted" />
              <td className="sticky bottom-0 z-30 border-t border-border bg-muted" />
              <td className="sticky bottom-0 z-30 border-t border-border bg-muted" />
              <td className="sticky bottom-0 z-30 border-t border-border bg-muted" />
              <td className="sticky bottom-0 z-30 border-t border-border bg-muted" />
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="flex flex-wrap gap-3.5 text-[11.5px] text-muted-foreground">
        <span>
          ⚙ colunas calculadas: V. Alim. = dias × VA/dia · V. Transp. = dias ×
          passagem/dia · Cesta = parâmetro quando marcada · Emprést. = parcelas
          ativas no mês (clique para gerenciar) · Total = proventos − descontos +
          cesta + V.A. + V.T. + complemento + 13º − emprést.
        </span>
        {closed && <span>Folha fechada — reabra para editar.</span>}
      </div>

      {addOpen && run && (
        <AddEmployeeDialog
          available={workspace?.availableEmployees ?? []}
          onClose={() => setAddOpen(false)}
          onAdd={async (payload) => {
            await addEmployeeToRun({ runId: run._id, ...payload });
            setAddOpen(false);
          }}
        />
      )}

      {loanLine && (
        <PayrollLoanDialog
          employeeId={loanLine.employeeId}
          employeeName={loanLine.name}
          jobTitle={loanLine.jobTitle}
          year={year}
          paymentMonth={paymentMonth}
          lineId={loanLine._id}
          manualLoanDeductionCents={loanLine.manualLoanDeductionCents}
          closed={closed}
          onClose={() => setLoanLine(null)}
        />
      )}
    </div>
  );
}

function ParamField({
  label,
  value,
  disabled,
  onCommit,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  onCommit: (value: string) => void;
}) {
  const [text, setText] = useState(value);
  useEffect(() => {
    setText(value);
  }, [value]);
  return (
    <label className="flex flex-col gap-1 text-[10.5px] font-semibold tracking-[0.04em] text-muted-foreground uppercase">
      {label}
      <input
        disabled={disabled}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={() => {
          if (text !== value) onCommit(text);
        }}
        className="h-8 w-[110px] rounded-md border border-border bg-background px-2.5 text-right text-[13px] font-semibold tabular-nums text-foreground"
      />
    </label>
  );
}

function MoneyCell({
  cents,
  disabled,
  onCommit,
  className,
  width = "w-[78px]",
}: {
  cents: number;
  disabled?: boolean;
  onCommit: (cents: number) => void;
  className?: string;
  width?: string;
}) {
  return (
    <td className="border-b border-border px-1 py-0.5">
      <GridInput
        disabled={disabled}
        className={`${width} ${className ?? ""}`}
        value={formatCentsInput(cents)}
        onCommit={(value) => onCommit(parsePayrollAmountToCents(value || "0"))}
      />
    </td>
  );
}

function FootCell({
  value,
  className,
}: {
  value?: number;
  className?: string;
}) {
  return (
    <td
      className={`sticky bottom-0 z-30 border-t border-border bg-muted px-2.5 py-2 text-right text-sm font-semibold tabular-nums ${className ?? ""}`}
    >
      {formatCurrency(value ?? 0)}
    </td>
  );
}

function AddEmployeeDialog({
  available,
  onClose,
  onAdd,
}: {
  available: { _id: Id<"employees">; name: string; code: string | null; jobTitle: string | null }[];
  onClose: () => void;
  onAdd: (payload: { employeeId?: Id<"employees">; name?: string }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [employeeId, setEmployeeId] = useState<string>(available[0]?._id ?? "");
  const [submitting, setSubmitting] = useState(false);
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="space-y-4 sm:max-w-[420px]">
        <DialogHeader>
          <div className="text-[11px] font-bold tracking-[0.06em] text-muted-foreground uppercase">
            Folha
          </div>
          <DialogTitle className="text-base font-bold">
            Adicionar funcionário
          </DialogTitle>
        </DialogHeader>
        {available.length > 0 && (
          <label className="flex flex-col gap-1 text-sm">
            Cadastro existente
            <select
              className="h-9 rounded-md border border-border bg-background px-2 text-sm"
              value={employeeId}
              onChange={(event) => setEmployeeId(event.target.value)}
            >
              {available.map((employee) => (
                <option key={employee._id} value={employee._id}>
                  {employee.code ? `${employee.code} · ` : ""}
                  {employee.name}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              disabled={submitting || !employeeId}
              onClick={() => {
                setSubmitting(true);
                void onAdd({ employeeId: employeeId as Id<"employees"> })
                  .catch((error) =>
                    toast.error(getErrorMessage(error, "Erro ao adicionar"))
                  )
                  .finally(() => setSubmitting(false));
              }}
            >
              Adicionar selecionado
            </Button>
          </label>
        )}
        <label className="flex flex-col gap-1 text-sm">
          Novo funcionário
          <Input
            value={name}
            placeholder="Nome completo"
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={submitting || !name.trim()}
            onClick={() => {
              setSubmitting(true);
              void onAdd({ name })
                .catch((error) =>
                  toast.error(getErrorMessage(error, "Erro ao adicionar"))
                )
                .finally(() => setSubmitting(false));
            }}
          >
            Criar e incluir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

