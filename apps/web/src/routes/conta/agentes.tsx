import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { createFileRoute } from "@tanstack/react-router";
import { useAction, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  Activity,
  Bot,
  Check,
  Copy,
  KeyRound,
  Loader2,
  Pencil,
  Plus,
  ShieldOff,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AuthShell } from "@/components/auth-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { getErrorMessage } from "@/lib/errors";

export const Route = createFileRoute("/conta/agentes")({
  component: AgentesPage,
});

type TokenRow = FunctionReturnType<typeof api.agentTokens.list>[number];
type AdminTokenRow = FunctionReturnType<typeof api.agentTokens.listAll>[number];
type CallRow = FunctionReturnType<typeof api.agentTokens.listMyCalls>[number];
type Permission = "full_access" | "read_only";

const EXPIRY_OPTIONS = [
  { value: "never", label: "Sem validade" },
  { value: "30", label: "30 dias" },
  { value: "90", label: "90 dias" },
  { value: "365", label: "1 ano" },
] as const;
type ExpiryOption = (typeof EXPIRY_OPTIONS)[number]["value"];

const cardCls = "rounded-2xl border border-slate-100 bg-white shadow-sm";

// Espelho de STAFF_ROLES em packages/backend/convex/lib/rbac.ts.
const STAFF_ROLES = ["director", "admin", "manager", "operator", "engenheiro"];

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(ts: number): string {
  return new Date(ts).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRelative(ts: number): string {
  const minutes = Math.round((Date.now() - ts) / 60_000);
  if (minutes < 1) return "agora há pouco";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.round(hours / 24);
  if (days < 30) return `há ${days} d`;
  return formatDate(ts);
}

function tokenStatus(token: {
  revokedAt?: number;
  expiresAt?: number;
}): "active" | "revoked" | "expired" {
  if (token.revokedAt !== undefined) return "revoked";
  if (token.expiresAt !== undefined && token.expiresAt <= Date.now()) {
    return "expired";
  }
  return "active";
}

/** URL do servidor MCP deste app (mesma origem da página). */
function useMcpUrl(): string {
  const [origin, setOrigin] = useState("https://<app>");
  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);
  return `${origin}/mcp`;
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(`${label} copiado`);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Não foi possível copiar");
    }
  };
  return (
    <Button
      type="button"
      variant="outline"
      size="icon-sm"
      onClick={handleCopy}
      aria-label={`Copiar ${label}`}
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
    </Button>
  );
}

function CodeBlock({ code, label }: { code: string; label: string }) {
  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-xl bg-slate-900 p-3 pr-12 text-xs leading-relaxed text-slate-100">
        <code>{code}</code>
      </pre>
      <div className="absolute right-2 top-2">
        <CopyButton value={code} label={label} />
      </div>
    </div>
  );
}

function PermissionBadge({ permission }: { permission: Permission }) {
  return permission === "full_access" ? (
    <Badge className="px-2 py-0.5 text-xs">Acesso total</Badge>
  ) : (
    <Badge variant="secondary" className="px-2 py-0.5 text-xs">
      Somente leitura
    </Badge>
  );
}

function StatusBadge({
  status,
}: {
  status: ReturnType<typeof tokenStatus>;
}) {
  if (status === "revoked") {
    return (
      <Badge variant="destructive" className="px-2 py-0.5 text-xs">
        Revogado
      </Badge>
    );
  }
  if (status === "expired") {
    return (
      <Badge variant="warning" className="px-2 py-0.5 text-xs">
        Expirado
      </Badge>
    );
  }
  return (
    <Badge variant="success" className="px-2 py-0.5 text-xs">
      Ativo
    </Badge>
  );
}

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

  const isAdmin =
    currentUser?.role === "director" || currentUser?.role === "admin";
  const activeCount = tokens?.filter((t) => tokenStatus(t) === "active").length ?? 0;

  // Tokens são só para a equipe interna (mesma regra de `staffQuery`):
  // qr_operator e cliente do portal veem um aviso em vez de erros.
  if (currentUser && !STAFF_ROLES.includes(currentUser.role)) {
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
            na criação.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {tokens === undefined ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Carregando…
            </div>
          ) : tokens.length === 0 ? (
            <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              Nenhum token ainda. Crie um para conectar um agente ao sistema.
            </div>
          ) : (
            <ul className="divide-y rounded-xl border">
              {tokens.map((token) => {
                const status = tokenStatus(token);
                const inactive = status !== "active";
                return (
                  <li
                    key={token._id}
                    className={`flex flex-col gap-2 p-3 md:flex-row md:items-center md:justify-between ${
                      inactive ? "opacity-60" : ""
                    }`}
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-medium">{token.name}</span>
                        <PermissionBadge permission={token.permission} />
                        {inactive && <StatusBadge status={status} />}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <code className="rounded bg-muted px-1.5 py-0.5 font-mono">
                          {token.tokenPrefix}…
                        </code>
                        <span>Criado em {formatDate(token.createdAt)}</span>
                        <span>
                          {token.lastUsedAt !== undefined
                            ? `Último uso ${formatRelative(token.lastUsedAt)}`
                            : "Nunca usado"}
                        </span>
                        {token.expiresAt !== undefined && status !== "revoked" && (
                          <span>
                            {status === "expired" ? "Expirou em" : "Expira em"}{" "}
                            {formatDate(token.expiresAt)}
                          </span>
                        )}
                      </div>
                    </div>
                    {!inactive && (
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setRenameTarget(token)}
                        >
                          <Pencil className="size-3.5" />
                          Renomear
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() =>
                            setRevokeTarget({ _id: token._id, name: token.name })
                          }
                        >
                          <ShieldOff className="size-3.5" />
                          Revogar
                        </Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className={cardCls}>
        <CardHeader>
          <CardTitle>Como conectar</CardTitle>
          <CardDescription>
            O servidor MCP fica em <code className="font-mono">{mcpUrl}</code>.
            Use o token como <code className="font-mono">Authorization: Bearer</code>
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

function ConnectionSnippets({ mcpUrl, token }: { mcpUrl: string; token: string }) {
  const [client, setClient] = useState<"claude-code" | "cursor" | "curl">(
    "claude-code"
  );
  const snippets = {
    "claude-code": `claude mcp add --transport http rlp ${mcpUrl} \\
  --header "Authorization: Bearer ${token}"`,
    cursor: JSON.stringify(
      {
        mcpServers: {
          rlp: { url: mcpUrl, headers: { Authorization: `Bearer ${token}` } },
        },
      },
      null,
      2
    ),
    curl: `curl ${mcpUrl} \\
  -H "Authorization: Bearer ${token}" \\
  -H "Content-Type: application/json" \\
  -H "Accept: application/json, text/event-stream" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`,
  } as const;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {(
          [
            ["claude-code", "Claude Code"],
            ["cursor", "Cursor / Claude Desktop (JSON)"],
            ["curl", "curl"],
          ] as const
        ).map(([value, label]) => (
          <Button
            key={value}
            type="button"
            size="xs"
            variant={client === value ? "default" : "outline"}
            onClick={() => setClient(value)}
          >
            {label}
          </Button>
        ))}
      </div>
      <CodeBlock code={snippets[client]} label="Configuração" />
    </div>
  );
}

function CallsTable({ calls }: { calls: CallRow[] | undefined }) {
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

function AdminTokensCard({
  onRevoke,
}: {
  onRevoke: (target: { _id: Id<"agentTokens">; name: string }) => void;
}) {
  const all = useQuery(api.agentTokens.listAll);
  return (
    <Card className={cardCls}>
      <CardHeader>
        <CardTitle>Todos os tokens</CardTitle>
        <CardDescription>
          Visão administrativa: tokens de todos os usuários. Revogue ao
          desligar alguém ou se um token vazar.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {all === undefined ? (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Carregando…
          </div>
        ) : all.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">Nenhum token criado.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Dono</TableHead>
                  <TableHead>Token</TableHead>
                  <TableHead>Permissão</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Último uso</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {all.map((token: AdminTokenRow) => {
                  const status = tokenStatus(token);
                  return (
                    <TableRow key={token._id}>
                      <TableCell>
                        <div className="text-sm font-medium">
                          {token.owner?.name ?? "—"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {token.owner?.email ?? token.owner?.username ?? ""}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{token.name}</div>
                        <code className="text-xs text-muted-foreground">
                          {token.tokenPrefix}…
                        </code>
                      </TableCell>
                      <TableCell>
                        <PermissionBadge permission={token.permission} />
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={status} />
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {token.lastUsedAt !== undefined
                          ? formatRelative(token.lastUsedAt)
                          : "Nunca"}
                      </TableCell>
                      <TableCell className="text-right">
                        {status === "active" && (
                          <Button
                            variant="destructive"
                            size="xs"
                            onClick={() =>
                              onRevoke({ _id: token._id, name: token.name })
                            }
                          >
                            Revogar
                          </Button>
                        )}
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
  );
}

// ----------------------------------------------------------------------------
// Criar
// ----------------------------------------------------------------------------

function CreateTokenDialog({
  isOpen,
  onClose,
  mcpUrl,
}: {
  isOpen: boolean;
  onClose: () => void;
  mcpUrl: string;
}) {
  const createToken = useAction(api.agentTokens.create);
  const [name, setName] = useState("");
  const [permission, setPermission] = useState<Permission>("read_only");
  const [expiry, setExpiry] = useState<ExpiryOption>("never");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [created, setCreated] = useState<{ token: string; name: string } | null>(
    null
  );

  const reset = () => {
    setName("");
    setPermission("read_only");
    setExpiry("never");
    setCreated(null);
    setIsSubmitting(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const result = await createToken({
        name,
        permission,
        expiresInDays: expiry === "never" ? undefined : Number(expiry),
      });
      setCreated({ token: result.token, name: result.name });
      toast.success("Token criado");
    } catch (error) {
      toast.error(getErrorMessage(error, "Erro ao criar token"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-lg">
        {created ? (
          <>
            <DialogHeader>
              <DialogTitle>Guarde o seu token</DialogTitle>
              <DialogDescription>
                Esta é a única vez que{" "}
                <span className="font-medium">{created.name}</span> será
                mostrado. Guarde-o em local seguro; se perder, revogue e crie
                outro.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <code className="flex-1 overflow-x-auto rounded-md border bg-muted px-3 py-2 font-mono text-xs">
                  {created.token}
                </code>
                <CopyButton value={created.token} label="Token" />
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">
                  Conectar o agente
                </p>
                <ConnectionSnippets mcpUrl={mcpUrl} token={created.token} />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleClose}>Concluir</Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>Novo token de agente</DialogTitle>
              <DialogDescription>
                O token herda o seu cargo e departamento. Somente leitura
                consulta tudo o que você vê; acesso total também grava.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="token-name">Nome</Label>
                <Input
                  id="token-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex.: Claude no meu notebook"
                  maxLength={80}
                  required
                  autoFocus
                />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label>Permissão</Label>
                  <Select
                    value={permission}
                    onValueChange={(v) => setPermission(v as Permission)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="read_only">Somente leitura</SelectItem>
                      <SelectItem value="full_access">Acesso total</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Validade</Label>
                  <Select
                    value={expiry}
                    onValueChange={(v) => setExpiry(v as ExpiryOption)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {EXPIRY_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={isSubmitting}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting || !name.trim()}>
                {isSubmitting && <Loader2 className="size-3.5 animate-spin" />}
                Criar token
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ----------------------------------------------------------------------------
// Renomear
// ----------------------------------------------------------------------------

function RenameTokenDialog({
  target,
  onClose,
}: {
  target: TokenRow | null;
  onClose: () => void;
}) {
  const renameToken = useMutation(api.agentTokens.rename);
  const [name, setName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [seededFor, setSeededFor] = useState<Id<"agentTokens"> | null>(null);
  if (!target && seededFor !== null) {
    // Fechou (ou cancelou): a próxima abertura volta a usar o nome atual.
    setSeededFor(null);
  } else if (target && seededFor !== target._id) {
    setSeededFor(target._id);
    setName(target.name);
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!target) return;
    setIsSubmitting(true);
    try {
      await renameToken({ id: target._id, name });
      toast.success("Token renomeado");
      onClose();
    } catch (error) {
      toast.error(getErrorMessage(error, "Erro ao renomear token"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Renomear token</DialogTitle>
            <DialogDescription>
              Só o nome muda. O token em si continua o mesmo.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 py-4">
            <Label htmlFor="token-rename">Nome</Label>
            <Input
              id="token-rename"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              required
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting || !name.trim()}>
              {isSubmitting && <Loader2 className="size-3.5 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ----------------------------------------------------------------------------
// Revogar
// ----------------------------------------------------------------------------

function RevokeTokenDialog({
  target,
  onClose,
}: {
  target: { _id: Id<"agentTokens">; name: string } | null;
  onClose: () => void;
}) {
  const revokeToken = useMutation(api.agentTokens.revoke);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleRevoke = async () => {
    if (!target) return;
    setIsSubmitting(true);
    try {
      await revokeToken({ id: target._id });
      toast.success(`Token "${target.name}" revogado`);
      onClose();
    } catch (error) {
      toast.error(getErrorMessage(error, "Erro ao revogar token"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Revogar &ldquo;{target?.name}&rdquo;?</DialogTitle>
          <DialogDescription>
            Toda conexão que usa este token passa a ser recusada imediatamente.
            Não dá para desfazer.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => void handleRevoke()}
            disabled={isSubmitting}
          >
            {isSubmitting && <Loader2 className="size-3.5 animate-spin" />}
            Revogar token
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
