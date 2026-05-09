import { api } from "@rlpapp/backend/convex/_generated/api";
import { createFileRoute } from "@tanstack/react-router";
import { Authenticated, AuthLoading, Unauthenticated, useQuery } from "convex/react";
import { History, Filter } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Badge } from "@/components/ui/badge";
import { ConvexUnauthRedirect } from "@/components/convex-unauth-redirect";

export const Route = createFileRoute("/estoque/movimentacoes")({
  component: MovimentacoesPage,
});

function MovimentacoesPage() {
  return (
    <>
      <Authenticated>
        <MovimentacoesContent />
      </Authenticated>
      <Unauthenticated>
        <ConvexUnauthRedirect />
      </Unauthenticated>
      <AuthLoading>
        <div className="flex items-center justify-center h-full">
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </AuthLoading>
    </>
  );
}

const typeLabels: Record<string, string> = {
  RegisteredIn: "Entrada",
  RegisteredOut: "Saída",
  Reversal: "Reversão",
  InventoryAdjust: "Ajuste",
};

const typeVariants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  RegisteredIn: "default",
  RegisteredOut: "secondary",
  Reversal: "outline",
  InventoryAdjust: "destructive",
};

const refTypeLabels: Record<string, string> = {
  receipt: "Recibo",
  shipment: "Remessa",
  adjustment: "Ajuste",
};

function MovimentacoesContent() {
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const events = useQuery(api.inventory.listEvents, {
    type: typeFilter !== "all" ? typeFilter : undefined,
    limit: 200,
  });

  const formatDate = (timestamp: number) =>
    new Date(timestamp).toLocaleString("pt-BR");

  return (
    <div className="p-4 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Histórico de Eventos</h1>
        <p className="text-muted-foreground">
          Ledger append-only de todos os eventos de inventário
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Filter className="h-4 w-4" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 items-end">
            <div className="grid gap-2">
              <label className="text-xs text-muted-foreground">Tipo de Evento</label>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="RegisteredIn">Entrada</SelectItem>
                  <SelectItem value="RegisteredOut">Saída</SelectItem>
                  <SelectItem value="Reversal">Reversão</SelectItem>
                  <SelectItem value="InventoryAdjust">Ajuste</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {typeFilter !== "all" && (
              <Button variant="ghost" size="sm" onClick={() => setTypeFilter("all")}>
                Limpar Filtros
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Eventos de Inventário
          </CardTitle>
          <CardDescription>
            {events?.length ?? 0} eventos encontrados
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!events ? (
            <p className="text-muted-foreground">Carregando...</p>
          ) : events.length === 0 ? (
            <p className="text-muted-foreground">Nenhum evento encontrado</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead>Qtd Delta</TableHead>
                  <TableHead>Referência</TableHead>
                  <TableHead>Usuário</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((event: any) => (
                  <TableRow key={event._id}>
                    <TableCell className="whitespace-nowrap">
                      {formatDate(event.createdAt)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={typeVariants[event.type] ?? "outline"}>
                        {typeLabels[event.type] ?? event.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">
                      {event.product?.name ?? "Produto não encontrado"}
                    </TableCell>
                    <TableCell>
                      <span
                        className={
                          event.qtyDelta > 0
                            ? "text-green-600 font-medium"
                            : "text-red-600 font-medium"
                        }
                      >
                        {event.qtyDelta > 0 ? "+" : ""}
                        {event.qtyDelta} {event.product?.unit}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs">
                      {refTypeLabels[event.refType] ?? event.refType}
                      <span className="text-muted-foreground ml-1">
                        {event.refId.substring(0, 10)}...
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {event.userId}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
