import { createFileRoute, Link } from "@tanstack/react-router";
import { Authenticated, AuthLoading, Unauthenticated, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "@rlpapp/backend/convex/_generated/api";
import { EquipmentForm } from "@/components/engenharia/equipment-form";
import { EquipmentDetail } from "@/components/engenharia/equipment-detail";
import { SlotPickerStep } from "@/components/engenharia/slot-picker";
import { StatusBadge } from "@/components/engenharia/status-badge";
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
  CloudOff,
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

  // Equipamento recém-cadastrado nesta sessão: habilita o passo opcional de
  // escolher a vaga planejada. Pular (ou atribuir) dispensa o passo.
  const [justRegisteredId, setJustRegisteredId] = useState<string | null>(
    null,
  );
  const [assignDone, setAssignDone] = useState(false);

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

  const { equipment } = data;

  if (!equipment) {
    return (
      <div className="mx-auto max-w-lg px-4 py-4">
        <EquipmentForm
          qrToken={token}
          destinationProjectName={data.batchProject?.projectName ?? null}
          onSuccess={(equipmentId) => setJustRegisteredId(equipmentId)}
        />
      </div>
    );
  }

  // Passo opcional pós-cadastro: escolher a vaga planejada na obra do lote.
  // Só aparece logo após o cadastro desta sessão; offline pula em silêncio.
  if (
    online &&
    !assignDone &&
    justRegisteredId === (equipment._id as string) &&
    data.batchProject &&
    !equipment.projectEquipmentId
  ) {
    return (
      <div className="mx-auto max-w-lg px-4 py-6">
        <SlotPickerStep
          projectId={data.batchProject.projectId}
          projectName={data.batchProject.projectName}
          equipmentId={equipment._id}
          onDone={() => setAssignDone(true)}
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

