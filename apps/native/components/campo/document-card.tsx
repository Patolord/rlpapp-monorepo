import type { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import type { FunctionReturnType } from "convex/server";
import { CheckCircle2, CloudDownload, ExternalLink, FileText, Trash2 } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { AppButton, Pill, Surface, useToast } from "@/components/ui";
import { getErrorMessage } from "@/lib/errors";
import {
  getOfflineDocument,
  offlineFile,
  openPdf,
  registerOfflineDocument,
  removeOfflineDocument,
  tempPdfFile,
  useDocumentDownloader,
  type CachedDocumentMeta,
} from "@/lib/field-documents";
import { formatFileSize } from "@/lib/format";
import { colors, space, type } from "@/lib/theme";

export type FieldDocument = FunctionReturnType<typeof api.projectDocuments.listForTechnician>[number];

type Busy = "open" | "save" | "remove" | null;

export function DocumentCard({
  document,
  projectId,
  ownerId,
  offline,
  online,
}: {
  document: FieldDocument;
  projectId: Id<"projects">;
  ownerId: string | null;
  offline: CachedDocumentMeta | null;
  online: boolean;
}) {
  const toast = useToast();
  const download = useDocumentDownloader();
  const [busy, setBusy] = useState<Busy>(null);
  const isSaved = offline !== null;
  const canOpen = isSaved || online;
  const canSave = online && ownerId !== null;

  const run = async (kind: Exclude<Busy, null>, action: () => Promise<void>) => {
    setBusy(kind);
    try {
      await action();
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível concluir a ação."));
    } finally {
      setBusy(null);
    }
  };

  // Prefere a cópia salva; senão baixa para a cache do sistema e abre.
  const handleOpen = () =>
    run("open", async () => {
      if (ownerId) {
        const cached = await getOfflineDocument(ownerId, document._id);
        if (cached) {
          await openPdf(cached.file, document.name);
          return;
        }
      }
      if (!online) throw new Error("Sem conexão para baixar este arquivo.");
      const file = await download(document._id, tempPdfFile(document._id));
      await openPdf(file, document.name);
    });

  const handleSave = () =>
    run("save", async () => {
      if (!ownerId) throw new Error("Sessão não identificada.");
      const file = await download(document._id, offlineFile(ownerId, projectId, document._id));
      await registerOfflineDocument(ownerId, {
        documentId: document._id,
        projectId,
        name: document.name,
        fileName: document.fileName,
        sizeBytes: file.size ?? document.sizeBytes,
        savedAt: Date.now(),
        uri: file.uri,
      });
      toast.success("PDF salvo para uso offline.");
    });

  const handleRemove = () =>
    run("remove", async () => {
      if (!ownerId) return;
      await removeOfflineDocument(ownerId, document._id);
      toast.success("PDF removido deste aparelho.");
    });

  return (
    <Surface style={{ gap: space.md }}>
      <View style={styles.top}>
        <View style={styles.icon}>
          <FileText size={22} color={colors.primary} strokeWidth={1.8} />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={[type.bodyStrong, { color: colors.text }]}>{document.name}</Text>
          {document.description ? (
            <Text style={[type.bodySm, { color: colors.textSecondary }]}>{document.description}</Text>
          ) : null}
          <View style={styles.meta}>
            <Text style={[type.caption, { color: colors.textMuted }]}>{formatFileSize(document.sizeBytes)}</Text>
            {isSaved ? (
              <Pill label="Salvo offline" tone="success" icon={<CheckCircle2 size={12} color={colors.success} />} />
            ) : !online ? (
              <Pill label="Precisa de conexão" tone="neutral" />
            ) : null}
          </View>
        </View>
      </View>

      <View style={styles.actions}>
        <AppButton
          label="Abrir"
          size="sm"
          icon={<ExternalLink size={18} color={colors.onPrimary} strokeWidth={2} />}
          trailing={null}
          disabled={!canOpen || busy !== null}
          loading={busy === "open"}
          onPress={handleOpen}
          style={{ flex: 1 }}
        />
        {isSaved ? (
          <AppButton
            label="Remover"
            variant="secondary"
            size="sm"
            icon={<Trash2 size={18} color={colors.text} strokeWidth={2} />}
            disabled={busy !== null}
            loading={busy === "remove"}
            onPress={handleRemove}
            style={{ flex: 1 }}
          />
        ) : (
          <AppButton
            label="Salvar offline"
            variant="secondary"
            size="sm"
            icon={<CloudDownload size={18} color={colors.text} strokeWidth={2} />}
            disabled={!canSave || busy !== null}
            loading={busy === "save"}
            onPress={handleSave}
            style={{ flex: 1 }}
          />
        )}
      </View>
    </Surface>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "flex-start", gap: space.md },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  meta: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: space.sm, marginTop: 2 },
  actions: { flexDirection: "row", gap: space.md },
});
