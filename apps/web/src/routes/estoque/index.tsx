import { api } from "@rlpapp/backend/convex/_generated/api";
import { createFileRoute } from "@tanstack/react-router";
import { usePaginatedQuery, useQuery } from "convex/react";
import {
  CheckCircle2,
  History,
  Package,
  Search,
  ShieldAlert,
  Warehouse,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { AuthShell } from "@/components/auth-shell";
import { InventoryAddressDialog } from "@/components/estoque/inventory-address-dialog";
import { InventoryApprovals } from "@/components/estoque/inventory-approvals";
import { InventoryDocumentsHistory } from "@/components/estoque/inventory-documents-history";
import { InventoryMovementDialog } from "@/components/estoque/inventory-movement-dialog";
import { InventoryRules } from "@/components/estoque/inventory-rules";
import { StockHealthBadge } from "@/components/compras/material-replenishment-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/estoque/")({
  component: EstoquePage,
});

type Section = "central" | "movimentacoes" | "aprovacoes" | "regras";

function EstoquePage() {
  return (
    <AuthShell>
      <EstoqueContent />
    </AuthShell>
  );
}

function EstoqueContent() {
  const access = useQuery(api.inventory.getAccess, {});
  const materials = useQuery(api.inventory.listMaterialOptions, {});
  const projects = useQuery(api.inventory.listProjects, {});
  const approvals = useQuery(api.inventory.listPendingApprovals, {});
  const rules = useQuery(api.inventory.listRules, {});
  const centralBalances = usePaginatedQuery(
    api.inventory.listBalances,
    access?.canViewCentral ? {} : "skip",
    { initialNumItems: 100 }
  );
  const documents = usePaginatedQuery(
    api.inventory.listDocuments,
    {},
    { initialNumItems: 20 }
  );

  const [section, setSection] = useState<Section>("central");
  const [search, setSearch] = useState("");

  const filteredCentralBalances = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    if (!term) return centralBalances.results;
    return centralBalances.results.filter(
      (balance) =>
        balance.materialName.toLocaleLowerCase("pt-BR").includes(term) ||
        balance.materialSku?.toLocaleLowerCase("pt-BR").includes(term) ||
        balance.category?.toLocaleLowerCase("pt-BR").includes(term) ||
        balance.physicalAddress?.toLocaleLowerCase("pt-BR").includes(term)
    );
  }, [centralBalances.results, search]);

  useEffect(() => {
    if (access && !access.canViewCentral && section === "central") {
      setSection("movimentacoes");
    }
  }, [access, section]);

  if (!access || !materials || !projects || !approvals || !rules) {
    return (
      <div className="mx-auto max-w-7xl py-16 text-center text-sm text-muted-foreground">
        Carregando estoque...
      </div>
    );
  }

  const sections: Array<{ key: Section; label: string; icon: typeof Package }> = [
    ...(access.canViewCentral
      ? [{ key: "central" as const, label: "Central", icon: Warehouse }]
      : []),
    { key: "movimentacoes", label: "Movimentações", icon: History },
    ...(access.isEngineer
      ? [{ key: "aprovacoes" as const, label: "Aprovações", icon: ShieldAlert }]
      : []),
    { key: "regras", label: "Regras", icon: CheckCircle2 },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Estoque central</h1>
          <p className="text-sm text-muted-foreground">
            Controle do armazém central, entradas e envios para as obras.
          </p>
        </div>
        <InventoryMovementDialog
          access={access}
          materials={materials}
          projects={projects}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {access.canViewCentral && (
          <MetricCard
            icon={Package}
            label="Materiais no central"
            value={String(
              centralBalances.results.filter((balance) => balance.quantity > 0)
                .length
            )}
          />
        )}
        <MetricCard
          icon={History}
          label="Movimentações carregadas"
          value={String(documents.results.length)}
        />
        <MetricCard
          icon={ShieldAlert}
          label="Suas aprovações pendentes"
          value={String(approvals.length)}
        />
      </div>

      <div className="flex gap-1 overflow-x-auto rounded-xl border bg-white p-1">
        {sections.map((item) => (
          <Button
            key={item.key}
            variant={section === item.key ? "default" : "ghost"}
            size="sm"
            className="shrink-0"
            onClick={() => setSection(item.key)}
          >
            <item.icon className="mr-1.5 size-4" />
            {item.label}
          </Button>
        ))}
      </div>

      {section === "central" && (
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle>Estoque central</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Saldos e endereço físico de cada material.
                </p>
              </div>
              <div className="relative w-full sm:w-80">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar material ou localização"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {centralBalances.status === "LoadingFirstPage" ? (
              <LoadingMessage />
            ) : filteredCentralBalances.length === 0 ? (
              <EmptyMessage text="Nenhum material no estoque central." />
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Material</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead className="text-right">Saldo</TableHead>
                      <TableHead>Saúde</TableHead>
                      <TableHead>Localização</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCentralBalances.map((balance) => (
                      <TableRow key={balance._id}>
                        <TableCell className="font-medium">
                          <div>
                            <p>{balance.materialName}</p>
                            {balance.materialSku && (
                              <p className="text-xs text-muted-foreground">
                                {balance.materialSku}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{balance.category ?? "—"}</TableCell>
                        <TableCell className="text-right font-semibold">
                          {balance.quantity} {balance.unit ?? ""}
                        </TableCell>
                        <TableCell>
                          <StockHealthBadge
                            state={balance.replenishmentState}
                            suggestedOrderQuantity={
                              balance.suggestedOrderQuantity
                            }
                          />
                        </TableCell>
                        <TableCell>
                          {access.canWriteCentral ? (
                            <InventoryAddressDialog
                              balanceId={balance._id}
                              materialName={balance.materialName}
                              currentAddress={balance.physicalAddress}
                            />
                          ) : (
                            balance.physicalAddress ?? "—"
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {centralBalances.status === "CanLoadMore" && (
                  <div className="mt-4 text-center">
                    <Button
                      variant="outline"
                      onClick={() => centralBalances.loadMore(100)}
                    >
                      Carregar mais
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {section === "movimentacoes" && (
        <Card>
          <CardHeader>
            <CardTitle>Histórico de movimentações</CardTitle>
          </CardHeader>
          <CardContent>
            <InventoryDocumentsHistory access={access} documents={documents} />
          </CardContent>
        </Card>
      )}

      {section === "aprovacoes" && (
        <InventoryApprovals approvals={approvals} />
      )}

      {section === "regras" && (
        <InventoryRules
          rules={rules}
          materials={materials}
          canConfigure={access.canConfigureRules}
        />
      )}
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Package;
  label: string;
  value: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <div className="rounded-xl bg-primary/10 p-3 text-primary">
          <Icon className="size-5" />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function LoadingMessage() {
  return (
    <p className="py-12 text-center text-sm text-muted-foreground">
      Carregando...
    </p>
  );
}

function EmptyMessage({ text }: { text: string }) {
  return (
    <p className="py-12 text-center text-sm text-muted-foreground">{text}</p>
  );
}
