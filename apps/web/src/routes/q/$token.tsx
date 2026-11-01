import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { Authenticated, AuthLoading, Unauthenticated, useQuery } from "convex/react";
import { useEffect } from "react";
import { api } from "@rlpapp/backend/convex/_generated/api";
import { useOnline } from "@/lib/use-online";
import { EquipmentTokenPage } from "@/components/campo/equipment-token-page";
import { StatusBadge } from "@/components/engenharia/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Tag,
  Clock,
  Loader2,
  QrCode,
  Home,
  LogIn,
  MessageCircle,
  Globe,
} from "lucide-react";

const WHATSAPP_URL =
  "https://wa.me/5511985782307?text=Olá,%20gostaria%20de%20solicitar%20um%20orçamento";

// URL pública impressa na etiqueta. Depois do login, o técnico de campo é
// levado para a etiqueta dentro da obra dela (tudo acontece em uma obra);
// o escritório continua vendo a página direta.
export const Route = createFileRoute("/q/$token")({
  component: QrResolutionPage,
});

function QrResolutionPage() {
  return (
    <>
      <Authenticated>
        <AuthenticatedContent />
      </Authenticated>
      <Unauthenticated>
        <UnauthenticatedView />
      </Unauthenticated>
      <AuthLoading>
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AuthLoading>
    </>
  );
}

function UnauthenticatedView() {
  const { token } = Route.useParams();
  const data = useQuery(api.qrCodes.getByToken, { token });

  // Marca a origem QR para o login atribuir a role correta e voltar para cá
  useEffect(() => {
    sessionStorage.setItem("qr_login_token", token);
  }, [token]);
  const equipment = data?.equipment ?? null;
  const lastMaintenanceAt = useQuery(
    api.maintenanceLogs.getLastMaintenanceDate,
    equipment ? { equipmentId: equipment._id } : "skip",
  );

  const lastMaintenanceDate = lastMaintenanceAt
    ? new Date(lastMaintenanceAt).toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    : null;

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="mx-auto w-full max-w-sm space-y-4">
        {equipment && (
          <Card>
            <CardContent>
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Tag className="h-4 w-4 text-muted-foreground" />
                    <h1 className="text-xl font-bold">
                      {equipment.description ?? "Equipamento"}
                    </h1>
                  </div>
                </div>
                <StatusBadge status={equipment.status} />
              </div>

              {lastMaintenanceDate && (
                <>
                  <Separator className="my-3" />
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    <span>Último registro: {lastMaintenanceDate}</span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="flex flex-col items-center gap-5 text-center">
            {!equipment && (
              <>
                <QrCode className="h-12 w-12 text-muted-foreground" />
                <div className="space-y-1">
                  <h1 className="text-xl font-bold">RLP Engenharia</h1>
                  <p className="text-sm text-muted-foreground">
                    Código QR escaneado com sucesso
                  </p>
                </div>
                <Separator />
              </>
            )}

            <div className="w-full space-y-3">
              <p className="text-sm font-medium">
                Se você é técnico, faça login para acessar o sistema:
              </p>
              <Button
                size="xl"
                className="w-full"
                render={<Link to="/" search={{ redirect: `/q/${token}` }} />}
              >
                <LogIn />
                Entrar
              </Button>
            </div>

            <div className="flex w-full items-center gap-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground">ou</span>
              <div className="h-px flex-1 bg-border" />
            </div>

            <div className="w-full space-y-3">
              <p className="text-sm font-medium">
                Entre em contato conosco:
              </p>
              <a
                href={WHATSAPP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-12 w-full items-center justify-center gap-2 rounded-md bg-[#25D366] text-base font-medium text-white hover:bg-[#1DA851] transition-colors"
              >
                <MessageCircle className="h-4 w-4" />
                Falar no WhatsApp
              </a>
              <a
                href="https://www.rlpeng.com.br"
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-10 w-full items-center justify-center gap-2 rounded-md border text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                <Globe className="h-3.5 w-3.5" />
                www.rlpeng.com.br
              </a>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function fieldObraSlug(
  project:
    | {
        projectId: string;
        projectSlug: string | null;
        archived: boolean;
      }
    | null
    | undefined
): string | null {
  if (!project || project.archived) return null;
  return project.projectSlug ?? project.projectId;
}

function AuthenticatedContent() {
  const { token } = Route.useParams();
  const data = useQuery(api.qrCodes.getByToken, { token });
  const currentUser = useQuery(api.users.getCurrentUser);
  const online = useOnline();

  // Técnico de campo: a etiqueta abre dentro da obra à qual pertence. Sem
  // obra conhecida (ou obra arquivada), fica na página direta, que também
  // cobre o cadastro offline.
  if (
    (currentUser === undefined && online) ||
    (currentUser?.role === "qr_operator" && data === undefined && online)
  ) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }
  let obraSlug: string | null = null;
  if (currentUser?.role === "qr_operator" && data) {
    obraSlug = fieldObraSlug(data.project) ?? fieldObraSlug(data.batchProject);
  }
  if (obraSlug) {
    return (
      <Navigate
        to="/qr-operador/obras/$obraSlug/etiqueta/$token"
        params={{ obraSlug, token }}
        replace
      />
    );
  }

  return (
    <EquipmentTokenPage
      token={token}
      notFoundAction={
        <Button render={<Link to="/app" />}>
          <Home />
          Voltar à tela inicial
        </Button>
      }
    />
  );
}
