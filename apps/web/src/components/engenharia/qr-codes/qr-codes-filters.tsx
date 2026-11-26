import { Printer, Search } from "lucide-react";
import { EQUIPMENT_STATUS_LABELS } from "@rlpapp/shared/engenharia/equipment";

import {
  ALL,
  NO_BATCH,
  type BatchSummary,
  type RegistrationFilter,
} from "@/components/engenharia/qr-codes/qr-code-rows";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** Busca e filtros (situação, status, lote) da lista de etiquetas. */
export function QrCodesFilters({
  search,
  onSearchChange,
  registrationOptions,
  registration,
  onRegistrationChange,
  status,
  onStatusChange,
  batches,
  hasRowsWithoutBatch,
  batchFilter,
  onBatchFilterChange,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  registrationOptions: Array<{
    id: RegistrationFilter;
    label: string;
    count: number;
  }>;
  registration: RegistrationFilter;
  onRegistrationChange: (value: RegistrationFilter) => void;
  status: string;
  onStatusChange: (value: string) => void;
  batches: BatchSummary[];
  hasRowsWithoutBatch: boolean;
  batchFilter: string;
  onBatchFilterChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <div className="relative sm:w-72">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Buscar token, lote, descrição, ambiente..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        {registrationOptions.map((option) => (
          <Button
            key={option.id}
            type="button"
            size="sm"
            variant={registration === option.id ? "default" : "outline"}
            aria-pressed={registration === option.id}
            onClick={() => onRegistrationChange(option.id)}
          >
            {option.label}
            <span className="ml-1 tabular-nums opacity-80">
              ({option.count})
            </span>
          </Button>
        ))}
      </div>
      <Select value={status} onValueChange={onStatusChange}>
        <SelectTrigger className="sm:w-44">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Todos os status</SelectItem>
          {(["operational", "installing", "warning", "error"] as const).map((value) => (
            <SelectItem key={value} value={value}>
              {EQUIPMENT_STATUS_LABELS[value]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {(batches.length > 0 || hasRowsWithoutBatch) && (
        <Select value={batchFilter} onValueChange={onBatchFilterChange}>
          <SelectTrigger className="sm:w-56">
            <SelectValue placeholder="Lote" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos os lotes</SelectItem>
            {batches.map((batch) => (
              <SelectItem key={batch.batchId} value={batch.batchId}>
                {batch.batchName ?? batch.batchId} ({batch.count})
              </SelectItem>
            ))}
            {hasRowsWithoutBatch && (
              <SelectItem value={NO_BATCH}>Sem lote</SelectItem>
            )}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

/** Lotes recentes: filtro e reimpressão em um clique. */
export function QrBatchChips({
  batches,
  batchFilter,
  onBatchFilterChange,
  onPrintBatch,
}: {
  batches: BatchSummary[];
  batchFilter: string;
  onBatchFilterChange: (value: string) => void;
  onPrintBatch: (batch: BatchSummary) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted-foreground">Lotes:</span>
      {batches.slice(0, 6).map((batch) => (
        <div
          key={batch.batchId}
          className="flex items-center overflow-hidden rounded-md border"
        >
          <button
            type="button"
            className={`px-2.5 py-1 text-xs font-medium transition-colors hover:bg-accent ${
              batchFilter === batch.batchId ? "bg-muted" : ""
            }`}
            onClick={() =>
              onBatchFilterChange(
                batchFilter === batch.batchId ? ALL : batch.batchId
              )
            }
            title={new Date(batch.createdAt).toLocaleString("pt-BR")}
          >
            {batch.batchName ?? batch.batchId}
            <span className="ml-1 tabular-nums text-muted-foreground">
              ({batch.count})
            </span>
          </button>
          <button
            type="button"
            className="border-l px-2 py-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            title={`Imprimir lote ${batch.batchName ?? batch.batchId}`}
            aria-label={`Imprimir lote ${batch.batchName ?? batch.batchId}`}
            onClick={() => onPrintBatch(batch)}
          >
            <Printer className="size-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
