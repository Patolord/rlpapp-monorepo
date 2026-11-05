import { api } from "@rlpapp/backend/convex/_generated/api";
import { formatDisplayName } from "@rlpapp/shared";
import { ROLE_LABELS, can } from "@rlpapp/shared/auth/permissions";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  Building2,
  ChevronRight,
  HardHat,
  LayoutDashboard,
  Monitor,
  Settings,
  ShoppingCart,
  Users,
  Warehouse,
  Briefcase,
  Layers,
  Eye,
  type LucideIcon,
} from "lucide-react";

import { AuthShell } from "@/components/auth-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { AREA_PATHS, AREA_PERMISSIONS, type DepartmentArea } from "@/lib/areas";

// Início pessoal: a página que todo usuário logado abre, qualquer que seja o
// acesso (ver UNIVERSAL_HOME_PATH em lib/areas). Lista só as áreas que as
// permissões dele abrem, para nunca levar a um "Acesso restrito".
export const Route = createFileRoute("/conta/")({
  component: () => (
    <AuthShell>
      <InicioPage />
    </AuthShell>
  ),
});

type CurrentUser = NonNullable<FunctionReturnType<typeof api.users.getCurrentUser>>;

interface Destination {
  key: string;
  to: string;
  label: string;
  description: string;
  icon: LucideIcon;
}

const AREA_DESTINATIONS: Record<DepartmentArea, Omit<Destination, "key" | "to">> = {
  engenharia: {
    label: "Engenharia",
    description: "Obras, equipamentos, documentos e medições.",
    icon: Building2,
  },
  compras: {
    label: "Compras",
    description: "Materiais, fornecedores, preços e takeoffs.",
    icon: ShoppingCart,
  },
  estoque: {
    label: "Estoque",
    description: "Estoque central e movimentações.",
    icon: Warehouse,
  },
  rh: {
    label: "Recursos Humanos",
    description: "Funcionários, folha e ponto.",
    icon: Users,
  },
  backoffice: {
    label: "Backoffice",
    description: "Clientes e empreiteiros.",
    icon: Briefcase,
  },
  takeoff: {
    label: "App Takeoff",
    description: "Kits, pesos, marcas VRF e parâmetros do app desktop.",
    icon: Layers,
  },
  configuracoes: {
    label: "Configurações",
    description: "Usuários e política de privacidade.",
    icon: Settings,
  },
};

const AREA_ORDER: DepartmentArea[] = [
  "engenharia",
  "compras",
  "estoque",
  "rh",
  "backoffice",
  "takeoff",
  "configuracoes",
];

function destinationsFor(user: CurrentUser): Destination[] {
  const list: Destination[] = [];
  if (user.homeArea === null) {
    list.push({
      key: "app",
      to: "/app",
      label: "Painel da diretoria",
      description: "Andamento das obras, pendências e resumo da semana.",
      icon: LayoutDashboard,
    });
  }
  for (const area of AREA_ORDER) {
    if (can(user, ...AREA_PERMISSIONS[area])) {
      list.push({ key: area, to: AREA_PATHS[area], ...AREA_DESTINATIONS[area] });
    }
  }
  if (user.roles.includes("qr_operator")) {
    list.push({
      key: "campo",
      to: "/qr-operador",
      label: "App de campo",
      description: "Suas obras, etiquetas e registros de campo.",
      icon: HardHat,
    });
  }
  if (user.roles.includes("client") || user.homeArea === null) {
    list.push({
      key: "portal",
      to: "/portal",
      label: "Portal do cliente",
      description: "Acompanhamento das obras, somente leitura.",
      icon: Eye,
    });
  }
  return list;
}

const cardCls = "rounded-xl border border-slate-100 bg-white shadow-sm";
const eyebrowCls =
  "text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400";

function InicioPage() {
  const currentUser = useQuery(api.users.getCurrentUser);

  if (currentUser === undefined) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 p-2 sm:p-4">
        <Skeleton className="h-14 w-64 rounded-lg" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  }

  if (currentUser === null) {
    return (
      <p className="py-16 text-center text-muted-foreground">
        Usuário não encontrado no sistema.
      </p>
    );
  }

  const firstName = formatDisplayName(currentUser.name).split(" ")[0] ?? "";
  const destinations = destinationsFor(currentUser);
  const usesTakeoff = can(currentUser, "takeoff.use");
  const roleLabels = currentUser.roles.map((role) => ROLE_LABELS[role]);

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-2 sm:p-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Olá{firstName ? `, ${firstName}` : ""}
        </h1>
        <p className="text-sm text-slate-500">
          {roleLabels.length > 0
            ? `Seus acessos: ${roleLabels.join(", ")}.`
            : "Seu usuário ainda não tem nenhum acesso."}
        </p>
      </div>

      {usesTakeoff && (
        <div className={`${cardCls} flex items-start gap-4 p-5`}>
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Monitor className="size-5" />
          </div>
          <div className="min-w-0 space-y-1">
            <h2 className="text-sm font-semibold text-slate-900">RLP Takeoff</h2>
            <p className="text-sm text-slate-500">
              O takeoff e os orçamentos são feitos no app desktop. Abra o RLP
              Takeoff no seu computador e entre com este mesmo usuário.
            </p>
          </div>
        </div>
      )}

      <section className={`${cardCls} p-6`}>
        <h2 className={eyebrowCls}>Suas áreas no sistema</h2>
        {destinations.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">
            {usesTakeoff
              ? "Além do app desktop, seu usuário não tem outras áreas liberadas."
              : "Seu usuário ainda não tem nenhuma área liberada."}{" "}
            Se precisar de mais acesso, fale com um administrador.
          </p>
        ) : (
          <div className="mt-2 divide-y divide-slate-100">
            {destinations.map((destination) => (
              <Link
                key={destination.key}
                to={destination.to}
                className="group flex items-center gap-4 rounded-md py-3.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-400 group-hover:text-primary">
                  <destination.icon className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">
                    {destination.label}
                  </p>
                  <p className="truncate text-xs text-slate-400">
                    {destination.description}
                  </p>
                </div>
                <ChevronRight className="size-4 shrink-0 text-slate-300 group-hover:text-slate-400" />
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
