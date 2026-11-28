import {
  DEFAULT_TAKEOFF_AGENT_MODEL,
  isTakeoffAgentModelId,
  MAX_AGENT_INSTRUCTIONS_EXTRA_LEN,
  MAX_AGENT_TOKENS_PER_TURN,
  MAX_AGENT_TURNS_PER_RUN,
  MIN_AGENT_TOKENS_PER_TURN,
  MIN_AGENT_TURNS_PER_RUN,
  TAKEOFF_AGENT_EFFORTS,
  TAKEOFF_AGENT_MODELS,
  type TakeoffAgentEffort,
  type TakeoffAgentSettings,
} from "@rlpapp/shared/takeoff/agentModels";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const EFFORT_LABELS: Record<TakeoffAgentEffort, string> = {
  low: "Baixo (mais rápido e econômico)",
  medium: "Médio (equilibrado)",
  high: "Alto (melhor leitura de plantas complexas)",
};

export interface AiSettingsDraft {
  enabled: boolean;
  model: string;
  effort: TakeoffAgentEffort;
  companyBudgetUsd: string;
  userBudgetUsd: string;
  maxTurnsPerRun: string;
  maxTokensPerTurn: string;
  promptVersion: string;
  instructionsExtra: string;
}

export function settingsToDraft(s: {
  enabled: boolean;
  model: string;
  effort: TakeoffAgentEffort;
  monthlyCompanyBudgetUsdCents: number;
  monthlyUserBudgetUsdCents: number;
  maxTurnsPerRun: number;
  maxTokensPerTurn: number;
  promptVersion: string;
  instructionsExtra?: string;
}): AiSettingsDraft {
  return {
    enabled: s.enabled,
    model: isTakeoffAgentModelId(s.model) ? s.model : DEFAULT_TAKEOFF_AGENT_MODEL,
    effort: s.effort,
    companyBudgetUsd: (s.monthlyCompanyBudgetUsdCents / 100).toFixed(2),
    userBudgetUsd: (s.monthlyUserBudgetUsdCents / 100).toFixed(2),
    maxTurnsPerRun: String(s.maxTurnsPerRun),
    maxTokensPerTurn: String(s.maxTokensPerTurn),
    promptVersion: s.promptVersion,
    instructionsExtra: s.instructionsExtra ?? "",
  };
}

export function draftToSettings(d: AiSettingsDraft): TakeoffAgentSettings {
  const parseUsdCents = (raw: string) => {
    const n = Number(raw.replace(",", "."));
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : 0;
  };
  const parseIntClamped = (raw: string, min: number, max: number, fallback: number) => {
    const n = Math.round(Number(raw));
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  };
  const extra = d.instructionsExtra.trim();
  return {
    enabled: d.enabled,
    model: isTakeoffAgentModelId(d.model) ? d.model : DEFAULT_TAKEOFF_AGENT_MODEL,
    effort: d.effort,
    monthlyCompanyBudgetUsdCents: parseUsdCents(d.companyBudgetUsd),
    monthlyUserBudgetUsdCents: parseUsdCents(d.userBudgetUsd),
    maxTurnsPerRun: parseIntClamped(
      d.maxTurnsPerRun,
      MIN_AGENT_TURNS_PER_RUN,
      MAX_AGENT_TURNS_PER_RUN,
      60,
    ),
    maxTokensPerTurn: parseIntClamped(
      d.maxTokensPerTurn,
      MIN_AGENT_TOKENS_PER_TURN,
      MAX_AGENT_TOKENS_PER_TURN,
      8192,
    ),
    promptVersion: d.promptVersion.trim() || "v1",
    ...(extra ? { instructionsExtra: extra } : {}),
  };
}

function formatUpdatedAt(ts: number): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(ts));
}

export function AiSettingsCard({
  draft,
  meta,
  canWrite,
  onChange,
}: {
  draft: AiSettingsDraft;
  meta: { updatedAt: number; updatedBy: string | null } | null;
  canWrite: boolean;
  onChange: (next: AiSettingsDraft) => void;
}) {
  const patch = (partial: Partial<AiSettingsDraft>) => onChange({ ...draft, ...partial });

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <CardTitle>Política e limites do agente</CardTitle>
            <Badge variant={draft.enabled ? "default" : "secondary"}>
              {draft.enabled ? "Ativo" : "Desativado"}
            </Badge>
          </div>
          <CardDescription>
            As alterações valem imediatamente no proxy da empresa para todos os usuários com a
            permissão <code className="font-mono text-xs">takeoff.agente</code>.
          </CardDescription>
        </div>
        {meta && (
          <p className="text-xs text-muted-foreground">
            Atualizado em {formatUpdatedAt(meta.updatedAt)}
            {meta.updatedBy ? ` por ${meta.updatedBy}` : ""}
          </p>
        )}
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="flex items-start gap-3 rounded-lg border border-control-border bg-muted/30 p-3.5">
          <Checkbox
            id="ai-enabled"
            checked={draft.enabled}
            disabled={!canWrite}
            onCheckedChange={(checked) => patch({ enabled: checked === true })}
            className="mt-0.5"
          />
          <div className="space-y-0.5">
            <Label htmlFor="ai-enabled" className="cursor-pointer font-medium">
              Permitir uso do agente de IA embutido no RLP Takeoff
            </Label>
            <p className="text-xs text-muted-foreground">
              Desmarcar interrompe imediatamente novas chamadas no proxy (kill switch global).
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="ai-model">Modelo Anthropic</Label>
            <Select
              value={draft.model}
              disabled={!canWrite}
              onValueChange={(model) => patch({ model })}
            >
              <SelectTrigger id="ai-model">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TAKEOFF_AGENT_MODELS.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.label} — US$ {m.inputUsdPerMillion}/{m.outputUsdPerMillion} por 1M tokens
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ai-effort">Nível de raciocínio (effort)</Label>
            <Select
              value={draft.effort}
              disabled={!canWrite}
              onValueChange={(effort) => patch({ effort: effort as TakeoffAgentEffort })}
            >
              <SelectTrigger id="ai-effort">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TAKEOFF_AGENT_EFFORTS.map((e) => (
                  <SelectItem key={e} value={e}>
                    {EFFORT_LABELS[e]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="ai-company-budget">Orçamento mensal da empresa (US$)</Label>
            <Input
              id="ai-company-budget"
              type="number"
              min={0}
              step="1"
              disabled={!canWrite}
              value={draft.companyBudgetUsd}
              onChange={(e) => patch({ companyBudgetUsd: e.target.value })}
              className="text-right font-mono"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ai-user-budget">Orçamento mensal por usuário (US$)</Label>
            <Input
              id="ai-user-budget"
              type="number"
              min={0}
              step="1"
              disabled={!canWrite}
              value={draft.userBudgetUsd}
              onChange={(e) => patch({ userBudgetUsd: e.target.value })}
              className="text-right font-mono"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ai-max-turns">Máx. turnos por execução</Label>
            <Input
              id="ai-max-turns"
              type="number"
              min={MIN_AGENT_TURNS_PER_RUN}
              max={MAX_AGENT_TURNS_PER_RUN}
              step={1}
              disabled={!canWrite}
              value={draft.maxTurnsPerRun}
              onChange={(e) => patch({ maxTurnsPerRun: e.target.value })}
              className="text-right font-mono"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ai-max-tokens">Máx. tokens de saída / turno</Label>
            <Input
              id="ai-max-tokens"
              type="number"
              min={MIN_AGENT_TOKENS_PER_TURN}
              max={MAX_AGENT_TOKENS_PER_TURN}
              step={256}
              disabled={!canWrite}
              value={draft.maxTokensPerTurn}
              onChange={(e) => patch({ maxTokensPerTurn: e.target.value })}
              className="text-right font-mono"
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-4">
          <div className="space-y-1.5 sm:col-span-1">
            <Label htmlFor="ai-prompt-version">Versão do prompt</Label>
            <Input
              id="ai-prompt-version"
              disabled={!canWrite}
              value={draft.promptVersion}
              onChange={(e) => patch({ promptVersion: e.target.value })}
              placeholder="v1"
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              Registrada em cada execução para comparar taxa de aceite.
            </p>
          </div>

          <div className="space-y-1.5 sm:col-span-3">
            <Label htmlFor="ai-instructions-extra">Instruções adicionais da empresa (opcional)</Label>
            <Textarea
              id="ai-instructions-extra"
              rows={3}
              maxLength={MAX_AGENT_INSTRUCTIONS_EXTRA_LEN}
              disabled={!canWrite}
              value={draft.instructionsExtra}
              onChange={(e) => patch({ instructionsExtra: e.target.value })}
              placeholder="Ex.: Priorize nomear ambientes conforme a legenda do pavimento e agrupar splits por andar."
            />
            <p className="text-xs text-muted-foreground">
              Anexadas ao prompt padrão do agente sem precisar publicar uma nova versão do app desktop.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
