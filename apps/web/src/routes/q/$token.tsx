import { createFileRoute, Link } from "@tanstack/react-router";
import { Authenticated, AuthLoading, Unauthenticated, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { EquipmentForm } from "@/components/engenharia/equipment-form";
import { EquipmentEditForm } from "@/components/engenharia/equipment-edit-form";
import { StatusBadge } from "@/components/engenharia/status-badge";
import { MaintenanceLogCard } from "@/components/engenharia/maintenance-log";
import { MaintenanceForm } from "@/components/engenharia/maintenance-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useOnline } from "@/lib/use-online";
import {
  cacheEquipment,
  getCachedEquipment,
  type CachedEquipment,
} from "@/lib/offline-queue";
import {
  Tag,
  Clock,
  Loader2,
  QrCode,
  AlertTriangle,
  LogIn,
  MessageCircle,
  Globe,
  Pencil,
  CloudOff,
} from "lucide-react";

const WHATSAPP_URL =
  "https://wa.me/5511985782307?text=Olá,%20gostaria%20de%20solicitar%20um%20orçamento";

type EquipmentStatus = "installing" | "operational" | "warning" | "error";

interface EquipmentInfo {
  description?: string;
  status: EquipmentStatus;
  createdAt: number;
}

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
            <CardContent className="pt-4">
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
          <CardContent className="flex flex-col items-center gap-5 pt-6 pb-6 text-center">
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
                className="h-12 w-full text-base"
                render={<Link to="/" search={{ redirect: `/q/${token}` }} />}
              >
                <LogIn className="mr-2 h-4 w-4" />
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

function AuthenticatedContent() {
  const { token } = Route.useParams();
  const online = useOnline();
  const data = useQuery(api.qrCodes.getByToken, { token });
  const currentUser = useQuery(api.users.getCurrentUser);

  // Cache de leitura: guarda o último estado conhecido para uso offline
  useEffect(() => {
    if (data === undefined) return;
    void cacheEquipment({
      token,
      cachedAt: Date.now(),
      equipment: data?.equipment
        ? {
            description: data.equipment.description,
            status: data.equipment.status,
            createdAt: data.equipment.createdAt,
          }
        : null,
    });
  }, [data, token]);

  if (data === undefined) {
    if (!online) {
      return <OfflineContent token={token} />;
    }
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
          <h1 className="text-2xl font-bold">Código QR não encontrado</h1>
          <p className="text-muted-foreground">
            Este código QR ({token}) não está registrado no sistema. Gere novos
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
            Código QR: {qrCode.token}
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
      qrToken={token}
      currentUserName={currentUser?.name}
    />
  );
}

/**
 * Sem internet: usa o cache local do equipamento (se já visitado) e
 * permite registrar tudo na fila offline.
 */
function OfflineContent({ token }: { token: string }) {
  const [cached, setCached] = useState<CachedEquipment | null | undefined>(
    undefined,
  );

  useEffect(() => {
    let alive = true;
    void getCachedEquipment(token).then((entry) => {
      if (alive) setCached(entry);
    });
    return () => {
      alive = false;
    };
  }, [token]);

  if (cached === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-6 space-y-4">
      <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-amber-800">
        <CloudOff className="h-5 w-5 shrink-0" />
        <p className="text-sm">
          Sem internet. Os registros serão salvos no aparelho e enviados
          automaticamente quando a conexão voltar.
        </p>
      </div>

      {cached?.equipment ? (
        <>
          <OfflineEquipmentCard equipment={cached.equipment} />
          <MaintenanceForm qrToken={token} />
        </>
      ) : (
        <>
          <div className="flex flex-col items-center gap-2 text-center">
            <QrCode className="h-10 w-10 text-muted-foreground" />
            <h1 className="text-xl font-bold">Código QR: {token}</h1>
            <p className="text-sm text-muted-foreground">
              Se este equipamento ainda não foi cadastrado, registre abaixo.
            </p>
          </div>
          <EquipmentForm qrToken={token} onSuccess={() => { }} />
          <Separator />
          <p className="text-sm text-muted-foreground text-center">
            Equipamento já cadastrado? Registre a instalação ou manutenção:
          </p>
          <MaintenanceForm qrToken={token} />
        </>
      )}
    </div>
  );
}

function OfflineEquipmentCard({
  equipment,
}: {
  equipment: NonNullable<CachedEquipment["equipment"]>;
}) {
  return (
    <Card>
      <CardContent className="pt-4">
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
      </CardContent>
    </Card>
  );
}

function EquipmentDetail({
  equipmentId,
  equipment,
  qrToken,
  currentUserName,
}: {
  equipmentId: Id<"equipment">;
  equipment: EquipmentInfo;
  qrToken: string;
  currentUserName?: string;
}) {
  const [editing, setEditing] = useState(false);
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
      {editing ? (
        <div className="mb-4">
          <EquipmentEditForm
            equipmentId={equipmentId}
            initial={{
              description: equipment.description,
              status: equipment.status,
            }}
            onClose={() => setEditing(false)}
          />
        </div>
      ) : (
        <Card className="mb-4">
          <CardContent className="pt-4">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Tag className="h-4 w-4 text-muted-foreground" />
                  <h1 className="text-xl font-bold">
                    {equipment.description ?? "Equipamento"}
                  </h1>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={equipment.status} />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setEditing(true)}
                  aria-label="Editar equipamento"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              </div>
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

      <div className="mb-4">
        <MaintenanceForm
          equipmentId={equipmentId}
          qrToken={qrToken}
          technicianName={currentUserName}
        />
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
