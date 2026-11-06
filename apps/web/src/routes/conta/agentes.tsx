import { api } from "@rlpapp/backend/convex/_generated/api";
import { can } from "@rlpapp/shared/auth/permissions";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { Activity, Bot, KeyRound, Plus } from "lucide-react";
import { useState } from "react";

import { AuthShell } from "@/components/auth-shell";
import { AdminTokensCard } from "@/components/conta/agentes/admin-tokens-card";
import { cardCls, tokenStatus, type TokenRow } from "@/components/conta/agentes/agent-tokens";
import { CallsTable } from "@/components/conta/agentes/calls-table";
import {
  ConnectionSnippets,
  apiBaseUrl,
  useMcpUrl,
} from "@/components/conta/agentes/connection-snippets";
import { CreateTokenDialog } from "@/components/conta/agentes/create-token-dialog";
import { MyTokensList } from "@/components/conta/agentes/my-tokens-list";
import { RenameTokenDialog } from "@/components/conta/agentes/rename-token-dialog";
import { RevokeTokenDialog } from "@/components/conta/agentes/revoke-token-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const Route = createFileRoute("/conta/agentes")({
  component: AgentesPage,
});

function AgentesPage() {
  return (
    <AuthShell>
      <AgentesContent />
    </AuthShell>
  );
}

function AgentesContent() {
  const currentUser = useQuery(api.users.getCurrentUser);
  const tokens = useQuery(api.agentTokens.list);
  const calls = useQuery(api.agentTokens.listMyCalls, { limit: 30 });
  const [createOpen, setCreateOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<TokenRow | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<{
    _id: Id<"agentTokens">;
    name: string;
  } | null>(null);
  const mcpUrl = useMcpUrl();

  const isAdmin = can(currentUser, "admin.manage");
  const activeCount = tokens?.filter((t) => tokenStatus(t) === "active").length ?? 0;

  // Tokens são só para a equipe interna (mesma regra de `staffQuery`):
  // qr_operator e cliente do portal veem um aviso em vez de erros.
  if (currentUser && !currentUser.isStaff) {
    return (
      <div className="mx-auto max-w-2xl py-12 text-center">
        <Bot className="mx-auto size-8 text-slate-400" />
        <h1 className="mt-3 text-xl font-semibold">Agentes (MCP)</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Tokens de agente estão disponíveis apenas para usuários internos da
          RLP.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Bot className="size-6 text-slate-500" />
            Agentes (MCP)
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Conecte Claude, Cursor ou qualquer cliente MCP ao sistema com um
            token de agente. O token age em seu nome, com as suas permissões, e
            pode ser revogado a qualquer momento.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" />
          Novo token
        </Button>
      </div>

      <Card className={cardCls}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="size-4 text-slate-500" />
            Meus tokens
          </CardTitle>
          <CardDescription>
            Só o prefixo fica visível. O token completo aparece uma única vez,
            na criação. Os marcados &ldquo;App desktop&rdquo; foram criados ao
            entrar no RLP Takeoff com esta conta; revogar desconecta aquele
            computador.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MyTokensList
            tokens={tokens}
            onRename={setRenameTarget}
            onRevoke={setRevokeTarget}
          />
        </CardContent>
      </Card>

      <Card className={cardCls}>
        <CardHeader>
          <CardTitle>Como conectar</CardTitle>
          <CardDescription>
            Agentes podem chamar qualquer função pública pela API HTTP em{" "}
            <code className="font-mono">{apiBaseUrl()}</code> ou usar o servidor
            MCP em <code className="font-mono">{mcpUrl}</code>. Nos dois casos o
            token vai em <code className="font-mono">Authorization: Bearer</code>
            {activeCount === 0 && " — crie um token acima para começar"}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ConnectionSnippets mcpUrl={mcpUrl} token="rlp_SEU_TOKEN" />
          <p className="text-xs text-muted-foreground">
            Tokens somente leitura só enxergam ferramentas de consulta. Tokens
            com acesso total também criam e alteram registros, sempre dentro
            do que o seu cargo e departamento permitem no sistema.
          </p>
        </CardContent>
      </Card>

      <Card className={cardCls}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="size-4 text-slate-500" />
            Atividade recente
          </CardTitle>
          <CardDescription>
            Últimas chamadas de ferramentas feitas com os seus tokens.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CallsTable calls={calls} />
        </CardContent>
      </Card>

      {isAdmin && <AdminTokensCard onRevoke={setRevokeTarget} />}

      <CreateTokenDialog
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        mcpUrl={mcpUrl}
      />
      <RenameTokenDialog target={renameTarget} onClose={() => setRenameTarget(null)} />
      <RevokeTokenDialog target={revokeTarget} onClose={() => setRevokeTarget(null)} />
    </div>
  );
}
