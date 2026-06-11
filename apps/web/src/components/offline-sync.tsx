import { useCallback, useEffect, useRef } from "react";
import { useConvex, useConvexAuth, useMutation } from "convex/react";
import { api } from "@rlpapp/backend/convex/_generated/api";
import { toast } from "sonner";
import {
  listPendingRecords,
  removePendingRecord,
  setPendingRecordError,
  type PendingRecord,
} from "@/lib/offline-queue";
import { uploadPhotos } from "@/lib/upload-photos";

/**
 * Processa a fila offline: ao voltar a conexão (ou ao abrir o app logado),
 * sobe as fotos e envia os registros pendentes para o Convex.
 */
export function OfflineSync() {
  const convex = useConvex();
  const { isAuthenticated } = useConvexAuth();
  const createEquipment = useMutation(api.equipment.create);
  const assignQr = useMutation(api.qrCodes.assignEquipment);
  const createLog = useMutation(api.maintenanceLogs.create);
  const generateUploadUrl = useMutation(api.maintenanceLogs.generateUploadUrl);
  const syncing = useRef(false);

  const processRecord = useCallback(
    async (record: PendingRecord) => {
      const data = await convex.query(api.qrCodes.getByToken, {
        token: record.qrToken,
      });
      if (!data) {
        throw new Error(`QR code ${record.qrToken} não encontrado no sistema`);
      }

      if (record.kind === "equipment") {
        if (data.equipment) {
          throw new Error(
            `QR ${record.qrToken} já está vinculado a um equipamento`
          );
        }
        const labelPhotoIds = await uploadPhotos(
          generateUploadUrl,
          record.photos
        );
        const equipmentId = await createEquipment({
          description: record.description,
          labelPhotoIds,
          tag: record.tag,
          type: record.type,
          location: record.location,
          status: record.status,
          notes: record.notes,
          qrToken: record.qrToken,
        });
        await assignQr({ token: record.qrToken, equipmentId });
        return;
      }

      // record.kind === "log"
      if (!data.equipment) {
        throw new Error(
          `QR ${record.qrToken} ainda não tem equipamento cadastrado`
        );
      }
      const photoIds = await uploadPhotos(generateUploadUrl, record.photos);
      await createLog({
        equipmentId: data.equipment._id,
        type: record.logType,
        notes: record.notes,
        tags: record.tags.length > 0 ? record.tags : undefined,
        status: record.status,
        tests: record.tests,
        photoIds,
      });
    },
    [convex, createEquipment, assignQr, createLog, generateUploadUrl]
  );

  const runSync = useCallback(async () => {
    if (syncing.current) return;
    if (!navigator.onLine) return;
    syncing.current = true;
    try {
      const records = await listPendingRecords();
      if (records.length === 0) return;

      toast.info(
        `Enviando ${records.length} registro${records.length > 1 ? "s" : ""} pendente${records.length > 1 ? "s" : ""}...`
      );

      let sent = 0;
      let failed = 0;
      for (const record of records) {
        try {
          await processRecord(record);
          await removePendingRecord(record.id);
          sent++;
        } catch (err) {
          failed++;
          const message =
            err instanceof Error ? err.message : "Erro desconhecido";
          console.error("Offline sync failed for record:", record.id, err);
          await setPendingRecordError(record.id, message);
          // Se foi erro de rede, para e tenta de novo depois.
          if (!navigator.onLine) break;
        }
      }

      if (sent > 0) {
        toast.success(
          `${sent} registro${sent > 1 ? "s" : ""} enviado${sent > 1 ? "s" : ""} com sucesso`
        );
      }
      if (failed > 0) {
        toast.error(
          `${failed} registro${failed > 1 ? "s" : ""} com problema. Veja em Registros Pendentes.`
        );
      }
    } finally {
      syncing.current = false;
    }
  }, [processRecord]);

  useEffect(() => {
    if (!isAuthenticated) return;

    void runSync();

    const onOnline = () => void runSync();
    window.addEventListener("online", onOnline);
    window.addEventListener(RUN_SYNC_EVENT, onOnline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener(RUN_SYNC_EVENT, onOnline);
    };
  }, [isAuthenticated, runSync]);

  return null;
}

export const RUN_SYNC_EVENT = "rlp-run-offline-sync";

/** Dispara a sincronização manual da fila offline. */
export function requestOfflineSync() {
  window.dispatchEvent(new Event(RUN_SYNC_EVENT));
}
