import { useAuth } from "@clerk/expo";
import { api } from "@rlpapp/backend/convex/_generated/api";
import { useRouter } from "expo-router";
import { FileText } from "lucide-react-native";
import { useEffect, useMemo } from "react";
import { FlatList, Text, View } from "react-native";

import { DocumentCard, type FieldDocument } from "@/components/campo/document-card";
import { obraTitle, useFieldObra } from "@/components/campo/obra-context";
import { OfflineBanner } from "@/components/campo/offline-banner";
import { EmptyState, LoadingState, Screen, ScreenHeader, screenStyles } from "@/components/ui";
import { pruneOfflineDocuments, useOfflineDocuments } from "@/lib/field-documents";
import { plural } from "@/lib/format";
import { colors, space, type } from "@/lib/theme";
import { useCachedQuery } from "@/lib/use-cached-query";
import { useOnline } from "@/lib/use-online";

/** Documentos (PDF) da obra liberados para o técnico, com cópia offline. */
export default function CampoObraDocumentosScreen() {
  const router = useRouter();
  const online = useOnline();
  const { userId: ownerId } = useAuth();
  const { obra, obraSlug } = useFieldObra();
  const { data: documents, fromCache, cacheChecked } = useCachedQuery(
    ownerId ? `docs:${ownerId}:${obraSlug}` : null,
    api.projectDocuments.listForTechnician,
    { projectId: obra._id }
  );
  const offlineDocs = useOfflineDocuments(ownerId ?? null, obraSlug);

  // Com a lista ao vivo, descarta PDFs salvos que sumiram ou perderam o acesso.
  useEffect(() => {
    if (!documents || fromCache || !ownerId) return;
    void pruneOfflineDocuments(ownerId, obraSlug, documents.map((d) => d._id));
  }, [documents, fromCache, ownerId, obraSlug]);

  const savedCount = useMemo(
    () => (documents ?? []).filter((d) => offlineDocs.has(d._id)).length,
    [documents, offlineDocs]
  );

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

  return (
    <Screen>
      <ScreenHeader
        title="Documentos"
        subtitle={obraTitle(obra)}
        onBack={() => router.back()}
      />
      {list === undefined ? (
        <LoadingState message="Carregando documentos..." />
      ) : (
        <FlatList
          data={list}
          keyExtractor={(item) => item._id}
          contentContainerStyle={screenStyles.content}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <View style={{ gap: space.md }}>
              <OfflineBanner detail="Só os PDFs salvos neste aparelho podem ser abertos." />
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
              projectId={obra._id}
              obraSlug={obraSlug}
              ownerId={ownerId ?? null}
              offline={offlineDocs.get(item._id) ?? null}
              online={online}
            />
          )}
        />
      )}
    </Screen>
  );
}
