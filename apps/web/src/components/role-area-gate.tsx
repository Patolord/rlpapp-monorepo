import { api } from "@rlpapp/backend/convex/_generated/api";
import { can, type Permission } from "@rlpapp/shared/auth/permissions";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useEffect } from "react";

// "backoffice" e "configuracoes" não são departamentos de usuário:
// backoffice é a área de cadastros compartilhados (clientes, empreiteiros),
// liberada para quem tem engenharia; configuracoes é a administração
// (usuários, política de privacidade), liberada para engenharia e compras.
export type DepartmentArea =
  | "rh"
  | "engenharia"
  | "compras"
  | "estoque"
  | "backoffice"
  | "configuracoes";

/**
 * Permissões (qualquer uma) que abrem cada área do dashboard. Espelha o que
 * as funções do backend de cada módulo exigem; quem nega continua sendo o
 * backend. Também usada pela sidebar para montar a navegação.
 */
export const AREA_PERMISSIONS: Record<DepartmentArea, Permission[]> = {
  rh: ["rh.read"],
  engenharia: ["engenharia.read"],
  compras: ["compras.read"],
  // Estoque permite leitura compartilhada com Compras e Engenharia; as ações
  // continuam protegidas por permissões específicas no backend.
  estoque: ["estoque.read"],
  // Backoffice (clientes, empreiteiros) segue o acesso de engenharia, que é a
  // permissão exigida pelo backend (engenharia.read).
  backoffice: ["engenharia.read"],
  // Configurações segue a mesma regra do grupo na sidebar (engenharia ou
  // compras); a página de usuários ainda exige admin para editar.
  configuracoes: ["engenharia.read", "compras.read"],
};

// Bloqueia áreas internas (departamentos):
// - qr_operator só pode acessar páginas /q/$token → vai para /qr-operador
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

  const isQrOperator = currentUser?.homeArea === "qr-operador";
  const denied =
    !!currentUser &&
    !!area &&
    !isQrOperator &&
    !can(currentUser, ...AREA_PERMISSIONS[area]);
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
