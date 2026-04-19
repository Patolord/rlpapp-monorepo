import { api } from "@rlpapp/backend/convex/_generated/api";
import { SignOutButton, useUser } from "@clerk/tanstack-react-start";
import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import {
  Package,
  Warehouse,
  ArrowDownToLine,
  ArrowUpFromLine,
  History,
  Users,
  MapPin,
  LayoutDashboard,
  LogOut,
  SlidersHorizontal,
  ChevronsUpDown,
  ChevronRight,
  DollarSign,
  HardHat,
  Home,
  Tag,
  Landmark,
  UserCheck,
  GitCompareArrows,
  BarChart3,
  ScanLine,
  ClipboardList,
  ClipboardCheck,
  type LucideIcon,
} from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";

interface NavSubItem {
  to: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
}

interface DepartmentSection {
  key: string;
  label: string;
  icon: LucideIcon;
  basePath: string;
  items: readonly NavSubItem[];
}

const estoqueOperatorItems: readonly NavSubItem[] = [
  { to: "/estoque", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/estoque/operador", label: "Operador", icon: ScanLine },
];

const estoqueAdminItems: readonly NavSubItem[] = [
  { to: "/estoque", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/estoque/operador", label: "Operador", icon: ScanLine },
  { to: "/estoque/produtos", label: "Produtos", icon: Package },
  { to: "/estoque/fornecedores", label: "Fornecedores", icon: Users },
  { to: "/estoque/sites", label: "Sites", icon: MapPin },
  { to: "/estoque/entrada", label: "Entrada", icon: ArrowDownToLine },
  { to: "/estoque/saida", label: "Saída", icon: ArrowUpFromLine },
  { to: "/estoque/solicitacoes", label: "Solicitações", icon: ClipboardList },
  { to: "/estoque/historico-entregas", label: "Hist. Entregas", icon: ClipboardCheck },
  { to: "/estoque/movimentacoes", label: "Movimentações", icon: History },
  { to: "/estoque/ajustes", label: "Ajustes", icon: SlidersHorizontal },
];

function getEstoqueItems(role?: string): readonly NavSubItem[] {
  if (role === "operator") return estoqueOperatorItems;
  return estoqueAdminItems;
}

function getDepartmentSections(role?: string): DepartmentSection[] {
  return [
    {
      key: "estoque",
      label: "Estoque",
      icon: Warehouse,
      basePath: "/estoque",
      items: getEstoqueItems(role),
    },
    {
      key: "financeiro",
      label: "Financeiro",
      icon: DollarSign,
      basePath: "/financeiro",
      items: [
        { to: "/financeiro", label: "Dashboard", icon: LayoutDashboard, exact: true },
        { to: "/financeiro/contas-pagar", label: "Contas a Pagar", icon: ArrowUpFromLine },
        { to: "/financeiro/contas-receber", label: "Contas a Receber", icon: ArrowDownToLine },
        { to: "/financeiro/clientes", label: "Clientes", icon: UserCheck },
        { to: "/financeiro/conciliacao", label: "Conciliação", icon: GitCompareArrows },
        { to: "/financeiro/relatorios", label: "Relatórios", icon: BarChart3 },
        { to: "/financeiro/categorias", label: "Categorias", icon: Tag },
        { to: "/financeiro/contas-bancarias", label: "Contas Bancárias", icon: Landmark },
      ],
    },
    {
      key: "rh",
      label: "Recursos Humanos",
      icon: Users,
      basePath: "/rh",
      items: [
        { to: "/rh", label: "Dashboard", icon: LayoutDashboard, exact: true },
      ],
    },
    {
      key: "engenharia",
      label: "Engenharia",
      icon: HardHat,
      basePath: "/engenharia",
      items: [
        { to: "/engenharia", label: "Dashboard", icon: LayoutDashboard, exact: true },
      ],
    },
  ];
}

function NavUser() {
  const { isMobile } = useSidebar();
  const { user } = useUser();

  const name = user?.fullName ?? "Usuário";
  const email = user?.primaryEmailAddress?.emailAddress ?? "";
  const avatar = user?.imageUrl ?? "";
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              />
            }
          >
            <Avatar className="h-8 w-8 rounded-lg">
              <AvatarImage src={avatar} alt={name} />
              <AvatarFallback className="rounded-lg">{initials}</AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{name}</span>
              <span className="truncate text-xs">{email}</span>
            </div>
            <ChevronsUpDown className="ml-auto size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="p-0 font-normal">
                <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                  <Avatar className="h-8 w-8 rounded-lg">
                    <AvatarImage src={avatar} alt={name} />
                    <AvatarFallback className="rounded-lg">{initials}</AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">{name}</span>
                    <span className="truncate text-xs">{email}</span>
                  </div>
                </div>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <SignOutButton>
                <DropdownMenuItem>
                  <LogOut />
                  Sair
                </DropdownMenuItem>
              </SignOutButton>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

function DepartmentCollapsible({
  section,
  currentPath,
  isActive,
}: {
  section: DepartmentSection;
  currentPath: string;
  isActive: (to: string, exact?: boolean) => boolean;
}) {
  const isSectionActive = currentPath.startsWith(section.basePath);

  return (
    <Collapsible defaultOpen={isSectionActive} className="group/collapsible">
      <SidebarMenuItem>
        <CollapsibleTrigger
          render={<SidebarMenuButton tooltip={section.label} isActive={isSectionActive} />}
        >
          <section.icon />
          <span>{section.label}</span>
          <ChevronRight className="ml-auto transition-transform duration-200 group-data-open/collapsible:rotate-90" />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub>
            {section.items.map((item) => (
              <SidebarMenuSubItem key={item.to}>
                <SidebarMenuSubButton
                  render={<Link to={item.to} />}
                  isActive={isActive(item.to, item.exact)}
                >
                  <item.icon />
                  <span>{item.label}</span>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;
  const currentUser = useQuery(api.users.getCurrentUser);
  const isDirector = currentUser?.role === "director";

  function isActive(to: string, exact?: boolean) {
    if (exact) return currentPath === to;
    return currentPath === to || currentPath.startsWith(to + "/");
  }

  const departmentSections = getDepartmentSections(currentUser?.role);
  const visibleSections = isDirector
    ? departmentSections
    : departmentSections.filter((s) => s.key === currentUser?.department);

  return (
    <Sidebar
      collapsible="icon"
      {...props}
      className="**:text-white"
      style={
        {
          "--sidebar": "#0b1228",
          "--sidebar-foreground": "#ffffff",
          "--sidebar-primary": "oklch(0.488 0.243 264.376)",
          "--sidebar-primary-foreground": "#ffffff",
          "--sidebar-accent": "rgba(255,255,255,0.08)",
          "--sidebar-accent-foreground": "#ffffff",
          "--sidebar-border": "rgba(255,255,255,0.1)",
          "--sidebar-ring": "rgba(255,255,255,0.3)",
          ...(props.style as React.CSSProperties | undefined),
        } as React.CSSProperties
      }
    >
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link to={isDirector ? "/app" : currentPath} />}>
              <img
                src="/logo.jpg"
                alt="RLP Engenharia"
                className="aspect-square size-8 rounded-lg object-cover"
              />
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">RLP Engenharia</span>
                <span className="truncate text-xs">Sistema ERP</span>
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
                    tooltip="Início"
                    isActive={currentPath === "/app"}
                  >
                    <Home />
                    <span>Início</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
        <SidebarGroup>
          <SidebarGroupLabel>Departamentos</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleSections.map((section) => (
                <DepartmentCollapsible
                  key={section.key}
                  section={section}
                  currentPath={currentPath}
                  isActive={isActive}
                />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
