import { useAuth } from "@clerk/expo";
import NetInfo from "@react-native-community/netinfo";
import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { useConvex, useConvexAuth, useMutation } from "convex/react";
import { useCallback, useEffect, useRef } from "react";

import { normalizeCaptureText } from "@rlpapp/shared/estoque/captureMatch";

import {
  capturePhotoExists,
  discardCapturePhoto,
  listPendingCaptures,
  removePendingCapture,
  subscribeCaptureQueue,
  updatePendingCapture,
  type PendingCapture,
} from "@/lib/capture-queue";
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
  setPendingPunchPhotoStorageId,
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
  const { userId } = useAuth();
  const registerForQr = useMutation(api.qrCodes.registerForQr);
  const createLog = useMutation(api.maintenanceLogs.create);
  const generateUploadUrl = useMutation(api.maintenanceLogs.generateUploadUrl);
  const registerPunch = useMutation(api.timeClockPunch.register);
  const generatePunchUploadUrl = useMutation(api.timeClockPunch.generatePhotoUploadUrl);
  const captureMaterial = useMutation(api.materialCaptures.capture);
  const generateCaptureUploadUrl = useMutation(api.materialCaptures.generateUploadUrl);
  const syncing = useRef(false);
  // Pedido de envio que chegou durante uma passada: roda mais uma no fim.
  const rerun = useRef(false);
  const runSyncRef = useRef<() => Promise<void>>(async () => undefined);

  /**
   * Item do cadastro em campo contado sem sinal: sobe a foto (uma vez só) e
   * envia. O servidor confere duplicatas de novo e é idempotente pelo clientId.
   */
  const processCapture = useCallback(
    async (capture: PendingCapture) => {
      let photoId = capture.photoStorageId as Id<"_storage"> | undefined;
      if (!photoId && capture.photoUri) {
        if (capturePhotoExists(capture.photoUri)) {
          try {
            [photoId] = await uploadPhotos(generateCaptureUploadUrl, [capture.photoUri]);
            await updatePendingCapture(capture.clientId, { photoStorageId: photoId });
          } catch (err) {
            // Sem sinal: tenta de novo depois. Com sinal, a foto não lê ou não
            // sobe: a contagem (o que importa) segue sem ela.
            if (!(await isOnline())) throw err;
            console.warn("Foto do cadastro não subiu; enviando sem foto:", capture.clientId, err);
            photoId = undefined;
            await discardCapturePhoto(capture.clientId);
          }
        } else {
          // A foto sumiu do aparelho: a contagem sobe sem ela, em vez de travar a fila.
          await discardCapturePhoto(capture.clientId);
        }
      }
      await captureMaterial({
        clientId: capture.clientId,
        projectId: capture.projectId as Id<"projects"> | undefined,
        materialId: capture.materialId as Id<"materials"> | undefined,
        item: capture.item,
        confirmedNew: capture.confirmedNew,
        quantityMode: capture.quantityMode,
        quantity: capture.quantity,
        physicalAddress: capture.physicalAddress,
        notes: capture.notes,
        photoId,
        offline: true,
        capturedAt: capture.capturedAt,
      });
    },
    [captureMaterial, generateCaptureUploadUrl]
  );

  /**
   * Marcação de ponto feita sem internet: sobe a foto (uma vez só) e registra
   * como offline. O servidor é idempotente pelo `clientPunchId`.
   */
  const processPunch = useCallback(
    async (punch: PendingPunch) => {
      let photoStorageId = punch.photoStorageId as Id<"_storage"> | undefined;
      if (!photoStorageId && punch.photoUri) {
        [photoStorageId] = await uploadPhotos(generatePunchUploadUrl, [punch.photoUri]);
        await setPendingPunchPhotoStorageId(punch.clientPunchId, photoStorageId);
      }
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

  const runSync = useCallback(async (): Promise<void> => {
    if (syncing.current) {
      rerun.current = true;
      return;
    }
    // A trava vale antes de qualquer espera: duas chamadas seguidas não
    // iniciam dois envios.
    syncing.current = true;
    rerun.current = false;
    // Itens tentados nesta passada: as próprias anotações de erro avisam a
    // fila, mas só item novo justifica outra passada.
    const attempted = new Set<string>();
    try {
      if (!(await isOnline())) return;
      // Só as marcações do usuário logado: a fila é do aparelho, e cada item
      // pertence a quem o criou.
      const currentUserId = userId;
      for (const punch of currentUserId ? await listPendingPunches(currentUserId) : []) {
        attempted.add(punch.clientPunchId);
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

      // Contagens do mesmo item no mesmo local sobem na ordem em que foram
      // feitas: se uma falha, as seguintes dele esperam (o modo "corrigir para
      // o contado" depende do saldo anterior).
      const blocked = new Set<string>();
      // "Corrigir para o contado" que falhou segura o local inteiro: uma
      // contagem posterior pode cair no mesmo material por um caminho que o
      // celular não conhece (ex.: código gravado depois no servidor).
      const blockedLocations = new Set<string>();
      for (const capture of currentUserId ? await listPendingCaptures(currentUserId) : []) {
        attempted.add(capture.clientId);
        const keys = captureOrderKeys(capture);
        const location = capture.projectId ?? "central";
        if (blockedLocations.has(location) || keys.some((key) => blocked.has(key))) continue;
        try {
          await processCapture(capture);
          await removePendingCapture(capture.clientId);
        } catch (err) {
          for (const key of keys) blocked.add(key);
          if (capture.quantityMode === "set") blockedLocations.add(location);
          const message = err instanceof Error ? err.message : "Erro desconhecido";
          console.error("Offline capture sync failed:", capture.clientId, err);
          await updatePendingCapture(capture.clientId, { error: message });
          if (!(await isOnline())) return;
        }
      }

      const records = await listPendingRecords();
      if (records.length === 0) return;

      for (const record of records) {
        attempted.add(record.id);
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
      if (rerun.current) {
        rerun.current = false;
        const currentUserId = userId;
        const pendingIds = [
          ...(currentUserId ? await listPendingPunches(currentUserId) : []).map((p) => p.clientPunchId),
          ...(currentUserId ? await listPendingCaptures(currentUserId) : []).map((c) => c.clientId),
          ...(await listPendingRecords()).map((r) => r.id),
        ];
        if (pendingIds.some((id) => !attempted.has(id))) void runSyncRef.current();
      }
    }
  }, [processRecord, processPunch, processCapture, userId]);
  useEffect(() => {
    runSyncRef.current = runSync;
  }, [runSync]);

  useEffect(() => {
    if (!isAuthenticated || !userId) return;

    void runSync();

    const unsubscribeNet = NetInfo.addEventListener((state) => {
      const online =
        Boolean(state.isConnected) && state.isInternetReachable !== false;
      if (online) void runSync();
    });
    const unsubscribeQueue = subscribeQueue(() => void runSync());
    const unsubscribePunches = subscribePunchQueue(() => void runSync());
    const unsubscribeCaptures = subscribeCaptureQueue(() => void runSync());

    return () => {
      unsubscribeNet();
      unsubscribeQueue();
      unsubscribePunches();
      unsubscribeCaptures();
    };
  }, [isAuthenticated, userId, runSync]);

  return null;
}

/**
 * Chaves de ordem de uma contagem na fila (local + cada jeito de reconhecer o
 * item: material, código, nome/variação/unidade). Duas contagens que dividem
 * qualquer chave podem cair no mesmo material no servidor e mantêm a ordem.
 */
function captureOrderKeys(capture: PendingCapture): string[] {
  const location = capture.projectId ?? "central";
  const keys = new Set<string>(capture.orderKeys ?? []);
  if (capture.materialId) keys.add(`material:${capture.materialId}`);
  if (capture.item?.barcode?.trim()) keys.add(`code:${capture.item.barcode.trim().toUpperCase()}`);
  if (capture.item?.name?.trim()) {
    keys.add(
      `name:${normalizeCaptureText(capture.item.name)}|${normalizeCaptureText(capture.item.variantLabel)}|${(capture.item.unit ?? "").trim().toLowerCase()}`
    );
  }
  return [...keys].map((key) => `${location}#${key}`);
}
