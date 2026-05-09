import { api } from "@rlpapp/backend/convex/_generated/api";
import { Outlet, createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { Authenticated, useQuery } from "convex/react";
import { useEffect } from "react";
import { SignOutButton, useUser } from "@clerk/tanstack-react-start";
import { LogOut } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
    <header className="flex h-16 shrink-0 items-center justify-between bg-transparent px-6">
      <div className="flex items-center gap-3">
        <img
          src="/logo.jpg"
          alt="RLP Engenharia"
          className="size-9 rounded-full object-cover"
        />
        <div>
          <h1 className="text-sm font-semibold text-white">RLP Engenharia</h1>
          <p className="text-xs text-white/70">Painel do Diretor</p>
        </div>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" className="relative h-8 w-8 rounded-full" />}
        >
          <Avatar className="h-8 w-8">
            <AvatarImage src={avatar} alt={name} />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56" align="end">
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col space-y-1">
              <p className="text-sm font-medium leading-none">{name}</p>
              <p className="text-xs leading-none text-muted-foreground">{email}</p>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <SignOutButton>
              <DropdownMenuItem>
                <LogOut className="mr-2 h-4 w-4" />
                Sair
              </DropdownMenuItem>
            </SignOutButton>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}

function AppLayout() {
  return (
    <Authenticated>
      <RoleGate>
        <div className="flex min-h-screen flex-col bg-linear-to-b from-[#0b1228] via-[#0d1631] to-[#111b3d] text-white">
          <AppHeader />
          <div className="flex-1">
            <Outlet />
          </div>
        </div>
      </RoleGate>
    </Authenticated>
  );
}
