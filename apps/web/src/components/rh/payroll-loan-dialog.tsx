import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { formatCurrency } from "@rlpapp/shared";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getErrorMessage } from "@/lib/errors";
import { formatMonthLabel, MONTH_LABELS } from "@/lib/rh/labels";
import { formatCentsInput, parsePayrollAmountToCents } from "@/lib/rh/money";

function monthOptions(fromYear: number, toYear: number) {
  const options: { year: number; month: number; label: string; key: string }[] =
    [];
  for (let year = fromYear; year <= toYear; year += 1) {
    for (let month = 1; month <= 12; month += 1) {
      options.push({
        year,
        month,
        label: formatMonthLabel(year, month),
        key: `${year}-${String(month).padStart(2, "0")}`,
      });
    }
  }
  return options;
}

export function PayrollLoanDialog({
  employeeId,
  employeeName,
  jobTitle,
  year,
  paymentMonth,
  lineId,
  manualLoanDeductionCents,
  closed,
  onClose,
}: {
  employeeId: Id<"employees">;
  employeeName: string;
  jobTitle: string | null;
  year: number;
  paymentMonth: number;
  lineId: Id<"payrollLines">;
  manualLoanDeductionCents: number;
  closed: boolean;
  onClose: () => void;
}) {
  const loans = useQuery(api.payroll.listLoans, {
    employeeId,
    year,
    paymentMonth,
  });
  const createLoan = useMutation(api.payroll.createLoan);
  const updateLoan = useMutation(api.payroll.updateLoan);
  const archiveLoan = useMutation(api.payroll.archiveLoan);
  const updateLine = useMutation(api.payroll.updateLine);
  const [avulso, setAvulso] = useState(
    formatCentsInput(manualLoanDeductionCents)
  );
  const options = monthOptions(year - 1, year + 1);

  async function saveAvulso() {
    try {
      await updateLine({
        lineId,
        manualLoanDeductionCents: parsePayrollAmountToCents(avulso || "0"),
      });
    } catch (error) {
      toast.error(getErrorMessage(error, "Erro ao salvar desconto avulso"));
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-6"
      onClick={onClose}
    >
      <div
        className="bg-card max-h-[88vh] w-[780px] max-w-full overflow-auto rounded-[var(--radius)] border border-border shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-card px-5 py-4">
          <div>
            <div className="text-[11px] font-bold tracking-[0.06em] text-muted-foreground uppercase">
              Empréstimos
            </div>
            <div className="text-base font-bold">
              {employeeName}
              {jobTitle ? ` · ${jobTitle}` : ""}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!closed && (
              <Button
                size="sm"
                onClick={() =>
                  void createLoan({
                    employeeId,
                    totalCents: 100_000,
                    installmentCount: 10,
                    installmentCents: 10_000,
                    startYear: year,
                    startMonth: paymentMonth,
                  }).catch((error) =>
                    toast.error(
                      getErrorMessage(error, "Erro ao criar empréstimo")
                    )
                  )
                }
              >
                + Novo empréstimo
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={onClose}>
              Fechar
            </Button>
          </div>
        </div>
        <div className="flex flex-col gap-3 p-5">
          {loans === undefined ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : loans.length === 0 ? (
            <div className="rounded-[var(--radius)] border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
              Nenhum empréstimo registrado. Clique em “+ Novo empréstimo”.
            </div>
          ) : (
            loans.map((loan) => (
              <div
                key={loan._id}
                className="flex flex-col gap-3 rounded-[var(--radius)] border border-border px-4 py-3.5"
              >
                <div className="flex flex-wrap items-end gap-3">
                  <label className="flex flex-col gap-1 text-[10.5px] font-semibold tracking-[0.04em] text-muted-foreground uppercase">
                    Valor total (R$)
                    <Input
                      className="h-8 w-[110px] text-right text-sm font-semibold tabular-nums"
                      disabled={closed}
                      defaultValue={formatCentsInput(loan.totalCents)}
                      onBlur={(event) => {
                        const totalCents = parsePayrollAmountToCents(
                          event.target.value || "0"
                        );
                        void updateLoan({
                          loanId: loan._id,
                          totalCents,
                          installmentCents: Math.round(
                            totalCents / loan.installmentCount
                          ),
                        });
                      }}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-[10.5px] font-semibold tracking-[0.04em] text-muted-foreground uppercase">
                    Nº parcelas
                    <Input
                      className="h-8 w-20 text-right text-sm font-semibold tabular-nums"
                      disabled={closed}
                      defaultValue={String(loan.installmentCount)}
                      onBlur={(event) => {
                        const installmentCount = Math.max(
                          1,
                          Number.parseInt(event.target.value, 10) || 1
                        );
                        void updateLoan({
                          loanId: loan._id,
                          installmentCount,
                          installmentCents: Math.round(
                            loan.totalCents / installmentCount
                          ),
                        });
                      }}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-[10.5px] font-semibold tracking-[0.04em] text-muted-foreground uppercase">
                    Valor da parcela (R$)
                    <Input
                      className="h-8 w-[110px] text-right text-sm font-semibold tabular-nums"
                      disabled={closed}
                      defaultValue={formatCentsInput(loan.installmentCents)}
                      onBlur={(event) => {
                        void updateLoan({
                          loanId: loan._id,
                          installmentCents: parsePayrollAmountToCents(
                            event.target.value || "0"
                          ),
                        });
                      }}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-[10.5px] font-semibold tracking-[0.04em] text-muted-foreground uppercase">
                    Início do desconto
                    <select
                      disabled={closed}
                      className="h-8 rounded-md border border-border bg-background px-2 text-sm font-semibold"
                      value={`${loan.startYear}-${String(loan.startMonth).padStart(2, "0")}`}
                      onChange={(event) => {
                        const [startYear, startMonth] = event.target.value
                          .split("-")
                          .map(Number);
                        void updateLoan({
                          loanId: loan._id,
                          startYear,
                          startMonth,
                        });
                      }}
                    >
                      {options.map((option) => (
                        <option key={option.key} value={option.key}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="flex flex-col gap-1 text-[10.5px] font-semibold tracking-[0.04em] text-muted-foreground uppercase">
                    Término
                    <div className="flex h-8 items-center text-sm font-bold text-foreground normal-case tracking-normal">
                      {MONTH_LABELS[loan.endMonth - 1]}/
                      {String(loan.endYear).slice(-2)}
                    </div>
                  </div>
                  {!closed && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="ml-auto text-destructive"
                      onClick={() => {
                        if (!confirm("Excluir este empréstimo?")) return;
                        void archiveLoan({ loanId: loan._id });
                      }}
                    >
                      Excluir
                    </Button>
                  )}
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${loan.progressPercent}%` }}
                  />
                </div>
                <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                  <span>
                    Pagas até este mês:{" "}
                    <strong className="text-foreground">
                      {loan.paidCount} / {loan.installmentCount} (
                      {formatCurrency(loan.paidCount * loan.installmentCents)})
                    </strong>
                  </span>
                  <span>
                    Desconto neste mês:{" "}
                    <strong className="text-foreground">
                      {formatCurrency(loan.dueCents)}
                    </strong>
                  </span>
                  <span>
                    Saldo devedor:{" "}
                    <strong className="text-destructive">
                      {formatCurrency(loan.outstandingCents)}
                    </strong>
                  </span>
                  <span>
                    {loan.settled
                      ? "✓ Quitado"
                      : loan.dueCents > 0
                        ? "Em desconto"
                        : `Início em ${formatMonthLabel(loan.startYear, loan.startMonth)}`}
                  </span>
                </div>
              </div>
            ))
          )}
          <Label className="border-t border-border pt-3.5 text-[10.5px] font-semibold tracking-[0.04em] text-muted-foreground uppercase">
            Desconto avulso neste mês (fora de empréstimo, R$)
            <Input
              className="mt-1 h-8 w-[130px] text-right text-sm font-semibold tabular-nums"
              disabled={closed}
              value={avulso}
              onChange={(event) => setAvulso(event.target.value)}
              onBlur={() => void saveAvulso()}
            />
          </Label>
        </div>
      </div>
    </div>
  );
}
