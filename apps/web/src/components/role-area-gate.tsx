import { api } from "@rlpapp/backend/convex/_generated/api";
import { can, type Permission } from "@rlpapp/shared/auth/permissions";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import {
  AREA_PERMISSIONS,
  UNIVERSAL_HOME_PATH,
  resolveHomePath,
  type DepartmentArea,
} from "@/lib/areas";

// Bloqueia áreas internas (departamentos):
// - técnico de campo (qr_operator) vai para /qr-operador, exceto nas áreas
//   que um ajuste individual liberou para ele (ex.: medições)
// - quem não tem permissão na área vai para a própria página inicial
//   (`resolveHomePath`: a área inicial, se abrir, ou o início pessoal em
//   /conta, que todo usuário abre), nunca para outra área sem acesso.
export function RoleAreaGate({
  area,
  children,
}: {
  area?: DepartmentArea;
  children: React.ReactNode;
}) {
  const currentUser = useQuery(api.users.getCurrentUser);
  const navigate = useNavigate();

  const areaAllowed = !!area && can(currentUser, ...AREA_PERMISSIONS[area]);
  const isQrOperator =
    currentUser?.homeArea === "qr-operador" && !areaAllowed;
  const denied = !!currentUser && !!area && !isQrOperator && !areaAllowed;
  const home = denied && currentUser ? resolveHomePath(currentUser) : null;
  // Só redireciona para fora da área; se a página inicial cair nela mesma
  // (não deveria, ela só aponta para áreas que abrem), mostra o aviso.
  const fallbackPath =
    home && home !== `/${area}` && !home.startsWith(`/${area}/`) ? home : null;

  useEffect(() => {
    if (isQrOperator) {
      void navigate({ to: "/qr-operador" });
    } else if (fallbackPath) {
      void navigate({ to: fallbackPath, replace: true });
    }
  }, [isQrOperator, fallbackPath, navigate]);

  if (isQrOperator || fallbackPath) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Redirecionando...</p>
      </div>
    );
  }

  if (denied) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 px-6 text-center">
        <h1 className="text-xl font-semibold">Acesso restrito</h1>
        <p className="text-muted-foreground">
          Você não tem acesso a esta área. Fale com um administrador.
        </p>
        <Button className="mt-2" render={<Link to={UNIVERSAL_HOME_PATH} />}>
          Ir para o início
        </Button>
      </div>
    );
  }

  return <>{children}</>;
}

/**
 * Página de uma funcionalidade dentro de uma área (contratos, medições,
 * folha...): mostra um aviso em vez de montar a página quando o usuário não
 * tem nenhuma das permissões, para que as queries dela não falhem.
 */
export function PermissionGate({
  permissions,
  children,
}: {
  permissions: Permission[];
  children: React.ReactNode;
}) {
  const currentUser = useQuery(api.users.getCurrentUser);
  if (currentUser === undefined) return null;
  // Sem sessão: a página (AuthShell) cuida do redirecionamento para o login.
  if (currentUser === null) return <>{children}</>;
  if (!can(currentUser, ...permissions)) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 px-6 text-center">
        <h1 className="text-xl font-semibold">Acesso restrito</h1>
        <p className="text-muted-foreground">
          Seu usuário não tem acesso a esta funcionalidade. Fale com um
          administrador.
        </p>
        <Button className="mt-2" render={<Link to={resolveHomePath(currentUser)} />}>
          Ir para o início
        </Button>
      </div>
    );
  }
  return <>{children}</>;
}
