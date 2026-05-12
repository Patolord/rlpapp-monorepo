import { api } from "@rlpapp/backend/convex/_generated/api";
import { Outlet, createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { Authenticated, useQuery } from "convex/react";
import { useEffect } from "react";
import { UserButton } from "@clerk/tanstack-react-start";


export const Route = createFileRoute("/app")({
  beforeLoad: async ({ context }) => {
    if (!(context as any).userId) {
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

    if (currentUser.role !== "director") {
      const dept = currentUser.department ?? "estoque";
      navigate({ to: `/${dept}` });
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
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Usuário não encontrado no sistema.</p>
      </div>
    );
  }

  if (currentUser.role !== "director") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Redirecionando...</p>
      </div>
    );
  }

  return <>{children}</>;
}

function AppHeader() {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between bg-transparent px-6">
      <div className="flex items-center gap-3">
        <img
          src="/logo.jpg"
          alt="RLP Engenharia"
          className="size-9 rounded-full object-cover"
        />
        <div>
          <h1 className="text-sm font-semibold">RLP Engenharia</h1>
          <p className="text-xs text-muted-foreground">Painel do Diretor</p>
        </div>
      </div>
      <UserButton />
    </header>
  );
}

function AppLayout() {
  return (
    <Authenticated>
      <RoleGate>
        <div className="flex min-h-screen flex-col bg-background">
          <AppHeader />
          <div className="flex-1">
            <Outlet />
          </div>
        </div>
      </RoleGate>
    </Authenticated>
  );
}
