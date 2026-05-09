import { UserButton } from "@clerk/tanstack-react-start";
import { Link } from "@tanstack/react-router";
import { Authenticated, Unauthenticated } from "convex/react";
import {
  Package,
  Warehouse,
  ArrowDownToLine,
  ArrowUpFromLine,
  History,
  Users,
  MapPin,
  LayoutDashboard,
  LogIn,
} from "lucide-react";

import { Button } from "@/components/ui/button";

export default function Header() {
  const estoqueLinks = [
    { to: "/estoque", label: "Dashboard", icon: LayoutDashboard },
    { to: "/estoque/produtos", label: "Produtos", icon: Package },
    { to: "/estoque/fornecedores", label: "Fornecedores", icon: Users },
    { to: "/estoque/sites", label: "Sites", icon: MapPin },
    { to: "/estoque/entrada", label: "Entrada", icon: ArrowDownToLine },
    { to: "/estoque/saida", label: "Saída", icon: ArrowUpFromLine },
    { to: "/estoque/movimentacoes", label: "Histórico", icon: History },
  ] as const;

  return (
    <div className="border-b">
      <div className="flex flex-row items-center justify-between px-4 py-2">
        <div className="flex items-center gap-6">
          <Link to="/" className="flex items-center gap-2 font-semibold">
            <Warehouse className="h-5 w-5" />
            <span>RLP Estoque</span>
          </Link>
          <nav className="flex gap-4 text-sm">
            <Link
              to="/"
              className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
              activeProps={{ className: "text-foreground font-medium" }}
              activeOptions={{ exact: true }}
            >
              Home
            </Link>
            <Authenticated>
              <Link
                to="/estoque"
                className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
                activeProps={{ className: "text-foreground font-medium" }}
              >
                <LayoutDashboard className="h-4 w-4" />
                Estoque
              </Link>
            </Authenticated>
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <Authenticated>
            <UserButton />
          </Authenticated>
          <Unauthenticated>
            <Link to="/">
              <Button variant="default" size="sm">
                <LogIn className="h-4 w-4 mr-2" />
                Entrar
              </Button>
            </Link>
          </Unauthenticated>
        </div>
      </div>
      <Authenticated>
        <div className="flex items-center gap-1 px-4 pb-2">
          {estoqueLinks.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded-none transition-colors"
              activeProps={{ className: "text-foreground bg-muted font-medium" }}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </Link>
          ))}
        </div>
      </Authenticated>
    </div>
  );
}
