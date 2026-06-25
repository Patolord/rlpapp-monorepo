import { api } from "@rlpapp/backend/convex/_generated/api";
import { UserButton } from "@clerk/tanstack-react-start";
import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import {
  ChevronRight,
  ClipboardList,
  HardHat,
  Home,
  QrCode,
  Plus,
  UserPlus,
  type LucideIcon,
} from "lucide-react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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

function getDepartmentSections(): DepartmentSection[] {
  return [
    {
      key: "engenharia",
      label: "Engenharia",
      icon: HardHat,
      basePath: "/engenharia",
      items: [
        { to: "/engenharia", label: "Códigos QR", icon: QrCode, exact: true },
        { to: "/engenharia/qr-codes", label: "Criar códigos QR", icon: Plus },
        { to: "/engenharia/registro-de-campo", label: "Registro de Campo", icon: ClipboardList },
        { to: "/engenharia/usuarios", label: "Usuários", icon: UserPlus },
      ],
    },
  ];
}

function NavUser() {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <div className="flex items-center gap-2 px-2 py-1.5 group-data-[collapsible=icon]:justify-center">
          <UserButton
            appearance={{
              elements: {
                userButtonTrigger: "focus:shadow-none",
              },
            }}
          />
          <span className="text-sm group-data-[collapsible=icon]:hidden">Conta</span>
        </div>
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

  const isEngenheiro = currentUser?.role === "engenheiro";
  const departmentSections = getDepartmentSections();
  const visibleSections = isDirector
    ? departmentSections
    : isEngenheiro
      ? departmentSections.filter((s) => s.key === "engenharia")
      : departmentSections.filter((s) => s.key === currentUser?.department);

  return (
    <Sidebar
      collapsible="icon"
      variant="floating"
      {...props}
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
