import { useEffect } from "react";
import { api } from "@rlpapp/backend/convex/_generated/api";
import {
  createFileRoute,
  Link,
  Outlet,
  redirect,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { Loader2, ShieldAlert } from "lucide-react";

import { FieldPageShell } from "@/components/campo/field-page-shell";
import { FieldObraProvider } from "@/components/campo/obra-context";
import { Button } from "@/components/ui/button";
import { getErrorMessage } from "@/lib/errors";
import { fieldCacheKeys, forgetProject } from "@/lib/field-cache";
import { useFieldCacheOwner } from "@/lib/use-field-cache-owner";
import { useOfflineQuery } from "@/lib/use-offline-query";
import { useOnline } from "@/lib/use-online";

export const Route = createFileRoute("/qr-operador_/obras/$obraSlug")({
  beforeLoad: async ({ context }) => {
    if (!context.userId) {
      throw redirect({ to: "/" });
    }
  },
  component: CampoObraLayout,
  errorComponent: CampoObraError,
});

const ACCESS_DENIED_MESSAGE = "Acesso negado a esta obra";

function CampoObraLayout() {
  const { obraSlug } = Route.useParams();
  const online = useOnline();
  const { data: obra, fromCache, cacheChecked } = useOfflineQuery(
    fieldCacheKeys.project(obraSlug),
    api.technicianPortal.getMyProject,
    { identifier: obraSlug }
  );

  if (obra === undefined) {
    if (!cacheChecked) return null;
    return (
      <FieldPageShell title="Obra">
        {online ? (
          <div className="flex min-h-48 items-center justify-center">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <p className="py-16 text-center text-sm text-muted-foreground">
            Sem conexão e esta obra ainda não foi aberta neste aparelho.
          </p>
        )}
      </FieldPageShell>
    );
  }

  if (obra === null) {
    return (
      <FieldPageShell title="Obra">
        <p className="py-16 text-center text-sm text-muted-foreground">
          Obra não encontrada ou arquivada.
        </p>
      </FieldPageShell>
    );
  }

  return (
    <FieldObraProvider value={{ obra, obraSlug, fromCache }}>
      <Outlet />
    </FieldObraProvider>
  );
}

function CampoObraError({ error }: ErrorComponentProps) {
  const { obraSlug } = Route.useParams();
  const { ownerId } = useFieldCacheOwner();
  const message = getErrorMessage(error, "");
  const accessDenied = message.includes(ACCESS_DENIED_MESSAGE);

  // Acesso revogado: nada desta obra pode continuar disponível offline
  // (resumo, lista de documentos e PDFs salvos).
  useEffect(() => {
    if (!accessDenied || !ownerId) return;
    void forgetProject(ownerId, obraSlug);
  }, [accessDenied, ownerId, obraSlug]);

  return (
    <FieldPageShell title="Obra">
      <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-center">
        <ShieldAlert className="size-9 text-muted-foreground" />
        <p className="font-medium">Não foi possível abrir esta obra</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          {accessDenied
            ? "Você não tem mais acesso a esta obra. Peça à engenharia para liberar."
            : message ||
              "Você não tem acesso a esta obra. Peça à engenharia para liberar."}
        </p>
        <Button variant="outline" render={<Link to="/qr-operador" />}>
          Voltar para minhas obras
        </Button>
      </div>
    </FieldPageShell>
  );
}
