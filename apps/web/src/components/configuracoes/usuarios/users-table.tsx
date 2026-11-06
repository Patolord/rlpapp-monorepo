import { formatDate, formatDisplayName, formatUsername } from "@rlpapp/shared";
import { MailX, Pencil, UserX } from "lucide-react";

import { isPendingInvite, type User } from "@/components/configuracoes/usuarios/admin-user";
import { RoleBadges, UserStatusBadge } from "@/components/configuracoes/usuarios/user-badges";
import {
  IconAction,
  ReactivateButton,
  ResendInviteButton,
} from "@/components/configuracoes/usuarios/user-row-actions";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { overridesCount } from "@/lib/permission-overrides";

export function UsersTable({
  users,
  currentUserId,
  onEdit,
  onDeactivate,
  onRevoke,
}: {
  users: User[];
  currentUserId: User["_id"];
  onEdit: (user: User) => void;
  onDeactivate: (user: User) => void;
  onRevoke: (user: User) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead>Login</TableHead>
            <TableHead>Acessos</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Último acesso</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => {
            const isSelf = user._id === currentUserId;
            const pending = isPendingInvite(user);
            return (
              <TableRow
                key={user._id}
                className={user.isActive ? undefined : "text-muted-foreground"}
              >
                <TableCell>
                  <p className="font-medium text-foreground">
                    {formatDisplayName(user.name)}
                    {isSelf && (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        você
                      </span>
                    )}
                  </p>
                  {user.email && (
                    <p className="text-sm text-muted-foreground">
                      {user.email}
                    </p>
                  )}
                </TableCell>
                <TableCell className="font-mono text-sm">
                  {user.username ? (
                    formatUsername(user.username)
                  ) : (
                    <span className="font-sans text-muted-foreground">
                      {pending ? "Define ao aceitar" : "—"}
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  <RoleBadges
                    roles={user.roles}
                    adjustments={overridesCount(user)}
                  />
                </TableCell>
                <TableCell>
                  <UserStatusBadge user={user} />
                </TableCell>
                <TableCell className="text-sm text-muted-foreground tabular-nums">
                  {user.lastLoginAt
                    ? formatDate(user.lastLoginAt)
                    : pending && user.invitedAt
                      ? `Convidado em ${formatDate(user.invitedAt)}`
                      : "Nunca"}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <IconAction
                      label={`Editar ${user.name}`}
                      tooltip="Editar"
                      onClick={() => onEdit(user)}
                    >
                      <Pencil />
                    </IconAction>
                    {pending ? (
                      <>
                        <ResendInviteButton user={user} />
                        <IconAction
                          label={`Cancelar convite de ${user.name}`}
                          tooltip="Cancelar convite"
                          onClick={() => onRevoke(user)}
                        >
                          <MailX className="text-destructive" />
                        </IconAction>
                      </>
                    ) : user.isActive ? (
                      <IconAction
                        label={`Desativar ${user.name}`}
                        tooltip={
                          isSelf
                            ? "Você não pode desativar o próprio acesso"
                            : "Desativar"
                        }
                        disabled={isSelf}
                        onClick={() => onDeactivate(user)}
                      >
                        <UserX className="text-destructive" />
                      </IconAction>
                    ) : (
                      <ReactivateButton user={user} />
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
