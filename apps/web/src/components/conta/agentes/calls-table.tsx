import { Loader2 } from "lucide-react";

import { formatDateTime, type CallRow } from "@/components/conta/agentes/agent-tokens";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function CallsTable({ calls }: { calls: CallRow[] | undefined }) {
  if (calls === undefined) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Carregando…
      </div>
    );
  }
  if (calls.length === 0) {
    return (
      <p className="py-4 text-sm text-muted-foreground">
        Nenhuma chamada registrada ainda.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Quando</TableHead>
            <TableHead>Token</TableHead>
            <TableHead>Ferramenta</TableHead>
            <TableHead>Função</TableHead>
            <TableHead>Resultado</TableHead>
            <TableHead className="text-right">Tempo</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {calls.map((call) => (
            <TableRow key={call._id}>
              <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                {formatDateTime(call.createdAt)}
              </TableCell>
              <TableCell className="text-sm">{call.tokenName ?? "—"}</TableCell>
              <TableCell className="font-mono text-xs">{call.tool}</TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">
                {call.functionPath ?? "—"}
              </TableCell>
              <TableCell>
                {call.outcome === "success" ? (
                  <Badge variant="success" className="px-2 py-0.5 text-xs">
                    OK
                  </Badge>
                ) : (
                  <span
                    className="inline-block max-w-[16rem] truncate text-xs text-destructive"
                    title={call.errorMessage ?? undefined}
                  >
                    {call.errorMessage ?? "Erro"}
                  </span>
                )}
              </TableCell>
              <TableCell className="text-right text-xs text-muted-foreground">
                {call.durationMs} ms
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
