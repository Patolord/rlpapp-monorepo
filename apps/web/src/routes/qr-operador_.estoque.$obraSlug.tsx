import { api } from "@rlpapp/backend/convex/_generated/api";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { Loader2 } from "lucide-react";

import { CampoObraStockPage } from "@/components/campo/obra-stock-page";
import { FieldPageShell } from "@/components/campo/field-page-shell";

export const Route = createFileRoute("/qr-operador_/estoque/$obraSlug")({
  beforeLoad: async ({ context }) => {
    if (!context.userId) {
      throw redirect({ to: "/" });
    }
  },
  component: CampoEstoqueObraPage,
});

function CampoEstoqueObraPage() {
  const { obraSlug } = Route.useParams();
  const resolved = useQuery(api.inventoryRequests.resolveAssignedObra, {
    identifier: obraSlug,
  });

  if (resolved === undefined) {
    return (
      <FieldPageShell title="Estoque da obra" backTo="/qr-operador/estoque">
        <div className="flex min-h-48 items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      </FieldPageShell>
    );
  }

  if (resolved === null) {
    return (
      <FieldPageShell title="Estoque da obra" backTo="/qr-operador/estoque">
        <p className="py-16 text-center text-sm text-muted-foreground">
          Obra não encontrada.
        </p>
      </FieldPageShell>
    );
  }

  return (
    <FieldPageShell title={resolved.name} backTo="/qr-operador/estoque">
      <CampoObraStockPage projectId={resolved._id} />
    </FieldPageShell>
  );
}
