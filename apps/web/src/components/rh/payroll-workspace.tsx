import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { formatCurrency } from "@rlpapp/shared";
import { MetricCard } from "@rlpapp/ui/web";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { PayrollGrid, type PayrollLinePatch } from "@/components/rh/payroll-grid";
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
import { formatCentsInput, parseDays, parsePayrollAmountToCents } from "@/lib/rh/money";

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

  function commitLine(lineId: Id<"payrollLines">, patch: PayrollLinePatch) {
    void updateLine({ ...patch, lineId }).catch((error) =>
      toast.error(getErrorMessage(error, "Erro ao salvar linha"))
    );
  }

  const options = runOptions(year);

  // Altura fixa (viewport − header − padding do layout): a grade rola dentro
  // do próprio card, com cabeçalho e totais sempre visíveis, em vez de rolar
  // a página inteira.
  return (
    <div className="flex h-[calc(100vh-6rem)] flex-col gap-3.5">
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

      <PayrollGrid
        lines={filtered}
        totalCount={lines.length}
        totals={workspace?.totals}
        status={
          workspace === undefined || creating
            ? "loading"
            : !run
              ? "no-run"
              : "ready"
        }
        closed={closed}
        onCommit={commitLine}
        onTogglePaid={(line) =>
          void togglePaid({ lineId: line._id, paid: !line.paid })
        }
        onRemove={(line) => {
          if (!confirm(`Excluir ${line.name || "esta linha"} deste mês?`)) {
            return;
          }
          void removeLine({ lineId: line._id });
        }}
        onOpenLoans={setLoanLine}
      />
      <div className="flex flex-wrap gap-3.5 text-[11.5px] text-muted-foreground">
        <span>
          Valores em R$ · ⚙ colunas calculadas: Vale alim. = dias × VA/dia ·
          Vale transp. = dias × passagem/dia · Cesta = parâmetro quando marcada
          · Emprést. = parcelas ativas no mês (clique para gerenciar) · Total =
          proventos − descontos + cesta + V.A. + V.T. + complemento + 13º −
          emprést.
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

