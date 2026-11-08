import { useAuth } from "@clerk/expo";
import { api } from "@rlpapp/backend/convex/_generated/api";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { FileText, ShieldAlert } from "lucide-react-native";
import { useEffect, useMemo } from "react";
import { FlatList, Text, View } from "react-native";

import { DocumentCard, type FieldDocument } from "@/components/campo/document-card";
import { obraTitle, useFieldObra } from "@/components/campo/obra";
import { OfflineBanner } from "@/components/campo/offline-banner";
import { EmptyState, LoadingState, screenStyles } from "@/components/ui";
import { forgetProject, pruneOfflineDocuments, useOfflineDocuments } from "@/lib/field-documents";
import { plural } from "@/lib/format";
import { colors, space, type } from "@/lib/theme";
import { useCachedQuery } from "@/lib/use-cached-query";
import { useOnline } from "@/lib/use-online";

/** Documentos (PDF) da obra liberados para o técnico, com cópia offline. */
export default function CampoObraDocumentosScreen() {
  const { projectId: identifier } = useLocalSearchParams<{ projectId: string }>();
  const router = useRouter();
  const online = useOnline();
  const { userId: ownerId } = useAuth();
  const obra = useFieldObra(identifier);

  // `listForTechnician` exige atribuição à obra; quem só "está de passagem"
  // (obra aberta sem estar atribuído) não vê documentos.
  const assignedId = obra != null && obra.assigned ? obra._id : null;
  // Offline sem cópia da obra: ainda dá para listar o que foi salvo, se a URL
  // trouxer o id (é o que as listas do app usam).
  const projectKey = obra?._id ?? identifier ?? null;

  const { data: documents, fromCache, cacheChecked } = useCachedQuery(
    assignedId && ownerId ? `docs:${ownerId}:${assignedId}` : null,
    api.projectDocuments.listForTechnician,
    assignedId ? { projectId: assignedId } : "skip"
  );
  const offlineDocs = useOfflineDocuments(ownerId ?? null, projectKey);

  // Com a lista ao vivo, descarta PDFs salvos que sumiram ou perderam o acesso.
  useEffect(() => {
    if (!documents || fromCache || !ownerId || !assignedId) return;
    void pruneOfflineDocuments(ownerId, assignedId, documents.map((d) => d._id));
  }, [documents, fromCache, ownerId, assignedId]);

  // Resposta ao vivo "não existe / arquivada / sem acesso": nada dela pode
  // continuar offline neste aparelho.
  useEffect(() => {
    if (!ownerId || obra === undefined) return;
    if (obra === null) {
      if (identifier) void forgetProject(ownerId, identifier);
      return;
    }
    if (!obra.assigned) void forgetProject(ownerId, obra._id);
  }, [obra, ownerId, identifier]);

  const savedCount = useMemo(
    () => (documents ?? []).filter((d) => offlineDocs.has(d._id)).length,
    [documents, offlineDocs]
  );

  // Offline sem cópia da obra segue adiante: ainda dá para abrir o que foi
  // salvo neste aparelho.
  if (obra === undefined && online) {
    return <LoadingState message="Abrindo obra..." />;
  }

  if (obra === null) {
    return (
      <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: space.screen }}>
        <EmptyState
          tone="neutral"
          icon={<ShieldAlert size={30} color={colors.textSecondary} strokeWidth={1.8} />}
          title="Obra não encontrada"
          description="Esta obra não existe mais ou foi arquivada."
          actionLabel="Voltar para minhas obras"
          onAction={() => router.replace("/campo" as Href)}
        />
      </View>
    );
  }

  if (obra && !obra.assigned) {
    return (
      <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: space.screen }}>
        <EmptyState
          tone="warning"
          icon={<ShieldAlert size={30} color={colors.warning} strokeWidth={1.8} />}
          title="Sem acesso aos documentos"
          description="Os PDFs desta obra só ficam disponíveis para técnicos atribuídos a ela. Peça à engenharia para liberar."
        />
      </View>
    );
  }

  // Sem lista (ao vivo ou salva) e sem conexão: mostra o que está salvo neste aparelho.
  const offlineOnly = documents === undefined && !online && cacheChecked;
  const list: FieldDocument[] | undefined =
    documents ??
    (offlineOnly
      ? [...offlineDocs.values()].map((meta) => ({
          _id: meta.documentId,
          projectId: meta.projectId,
          name: meta.name,
          description: null,
          fileName: meta.fileName,
          contentType: "application/pdf",
          sizeBytes: meta.sizeBytes,
          createdAt: meta.savedAt,
          updatedAt: null,
        }))
      : undefined);

  if (list === undefined) {
    return <LoadingState message="Carregando documentos..." />;
  }

  return (
    <FlatList
      data={list}
      keyExtractor={(item) => item._id}
      contentContainerStyle={[screenStyles.content, { paddingTop: space.lg }]}
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={
        <View style={{ gap: space.md }}>
          <OfflineBanner detail="Só os PDFs salvos neste aparelho podem ser abertos." />
          {obra ? (
            <Text style={[type.bodySm, { color: colors.textSecondary }]} numberOfLines={2}>
              {obraTitle(obra)}
            </Text>
          ) : null}
          {list.length > 0 ? (
            <Text style={[type.caption, { color: colors.textMuted }]}>
              {plural(list.length, "documento")}
              {savedCount > 0 ? ` · ${savedCount} salvo${savedCount === 1 ? "" : "s"} neste aparelho` : ""}
              {fromCache || offlineOnly ? " · lista salva neste aparelho" : ""}
            </Text>
          ) : null}
        </View>
      }
      ListEmptyComponent={
        <EmptyState
          icon={<FileText size={30} color={colors.primary} strokeWidth={1.8} />}
          title={offlineOnly ? "Nada salvo neste aparelho" : "Nenhum documento"}
          description={
            offlineOnly
              ? "Sem conexão e nenhum documento desta obra foi salvo offline."
              : "Nenhum documento liberado para você nesta obra."
          }
        />
      }
      renderItem={({ item }) => (
        <DocumentCard
          document={item}
          projectId={item.projectId}
          ownerId={ownerId ?? null}
          offline={offlineDocs.get(item._id) ?? null}
          online={online}
        />
      )}
    />
  );
}
