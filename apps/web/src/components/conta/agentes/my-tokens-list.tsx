import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { Loader2, Pencil, ShieldOff } from "lucide-react";

import {
  formatShortMonthDate,
  formatRelative,
  tokenStatus,
  type TokenRow,
} from "@/components/conta/agentes/agent-tokens";
import {
  DeviceBadge,
  PermissionBadge,
  StatusBadge,
} from "@/components/conta/agentes/token-badges";
import { Button } from "@/components/ui/button";

/** Lista "Meus tokens": só o prefixo de cada token fica visível. */
export function MyTokensList({
  tokens,
  onRename,
  onRevoke,
}: {
  tokens: TokenRow[] | undefined;
  onRename: (token: TokenRow) => void;
  onRevoke: (target: { _id: Id<"agentTokens">; name: string }) => void;
}) {
  return tokens === undefined ? (
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
                <DeviceBadge kind={token.kind} />
                <PermissionBadge permission={token.permission} />
                {inactive && <StatusBadge status={status} />}
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono">
                  {token.tokenPrefix}…
                </code>
                <span>Criado em {formatShortMonthDate(token.createdAt)}</span>
                <span>
                  {token.lastUsedAt !== undefined
                    ? `Último uso ${formatRelative(token.lastUsedAt)}`
                    : "Nunca usado"}
                </span>
                {token.expiresAt !== undefined && status !== "revoked" && (
                  <span>
                    {status === "expired" ? "Expirou em" : "Expira em"}{" "}
                    {formatShortMonthDate(token.expiresAt)}
                  </span>
                )}
              </div>
            </div>
            {!inactive && (
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onRename(token)}
                >
                  <Pencil className="size-3.5" />
                  Renomear
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() =>
                    onRevoke({ _id: token._id, name: token.name })
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
  );
}
