import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import {
  ClipboardCheck,
  ChevronDown,
  ChevronRight,
  Filter,
} from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AuthShell } from "@/components/auth-shell";
import { formatDateTime } from "@rlpapp/shared";

export const Route = createFileRoute("/estoque/historico-entregas")({
  component: HistoricoEntregasPage,
});

function HistoricoEntregasPage() {
  return (
    <AuthShell>
      <HistoricoContent />
    </AuthShell>
  );
}

function HistoricoContent() {
  const sites = useQuery(api.sites.list, { onlyActive: false });
  const [siteFilter, setSiteFilter] = useState<string>("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filterArgs: {
    siteId?: Id<"sites">;
    startDate?: number;
    endDate?: number;
  } = {};
  if (siteFilter) filterArgs.siteId = siteFilter as Id<"sites">;
  if (startDate) filterArgs.startDate = new Date(startDate).getTime();
  if (endDate)
    filterArgs.endDate = new Date(endDate).getTime() + 24 * 60 * 60 * 1000;

  const confirmations = useQuery(api.deliveryConfirmations.list, filterArgs);

  const clearFilters = () => {
    setSiteFilter("");
    setStartDate("");
    setEndDate("");
  };

  return (
    <div className="p-4 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Histórico de Entregas</h1>
        <p className="text-muted-foreground">
          Registro de todas as confirmações de entrega via código QR
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Filter className="h-4 w-4" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4 items-end">
            <div className="grid gap-1.5 min-w-[200px]">
              <Label className="text-xs">Obra</Label>
              <Select value={siteFilter} onValueChange={(v) => setSiteFilter(v ?? "")}>
                <SelectTrigger>
                  <SelectValue placeholder="Todas as obras" />
                </SelectTrigger>
                <SelectContent>
                  {sites?.map((s) => (
                    <SelectItem key={s._id} value={s._id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Data inicial</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Data final</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            {(siteFilter || startDate || endDate) && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                Limpar
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5" />
            Confirmações de Entrega
          </CardTitle>
          <CardDescription>
            {confirmations
              ? `${confirmations.length} registro(s) encontrado(s)`
              : "Carregando..."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!confirmations ? (
            <p className="text-muted-foreground">Carregando...</p>
          ) : confirmations.length === 0 ? (
            <p className="text-muted-foreground">
              Nenhuma confirmação encontrada
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Data</TableHead>
                  <TableHead>Obra</TableHead>
                  <TableHead>Recebido por</TableHead>
                  <TableHead>Confirmado por</TableHead>
                  <TableHead>Obs</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {confirmations.map((c) => (
                  <>
                    <TableRow
                      key={c._id}
                      className="cursor-pointer"
                      onClick={() =>
                        setExpandedId(expandedId === c._id ? null : c._id)
                      }
                    >
                      <TableCell>
                        {expandedId === c._id ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </TableCell>
                      <TableCell>{formatDateTime(c.confirmedAt)}</TableCell>
                      <TableCell>{c.site?.name ?? "—"}</TableCell>
                      <TableCell className="font-medium">
                        {c.receiverName}
                      </TableCell>
                      <TableCell>{c.confirmedByUserName}</TableCell>
                      <TableCell className="max-w-[150px] truncate">
                        {c.notes ?? "—"}
                      </TableCell>
                    </TableRow>
                    {expandedId === c._id && (
                      <TableRow key={`${c._id}-detail`}>
                        <TableCell colSpan={6} className="bg-muted/50 p-0">
                          <div className="p-3">
                            <p className="text-xs text-muted-foreground mb-2">
                              Itens da remessa
                            </p>
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Produto</TableHead>
                                  <TableHead>Quantidade</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {c.shipmentLines.map((line, idx) => (
                                    <TableRow key={idx}>
                                      <TableCell className="font-medium">
                                        {line.productName}
                                      </TableCell>
                                      <TableCell>
                                        {line.qty} {line.unit}
                                      </TableCell>
                                    </TableRow>
                                  )
                                )}
                              </TableBody>
                            </Table>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
