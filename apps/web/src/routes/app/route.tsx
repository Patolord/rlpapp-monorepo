import { api } from "@rlpapp/backend/convex/_generated/api";
import {
  Link,
  Outlet,
  createFileRoute,
  redirect,
  useNavigate,
} from "@tanstack/react-router";
import { Authenticated, useQuery } from "convex/react";
import { Home } from "lucide-react";
import { useEffect } from "react";

import { AppSidebar } from "@/components/app-sidebar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";


export const Route = createFileRoute("/app")({
  beforeLoad: async ({ context }) => {
    if (!context.userId) {
      throw redirect({ to: "/" });
    }
  },
  component: AppLayout,
});

function RoleGate({ children }: { children: React.ReactNode }) {
  const currentUser = useQuery(api.users.getCurrentUser);
  const navigate = useNavigate();

  useEffect(() => {
    if (currentUser === undefined) return;
    if (currentUser === null) return;

    if (currentUser.role === "qr_operator") {
      void navigate({ to: "/qr-operador" });
      return;
    }

    if (currentUser.role === "engenheiro") {
      void navigate({ to: "/engenharia" });
      return;
    }

    if (currentUser.role !== "director") {
      const dept = currentUser.department ?? "engenharia";
      void navigate({ to: `/${dept}` });
    }
  }, [currentUser, navigate]);

  if (currentUser === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  if (currentUser === null) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-muted-foreground">
          Usuário não encontrado no sistema.
        </p>
        <Button render={<Link to="/" />}>
          <Home className="mr-2 size-4" />
          Voltar à tela inicial
        </Button>
      </div>
    );
  }

  return <>{children}</>;
}

function AppLayout() {
  return (
    <Authenticated>
      <RoleGate>
        <SidebarProvider className="bg-[#f7f8fc]">
          <AppSidebar />
          <SidebarInset className="bg-[#f7f8fc]">
            <header className="flex h-14 shrink-0 items-center gap-2 border-b border-slate-100 bg-[#f7f8fc] transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
              <div className="flex items-center gap-2 px-4">
                <SidebarTrigger className="-ml-1" />
                <Separator orientation="vertical" className="mr-2 h-4" />
              </div>
            </header>
            <div className="flex-1 overflow-auto bg-[#f7f8fc] p-4 sm:p-6">
              <Outlet />
            </div>
          </SidebarInset>
        </SidebarProvider>
      </RoleGate>
    </Authenticated>
  );
}
