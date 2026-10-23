import NetInfo from "@react-native-community/netinfo";
import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { useConvex, useConvexAuth, useMutation } from "convex/react";
import { useCallback, useEffect, useRef } from "react";

import {
  listPendingRecords,
  removePendingRecord,
  setPendingRecordError,
  subscribeQueue,
  type PendingRecord,
} from "@/lib/offline-queue";
import {
  listPendingPunches,
  removePendingPunch,
  setPendingPunchError,
  subscribePunchQueue,
  type PendingPunch,
} from "@/lib/punch-queue";
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
  const registerForQr = useMutation(api.qrCodes.registerForQr);
  const createLog = useMutation(api.maintenanceLogs.create);
  const generateUploadUrl = useMutation(api.maintenanceLogs.generateUploadUrl);
  const registerPunch = useMutation(api.timeClockPunch.register);
  const generatePunchUploadUrl = useMutation(api.timeClockPunch.generatePhotoUploadUrl);
  const syncing = useRef(false);

  /** Marcação de ponto feita sem internet: sobe a foto e registra como offline. */
  const processPunch = useCallback(
    async (punch: PendingPunch) => {
      const photoStorageId = punch.photoUri
        ? (await uploadPhotos(generatePunchUploadUrl, [punch.photoUri]))[0]
        : undefined;
      await registerPunch({
        clientPunchId: punch.clientPunchId,
        capturedAt: punch.capturedAt,
        latitude: punch.latitude,
        longitude: punch.longitude,
        accuracyMeters: punch.accuracyMeters,
        photoStorageId,
        photoCapturedAt: punch.photoCapturedAt,
        offline: true,
        deviceModel: punch.deviceModel,
        appVersion: punch.appVersion,
      });
    },
    [generatePunchUploadUrl, registerPunch]
  );

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
        if (record.projectId) {
          const obra = await convex.query(api.technicianPortal.getFieldProject, {
            identifier: record.projectId,
          });
          if (!obra) {
            throw new Error("Obra não disponível");
          }
        }
        const labelPhotoIds = await uploadPhotos(
          generateUploadUrl,
          record.photos
        );
        await registerForQr({
          token: record.qrToken,
          description: record.description,
          labelPhotoIds,
          status: record.status,
          projectId: record.projectId
            ? (record.projectId as Id<"projects">)
            : undefined,
        });
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
    [convex, registerForQr, createLog, generateUploadUrl]
  );

  const runSync = useCallback(async () => {
    if (syncing.current) return;
    if (!(await isOnline())) return;
    syncing.current = true;
    try {
      for (const punch of await listPendingPunches()) {
        try {
          await processPunch(punch);
          await removePendingPunch(punch.clientPunchId);
        } catch (err) {
          const message = err instanceof Error ? err.message : "Erro desconhecido";
          console.error("Offline punch sync failed:", punch.clientPunchId, err);
          await setPendingPunchError(punch.clientPunchId, message);
          if (!(await isOnline())) return;
        }
      }

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
  }, [processRecord, processPunch]);

  useEffect(() => {
    if (!isAuthenticated) return;

    void runSync();

    const unsubscribeNet = NetInfo.addEventListener((state) => {
      const online =
        Boolean(state.isConnected) && state.isInternetReachable !== false;
      if (online) void runSync();
    });
    const unsubscribeQueue = subscribeQueue(() => void runSync());
    const unsubscribePunches = subscribePunchQueue(() => void runSync());

    return () => {
      unsubscribeNet();
      unsubscribeQueue();
      unsubscribePunches();
    };
  }, [isAuthenticated, runSync]);

  return null;
}
