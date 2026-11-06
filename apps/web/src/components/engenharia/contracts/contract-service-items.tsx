import { useMemo, type Dispatch, type SetStateAction } from "react";
import { formatCurrency, parseCurrencyToCents } from "@rlpapp/shared";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type ServiceRow = {
  key: string;
  description: string;
  value: string;
};

function toCurrencyInput(cents?: number | null): string {
  if (cents == null) return "";
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

export function newServiceRow(seed?: {
  description?: string;
  valueCents?: number;
}): ServiceRow {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    description: seed?.description ?? "",
    value: toCurrencyInput(seed?.valueCents),
  };
}

/** Lista editável de serviços do contrato, com o total ao vivo. */
export function ContractServiceItems({
  serviceRows,
  setServiceRows,
}: {
  serviceRows: ServiceRow[];
  setServiceRows: Dispatch<SetStateAction<ServiceRow[]>>;
}) {
  const totalPreview = useMemo(() => {
    let total = 0;
    for (const row of serviceRows) {
      try {
        total += parseCurrencyToCents(row.value || "0");
      } catch {
        // ignore invalid row while typing
      }
    }
    return total;
  }, [serviceRows]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label>Serviços</Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            setServiceRows((rows) => [...rows, newServiceRow()])
          }
        >
          <Plus />
          Item
        </Button>
      </div>
      <div className="space-y-2">
        {serviceRows.map((row, index) => (
          <div
            key={row.key}
            className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_140px_auto]"
          >
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                Descrição
              </Label>
              <Input
                value={row.description}
                placeholder={`Serviço ${index + 1}`}
                onChange={(e) =>
                  setServiceRows((rows) =>
                    rows.map((r) =>
                      r.key === row.key
                        ? { ...r, description: e.target.value }
                        : r
                    )
                  )
                }
                required
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                Valor (R$)
              </Label>
              <Input
                value={row.value}
                placeholder="0,00"
                onChange={(e) =>
                  setServiceRows((rows) =>
                    rows.map((r) =>
                      r.key === row.key
                        ? { ...r, value: e.target.value }
                        : r
                    )
                  )
                }
                required
              />
            </div>
            <div className="flex items-end">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={serviceRows.length === 1}
                className="text-muted-foreground hover:text-destructive"
                onClick={() =>
                  setServiceRows((rows) =>
                    rows.filter((r) => r.key !== row.key)
                  )
                }
              >
                <Trash2 />
              </Button>
            </div>
          </div>
        ))}
      </div>
      <p className="text-sm tabular-nums text-muted-foreground">
        Total:{" "}
        <span className="font-semibold text-foreground">
          {formatCurrency(totalPreview)}
        </span>
      </p>
    </div>
  );
}
