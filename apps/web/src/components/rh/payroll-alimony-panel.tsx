import type { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { formatCurrency } from "@rlpapp/shared";
import type { FunctionReturnType } from "convex/server";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { formatCentsInput, parsePayrollAmountToCents } from "@/lib/rh/money";
import { cn } from "@/lib/utils";

type Workspace = FunctionReturnType<typeof api.payroll.getWorkspace>;
export type AlimonyLine = Workspace["alimonyLines"][number];
type AvailableAlimony = Workspace["availableAlimonies"][number];

const CELL = "border-b border-border px-1.5 py-1 text-[12px]";

function CommitInput({
  value,
  disabled,
  align = "left",
  placeholder,
  className,
  onCommit,
}: {
  value: string;
  disabled?: boolean;
  align?: "left" | "right";
  placeholder?: string;
  className?: string;
  onCommit: (value: string) => void;
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
      onChange={(event) => setText(event.target.value)}
      onBlur={() => {
        if (text !== value) onCommit(text);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") (event.target as HTMLInputElement).blur();
      }}
      className={cn(
        "h-[26px] w-full rounded-[4px] border border-transparent bg-transparent px-1 text-[12px] hover:border-border focus:border-ring focus:outline-none disabled:opacity-70",
        align === "right" && "text-right tabular-nums",
        className
      )}
    />
  );
}

/**
 * Pensões alimentícias do mês: pagamentos a beneficiários por conta de um
 * funcionário. Painel separado da grade porque não é remuneração do
 * funcionário nem entra no total dele; tem total e confirmação próprios.
 */
export function PayrollAlimonyPanel({
  lines,
  totals,
  available,
  closed,
  onCommit,
  onTogglePaid,
  onRemove,
  onAdd,
}: {
  lines: AlimonyLine[];
  totals: Workspace["alimonyTotals"];
  available: AvailableAlimony[];
  closed: boolean;
  onCommit: (
    lineId: Id<"payrollAlimonyLines">,
    patch: { amountCents?: number; notes?: string | null }
  ) => void;
  onTogglePaid: (line: AlimonyLine) => void;
  onRemove: (line: AlimonyLine) => void;
  onAdd: (alimonyId: Id<"employeeAlimonies">) => void;
}) {
  const [selected, setSelected] = useState<string>("");
  const selectedId = selected || available[0]?._id || "";

  return (
    <section className="flex max-h-[240px] min-h-0 shrink-0 flex-col overflow-hidden rounded-[var(--radius)] border border-border bg-card">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-3 py-2">
        <div className="flex flex-col">
          <span className="text-[11px] font-bold tracking-[0.06em] text-muted-foreground uppercase">
            Pensões alimentícias
          </span>
          <span className="text-[11.5px] text-muted-foreground">
            Pagas ao beneficiário, fora da linha do funcionário. O valor é o do
            mês; o próximo mês nasce com este valor.
          </span>
        </div>
        <div className="ml-auto flex items-center gap-3 text-[12px]">
          <span className="text-muted-foreground">
            {totals.paidCount} / {totals.count} pagas
          </span>
          <span className="font-bold tabular-nums">
            {formatCurrency(totals.totalCents)}
          </span>
          {!closed && available.length > 0 && (
            <div className="flex items-center gap-1">
              <select
                className="h-7 rounded-md border border-border bg-background px-1.5 text-[12px]"
                value={selectedId}
                onChange={(event) => setSelected(event.target.value)}
                aria-label="Pensão a incluir"
              >
                {available.map((alimony) => (
                  <option key={alimony._id} value={alimony._id}>
                    {alimony.beneficiaryName}
                  </option>
                ))}
              </select>
              <Button
                size="sm"
                variant="outline"
                className="h-7"
                disabled={!selectedId}
                onClick={() => onAdd(selectedId as Id<"employeeAlimonies">)}
              >
                Incluir no mês
              </Button>
            </div>
          )}
        </div>
      </div>
      <div className="min-h-0 overflow-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-muted text-[10px] font-semibold tracking-[0.04em] text-muted-foreground uppercase">
              <th className="px-1.5 py-1 text-left">Beneficiário</th>
              <th className="px-1.5 py-1 text-left">Por conta de</th>
              <th className="w-[96px] px-1.5 py-1 text-right">Valor</th>
              <th className="w-[56px] px-1.5 py-1 text-left">F. pag.</th>
              <th className="px-1.5 py-1 text-left">Chave PIX</th>
              <th className="px-1.5 py-1 text-left">Observações</th>
              <th className="w-[60px] px-1.5 py-1 text-center">Pago</th>
              <th className="w-[36px] px-1.5 py-1" />
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="px-3 py-4 text-[12px] text-muted-foreground"
                >
                  Nenhuma pensão neste mês. Cadastre em Funcionários › detalhe
                  › Pensão alimentícia, ou inclua uma pensão existente acima.
                </td>
              </tr>
            ) : (
              lines.map((line) => (
                <tr
                  key={line._id}
                  style={{
                    background: line.paid
                      ? "var(--card)"
                      : "color-mix(in oklab, var(--primary) 6%, var(--card))",
                  }}
                >
                  <td className={cn(CELL, "font-semibold")}>
                    {line.beneficiaryName}
                  </td>
                  <td className={cn(CELL, "text-muted-foreground")}>
                    {line.employeeName}
                  </td>
                  <td className={cn(CELL, "p-0 px-0.5")}>
                    <CommitInput
                      align="right"
                      disabled={closed}
                      className="font-semibold"
                      value={formatCentsInput(line.amountCents)}
                      onCommit={(value) =>
                        onCommit(line._id, {
                          amountCents: parsePayrollAmountToCents(value || "0"),
                        })
                      }
                    />
                  </td>
                  <td className={CELL}>{line.paymentMethod.toUpperCase()}</td>
                  <td className={cn(CELL, "text-muted-foreground")}>
                    {line.pixKey ?? "—"}
                  </td>
                  <td className={cn(CELL, "p-0 px-0.5")}>
                    <CommitInput
                      disabled={closed}
                      placeholder="—"
                      className="text-muted-foreground"
                      value={line.notes ?? ""}
                      onCommit={(value) =>
                        onCommit(line._id, { notes: value || null })
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
                          : "border-border bg-transparent text-muted-foreground"
                      )}
                    >
                      {line.paid ? "PAGO" : "—"}
                    </button>
                  </td>
                  <td className={cn(CELL, "text-center")}>
                    {!closed && (
                      <button
                        type="button"
                        title="Tirar deste mês (o cadastro continua)"
                        onClick={() => onRemove(line)}
                        className="rounded px-1 text-[14px] leading-none text-muted-foreground hover:bg-muted hover:text-destructive"
                      >
                        ×
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
