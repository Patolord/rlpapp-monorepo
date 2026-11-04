import { api } from "@rlpapp/backend/convex/_generated/api";
import { can, type Permission } from "@rlpapp/shared/auth/permissions";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useEffect } from "react";

// "backoffice", "configuracoes" e "takeoff" não são departamentos de usuário:
// backoffice é a área de cadastros compartilhados (clientes, empreiteiros),
// liberada para quem tem engenharia; configuracoes é a administração
// (usuários, política de privacidade) e takeoff é a configuração do app
// desktop RLP Takeoff (kits), ambas liberadas para engenharia e compras.
export type DepartmentArea =
  | "rh"
  | "engenharia"
  | "compras"
  | "estoque"
  | "backoffice"
  | "configuracoes"
  | "takeoff";

/**
 * Permissões (qualquer uma) que abrem cada área do dashboard. Espelha o que
 * as funções do backend de cada módulo exigem; quem nega continua sendo o
 * backend. Também usada pela sidebar para montar a navegação. Dentro de cada
 * área, as páginas de uma funcionalidade específica usam `PermissionGate`.
 */
export const AREA_PERMISSIONS: Record<DepartmentArea, Permission[]> = {
  // Folha e ponto dependem de rh.funcionarios.read (PERMISSION_DEPENDENCIES).
  rh: ["rh.funcionarios.read"],
  // Toda funcionalidade de engenharia depende de obras.read.
  engenharia: ["obras.read"],
  compras: ["compras.read"],
  // Estoque permite leitura compartilhada com Compras e Engenharia; as ações
  // continuam protegidas por permissões específicas no backend.
  estoque: ["estoque.read"],
  // Backoffice: clientes e empreiteiros.
  backoffice: ["cadastros.read"],
  // Configurações: engenharia ou compras (política de privacidade, lista de
  // usuários) e quem administra usuários, mesmo que por ajuste individual; a
  // página de usuários ainda exige admin.manage para editar.
  configuracoes: ["obras.read", "compras.read", "admin.manage"],
  // App Takeoff: kits, pesos, marcas VRF e parâmetros.
  takeoff: ["takeoff.config"],
};

const OFFICE_AREAS = ["engenharia", "estoque", "compras", "rh", "backoffice"] as const;

/**
 * Primeira área do escritório que o usuário abre, para quem entra pelo app de
 * campo mas recebeu alguma funcionalidade do escritório (ex.: técnico com
 * medições). `null` se não abre nenhuma.
 */
export function firstOfficeArea(
  user: { permissions: readonly Permission[] } | null | undefined
): (typeof OFFICE_AREAS)[number] | null {
  return OFFICE_AREAS.find((area) => can(user, ...AREA_PERMISSIONS[area])) ?? null;
}

// Bloqueia áreas internas (departamentos):
// - técnico de campo (qr_operator) vai para /qr-operador, exceto nas áreas
//   que um ajuste individual liberou para ele (ex.: medições)
// - quem não tem permissão na área vai para a própria área inicial
//   (`homeArea`, calculada pelo backend) ou vê um aviso, se for a mesma.
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
  const fallbackArea =
    denied && currentUser?.homeArea && currentUser.homeArea !== area
      ? currentUser.homeArea
      : null;

  useEffect(() => {
    if (isQrOperator) {
      void navigate({ to: "/qr-operador" });
    } else if (fallbackArea) {
      void navigate({ to: `/${fallbackArea}` });
    }
  }, [isQrOperator, fallbackArea, navigate]);

  if (isQrOperator || fallbackArea) {
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
      </div>
    );
  }
  return <>{children}</>;
}
