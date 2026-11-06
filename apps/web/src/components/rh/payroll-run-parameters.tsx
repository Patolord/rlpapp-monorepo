import { api } from "@rlpapp/backend/convex/_generated/api";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useEffect, useState } from "react";

import { formatCentsInput, parseDays, parsePayrollAmountToCents } from "@/lib/rh/money";

type PayrollRun = NonNullable<FunctionReturnType<typeof api.payroll.getWorkspace>["run"]>;

/** Parâmetros do mês (VA/dia, cesta, passagem e dias padrão), salvos ao sair do campo. */
export function PayrollRunParameters({
  run,
  closed,
}: {
  run: PayrollRun | null;
  closed: boolean;
}) {
  const updateRunParameters = useMutation(api.payroll.updateRunParameters);

  return (
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
