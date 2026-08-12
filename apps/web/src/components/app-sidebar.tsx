import { api } from "@rlpapp/backend/convex/_generated/api";
import { UserButton } from "@clerk/tanstack-react-start";
import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import {
  Building2,
  ChevronsUpDown,
  ClipboardList,
  FileText,
  HardHat,
  LayoutDashboard,
  Package,
  QrCode,
  Receipt,
  ShoppingCart,
  Truck,
  UserPlus,
  Users,
  Warehouse,
  ArrowLeftRight,
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
}

interface NavGroup {
  key: string;
  label: string;
  items: readonly NavItem[];
}

function getNavGroups(): NavGroup[] {
  return [
    {
      key: "engenharia",
      label: "Engenharia",
      items: [
        { to: "/engenharia/obras", label: "Obras", icon: Building2 },
        { to: "/engenharia/clientes", label: "Clientes", icon: Users },
        { to: "/engenharia/empreiteiros", label: "Empreiteiros", icon: HardHat },
        { to: "/engenharia/contratos", label: "Contratos", icon: FileText },
        { to: "/engenharia/qr-codes", label: "Códigos QR", icon: QrCode },
        {
          to: "/engenharia/registro-de-campo",
          label: "Registro de Campo",
          icon: ClipboardList,
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
        { to: "/estoque/movimentacao", label: "Nova movimentação", icon: ArrowLeftRight },
        { to: "/estoque", label: "Estoque central", icon: Warehouse, exact: true },
      ],
    },
    {
      key: "configuracoes",
      label: "Configurações",
      items: [
        { to: "/engenharia/usuarios", label: "Usuários", icon: UserPlus },
      ],
    },
  ];
}

const roleLabels: Record<string, string> = {
  director: "Diretora",
  admin: "Administrador",
  manager: "Gerente",
  operator: "Operador",
  engenheiro: "Engenheiro",
  qr_operator: "Operador QR",
  client: "Cliente",
};

function NavUser({ name, role }: { name?: string; role?: string }) {
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
            <span className="truncate text-xs text-slate-500">
              {role ? roleLabels[role] ?? role : ""}
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
  const isDirector = currentUser?.role === "director";
  const isAdmin = currentUser?.role === "admin";
  const isEngenheiro = currentUser?.role === "engenheiro";

  function isActive(to: string, exact?: boolean) {
    if (exact) return currentPath === to;
    return currentPath === to || currentPath.startsWith(to + "/");
  }

  const hasEngineeringAccess =
    isDirector || isEngenheiro || currentUser?.department === "engenharia";
  const hasPurchasingAccess =
    isDirector || isAdmin || currentUser?.department === "compras";
  const hasInventoryAccess =
    isDirector ||
    isAdmin ||
    isEngenheiro ||
    currentUser?.department === "engenharia" ||
    currentUser?.department === "compras" ||
    currentUser?.department === "estoque";

  const navGroups = isDirector || isAdmin
    ? getNavGroups()
    : getNavGroups().filter((group) => {
        if (group.key === "engenharia") return hasEngineeringAccess;
        if (group.key === "compras") return hasPurchasingAccess;
        if (group.key === "estoque") return hasInventoryAccess;
        if (group.key === "configuracoes") {
          return hasEngineeringAccess || hasPurchasingAccess;
        }
        return false;
      });

  return (
    <Sidebar collapsible="icon" variant="floating" {...props}>
      <SidebarHeader className="py-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link to={isDirector ? "/app" : currentPath} />}>
              <img
                src="/logo.jpg"
                alt="RLP Engenharia"
                className="aspect-square size-10 rounded-lg object-cover"
              />
              <div className="grid flex-1 text-left leading-tight">
                <span className="truncate text-base font-bold tracking-tight group-hover/menu-button:text-sidebar-accent-foreground group-data-active/menu-button:text-sidebar-accent-foreground">
                  RLP Engenharia
                </span>
                <span className="truncate text-xs text-sidebar-foreground/70 group-hover/menu-button:text-sidebar-accent-foreground/80 group-data-active/menu-button:text-sidebar-accent-foreground/80">
                  Sistema ERP
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {isDirector && (
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
        <NavUser name={currentUser?.name} role={currentUser?.role} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
