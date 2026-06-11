import { api } from "@rlpapp/backend/convex/_generated/api";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useEffect } from "react";

// Bloqueia áreas internas (departamentos) para a role qr_operator,
// que só pode acessar páginas /q/$token.
export function RoleAreaGate({ children }: { children: React.ReactNode }) {
  const currentUser = useQuery(api.users.getCurrentUser);
  const navigate = useNavigate();

  useEffect(() => {
    if (currentUser?.role === "qr_operator") {
      navigate({ to: "/qr-operador" });
    }
  }, [currentUser, navigate]);

  if (currentUser?.role === "qr_operator") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Redirecionando...</p>
      </div>
    );
  }

  return <>{children}</>;
}
