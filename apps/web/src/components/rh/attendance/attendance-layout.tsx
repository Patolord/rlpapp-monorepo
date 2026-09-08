import { Link, Outlet } from "@tanstack/react-router";
import { AuthShell } from "@/components/auth-shell";

export function AttendanceLayout() {
  return (
    <AuthShell>
      <div className="mx-auto min-w-0 max-w-7xl space-y-5">
        <nav aria-label="Ponto" className="flex gap-1 overflow-x-auto border-b border-slate-200 pb-2">
          {[
            { to: "/rh/ponto", label: "Marcações", exact: true },
            { to: "/rh/ponto/relatorios", label: "Relatórios", exact: false },
            { to: "/rh/ponto/configuracao", label: "Vínculos e ajustes", exact: false },
          ].map((item) => (
            <Link key={item.to} to={item.to} activeOptions={{ exact: item.exact }} className="rounded-md px-3 py-2 text-sm font-medium whitespace-nowrap text-slate-600 hover:bg-white focus-visible:outline-2 focus-visible:outline-primary" activeProps={{ className: "bg-white text-primary shadow-sm" }}>
              {item.label}
            </Link>
          ))}
        </nav>
        <Outlet />
      </div>
    </AuthShell>
  );
}
