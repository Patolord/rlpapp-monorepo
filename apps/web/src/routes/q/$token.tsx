import { createFileRoute, Link } from "@tanstack/react-router";
import { Authenticated, AuthLoading, Unauthenticated, useQuery } from "convex/react";
import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { EquipmentForm } from "@/components/engenharia/equipment-form";
import { StatusBadge } from "@/components/engenharia/status-badge";
import { MaintenanceLogCard } from "@/components/engenharia/maintenance-log";
import { MaintenanceForm } from "@/components/engenharia/maintenance-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  MapPin,
  Tag,
  Clock,
  Loader2,
  QrCode,
  AlertTriangle,
  LogIn,
  MessageCircle,
  Globe,
} from "lucide-react";

const WHATSAPP_URL =
  "https://wa.me/5511985782307?text=Olá,%20gostaria%20de%20solicitar%20um%20orçamento";

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
  const equipment = data?.equipment ?? null;
  const logs = useQuery(
    api.maintenanceLogs.listByEquipment,
    equipment ? { equipmentId: equipment._id } : "skip",
  );

  const lastMaintenance = logs?.[0];
  const lastMaintenanceDate = lastMaintenance
    ? new Date(lastMaintenance.createdAt).toLocaleDateString("pt-BR", {
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
            <CardContent className="pt-4">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Tag className="h-4 w-4 text-muted-foreground" />
                    <h1 className="text-xl font-bold">{equipment.tag}</h1>
                  </div>
                  <p className="text-sm text-muted-foreground">{equipment.type}</p>
                </div>
                <StatusBadge status={equipment.status} />
              </div>

              <Separator className="my-3" />

              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5" />
                  <span>{equipment.location}</span>
                </div>
                {lastMaintenanceDate && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    <span>Última manutenção: {lastMaintenanceDate}</span>
                  </div>
                )}
              </div>

              {equipment.notes && (
                <>
                  <Separator className="my-3" />
                  <p className="text-sm">{equipment.notes}</p>
                </>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="flex flex-col items-center gap-5 pt-6 pb-6 text-center">
            {!equipment && (
              <>
                <QrCode className="h-12 w-12 text-muted-foreground" />
                <div className="space-y-1">
                  <h1 className="text-xl font-bold">RLP Engenharia</h1>
                  <p className="text-sm text-muted-foreground">
                    QR Code escaneado com sucesso
                  </p>
                </div>
                <Separator />
              </>
            )}

            <div className="w-full space-y-3">
              <p className="text-sm font-medium">
                Se você é técnico, faça login para acessar o sistema:
              </p>
              <Button className="h-12 w-full text-base" render={<Link to="/" />}>
                <LogIn className="mr-2 h-4 w-4" />
                Fazer Login
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

function AuthenticatedContent() {
  const { token } = Route.useParams();
  const data = useQuery(api.qrCodes.getByToken, { token });
  const currentUser = useQuery(api.users.getCurrentUser);

  if (data === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (data === null) {
    return (
      <div className="mx-auto max-w-lg px-4 py-8">
        <div className="flex flex-col items-center gap-4 text-center">
          <AlertTriangle className="h-12 w-12 text-yellow-500" />
          <h1 className="text-2xl font-bold">QR Code Não Encontrado</h1>
          <p className="text-muted-foreground">
            Este QR code ({token}) não está registrado no sistema. Gere novos
            códigos na página de administração.
          </p>
        </div>
      </div>
    );
  }

  const { qrCode, equipment } = data;

  if (!equipment) {
    return (
      <div className="mx-auto max-w-lg px-4 py-8">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <QrCode className="h-10 w-10 text-muted-foreground" />
          <h1 className="text-xl font-bold">Novo Equipamento</h1>
          <p className="text-sm text-muted-foreground">
            QR Code: {qrCode.token}
          </p>
        </div>
        <EquipmentForm
          qrToken={token}
          onSuccess={() => { }}
        />
      </div>
    );
  }

  return (
    <EquipmentDetail
      equipmentId={equipment._id}
      equipment={equipment}
      currentUserName={currentUser?.name}
    />
  );
}

function EquipmentDetail({
  equipmentId,
  equipment,
  currentUserName,
}: {
  equipmentId: Id<"equipment">;
  equipment: {
    tag: string;
    type: string;
    location: string;
    status: "operational" | "warning" | "error";
    notes?: string;
    createdAt: number;
  };
  currentUserName?: string;
}) {
  const logs = useQuery(api.maintenanceLogs.listByEquipment, {
    equipmentId,
  });

  const lastMaintenance = logs?.[0];
  const lastMaintenanceDate = lastMaintenance
    ? new Date(lastMaintenance.createdAt).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    })
    : null;

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <Card className="mb-4">
        <CardContent className="pt-4">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Tag className="h-4 w-4 text-muted-foreground" />
                <h1 className="text-xl font-bold">{equipment.tag}</h1>
              </div>
              <p className="text-sm text-muted-foreground">{equipment.type}</p>
            </div>
            <StatusBadge status={equipment.status} />
          </div>

          <Separator className="my-3" />

          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" />
              <span>{equipment.location}</span>
            </div>
            {lastMaintenanceDate && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                <span>Última manutenção: {lastMaintenanceDate}</span>
              </div>
            )}
          </div>

          {equipment.notes && (
            <>
              <Separator className="my-3" />
              <p className="text-sm">{equipment.notes}</p>
            </>
          )}
        </CardContent>
      </Card>

      <div className="mb-4">
        <MaintenanceForm equipmentId={equipmentId} defaultTechnicianName={currentUserName} />
      </div>

      {logs === undefined ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : logs.length > 0 ? (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">
            Histórico ({logs.length})
          </h2>
          {logs.map((log) => (
            <MaintenanceLogCard key={log._id} log={log} />
          ))}
        </div>
      ) : (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Nenhum registro de manutenção encontrado.
        </p>
      )}
    </div>
  );
}
