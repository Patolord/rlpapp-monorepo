import { api } from "@rlpapp/backend/convex/_generated/api";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useEffect } from "react";

export type DepartmentArea = "estoque" | "financeiro" | "engenharia" | "rh";

// Mesma regra da navegação: diretores acessam tudo; demais usuários só o
// próprio departamento (default "estoque", igual ao redirect de /app).
function resolveAllowedArea(user: {
  role: string;
  department?: string;
}): DepartmentArea {
  return (user.department as DepartmentArea | undefined) ?? "estoque";
}

// Bloqueia áreas internas (departamentos):
// - qr_operator só pode acessar páginas /q/$token → vai para /qr-operador
// - não-diretores só acessam o próprio departamento
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
  const isDirector = currentUser?.role === "director";
  const wrongDepartment =
    !!currentUser &&
    !!area &&
    !isDirector &&
    !isQrOperator &&
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
