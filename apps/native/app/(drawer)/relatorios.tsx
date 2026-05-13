import { api } from "@rlpapp/backend/convex/_generated/api";
import { Authenticated, AuthLoading, Unauthenticated, useQuery } from "convex/react";
import {
  Lock,
  TrendingUp,
  TrendingDown,
  DollarSign,
  BarChart3,
  ArrowUpFromLine,
  ArrowDownToLine,
} from "lucide-react-native";
import { useState, useMemo } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { Link } from "expo-router";

import { Container } from "@/components/container";
import { Button, ButtonText } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";

function formatCurrency(valueInCents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valueInCents / 100);
}

type Tab = "fluxo" | "dre" | "aging" | "categoria";

const TAB_OPTIONS: { label: string; value: Tab }[] = [
  { label: "Fluxo de Caixa", value: "fluxo" },
  { label: "DRE", value: "dre" },
  { label: "Aging", value: "aging" },
  { label: "Por Categoria", value: "categoria" },
];

function getDateRange(preset: string): { start: number; end: number } {
  const now = new Date();
  const end = now.getTime();
  switch (preset) {
    case "month": {
      const start = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
      return { start, end };
    }
    case "year": {
      const start = new Date(now.getFullYear(), 0, 1).getTime();
      return { start, end };
    }
    case "3months": {
      const start = new Date(now.getFullYear(), now.getMonth() - 3, 1).getTime();
      return { start, end };
    }
    default: {
      const start = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
      return { start, end };
    }
  }
}

export default function RelatoriosScreen() {
  return (
    <Container className="px-5 pt-4 pb-4">
      <Authenticated>
        <RelatoriosContent />
      </Authenticated>
      <Unauthenticated>
        <Card className="p-6 items-center">
          <Lock size={48} color="#888" />
          <Text className="text-foreground font-medium mt-4">Acesso Restrito</Text>
          <Text className="text-muted-foreground text-sm text-center mt-2">Faça login para acessar</Text>
          <Link href="/(auth)/sign-in" asChild>
            <Button className="mt-4"><ButtonText>Entrar</ButtonText></Button>
          </Link>
        </Card>
      </Unauthenticated>
      <AuthLoading>
        <View className="flex-1 items-center justify-center"><ActivityIndicator size="large" /></View>
      </AuthLoading>
    </Container>
  );
}

function RelatoriosContent() {
  const [activeTab, setActiveTab] = useState<Tab>("fluxo");
  const [datePreset, setDatePreset] = useState("month");
  const [agingTipo, setAgingTipo] = useState<"pagar" | "receber">("pagar");
  const [categoriaTipo, setCategoriaTipo] = useState<"despesas" | "receitas">("despesas");

  const dateRange = useMemo(() => getDateRange(datePreset), [datePreset]);

  return (
    <View className="gap-4">
      <View>
        <Text className="text-2xl font-bold text-foreground">Relatórios Financeiros</Text>
        <Text className="text-muted-foreground text-sm">Análise detalhada das finanças</Text>
      </View>

      {/* Tab Selector */}
      <View className="flex-row flex-wrap gap-2">
        {TAB_OPTIONS.map((tab) => (
          <Pressable
            key={tab.value}
            onPress={() => setActiveTab(tab.value)}
            className={`px-4 py-2 rounded-full ${activeTab === tab.value ? "bg-primary" : "bg-card border border-border"}`}
          >
            <Text className={`text-sm font-medium ${activeTab === tab.value ? "text-primary-foreground" : "text-foreground"}`}>
              {tab.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Date Preset Buttons (for tabs that need date range) */}
      {(activeTab === "fluxo" || activeTab === "dre" || activeTab === "categoria") && (
        <View className="flex-row gap-2">
          {[
            { label: "Este Mês", value: "month" },
            { label: "Este Ano", value: "year" },
            { label: "Últimos 3 Meses", value: "3months" },
          ].map((preset) => (
            <Pressable
              key={preset.value}
              onPress={() => setDatePreset(preset.value)}
              className={`px-3 py-1.5 rounded-lg ${datePreset === preset.value ? "bg-primary" : "bg-card border border-border"}`}
            >
              <Text className={`text-xs font-medium ${datePreset === preset.value ? "text-primary-foreground" : "text-foreground"}`}>
                {preset.label}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {activeTab === "fluxo" && <FluxoCaixa dataInicio={dateRange.start} dataFim={dateRange.end} />}
      {activeTab === "dre" && <DREReport dataInicio={dateRange.start} dataFim={dateRange.end} />}
      {activeTab === "aging" && (
        <View className="gap-4">
          <View className="flex-row gap-2">
            <Pressable
              onPress={() => setAgingTipo("pagar")}
              className={`px-4 py-2 rounded-lg ${agingTipo === "pagar" ? "bg-red-500" : "bg-card border border-border"}`}
            >
              <Text className={`text-sm font-medium ${agingTipo === "pagar" ? "text-white" : "text-foreground"}`}>A Pagar</Text>
            </Pressable>
            <Pressable
              onPress={() => setAgingTipo("receber")}
              className={`px-4 py-2 rounded-lg ${agingTipo === "receber" ? "bg-emerald-500" : "bg-card border border-border"}`}
            >
              <Text className={`text-sm font-medium ${agingTipo === "receber" ? "text-white" : "text-foreground"}`}>A Receber</Text>
            </Pressable>
          </View>
          <AgingReport tipo={agingTipo} />
        </View>
      )}
      {activeTab === "categoria" && (
        <View className="gap-4">
          <View className="flex-row gap-2">
            <Pressable
              onPress={() => setCategoriaTipo("despesas")}
              className={`px-4 py-2 rounded-lg ${categoriaTipo === "despesas" ? "bg-red-500" : "bg-card border border-border"}`}
            >
              <Text className={`text-sm font-medium ${categoriaTipo === "despesas" ? "text-white" : "text-foreground"}`}>Despesas</Text>
            </Pressable>
            <Pressable
              onPress={() => setCategoriaTipo("receitas")}
              className={`px-4 py-2 rounded-lg ${categoriaTipo === "receitas" ? "bg-emerald-500" : "bg-card border border-border"}`}
            >
              <Text className={`text-sm font-medium ${categoriaTipo === "receitas" ? "text-white" : "text-foreground"}`}>Receitas</Text>
            </Pressable>
          </View>
          <CategoriaReport dataInicio={dateRange.start} dataFim={dateRange.end} tipo={categoriaTipo} />
        </View>
      )}
    </View>
  );
}

function FluxoCaixa({ dataInicio, dataFim }: { dataInicio: number; dataFim: number }) {
  const data = useQuery(api.relatorios.fluxoDeCaixa, { dataInicio, dataFim });

  if (!data) return <ActivityIndicator className="py-8" />;

  const maxValue = Math.max(
    ...data.periodos.map((p) => Math.max(p.entradas, p.saidas)),
    1,
  );

  return (
    <View className="gap-4">
      {/* Summary Cards */}
      <View className="flex-row flex-wrap gap-3">
        <SummaryCard
          title="Entradas"
          value={formatCurrency(data.totalEntradas)}
          icon={<ArrowDownToLine size={16} color="#10b981" />}
          color="#10b981"
        />
        <SummaryCard
          title="Saídas"
          value={formatCurrency(data.totalSaidas)}
          icon={<ArrowUpFromLine size={16} color="#ef4444" />}
          color="#ef4444"
        />
        <SummaryCard
          title="Saldo"
          value={formatCurrency(data.saldoTotal)}
          icon={<DollarSign size={16} color={data.saldoTotal >= 0 ? "#10b981" : "#ef4444"} />}
          color={data.saldoTotal >= 0 ? "#10b981" : "#ef4444"}
        />
      </View>

      {/* Period Table with Visual Bars */}
      <Card>
        <CardHeader>
          <CardTitle>Fluxo por Período</CardTitle>
          <CardDescription>{data.periodos.length} períodos</CardDescription>
        </CardHeader>
        <CardContent>
          {data.periodos.length === 0 ? (
            <Text className="text-muted-foreground text-center py-4">Sem dados no período</Text>
          ) : (
            <View className="gap-4">
              {data.periodos.map((p) => (
                <View key={p.periodo} className="gap-2">
                  <View className="flex-row items-center justify-between">
                    <Text className="text-sm font-medium text-foreground">{p.periodo}</Text>
                    <Text className={`text-sm font-bold ${p.saldo >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                      {formatCurrency(p.saldo)}
                    </Text>
                  </View>
                  {/* Entradas bar */}
                  <View className="flex-row items-center gap-2">
                    <Text className="text-xs text-muted-foreground w-12">Entr.</Text>
                    <View className="flex-1 h-4 rounded-full bg-gray-100 overflow-hidden">
                      <View
                        className="h-full rounded-full bg-emerald-500"
                        style={{ width: `${(p.entradas / maxValue) * 100}%` }}
                      />
                    </View>
                    <Text className="text-xs text-emerald-600 w-24 text-right">{formatCurrency(p.entradas)}</Text>
                  </View>
                  {/* Saidas bar */}
                  <View className="flex-row items-center gap-2">
                    <Text className="text-xs text-muted-foreground w-12">Saíd.</Text>
                    <View className="flex-1 h-4 rounded-full bg-gray-100 overflow-hidden">
                      <View
                        className="h-full rounded-full bg-red-500"
                        style={{ width: `${(p.saidas / maxValue) * 100}%` }}
                      />
                    </View>
                    <Text className="text-xs text-red-600 w-24 text-right">{formatCurrency(p.saidas)}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </CardContent>
      </Card>
    </View>
  );
}

function DREReport({ dataInicio, dataFim }: { dataInicio: number; dataFim: number }) {
  const data = useQuery(api.relatorios.dre, { dataInicio, dataFim });

  if (!data) return <ActivityIndicator className="py-8" />;

  return (
    <View className="gap-4">
      {/* Summary */}
      <View className="flex-row flex-wrap gap-3">
        <SummaryCard title="Receitas" value={formatCurrency(data.totalReceitas)} icon={<TrendingUp size={16} color="#10b981" />} color="#10b981" />
        <SummaryCard title="Despesas" value={formatCurrency(data.totalDespesas)} icon={<TrendingDown size={16} color="#ef4444" />} color="#ef4444" />
        <SummaryCard
          title="Resultado"
          value={formatCurrency(data.resultado)}
          icon={<DollarSign size={16} color={data.resultado >= 0 ? "#10b981" : "#ef4444"} />}
          color={data.resultado >= 0 ? "#10b981" : "#ef4444"}
        />
        <SummaryCard
          title="Margem"
          value={`${data.margemPercentual}%`}
          icon={<BarChart3 size={16} color="#3b82f6" />}
          color="#3b82f6"
        />
      </View>

      {/* Receitas by Category */}
      <Card>
        <CardHeader>
          <CardTitle>Receitas por Categoria</CardTitle>
        </CardHeader>
        <CardContent>
          {data.receitas.length === 0 ? (
            <Text className="text-muted-foreground text-center py-4">Sem receitas no período</Text>
          ) : (
            <View className="gap-3">
              {data.receitas.map((r, i) => (
                <View key={i} className="flex-row items-center justify-between rounded-lg border border-border p-3">
                  <View className="flex-1">
                    <Text className="text-foreground font-medium">{r.nome}</Text>
                    <Text className="text-muted-foreground text-xs">{r.count} lançamentos</Text>
                  </View>
                  <Text className="text-emerald-600 font-bold">{formatCurrency(r.total)}</Text>
                </View>
              ))}
            </View>
          )}
        </CardContent>
      </Card>

      {/* Despesas by Category */}
      <Card>
        <CardHeader>
          <CardTitle>Despesas por Categoria</CardTitle>
        </CardHeader>
        <CardContent>
          {data.despesas.length === 0 ? (
            <Text className="text-muted-foreground text-center py-4">Sem despesas no período</Text>
          ) : (
            <View className="gap-3">
              {data.despesas.map((d, i) => (
                <View key={i} className="flex-row items-center justify-between rounded-lg border border-border p-3">
                  <View className="flex-1">
                    <Text className="text-foreground font-medium">{d.nome}</Text>
                    <Text className="text-muted-foreground text-xs">{d.count} lançamentos</Text>
                  </View>
                  <Text className="text-red-600 font-bold">{formatCurrency(d.total)}</Text>
                </View>
              ))}
            </View>
          )}
        </CardContent>
      </Card>
    </View>
  );
}

function AgingReport({ tipo }: { tipo: "pagar" | "receber" }) {
  const data = useQuery(api.relatorios.aging, { tipo });

  if (!data) return <ActivityIndicator className="py-8" />;

  const total = data.reduce((s, f) => s + f.total, 0);
  const maxTotal = Math.max(...data.map((f) => f.total), 1);

  const barColors = ["#3b82f6", "#f59e0b", "#f97316", "#ef4444", "#dc2626"];

  return (
    <View className="gap-4">
      {/* Stacked bar visualization */}
      <Card>
        <CardHeader>
          <CardTitle>Aging - {tipo === "pagar" ? "Contas a Pagar" : "Contas a Receber"}</CardTitle>
          <CardDescription>Total: {formatCurrency(total)}</CardDescription>
        </CardHeader>
        <CardContent>
          {total === 0 ? (
            <Text className="text-muted-foreground text-center py-4">Sem dados</Text>
          ) : (
            <>
              {/* Stacked bar */}
              <View className="flex-row h-8 rounded-full overflow-hidden mb-4">
                {data.map((faixa, i) => {
                  const width = total > 0 ? (faixa.total / total) * 100 : 0;
                  if (width === 0) return null;
                  return (
                    <View
                      key={faixa.faixa}
                      style={{ width: `${width}%`, backgroundColor: barColors[i] ?? "#9ca3af" }}
                      className="h-full"
                    />
                  );
                })}
              </View>

              {/* Faixa table */}
              <View className="gap-3">
                {data.map((faixa, i) => (
                  <View key={faixa.faixa} className="gap-2">
                    <View className="flex-row items-center justify-between">
                      <View className="flex-row items-center gap-2">
                        <View className="w-3 h-3 rounded-full" style={{ backgroundColor: barColors[i] ?? "#9ca3af" }} />
                        <Text className="text-sm text-foreground font-medium">{faixa.faixa}</Text>
                      </View>
                      <View className="flex-row items-center gap-3">
                        <Badge variant="outline">{faixa.count}</Badge>
                        <Text className="text-sm font-bold text-foreground">{formatCurrency(faixa.total)}</Text>
                      </View>
                    </View>
                    <View className="flex-1 h-3 rounded-full bg-gray-100 overflow-hidden">
                      <View
                        className="h-full rounded-full"
                        style={{
                          width: `${(faixa.total / maxTotal) * 100}%`,
                          backgroundColor: barColors[i] ?? "#9ca3af",
                        }}
                      />
                    </View>
                  </View>
                ))}
              </View>
            </>
          )}
        </CardContent>
      </Card>
    </View>
  );
}

function CategoriaReport({
  dataInicio,
  dataFim,
  tipo,
}: {
  dataInicio: number;
  dataFim: number;
  tipo: "despesas" | "receitas";
}) {
  const data = useQuery(api.relatorios.porCategoria, { dataInicio, dataFim, tipo });

  if (!data) return <ActivityIndicator className="py-8" />;

  const maxTotal = Math.max(...data.categorias.map((c) => c.total), 1);
  const barColor = tipo === "despesas" ? "#ef4444" : "#10b981";

  return (
    <View className="gap-4">
      <Card>
        <CardHeader>
          <CardTitle>{tipo === "despesas" ? "Despesas" : "Receitas"} por Categoria</CardTitle>
          <CardDescription>Total: {formatCurrency(data.total)}</CardDescription>
        </CardHeader>
        <CardContent>
          {data.categorias.length === 0 ? (
            <Text className="text-muted-foreground text-center py-4">Sem dados no período</Text>
          ) : (
            <View className="gap-4">
              {data.categorias.map((cat, i) => (
                <View key={i} className="gap-2">
                  <View className="flex-row items-center justify-between">
                    <Text className="text-sm text-foreground font-medium flex-1">{cat.nome}</Text>
                    <View className="flex-row items-center gap-2">
                      <Badge variant="outline">{cat.percentual}%</Badge>
                      <Text className="text-sm font-bold" style={{ color: barColor }}>{formatCurrency(cat.total)}</Text>
                    </View>
                  </View>
                  {/* Horizontal bar */}
                  <View className="h-4 rounded-full bg-gray-100 overflow-hidden">
                    <View
                      className="h-full rounded-full"
                      style={{
                        width: `${(cat.total / maxTotal) * 100}%`,
                        backgroundColor: barColor,
                      }}
                    />
                  </View>
                  <Text className="text-xs text-muted-foreground">{cat.count} lançamentos</Text>
                </View>
              ))}
            </View>
          )}
        </CardContent>
      </Card>
    </View>
  );
}

function SummaryCard({ title, value, icon, color }: { title: string; value: string; icon: React.ReactNode; color: string }) {
  return (
    <Card className="rounded-xl" style={{ width: "48%" }}>
      <CardContent className="p-3">
        <View className="flex-row items-center gap-2">
          <View className="w-8 h-8 rounded-lg items-center justify-center" style={{ backgroundColor: color + "15" }}>
            {icon}
          </View>
          <View className="flex-1">
            <Text className="text-xs text-muted-foreground">{title}</Text>
            <Text className="text-base font-bold text-foreground" numberOfLines={1}>{value}</Text>
          </View>
        </View>
      </CardContent>
    </Card>
  );
}
