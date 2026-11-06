import { ROLE_LABELS, type Role } from "@rlpapp/shared/auth/permissions";

import { isPendingInvite, type User } from "@/components/configuracoes/usuarios/admin-user";
import { Badge } from "@/components/ui/badge";

export function UserStatusBadge({
  user,
}: {
  user: Pick<User, "isActive" | "clerkId" | "invitedAt">;
}) {
  if (!user.isActive) return <Badge variant="muted">Inativo</Badge>;
  if (isPendingInvite(user)) return <Badge variant="warning">Convite pendente</Badge>;
  return <Badge variant="success">Ativo</Badge>;
}

export function RoleBadges({ roles, adjustments }: { roles: Role[]; adjustments: number }) {
  if (roles.length === 0 && adjustments === 0) {
    return <span className="text-sm text-muted-foreground">Sem acessos</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {roles.map((role) => (
        <Badge key={role} variant="outline">
          {ROLE_LABELS[role]}
        </Badge>
      ))}
      {adjustments > 0 && (
        <Badge variant="info" title="Permissões individuais ajustadas">
          {adjustments} ajuste{adjustments === 1 ? "" : "s"}
        </Badge>
      )}
    </div>
  );
}
