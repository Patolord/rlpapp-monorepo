import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

import { AppSidebar } from "@/components/app-sidebar";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";

export const Route = createFileRoute("/estoque")({
  beforeLoad: async ({ context }) => {
    if (!(context as any).userId) {
      throw redirect({ to: "/" });
    }
  },
  component: EstoqueLayout,
});

function EstoqueLayout() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="bg-linear-to-b from-[#0b1228] via-[#0d1631] to-[#111b3d] text-white">
        <header className="flex h-16 shrink-0 items-center gap-2 bg-transparent transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1 text-white hover:bg-white/10" />
            <Separator orientation="vertical" className="mr-2 h-4 bg-white/20" />
          </div>
        </header>
        <div className="flex-1 overflow-auto p-4">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
