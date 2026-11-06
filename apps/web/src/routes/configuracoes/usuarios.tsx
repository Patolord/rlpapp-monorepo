import { api } from "@rlpapp/backend/convex/_generated/api";
import { can } from "@rlpapp/shared/auth/permissions";
import { EmptyState, LoadingState } from "@rlpapp/ui/web";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { Search, UserPlus, Users } from "lucide-react";
import { useMemo, useState } from "react";

import { AuthShell } from "@/components/auth-shell";
import { isPendingInvite, type User } from "@/components/configuracoes/usuarios/admin-user";
import { DeactivateUserDialog } from "@/components/configuracoes/usuarios/deactivate-user-dialog";
import { EditUserDialog } from "@/components/configuracoes/usuarios/edit-user-dialog";
import { NewUserDialog } from "@/components/configuracoes/usuarios/new-user-dialog";
import { RevokeInviteDialog } from "@/components/configuracoes/usuarios/revoke-invite-dialog";
import { UsersTable } from "@/components/configuracoes/usuarios/users-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/configuracoes/usuarios")({
  component: UsuariosPage,
});

function UsuariosPage() {
  return (
    <AuthShell>
      <UsuariosContent />
    </AuthShell>
  );
}

function UsuariosContent() {
  const currentUser = useQuery(api.users.getCurrentUser);
  const isAdmin = can(currentUser, "admin.manage");
  // A lista completa (email, telefone, acessos) é só da administração.
  const users = useQuery(api.users.list, isAdmin ? {} : "skip");

  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [deactivatingUser, setDeactivatingUser] = useState<User | null>(null);
  const [revokingUser, setRevokingUser] = useState<User | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  const filteredUsers = useMemo(() => {
    if (!users) return [];
    let result = [...users];
    if (filterStatus === "active") {
      result = result.filter((u) => u.isActive && !isPendingInvite(u));
    } else if (filterStatus === "inactive") {
      result = result.filter((u) => !u.isActive);
    } else if (filterStatus === "invited") {
      result = result.filter((u) => isPendingInvite(u));
    }
    const term = searchTerm.trim().toLowerCase();
    if (term) {
      result = result.filter(
        (u) =>
          u.name.toLowerCase().includes(term) ||
          u.email?.toLowerCase().includes(term) ||
          u.username?.toLowerCase().includes(term)
      );
    }
    return result.sort((a, b) => {
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
      return a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" });
    });
  }, [users, filterStatus, searchTerm]);

  const isFiltering = searchTerm.trim() !== "" || filterStatus !== "all";
  const pendingCount = users?.filter(isPendingInvite).length ?? 0;

  if (!currentUser) {
    return <LoadingState variant="skeleton" label="Carregando usuários" fullHeight />;
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <h1 className="text-2xl font-bold">Acesso restrito</h1>
        <p className="mt-2 text-muted-foreground">
          Somente administradores podem gerenciar usuários.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">Usuários</h1>
          <p className="text-sm text-muted-foreground">
            Quem acessa o sistema e com quais acessos. Os acessos se somam: uma
            pessoa pode ter vários.
          </p>
        </div>
        <NewUserDialog
          trigger={
            <Button>
              <UserPlus />
              Convidar usuário
            </Button>
          }
        />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Buscar por nome, email ou login"
            aria-label="Buscar usuários"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger
            className="w-full sm:w-[200px]"
            aria-label="Filtrar por status"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            <SelectItem value="active">Somente ativos</SelectItem>
            <SelectItem value="invited">
              Convites pendentes{pendingCount > 0 ? ` (${pendingCount})` : ""}
            </SelectItem>
            <SelectItem value="inactive">Somente inativos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {users === undefined
              ? "Usuários"
              : isFiltering
                ? `${filteredUsers.length} de ${users.length} usuários`
                : `${users.length} usuário${users.length === 1 ? "" : "s"}`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {users === undefined ? (
            <LoadingState variant="skeleton" label="Carregando usuários" />
          ) : users.length === 0 ? (
            <EmptyState
              icon={<Users />}
              title="Nenhum usuário cadastrado"
              description="Convide a primeira pessoa pelo email para liberar o acesso ao sistema."
              action={
                <NewUserDialog
                  trigger={
                    <Button>
                      <UserPlus />
                      Convidar usuário
                    </Button>
                  }
                />
              }
            />
          ) : filteredUsers.length === 0 ? (
            <EmptyState
              variant="inline"
              description="Nenhum usuário corresponde aos filtros."
              action={
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm("");
                    setFilterStatus("all");
                  }}
                >
                  Limpar filtros
                </button>
              }
            />
          ) : (
            <UsersTable
              users={filteredUsers}
              currentUserId={currentUser._id}
              onEdit={setEditingUser}
              onDeactivate={setDeactivatingUser}
              onRevoke={setRevokingUser}
            />
          )}
        </CardContent>
      </Card>

      <EditUserDialog
        user={editingUser}
        currentUserId={currentUser._id}
        onClose={() => setEditingUser(null)}
      />
      <DeactivateUserDialog
        user={deactivatingUser}
        onClose={() => setDeactivatingUser(null)}
      />
      <RevokeInviteDialog
        user={revokingUser}
        onClose={() => setRevokingUser(null)}
      />
    </div>
  );
}
