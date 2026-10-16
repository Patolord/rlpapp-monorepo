import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { AlertTriangle, Building2, CloudOff, Loader2, Tag } from "lucide-react";

import { EquipmentDetail } from "@/components/engenharia/equipment-detail";
import { EquipmentForm } from "@/components/engenharia/equipment-form";
import { MaintenanceForm } from "@/components/engenharia/maintenance-form";
import { SlotPickerStep } from "@/components/engenharia/slot-picker";
import { StatusBadge } from "@/components/engenharia/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  cacheEquipment,
  getCachedEquipment,
  type CachedEquipment,
} from "@/lib/offline-queue";
import { useOnline } from "@/lib/use-online";

export interface FieldProjectRef {
  _id: Id<"projects">;
  name: string;
}

interface EquipmentTokenPageProps {
  token: string;
  /**
   * Obra aberta no app de campo. Um cadastro novo vincula a etiqueta a ela
   * (a obra aberta vence o destino do lote) e oferece a vaga planejada nela.
   * Etiqueta de outra obra só avisa.
   */
  project?: FieldProjectRef | null;
  /** Conteúdo exibido quando o código não existe (botão de voltar, etc.). */
  notFoundAction?: React.ReactNode;
}

/**
 * Página de uma etiqueta QR para quem está logado: cadastro do equipamento
 * (se ainda não existe), passo opcional da vaga planejada, registro de
 * instalação/manutenção e histórico. Funciona offline a partir do cache.
 */
export function EquipmentTokenPage({
  token,
  project = null,
  notFoundAction,
}: EquipmentTokenPageProps) {
  const online = useOnline();
  const data = useQuery(api.qrCodes.getByToken, { token });
  const currentUser = useQuery(api.users.getCurrentUser);

  // Equipamento recém-cadastrado nesta sessão: habilita o passo opcional de
  // escolher a vaga planejada. Pular (ou atribuir) dispensa o passo.
  const [justRegisteredId, setJustRegisteredId] = useState<string | null>(null);
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
      project: data?.project
        ? {
            projectId: data.project.projectId,
            projectName: data.project.projectName,
          }
        : null,
    });
  }, [data, token]);

  if (data === undefined) {
    if (!online) {
      return <OfflineContent token={token} project={project} />;
    }
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
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
            Este código QR ({token}) não está registrado no sistema.
          </p>
          {notFoundAction}
        </div>
      </div>
    );
  }

  const { equipment } = data;

  // Válvula de escape: etiqueta de outra obra abre normalmente, só avisa.
  const otherProject =
    project && data.project && data.project.projectId !== project._id
      ? data.project
      : null;
  // A obra aberta recebe a etiqueta. O aviso só informa a troca.
  const registrationProject = project;

  if (!equipment) {
    return (
      <div className="mx-auto max-w-lg space-y-4 px-4 py-4">
        {otherProject && <OtherObraNotice name={otherProject.projectName} />}
        <EquipmentForm
          qrToken={token}
          project={registrationProject}
          destinationProjectName={data.batchProject?.projectName ?? null}
          onSuccess={(equipmentId) => setJustRegisteredId(equipmentId)}
        />
      </div>
    );
  }

  // Passo opcional pós-cadastro: escolher a vaga planejada. Prioriza a obra
  // aberta no app; sem ela, a obra do lote. Offline pula em silêncio.
  const slotProject = registrationProject
    ? { projectId: registrationProject._id, projectName: registrationProject.name }
    : data.batchProject;
  if (
    online &&
    !assignDone &&
    justRegisteredId === (equipment._id as string) &&
    slotProject &&
    !equipment.projectEquipmentId
  ) {
    return (
      <div className="mx-auto max-w-lg px-4 py-6">
        <SlotPickerStep
          projectId={slotProject.projectId}
          projectName={slotProject.projectName}
          equipmentId={equipment._id}
          onDone={() => setAssignDone(true)}
        />
      </div>
    );
  }

  return (
    <>
      {otherProject && (
        <div className="mx-auto max-w-lg px-4 pt-4">
          <OtherObraNotice name={otherProject.projectName} />
        </div>
      )}
      <EquipmentDetail
        equipmentId={equipment._id}
        equipment={equipment}
        qrToken={token}
        currentUserName={currentUser?.name}
      />
    </>
  );
}

function OtherObraNotice({ name }: { name: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-blue-300 bg-blue-50 px-3 py-2 text-sm text-blue-900 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200">
      <Building2 className="mt-0.5 size-4 shrink-0" />
      <span>
        Esta etiqueta pertence à obra <span className="font-semibold">{name}</span>.
        O cadastro vai vinculá-la à obra que você abriu.
      </span>
    </div>
  );
}

/**
 * Sem internet: usa o cache local do equipamento (se já visitado) e
 * permite registrar tudo na fila offline.
 */
function OfflineContent({
  token,
  project,
}: {
  token: string;
  project: FieldProjectRef | null;
}) {
  const [cached, setCached] = useState<CachedEquipment | null | undefined>(
    undefined
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
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 py-6">
      <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-amber-800">
        <CloudOff className="h-5 w-5 shrink-0" />
        <p className="text-sm">
          Sem internet. Os registros serão salvos no aparelho e enviados
          automaticamente quando a conexão voltar.
        </p>
      </div>

      {cached?.equipment ? (
        <>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <Tag className="h-4 w-4 text-muted-foreground" />
                  <h1 className="text-xl font-bold">
                    {cached.equipment.description ?? "Equipamento"}
                  </h1>
                </div>
                <StatusBadge status={cached.equipment.status} />
              </div>
            </CardContent>
          </Card>
          <MaintenanceForm qrToken={token} />
        </>
      ) : (
        <>
          {cached?.project &&
          project &&
          cached.project.projectId !== project._id && (
            <OtherObraNotice name={cached.project.projectName} />
          )}
          <EquipmentForm qrToken={token} project={project} onSuccess={() => {}} />
          <Separator />
          <p className="text-center text-sm text-muted-foreground">
            Equipamento já cadastrado? Registre a instalação ou manutenção:
          </p>
          <MaintenanceForm qrToken={token} />
        </>
      )}
    </div>
  );
}
