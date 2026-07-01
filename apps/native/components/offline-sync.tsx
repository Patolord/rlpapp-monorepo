import NetInfo from "@react-native-community/netinfo";
import { api } from "@rlpapp/backend/convex/_generated/api";
import { useConvex, useConvexAuth, useMutation } from "convex/react";
import { useCallback, useEffect, useRef } from "react";

import {
  listPendingRecords,
  removePendingRecord,
  setPendingRecordError,
  subscribeQueue,
  type PendingRecord,
} from "@/lib/offline-queue";
import { uploadPhotos } from "@/lib/upload-photos";

async function isOnline(): Promise<boolean> {
  try {
    const state = await NetInfo.fetch();
    return Boolean(state.isConnected) && state.isInternetReachable !== false;
  } catch {
    return true;
  }
}

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
        throw new Error(
          `Código QR ${record.qrToken} não encontrado no sistema`
        );
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
          status: record.status,
          qrToken: record.qrToken,
        });
        await assignQr({ token: record.qrToken, equipmentId });
        return;
      }

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
    if (!(await isOnline())) return;
    syncing.current = true;
    try {
      const records = await listPendingRecords();
      if (records.length === 0) return;

      for (const record of records) {
        try {
          await processRecord(record);
          await removePendingRecord(record.id);
        } catch (err) {
          const message =
            err instanceof Error ? err.message : "Erro desconhecido";
          console.error("Offline sync failed for record:", record.id, err);
          await setPendingRecordError(record.id, message);
          if (!(await isOnline())) break;
        }
      }
    } finally {
      syncing.current = false;
    }
  }, [processRecord]);

  useEffect(() => {
    if (!isAuthenticated) return;

    void runSync();

    const unsubscribeNet = NetInfo.addEventListener((state) => {
      const online =
        Boolean(state.isConnected) && state.isInternetReachable !== false;
      if (online) void runSync();
    });
    const unsubscribeQueue = subscribeQueue(() => void runSync());

    return () => {
      unsubscribeNet();
      unsubscribeQueue();
    };
  }, [isAuthenticated, runSync]);

  return null;
}
