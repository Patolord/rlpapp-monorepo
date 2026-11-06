import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { formatUsername } from "@rlpapp/shared";
import { useQuery } from "convex/react";
import { Loader2 } from "lucide-react";

import {
  cardCls,
  formatRelative,
  tokenStatus,
  type AdminTokenRow,
} from "@/components/conta/agentes/agent-tokens";
import {
  DeviceBadge,
  PermissionBadge,
  StatusBadge,
} from "@/components/conta/agentes/token-badges";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function AdminTokensCard({
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
                          {token.owner?.email ?? (token.owner?.username ? formatUsername(token.owner.username) : "")}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{token.name}</div>
                        <code className="text-xs text-muted-foreground">
                          {token.tokenPrefix}…
                        </code>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          <PermissionBadge permission={token.permission} />
                          <DeviceBadge kind={token.kind} />
                        </div>
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
