import { useState } from "react";
import { api } from "@rlpapp/backend/convex/_generated/api";
import { formatCurrency } from "@rlpapp/shared";
import { useQuery } from "convex/react";
import { HandCoins } from "lucide-react";

import { PayrollLoanDialog } from "@/components/rh/payroll-loan-dialog";

import { Button } from "@/components/ui/button";
import { formatMonthLabel } from "@/lib/rh/labels";

import type { EmployeeSummary } from "./employee-form";

function currentMonth() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

/**
 * Empréstimos do funcionário: resumo no cadastro e gestão completa no mesmo
 * diálogo usado pela folha. As parcelas entram como desconto na folha de cada
 * mês a partir do início escolhido.
 */
export function LoansSection({ employee }: { employee: EmployeeSummary }) {
  const { year, month } = currentMonth();
  const loans = useQuery(api.payroll.listLoans, {
    employeeId: employee._id,
    year,
    paymentMonth: month,
  });
  const [open, setOpen] = useState(false);
  // `settled` já é verdadeiro no mês da última parcela; ela ainda está em
  // desconto, então continua visível até o mês virar.
  const active = (loans ?? []).filter((loan) => !loan.settled || loan.dueCents > 0);
  const outstanding = active.reduce((sum, loan) => sum + loan.outstandingCents, 0);

  return (
    <div className="grid gap-2 rounded-md border p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
          Empréstimos
        </p>
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          <HandCoins />
          {active.length ? "Gerenciar" : "Novo empréstimo"}
        </Button>
      </div>
      {loans === undefined ? (
        <p className="text-xs text-muted-foreground">Carregando...</p>
      ) : active.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Nenhum empréstimo em aberto. As parcelas são descontadas na folha de
          cada mês, a partir do início escolhido.
        </p>
      ) : (
        <ul className="grid gap-1.5 text-sm">
          {active.map((loan) => (
            <li key={loan._id} className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-medium tabular-nums">
                {formatCurrency(loan.totalCents)}
              </span>
              <span className="text-muted-foreground">
                em {loan.installmentCount}× de {formatCurrency(loan.installmentCents)}
                {" · "}
                {loan.paidCount} paga{loan.paidCount === 1 ? "" : "s"}
                {" · "}
                saldo {formatCurrency(loan.outstandingCents)}
                {" · "}
                {loan.dueCents > 0
                  ? "em desconto"
                  : `início ${formatMonthLabel(loan.startYear, loan.startMonth)}`}
              </span>
            </li>
          ))}
          {active.length > 1 ? (
            <li className="text-xs text-muted-foreground">
              Saldo total em aberto: {formatCurrency(outstanding)}
            </li>
          ) : null}
        </ul>
      )}
      {open ? (
        <PayrollLoanDialog
          employeeId={employee._id}
          employeeName={employee.name}
          jobTitle={employee.jobTitle}
          year={year}
          paymentMonth={month}
          closed={false}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
}
