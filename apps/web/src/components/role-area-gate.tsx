import { api } from "@rlpapp/backend/convex/_generated/api";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useEffect } from "react";

export type DepartmentArea = "rh" | "engenharia" | "compras" | "estoque";

// Mesma regra da navegação: diretores acessam tudo; engenheiro só engenharia;
// demais usuários só o próprio departamento (default "engenharia").
function resolveAllowedArea(user: {
  role: string;
  department?: string;
}): DepartmentArea {
  if (user.role === "engenheiro") return "engenharia";
  return (user.department as DepartmentArea | undefined) ?? "engenharia";
}

// Bloqueia áreas internas (departamentos):
// - qr_operator só pode acessar páginas /q/$token → vai para /qr-operador
// - não-diretores só acessam o próprio departamento
// - Estoque permite leitura compartilhada com Compras e Engenharia; as ações
//   continuam protegidas por permissões específicas no backend.
export function RoleAreaGate({
  area,
  children,
}: {
  area?: DepartmentArea;
  children: React.ReactNode;
}) {
  const currentUser = useQuery(api.users.getCurrentUser);
  const navigate = useNavigate();

  const isQrOperator = currentUser?.role === "qr_operator";
  const isAdmin =
    currentUser?.role === "director" || currentUser?.role === "admin";
  const hasInventoryAccess =
    isAdmin ||
    currentUser?.role === "engenheiro" ||
    currentUser?.department === "engenharia" ||
    currentUser?.department === "compras" ||
    currentUser?.department === "estoque";
  const wrongDepartment =
    !!currentUser &&
    !!area &&
    !isAdmin &&
    !isQrOperator &&
    !(area === "estoque" && hasInventoryAccess) &&
    resolveAllowedArea(currentUser) !== area;

  useEffect(() => {
    if (isQrOperator) {
      void navigate({ to: "/qr-operador" });
    } else if (wrongDepartment && currentUser) {
      void navigate({ to: `/${resolveAllowedArea(currentUser)}` });
    }
  }, [isQrOperator, wrongDepartment, currentUser, navigate]);

  if (isQrOperator || wrongDepartment) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Redirecionando...</p>
      </div>
    );
  }

  return <>{children}</>;
}
