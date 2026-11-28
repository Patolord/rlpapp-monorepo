import type { api } from "@rlpapp/backend/convex/_generated/api";
import {
  findTakeoffAgentModel,
  formatUsdFromCents,
  formatUsdFromMicroUsd,
  usdCentsToMicroUsd,
} from "@rlpapp/shared/takeoff/agentModels";
import type { FunctionReturnType } from "convex/server";

import { Badge } from "@/components/ui/badge";
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

export type TakeoffAgentDashboardData = FunctionReturnType<typeof api.takeoffAgent.getDashboard>;

const STATUS_BADGE: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  running: { label: "Em andamento", variant: "secondary" },
  completed: { label: "Concluída", variant: "default" },
  aborted: { label: "Interrompida", variant: "outline" },
  error: { label: "Erro", variant: "destructive" },
};

function formatDateTimeBrt(ts: number): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(ts));
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2).replace(".", ",")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(".", ",")}k`;
  return String(n);
}

function formatAcceptanceRate(accepted: number, edited: number, rejected: number): string {
  const reviewed = accepted + edited + rejected;
  if (reviewed === 0) return "—";
  return `${Math.round((accepted / reviewed) * 100)}%`;
}

export function recentMonthOptions(currentMonth: string, count = 6): string[] {
  const [yStr, mStr] = currentMonth.split("-");
  let year = Number(yStr);
  let month = Number(mStr);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return [currentMonth];
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    out.push(`${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`);
    month -= 1;
    if (month < 1) {
      month = 12;
      year -= 1;
    }
  }
  return out;
}

export function AiUsageSection({
  data,
  selectedMonth,
  monthOptions,
  onSelectMonth,
}: {
  data: TakeoffAgentDashboardData;
  selectedMonth: string;
  monthOptions: string[];
  onSelectMonth: (month: string) => void;
}) {
  const { totals, settings, byUser, recentRuns } = data;
  const companyBudgetMicro = usdCentsToMicroUsd(settings.monthlyCompanyBudgetUsdCents);
  const budgetPct =
    companyBudgetMicro > 0 ? Math.min(100, Math.round((totals.costMicroUsd / companyBudgetMicro) * 100)) : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Uso e revisão</h2>
          <p className="text-xs text-muted-foreground">
            Custos estimados pelo ledger do proxy e aceitação das sugestões revisadas no app desktop.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Mês (Brasília):</span>
          <Select value={selectedMonth} onValueChange={onSelectMonth}>
            <SelectTrigger className="w-36 font-mono">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {monthOptions.map((m) => (
                <SelectItem key={m} value={m} className="font-mono">
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Gasto no mês</CardDescription>
            <CardTitle className="font-mono text-2xl">
              {formatUsdFromMicroUsd(totals.costMicroUsd)}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-xs text-muted-foreground">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${budgetPct}%` }}
              />
            </div>
            <p>
              {budgetPct}% do limite de {formatUsdFromCents(settings.monthlyCompanyBudgetUsdCents)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Execuções e turnos</CardDescription>
            <CardTitle className="font-mono text-2xl">{totals.runs}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {totals.turns} {totals.turns === 1 ? "turno de modelo" : "turnos de modelo"} no período
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Tokens processados</CardDescription>
            <CardTitle className="font-mono text-2xl">
              {formatTokens(totals.inputTokens + totals.outputTokens + totals.cacheReadTokens)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Entrada {formatTokens(totals.inputTokens)} · Saída {formatTokens(totals.outputTokens)} ·
            Cache {formatTokens(totals.cacheReadTokens)}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Aceite sem edição</CardDescription>
            <CardTitle className="font-mono text-2xl">
              {formatAcceptanceRate(totals.acceptedCount, totals.editedCount, totals.rejectedCount)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {totals.acceptedCount} aceitas · {totals.editedCount} editadas · {totals.rejectedCount}{" "}
            descartadas
          </CardContent>
        </Card>
      </div>

      {/* Per-user table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Uso por usuário ({data.month})</CardTitle>
          <CardDescription>
            Limite individual atual: {formatUsdFromCents(settings.monthlyUserBudgetUsdCents)} / mês.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {byUser.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhuma execução registrada neste mês.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Usuário</TableHead>
                    <TableHead className="text-right">Execuções</TableHead>
                    <TableHead className="text-right">Turnos</TableHead>
                    <TableHead className="text-right">Custo</TableHead>
                    <TableHead className="text-right">Revisão (A / E / D)</TableHead>
                    <TableHead className="text-right">Aceite</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byUser.map((u) => (
                    <TableRow key={u.userId}>
                      <TableCell className="font-medium">{u.userName}</TableCell>
                      <TableCell className="text-right font-mono">{u.runs}</TableCell>
                      <TableCell className="text-right font-mono">{u.turns}</TableCell>
                      <TableCell className="text-right font-mono">
                        {formatUsdFromMicroUsd(u.costMicroUsd)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs text-muted-foreground">
                        {u.acceptedCount} / {u.editedCount} / {u.rejectedCount}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatAcceptanceRate(u.acceptedCount, u.editedCount, u.rejectedCount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent runs table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Execuções recentes ({data.month})</CardTitle>
          <CardDescription>Últimas {recentRuns.length} execuções do período.</CardDescription>
        </CardHeader>
        <CardContent>
          {recentRuns.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhuma execução neste mês.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Início (BRT)</TableHead>
                    <TableHead>Usuário</TableHead>
                    <TableHead>Takeoff</TableHead>
                    <TableHead>Modelo</TableHead>
                    <TableHead className="text-right">Turnos</TableHead>
                    <TableHead className="text-right">Custo</TableHead>
                    <TableHead className="text-right">Revisão</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentRuns.map((run) => {
                    const badge = STATUS_BADGE[run.status] ?? {
                      label: run.status,
                      variant: "outline" as const,
                    };
                    const modelLabel = findTakeoffAgentModel(run.model)?.label ?? run.model;
                    return (
                      <TableRow key={run.id}>
                        <TableCell className="whitespace-nowrap font-mono text-xs">
                          {formatDateTimeBrt(run.startedAt)}
                        </TableCell>
                        <TableCell>{run.userName}</TableCell>
                        <TableCell className="max-w-48 truncate" title={run.takeoffName ?? undefined}>
                          {run.takeoffName ?? "—"}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs">
                          {modelLabel}{" "}
                          <span className="font-mono text-muted-foreground">
                            ({run.promptVersion})
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-mono">{run.turns}</TableCell>
                        <TableCell className="text-right font-mono">
                          {formatUsdFromMicroUsd(run.costMicroUsd)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs text-muted-foreground">
                          {run.reviewStats
                            ? `${run.reviewStats.accepted}/${run.reviewStats.edited}/${run.reviewStats.rejected}`
                            : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={badge.variant}
                            title={run.errorMessage ?? undefined}
                          >
                            {badge.label}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
