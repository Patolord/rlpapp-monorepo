import { api } from "@rlpapp/backend/convex/_generated/api";
import { createFileRoute } from "@tanstack/react-router";
import { Authenticated, AuthLoading, Unauthenticated, useQuery } from "convex/react";
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  ArrowDownToLine,
  ArrowUpFromLine,
  DollarSign,
  Percent,
  Calendar,
} from "lucide-react";
import { useState, useMemo } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/financeiro/relatorios")({
  component: RelatoriosPage,
});

type TabKey = "fluxo" | "dre" | "aging" | "categoria";

function RelatoriosPage() {
  return (
    <>
      <Authenticated>
        <RelatoriosContent />
      </Authenticated>
      <Unauthenticated>
        <div className="flex items-center justify-center h-full">
          <p className="text-muted-foreground">Faça login para acessar</p>
        </div>
      </Unauthenticated>
      <AuthLoading>
        <div className="flex items-center justify-center h-full">
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </AuthLoading>
    </>
  );
}

function getDefaultDateRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    inicio: start.toISOString().split("T")[0],
    fim: end.toISOString().split("T")[0],
  };
}

function RelatoriosContent() {
  const [activeTab, setActiveTab] = useState<TabKey>("fluxo");
  const defaultRange = getDefaultDateRange();
  const [dataInicio, setDataInicio] = useState(defaultRange.inicio);
  const [dataFim, setDataFim] = useState(defaultRange.fim);

  const tabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    { key: "fluxo", label: "Fluxo de Caixa", icon: <TrendingUp className="h-4 w-4" /> },
    { key: "dre", label: "DRE Simplificado", icon: <BarChart3 className="h-4 w-4" /> },
    { key: "aging", label: "Aging", icon: <Calendar className="h-4 w-4" /> },
    { key: "categoria", label: "Por Categoria", icon: <Percent className="h-4 w-4" /> },
  ];

  return (
    <div className="p-4 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Relatórios Financeiros</h1>
        <p className="text-muted-foreground">Análise de dados financeiros da empresa</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b pb-2">
        {tabs.map((tab) => (
          <Button
            key={tab.key}
            variant={activeTab === tab.key ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveTab(tab.key)}
            className="gap-2"
          >
            {tab.icon}
            {tab.label}
          </Button>
        ))}
      </div>

      {/* Date range filter (for fluxo, dre, categoria) */}
      {activeTab !== "aging" && (
        <div className="flex items-end gap-4">
          <div className="grid gap-1.5">
            <Label className="text-xs">Data Início</Label>
            <Input
              type="date"
              value={dataInicio}
              onChange={(e) => setDataInicio(e.target.value)}
              className="w-[160px]"
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Data Fim</Label>
            <Input
              type="date"
              value={dataFim}
              onChange={(e) => setDataFim(e.target.value)}
              className="w-[160px]"
            />
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const now = new Date();
                setDataInicio(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0]);
                setDataFim(new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0]);
              }}
            >
              Este Mês
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const now = new Date();
                setDataInicio(new Date(now.getFullYear(), 0, 1).toISOString().split("T")[0]);
                setDataFim(new Date(now.getFullYear(), 11, 31).toISOString().split("T")[0]);
              }}
            >
              Este Ano
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const now = new Date();
                setDataInicio(new Date(now.getFullYear(), now.getMonth() - 2, 1).toISOString().split("T")[0]);
                setDataFim(new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0]);
              }}
            >
              Últimos 3 Meses
            </Button>
          </div>
        </div>
      )}

      {/* Tab content */}
      {activeTab === "fluxo" && (
        <FluxoDeCaixa dataInicio={dataInicio} dataFim={dataFim} />
      )}
      {activeTab === "dre" && <DRE dataInicio={dataInicio} dataFim={dataFim} />}
      {activeTab === "aging" && <AgingReport />}
      {activeTab === "categoria" && (
        <CategoriaReport dataInicio={dataInicio} dataFim={dataFim} />
      )}
    </div>
  );
}

function FluxoDeCaixa({ dataInicio, dataFim }: { dataInicio: string; dataFim: string }) {
  const [agrupamento, setAgrupamento] = useState<"dia" | "semana" | "mes">("mes");

  const fluxo = useQuery(api.relatorios.fluxoDeCaixa, {
    dataInicio: new Date(dataInicio).getTime(),
    dataFim: new Date(dataFim + "T23:59:59").getTime(),
    agrupamento,
  });

  if (!fluxo) return <p className="text-muted-foreground">Carregando...</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100">
                  <ArrowDownToLine className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total Entradas</p>
                  <p className="text-xl font-bold text-emerald-600">
                    {formatCurrency(fluxo.totalEntradas)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-100">
                  <ArrowUpFromLine className="h-5 w-5 text-red-500" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total Saídas</p>
                  <p className="text-xl font-bold text-red-500">
                    {formatCurrency(fluxo.totalSaidas)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-xl ${fluxo.saldoTotal >= 0 ? "bg-blue-100" : "bg-red-100"}`}
                >
                  <DollarSign
                    className={`h-5 w-5 ${fluxo.saldoTotal >= 0 ? "text-blue-600" : "text-red-500"}`}
                  />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Saldo</p>
                  <p
                    className={`text-xl font-bold ${fluxo.saldoTotal >= 0 ? "text-blue-600" : "text-red-500"}`}
                  >
                    {formatCurrency(fluxo.saldoTotal)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
        <Select
          value={agrupamento}
          onValueChange={(v) => setAgrupamento(v as "dia" | "semana" | "mes")}
        >
          <SelectTrigger className="w-[130px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="dia">Diário</SelectItem>
            <SelectItem value="semana">Semanal</SelectItem>
            <SelectItem value="mes">Mensal</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {fluxo.periodos.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <BarChart3 className="mx-auto h-10 w-10 text-muted-foreground/30" />
            <p className="mt-3 text-muted-foreground">
              Nenhum dado para o período selecionado
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Fluxo de Caixa</CardTitle>
            <CardDescription>Movimentações por período</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Período</TableHead>
                  <TableHead className="text-right">Entradas</TableHead>
                  <TableHead className="text-right">Saídas</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                  <TableHead className="text-right">Acumulado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fluxo.periodos.map((p) => (
                  <TableRow key={p.periodo}>
                    <TableCell className="font-medium">{formatPeriodo(p.periodo)}</TableCell>
                    <TableCell className="text-right text-emerald-600">
                      {formatCurrency(p.entradas)}
                    </TableCell>
                    <TableCell className="text-right text-red-500">
                      {formatCurrency(p.saidas)}
                    </TableCell>
                    <TableCell
                      className={`text-right font-semibold ${p.saldo >= 0 ? "text-emerald-600" : "text-red-500"}`}
                    >
                      {formatCurrency(p.saldo)}
                    </TableCell>
                    <TableCell
                      className={`text-right font-semibold ${p.saldoAcumulado >= 0 ? "text-blue-600" : "text-red-500"}`}
                    >
                      {formatCurrency(p.saldoAcumulado)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {/* Visual bar representation */}
            <div className="mt-6 space-y-2">
              {fluxo.periodos.map((p) => {
                const maxVal = Math.max(
                  ...fluxo.periodos.map((pp) => Math.max(pp.entradas, pp.saidas)),
                  1
                );
                const entradaPct = (p.entradas / maxVal) * 100;
                const saidaPct = (p.saidas / maxVal) * 100;
                return (
                  <div key={p.periodo} className="space-y-1">
                    <p className="text-xs text-muted-foreground">{formatPeriodo(p.periodo)}</p>
                    <div className="flex gap-1 h-5">
                      <div
                        className="bg-emerald-400 rounded-sm"
                        style={{ width: `${entradaPct}%` }}
                        title={`Entradas: ${formatCurrency(p.entradas)}`}
                      />
                      <div
                        className="bg-red-400 rounded-sm"
                        style={{ width: `${saidaPct}%` }}
                        title={`Saídas: ${formatCurrency(p.saidas)}`}
                      />
                    </div>
                  </div>
                );
              })}
              <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-sm bg-emerald-400" /> Entradas
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-sm bg-red-400" /> Saídas
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function DRE({ dataInicio, dataFim }: { dataInicio: string; dataFim: string }) {
  const dre = useQuery(api.relatorios.dre, {
    dataInicio: new Date(dataInicio).getTime(),
    dataFim: new Date(dataFim + "T23:59:59").getTime(),
  });

  if (!dre) return <p className="text-muted-foreground">Carregando...</p>;

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Receita Total</p>
            <p className="text-2xl font-bold text-emerald-600">
              {formatCurrency(dre.totalReceitas)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Despesa Total</p>
            <p className="text-2xl font-bold text-red-500">{formatCurrency(dre.totalDespesas)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Resultado</p>
            <p
              className={`text-2xl font-bold ${dre.resultado >= 0 ? "text-emerald-600" : "text-red-500"}`}
            >
              {formatCurrency(dre.resultado)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Margem</p>
            <p
              className={`text-2xl font-bold ${dre.margemPercentual >= 0 ? "text-blue-600" : "text-red-500"}`}
            >
              {dre.margemPercentual}%
            </p>
          </CardContent>
        </Card>
      </div>

      {/* DRE Table */}
      <Card>
        <CardHeader>
          <CardTitle>Demonstrativo de Resultado</CardTitle>
          <CardDescription>Receitas e despesas por categoria</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Descrição</TableHead>
                <TableHead className="text-right">Qtd</TableHead>
                <TableHead className="text-right">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow className="bg-emerald-50/50 font-semibold">
                <TableCell>RECEITAS</TableCell>
                <TableCell className="text-right">
                  {dre.receitas.reduce((s, r) => s + r.count, 0)}
                </TableCell>
                <TableCell className="text-right text-emerald-600">
                  {formatCurrency(dre.totalReceitas)}
                </TableCell>
              </TableRow>
              {dre.receitas.map((r, i) => (
                <TableRow key={`r-${i}`}>
                  <TableCell className="pl-8">{r.nome}</TableCell>
                  <TableCell className="text-right">{r.count}</TableCell>
                  <TableCell className="text-right text-emerald-600">
                    {formatCurrency(r.total)}
                  </TableCell>
                </TableRow>
              ))}
              {dre.receitas.length === 0 && (
                <TableRow>
                  <TableCell className="pl-8 text-muted-foreground" colSpan={3}>
                    Nenhuma receita no período
                  </TableCell>
                </TableRow>
              )}

              <TableRow className="bg-red-50/50 font-semibold">
                <TableCell>DESPESAS</TableCell>
                <TableCell className="text-right">
                  {dre.despesas.reduce((s, d) => s + d.count, 0)}
                </TableCell>
                <TableCell className="text-right text-red-500">
                  {formatCurrency(dre.totalDespesas)}
                </TableCell>
              </TableRow>
              {dre.despesas.map((d, i) => (
                <TableRow key={`d-${i}`}>
                  <TableCell className="pl-8">{d.nome}</TableCell>
                  <TableCell className="text-right">{d.count}</TableCell>
                  <TableCell className="text-right text-red-500">
                    {formatCurrency(d.total)}
                  </TableCell>
                </TableRow>
              ))}
              {dre.despesas.length === 0 && (
                <TableRow>
                  <TableCell className="pl-8 text-muted-foreground" colSpan={3}>
                    Nenhuma despesa no período
                  </TableCell>
                </TableRow>
              )}

              <TableRow className="border-t-2 font-bold">
                <TableCell>RESULTADO</TableCell>
                <TableCell />
                <TableCell
                  className={`text-right ${dre.resultado >= 0 ? "text-emerald-600" : "text-red-500"}`}
                >
                  {formatCurrency(dre.resultado)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function AgingReport() {
  const [tipo, setTipo] = useState<"pagar" | "receber">("pagar");
  const aging = useQuery(api.relatorios.aging, { tipo });

  if (!aging) return <p className="text-muted-foreground">Carregando...</p>;

  const total = aging.reduce((s, f) => s + f.total, 0);
  const totalCount = aging.reduce((s, f) => s + f.count, 0);

  const colors = [
    "bg-blue-400",
    "bg-amber-400",
    "bg-orange-400",
    "bg-red-400",
    "bg-red-600",
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Select value={tipo} onValueChange={(v) => setTipo(v as "pagar" | "receber")}>
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pagar">Contas a Pagar</SelectItem>
            <SelectItem value="receber">Contas a Receber</SelectItem>
          </SelectContent>
        </Select>
        <div className="text-sm text-muted-foreground">
          {totalCount} contas abertas • Total: {formatCurrency(total)}
        </div>
      </div>

      {/* Visual aging bars */}
      <Card>
        <CardHeader>
          <CardTitle>
            Aging Report — {tipo === "pagar" ? "Contas a Pagar" : "Contas a Receber"}
          </CardTitle>
          <CardDescription>Distribuição por faixa de vencimento</CardDescription>
        </CardHeader>
        <CardContent>
          {totalCount === 0 ? (
            <div className="py-8 text-center">
              <Calendar className="mx-auto h-10 w-10 text-muted-foreground/30" />
              <p className="mt-3 text-muted-foreground">Nenhuma conta aberta</p>
            </div>
          ) : (
            <>
              {/* Stacked bar */}
              <div className="flex h-10 w-full overflow-hidden rounded-lg">
                {aging.map((f, i) => {
                  const pct = total > 0 ? (f.total / total) * 100 : 0;
                  if (pct === 0) return null;
                  return (
                    <div
                      key={f.faixa}
                      className={`${colors[i]} flex items-center justify-center text-xs text-white font-medium`}
                      style={{ width: `${pct}%` }}
                      title={`${f.faixa}: ${formatCurrency(f.total)} (${f.count})`}
                    >
                      {pct >= 8 ? `${Math.round(pct)}%` : ""}
                    </div>
                  );
                })}
              </div>

              <Table className="mt-4">
                <TableHeader>
                  <TableRow>
                    <TableHead>Faixa</TableHead>
                    <TableHead className="text-right">Qtd</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead className="text-right">%</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {aging.map((f, i) => {
                    const pct = total > 0 ? ((f.total / total) * 100).toFixed(1) : "0.0";
                    return (
                      <TableRow key={f.faixa}>
                        <TableCell>
                          <span className="flex items-center gap-2">
                            <span className={`h-3 w-3 rounded-sm ${colors[i]}`} />
                            {f.faixa}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">{f.count}</TableCell>
                        <TableCell className="text-right font-semibold">
                          {formatCurrency(f.total)}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {pct}%
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  <TableRow className="font-bold border-t-2">
                    <TableCell>Total</TableCell>
                    <TableCell className="text-right">{totalCount}</TableCell>
                    <TableCell className="text-right">{formatCurrency(total)}</TableCell>
                    <TableCell className="text-right">100%</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CategoriaReport({ dataInicio, dataFim }: { dataInicio: string; dataFim: string }) {
  const [tipo, setTipo] = useState<"despesas" | "receitas">("despesas");

  const report = useQuery(api.relatorios.porCategoria, {
    dataInicio: new Date(dataInicio).getTime(),
    dataFim: new Date(dataFim + "T23:59:59").getTime(),
    tipo,
  });

  if (!report) return <p className="text-muted-foreground">Carregando...</p>;

  const categoryColors = [
    "bg-blue-500",
    "bg-emerald-500",
    "bg-amber-500",
    "bg-violet-500",
    "bg-rose-500",
    "bg-cyan-500",
    "bg-orange-500",
    "bg-teal-500",
    "bg-pink-500",
    "bg-indigo-500",
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Select value={tipo} onValueChange={(v) => setTipo(v as "despesas" | "receitas")}>
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="despesas">Despesas</SelectItem>
            <SelectItem value="receitas">Receitas</SelectItem>
          </SelectContent>
        </Select>
        <div className="text-sm text-muted-foreground">
          Total: {formatCurrency(report.total)} • {report.categorias.length} categorias
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{tipo === "despesas" ? "Despesas" : "Receitas"} por Categoria</CardTitle>
          <CardDescription>Distribuição por categoria financeira</CardDescription>
        </CardHeader>
        <CardContent>
          {report.categorias.length === 0 ? (
            <div className="py-8 text-center">
              <Percent className="mx-auto h-10 w-10 text-muted-foreground/30" />
              <p className="mt-3 text-muted-foreground">
                Nenhum dado para o período selecionado
              </p>
            </div>
          ) : (
            <>
              {/* Horizontal bars */}
              <div className="space-y-3">
                {report.categorias.map((cat, i) => (
                  <div key={cat.nome} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <span
                          className={`h-3 w-3 rounded-sm ${categoryColors[i % categoryColors.length]}`}
                        />
                        {cat.nome}
                      </span>
                      <span className="font-medium">
                        {formatCurrency(cat.total)}{" "}
                        <span className="text-muted-foreground">({cat.percentual}%)</span>
                      </span>
                    </div>
                    <div className="h-3 w-full rounded-full bg-muted">
                      <div
                        className={`h-full rounded-full ${categoryColors[i % categoryColors.length]}`}
                        style={{ width: `${cat.percentual}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <Table className="mt-6">
                <TableHeader>
                  <TableRow>
                    <TableHead>Categoria</TableHead>
                    <TableHead className="text-right">Qtd</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead className="text-right">%</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.categorias.map((cat, i) => (
                    <TableRow key={cat.nome}>
                      <TableCell>
                        <span className="flex items-center gap-2">
                          <span
                            className={`h-3 w-3 rounded-sm ${categoryColors[i % categoryColors.length]}`}
                          />
                          {cat.nome}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">{cat.count}</TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatCurrency(cat.total)}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {cat.percentual}%
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="font-bold border-t-2">
                    <TableCell>Total</TableCell>
                    <TableCell className="text-right">
                      {report.categorias.reduce((s, c) => s + c.count, 0)}
                    </TableCell>
                    <TableCell className="text-right">{formatCurrency(report.total)}</TableCell>
                    <TableCell className="text-right">100%</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function formatCurrency(valueInCents: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(valueInCents / 100);
}

function formatPeriodo(periodo: string) {
  if (periodo.length === 7) {
    const [year, month] = periodo.split("-");
    const months = [
      "Jan",
      "Fev",
      "Mar",
      "Abr",
      "Mai",
      "Jun",
      "Jul",
      "Ago",
      "Set",
      "Out",
      "Nov",
      "Dez",
    ];
    return `${months[parseInt(month) - 1]} ${year}`;
  }
  const parts = periodo.split("-");
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}
