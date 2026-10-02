import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { formatCurrency } from "@rlpapp/shared";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

function monthKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function SyncedInput({
  value,
  disabled,
  className,
  onCommit,
}: {
  value: string;
  disabled?: boolean;
  className?: string;
  onCommit: (value: string) => void;
}) {
  const [text, setText] = useState(value);
  useEffect(() => {
    setText(value);
  }, [value]);
  return (
    <Input
      className={className}
      disabled={disabled}
      value={text}
      onChange={(event) => setText(event.target.value)}
      onBlur={() => onCommit(text)}
    />
  );
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
  const [newTotal, setNewTotal] = useState("");
  const [newCount, setNewCount] = useState("10");
  const [newStart, setNewStart] = useState(monthKey(year, paymentMonth));
  const options = monthOptions(year - 1, year + 1);

  function commitLoan(
    patch: Parameters<typeof updateLoan>[0],
    fallback: string
  ) {
    void updateLoan(patch).catch((error) =>
      toast.error(getErrorMessage(error, fallback))
    );
  }

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

  async function handleCreateLoan() {
    try {
      if (!newTotal.trim()) {
        toast.error("Informe o valor total");
        return;
      }
      const totalCents = parsePayrollAmountToCents(newTotal);
      const installmentCount = Math.max(
        1,
        Number.parseInt(newCount, 10) || 1
      );
      const [startYear, startMonth] = newStart.split("-").map(Number);
      await createLoan({
        employeeId,
        totalCents,
        installmentCount,
        startYear,
        startMonth,
      });
      setNewTotal("");
      setNewCount("10");
      setNewStart(monthKey(year, paymentMonth));
    } catch (error) {
      toast.error(getErrorMessage(error, "Erro ao criar empréstimo"));
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[88vh] w-[780px] max-w-[calc(100vw-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[780px]">
        <DialogHeader className="sticky top-0 z-10 flex-row items-center justify-between space-y-0 border-b border-border px-5 py-4 pr-12 text-left">
          <div>
            <div className="text-[11px] font-bold tracking-[0.06em] text-muted-foreground uppercase">
              Empréstimos
            </div>
            <DialogTitle className="text-base font-bold">
              {employeeName}
              {jobTitle ? ` · ${jobTitle}` : ""}
            </DialogTitle>
          </div>
          <Button variant="outline" size="sm" onClick={onClose}>
            Fechar
          </Button>
        </DialogHeader>
        <div className="flex flex-col gap-3 overflow-auto p-5">
          {!closed && (
            <div className="flex flex-wrap items-end gap-3 rounded-[var(--radius)] border border-dashed border-border px-4 py-3">
              <label className="flex flex-col gap-1 text-[10.5px] font-semibold tracking-[0.04em] text-muted-foreground uppercase">
                Valor total (R$)
                <Input
                  className="h-8 w-[110px] text-right text-sm font-semibold tabular-nums"
                  value={newTotal}
                  onChange={(event) => setNewTotal(event.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1 text-[10.5px] font-semibold tracking-[0.04em] text-muted-foreground uppercase">
                Nº parcelas
                <Input
                  className="h-8 w-20 text-right text-sm font-semibold tabular-nums"
                  value={newCount}
                  onChange={(event) => setNewCount(event.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1 text-[10.5px] font-semibold tracking-[0.04em] text-muted-foreground uppercase">
                Início do desconto
                <select
                  className="h-8 rounded-md border border-border bg-background px-2 text-sm font-semibold"
                  value={newStart}
                  onChange={(event) => setNewStart(event.target.value)}
                >
                  {options.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <Button size="sm" onClick={() => void handleCreateLoan()}>
                + Novo empréstimo
              </Button>
            </div>
          )}
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
                    <SyncedInput
                      className="h-8 w-[110px] text-right text-sm font-semibold tabular-nums"
                      disabled={closed}
                      value={formatCentsInput(loan.totalCents)}
                      onCommit={(value) => {
                        try {
                          const totalCents = parsePayrollAmountToCents(
                            value || "0"
                          );
                          commitLoan(
                            {
                              loanId: loan._id,
                              totalCents,
                              installmentCents: Math.round(
                                totalCents / loan.installmentCount
                              ),
                            },
                            "Erro ao atualizar empréstimo"
                          );
                        } catch (error) {
                          toast.error(
                            getErrorMessage(error, "Erro ao atualizar empréstimo")
                          );
                        }
                      }}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-[10.5px] font-semibold tracking-[0.04em] text-muted-foreground uppercase">
                    Nº parcelas
                    <SyncedInput
                      className="h-8 w-20 text-right text-sm font-semibold tabular-nums"
                      disabled={closed}
                      value={String(loan.installmentCount)}
                      onCommit={(value) => {
                        const installmentCount = Math.max(
                          1,
                          Number.parseInt(value, 10) || 1
                        );
                        commitLoan(
                          {
                            loanId: loan._id,
                            installmentCount,
                            installmentCents: Math.round(
                              loan.totalCents / installmentCount
                            ),
                          },
                          "Erro ao atualizar empréstimo"
                        );
                      }}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-[10.5px] font-semibold tracking-[0.04em] text-muted-foreground uppercase">
                    Valor da parcela (R$)
                    <SyncedInput
                      className="h-8 w-[110px] text-right text-sm font-semibold tabular-nums"
                      disabled={closed}
                      value={formatCentsInput(loan.installmentCents)}
                      onCommit={(value) => {
                        try {
                          commitLoan(
                            {
                              loanId: loan._id,
                              installmentCents: parsePayrollAmountToCents(
                                value || "0"
                              ),
                            },
                            "Erro ao atualizar empréstimo"
                          );
                        } catch (error) {
                          toast.error(
                            getErrorMessage(error, "Erro ao atualizar empréstimo")
                          );
                        }
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
                        commitLoan(
                          {
                            loanId: loan._id,
                            startYear,
                            startMonth,
                          },
                          "Erro ao atualizar empréstimo"
                        );
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
                    <div className="flex h-8 items-center text-sm font-bold tracking-normal text-foreground normal-case">
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
                        void archiveLoan({ loanId: loan._id }).catch((error) =>
                          toast.error(
                            getErrorMessage(error, "Erro ao excluir empréstimo")
                          )
                        );
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
      </DialogContent>
    </Dialog>
  );
}
