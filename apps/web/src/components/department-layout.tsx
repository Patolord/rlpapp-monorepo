import { Outlet } from "@tanstack/react-router";

import { AppSidebar } from "@/components/app-sidebar";
import { RoleAreaGate, type DepartmentArea } from "@/components/role-area-gate";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

/**
 * Layout padrão das áreas de departamento (engenharia, rh):
 * gate de acesso por departamento + sidebar + header.
 * `printable` esconde o chrome na impressão (usado pela engenharia).
 */
export function DepartmentLayout({
  area,
  printable = false,
}: {
  area: DepartmentArea;
  printable?: boolean;
}) {
  return (
    <RoleAreaGate area={area}>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <header
            className={cn(
              "flex h-16 shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12",
              printable && "print:hidden"
            )}
          >
            <div className="flex items-center gap-2 px-4">
              <SidebarTrigger className="-ml-1" />
              <Separator orientation="vertical" className="mr-2 h-4" />
            </div>
          </header>
          <div
            className={cn(
              "flex-1 overflow-auto p-4",
              printable && "print:overflow-visible print:p-0"
            )}
          >
            <Outlet />
          </div>
        </SidebarInset>
      </SidebarProvider>
    </RoleAreaGate>
  );
}
