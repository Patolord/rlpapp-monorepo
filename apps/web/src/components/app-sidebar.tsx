import { api } from "@rlpapp/backend/convex/_generated/api";
import { UserButton } from "@clerk/tanstack-react-start";
import { Link, useRouterState } from "@tanstack/react-router";
import { formatDisplayName } from "@rlpapp/shared";
import {
  ROLE_LABELS,
  can,
  type Permission,
  type Role,
} from "@rlpapp/shared/auth/permissions";
import { AREA_PERMISSIONS, type DepartmentArea } from "@/components/role-area-gate";
import { useQuery } from "convex/react";
import {
  Building2,
  ChevronsUpDown,
  ClipboardList,
  FileText,
  HardHat,
  LayoutDashboard,
  Package,
  Receipt,
  ShoppingCart,
  Truck,
  UserPlus,
  Users,
  Warehouse,
  ArrowLeftRight,
  Shield,
  Banknote,
  Bot,
  Clock,
  Layers,
  Scale,
  SlidersHorizontal,
  Snowflake,
  type LucideIcon,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  /** Funcionalidade específica dentro da área (além da permissão do grupo). */
  permission?: Permission;
}

interface NavGroup {
  key: string;
  label: string;
  items: readonly NavItem[];
}

// Um grupo por departamento, mais os cadastros compartilhados (Backoffice),
// a configuração do app desktop (App Takeoff), a administração
// (Configurações) e a área pessoal. Códigos QR são gerenciados dentro de cada
// obra, por isso não aparecem aqui.
function getNavGroups(): NavGroup[] {
  return [
    {
      key: "engenharia",
      label: "Engenharia",
      items: [
        { to: "/engenharia/obras", label: "Obras", icon: Building2 },
        {
          to: "/engenharia/contratos",
          label: "Contratos",
          icon: FileText,
          permission: "contratos.read",
        },
      ],
    },
    {
      key: "compras",
      label: "Compras",
      items: [
        { to: "/compras", label: "Painel", icon: ShoppingCart, exact: true },
        { to: "/compras/materiais", label: "Materiais", icon: Package },
        { to: "/compras/fornecedores", label: "Fornecedores", icon: Truck },
        { to: "/compras/takeoffs", label: "Takeoffs", icon: ClipboardList },
        { to: "/compras/eventos-preco", label: "Eventos de Preço", icon: Receipt },
        { to: "/compras/fila-revisao", label: "Fila de Revisão", icon: ClipboardList },
      ],
    },
    {
      key: "estoque",
      label: "Estoque",
      items: [
        { to: "/estoque", label: "Estoque central", icon: Warehouse, exact: true },
        { to: "/estoque/movimentacao", label: "Nova movimentação", icon: ArrowLeftRight },
      ],
    },
    {
      key: "rh",
      label: "Recursos Humanos",
      items: [
        {
          to: "/rh/folha",
          label: "Folha de pagamento",
          icon: Banknote,
          permission: "rh.folha.read",
        },
        { to: "/rh/funcionarios", label: "Funcionários", icon: Users },
        {
          to: "/rh/ponto",
          label: "Ponto (RHID)",
          icon: Clock,
          permission: "rh.ponto.read",
        },
      ],
    },
    {
      key: "backoffice",
      label: "Backoffice",
      items: [
        { to: "/backoffice/clientes", label: "Clientes", icon: Users },
        { to: "/backoffice/empreiteiros", label: "Empreiteiros", icon: HardHat },
      ],
    },
    {
      // O que se edita aqui reflete no RLP Takeoff (desktop) de todos os
      // usuários na próxima atualização do catálogo; fica separado de Compras
      // e Engenharia justamente para deixar isso claro.
      key: "takeoff",
      label: "App Takeoff",
      items: [
        { to: "/takeoff/kits", label: "Kits (presets)", icon: Layers },
        { to: "/takeoff/pesos", label: "Pesos e insumos", icon: Scale },
        { to: "/takeoff/vrf", label: "Marcas VRF", icon: Snowflake },
        { to: "/takeoff/parametros", label: "Parâmetros", icon: SlidersHorizontal },
      ],
    },
    {
      key: "configuracoes",
      label: "Configurações",
      items: [
        {
          to: "/configuracoes/usuarios",
          label: "Usuários",
          icon: UserPlus,
          permission: "admin.manage",
        },
        {
          to: "/configuracoes/politica-privacidade",
          label: "Política de Privacidade",
          icon: Shield,
        },
      ],
    },
    {
      key: "conta",
      label: "Minha conta",
      items: [{ to: "/conta/agentes", label: "Agentes (MCP)", icon: Bot }],
    },
  ];
}

/** "Compras, Estoque" ou "Compras +2": acessos do usuário em uma linha. */
function describeRoles(roles: readonly Role[] | undefined): string {
  if (!roles || roles.length === 0) return "";
  const labels = roles.map((role) => ROLE_LABELS[role]);
  if (labels.length <= 2) return labels.join(", ");
  return `${labels[0]} +${labels.length - 1}`;
}

function NavUser({ name, roles }: { name?: string; roles?: readonly Role[] }) {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <div className="flex items-center gap-3 rounded-lg px-2 py-2 group-data-[collapsible=icon]:justify-center">
          <UserButton
            appearance={{
              elements: {
                userButtonTrigger: "focus:shadow-none",
                userButtonAvatarBox: "size-9",
              },
            }}
          />
          <div className="grid min-w-0 flex-1 leading-tight group-data-[collapsible=icon]:hidden">
            <span className="truncate text-sm font-semibold text-slate-800">
              {name ?? "Conta"}
            </span>
            <span className="truncate text-xs text-slate-500" title={roles?.map((r) => ROLE_LABELS[r]).join(", ")}>
              {describeRoles(roles)}
            </span>
          </div>
          <ChevronsUpDown className="size-4 shrink-0 text-slate-400 group-data-[collapsible=icon]:hidden" />
        </div>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;
  const currentUser = useQuery(api.users.getCurrentUser);
  // Diretor fica na página inicial do app; os demais têm uma área inicial.
  const staysOnHome = currentUser != null && currentUser.homeArea === null;

  function isActive(to: string, exact?: boolean) {
    if (exact) return currentPath === to;
    return currentPath === to || currentPath.startsWith(to + "/");
  }

  // Cada grupo abre com as mesmas permissões que o RoleAreaGate da área exige.
  // Itens de uma funcionalidade específica somem para quem não a tem.
  const navGroups = getNavGroups()
    .filter((group) => {
      // Tokens de agente são pessoais: todo usuário interno pode criar os seus.
      if (group.key === "conta") return currentUser?.isStaff ?? false;
      const permissions = AREA_PERMISSIONS[group.key as DepartmentArea];
      return permissions ? can(currentUser, ...permissions) : false;
    })
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) => !item.permission || can(currentUser, item.permission)
      ),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <Sidebar collapsible="icon" variant="floating" {...props}>
      <SidebarHeader className="py-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link to={staysOnHome ? "/app" : currentPath} />}>
              <img
                src="/logo.jpg"
                alt="RLP Engenharia"
                className="aspect-square size-10 rounded-lg object-cover"
              />
              <div className="grid flex-1 text-left leading-tight">
                <span className="truncate text-base font-bold tracking-tight group-hover/menu-button:text-sidebar-accent-foreground group-data-active/menu-button:text-sidebar-accent-foreground">
                  RLP Engenharia
                </span>
                <span className="truncate text-xs text-sidebar-foreground/70 group-hover/menu-button:text-sidebar-accent-foreground group-data-active/menu-button:text-sidebar-accent-foreground">
                  Sistema ERP
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {staysOnHome && (
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    render={<Link to="/app" />}
                    tooltip="Dashboard"
                    isActive={currentPath === "/app"}
                  >
                    <LayoutDashboard />
                    <span>Dashboard</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
        {navGroups.map((group) => (
          <SidebarGroup key={group.key}>
            <SidebarGroupLabel className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={`${group.key}-${item.label}`}>
                    <SidebarMenuButton
                      render={<Link to={item.to} />}
                      tooltip={item.label}
                      isActive={isActive(item.to, item.exact)}
                    >
                      <item.icon />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter className="border-t border-slate-100">
        <NavUser
          name={currentUser?.name ? formatDisplayName(currentUser.name) : undefined}
          roles={currentUser?.roles}
        />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
