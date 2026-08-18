import { UserButton } from "@clerk/tanstack-react-start";
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";

export function FieldPageShell({
  title,
  backTo = "/qr-operador",
  children,
}: {
  title: string;
  backTo?: "/qr-operador" | "/qr-operador/estoque";
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex h-16 shrink-0 items-center justify-between px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="-ml-2"
            render={<Link to={backTo} />}
            aria-label="Voltar"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="truncate text-sm font-semibold">{title}</h1>
        </div>
        <UserButton />
      </header>
      <div className="flex-1 overflow-auto px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        {children}
      </div>
    </div>
  );
}
