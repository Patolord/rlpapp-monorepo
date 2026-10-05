import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { CalendarDays, CalendarRange, Link2 } from "lucide-react";

import { AuthShell } from "@/components/auth-shell";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/rh/ponto")({
  component: PontoLayout,
});

const TABS = [
  { to: "/rh/ponto", label: "Dia", icon: CalendarDays, exact: true },
  { to: "/rh/ponto/mensal", label: "Mensal", icon: CalendarRange, exact: false },
  { to: "/rh/ponto/vinculos", label: "Vínculos", icon: Link2, exact: false },
] as const;

function PontoLayout() {
  return (
    <AuthShell>
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Ponto (RHID)</h1>
            <p className="text-sm text-muted-foreground">
              Presença, marcações e homem-dia coletados do controle de acesso RHID.
            </p>
          </div>
          <nav
            aria-label="Seções do ponto"
            className="flex w-fit gap-1 rounded-md border border-border bg-card p-1"
          >
            {TABS.map((tab) => (
              <Link
                key={tab.to}
                to={tab.to}
                activeOptions={{ exact: tab.exact, includeSearch: false }}
                className="inline-flex items-center gap-2 rounded-sm px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                activeProps={{
                  className: cn("bg-primary text-primary-foreground hover:text-primary-foreground"),
                }}
              >
                <tab.icon className="size-4" />
                {tab.label}
              </Link>
            ))}
          </nav>
        </div>
        <Outlet />
      </div>
    </AuthShell>
  );
}
