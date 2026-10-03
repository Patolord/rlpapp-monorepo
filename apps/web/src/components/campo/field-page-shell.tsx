import { UserButton } from "@clerk/tanstack-react-start";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, WifiOff } from "lucide-react";
import type { ReactElement, ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { useOnline } from "@/lib/use-online";

export function OfflineBanner({ detail }: { detail?: string }) {
  const online = useOnline();
  if (online) return null;
  return (
    <div
      role="status"
      className="flex items-center gap-2 border-b border-amber-300 bg-amber-50 px-4 py-2 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200"
    >
      <WifiOff className="size-4 shrink-0" />
      <span>
        Sem conexão.{" "}
        {detail ?? "Mostrando o que foi salvo neste aparelho."}
      </span>
    </div>
  );
}

export function FieldPageShell({
  title,
  subtitle,
  back,
  actions,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  /** Link de voltar; por padrão volta para o hub do técnico. */
  back?: ReactElement;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex h-16 shrink-0 items-center justify-between px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="-ml-2 shrink-0"
            render={back ?? <Link to="/qr-operador" />}
            aria-label="Voltar"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold">{title}</h1>
            {subtitle && (
              <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {actions}
          <UserButton />
        </div>
      </header>
      <OfflineBanner />
      <div className="flex-1 overflow-auto px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        {children}
      </div>
    </div>
  );
}
