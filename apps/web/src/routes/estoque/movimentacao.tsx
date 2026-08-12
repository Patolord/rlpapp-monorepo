import { api } from "@rlpapp/backend/convex/_generated/api";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { ArrowLeft } from "lucide-react";

import { AuthShell } from "@/components/auth-shell";
import { InventoryMovementForm } from "@/components/estoque/inventory-movement-form";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/estoque/movimentacao")({
  component: MovimentacaoPage,
});

function MovimentacaoPage() {
  return (
    <AuthShell>
      <MovimentacaoContent />
    </AuthShell>
  );
}

function MovimentacaoContent() {
  const access = useQuery(api.inventory.getAccess, {});
  const projects = useQuery(api.inventory.listProjects, {});

  if (!access || !projects) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center text-sm text-muted-foreground">
        Carregando movimentação...
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <div className="flex items-start gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="mt-0.5 shrink-0"
          render={<Link to="/estoque" />}
          aria-label="Voltar ao estoque central"
        >
          <ArrowLeft className="size-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Nova movimentação</h1>
          <p className="text-sm text-muted-foreground">
            Entradas, envios e ajustes do armazém central.
          </p>
        </div>
      </div>
      <InventoryMovementForm
        access={access}
        projects={projects}
        scope="central"
        layout="page"
      />
    </div>
  );
}
