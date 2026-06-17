import { api } from "@rlpapp/backend/convex/_generated/api";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { Users, UserCheck, UserX, Shield } from "lucide-react";
import { useMemo } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AuthShell } from "@/components/auth-shell";

export const Route = createFileRoute("/rh/")({
  component: RhDashboard,
});

const ROLE_LABELS: Record<string, string> = {
  director: "Diretores",
  admin: "Administradores",
  manager: "Gerentes",
  operator: "Operadores",
  qr_operator: "Operadores QR",
};

function RhDashboard() {
  return (
    <AuthShell>
      <RhDashboardContent />
    </AuthShell>
  );
}

function RhDashboardContent() {
  const users = useQuery(api.users.list, {});
  const currentUser = useQuery(api.users.getCurrentUser);

  const stats = useMemo(() => {
    if (!users) return null;
    const active = users.filter((u) => u.isActive).length;
    const inactive = users.filter((u) => !u.isActive).length;
    const byRole: Record<string, number> = {};
    for (const u of users) {
      if (u.isActive) {
        byRole[u.role] = (byRole[u.role] ?? 0) + 1;
      }
    }
    return { total: users.length, active, inactive, byRole };
  }, [users]);

  const isAdmin =
    currentUser?.role === "director" || currentUser?.role === "admin";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Recursos Humanos</h1>
          <p className="text-muted-foreground">
            Visão geral dos colaboradores
          </p>
        </div>
        {isAdmin && (
          <Button render={<Link to="/rh/usuarios" />}>
            <Users className="mr-2 h-4 w-4" />
            Gerenciar Usuários
          </Button>
        )}
      </div>

      {!stats ? (
        <p className="text-muted-foreground py-8 text-center">Carregando...</p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">
                  Total de Usuários
                </CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.total}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Ativos</CardTitle>
                <UserCheck className="h-4 w-4 text-emerald-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-emerald-600">
                  {stats.active}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Inativos</CardTitle>
                <UserX className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-muted-foreground">
                  {stats.inactive}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-muted-foreground" />
                Usuários ativos por cargo
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {Object.entries(ROLE_LABELS).map(([role, label]) => (
                  <div
                    key={role}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <span className="text-sm font-medium">{label}</span>
                    <span className="text-lg font-bold">
                      {stats.byRole[role] ?? 0}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
