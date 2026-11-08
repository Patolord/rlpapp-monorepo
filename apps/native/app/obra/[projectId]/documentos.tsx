import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import type { FunctionReturnType } from "convex/server";
import { useMutation, useQuery } from "convex/react";
import { useLocalSearchParams } from "expo-router";
import { ExternalLink, FileText, FolderOpen } from "lucide-react-native";
import { useEffect, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";

import { AppButton, Banner, ChoiceChips, ChoiceGroup, ConfirmDialog, EmptyState, Field, LoadingState, Pill, Sheet, Surface, useToast } from "@/components/ui";
import { getErrorMessage } from "@/lib/errors";
import { openPdf, tempPdfFile, useDocumentDownloader } from "@/lib/field-documents";
import { formatDateTime, formatFileSize } from "@/lib/format";
import { WEB_URL, openUrl } from "@/lib/links";
import { colors, radius, space, type } from "@/lib/theme";

type Doc = FunctionReturnType<typeof api.projectDocuments.listByProject>[number];
type Access = "none" | "all" | "selected";

const ACCESS_LABEL: Record<Access, string> = {
  none: "Só escritório",
  all: "Todos os técnicos",
  selected: "Técnicos escolhidos",
};

/** Documentos da obra no escritório (ficha O15): abrir, acesso dos técnicos e remover. */
export default function ObraDocumentosScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const id = projectId as Id<"projects">;
  const docs = useQuery(api.projectDocuments.listByProject, { projectId: id });
  const project = useQuery(api.projects.getOverview, { projectId: id });
  const [selected, setSelected] = useState<Doc | null>(null);

  if (docs === undefined) return <LoadingState message="Carregando documentos…" />;

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={docs}
        keyExtractor={(d) => d._id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <Banner
            tone="neutral"
            icon={<ExternalLink size={18} color={colors.icon} />}
            title="Enviar PDF pelo web"
            detail="O envio de arquivos fica no sistema web por enquanto. Aqui você abre, muda o acesso e remove."
            actionLabel="Abrir no web"
            onAction={() => openUrl(project ? `${WEB_URL}/engenharia/obras/${project.slug}/documentos` : WEB_URL)}
            style={{ marginBottom: space.sm }}
          />
        }
        renderItem={({ item }) => (
          <Surface onPress={() => setSelected(item)} accessibilityLabel={item.name}>
            <View style={styles.row}>
              <View style={styles.tile}>
                <FileText size={20} color={colors.primary} />
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text style={[type.bodyStrong, { color: colors.text }]} numberOfLines={2}>
                  {item.name}
                </Text>
                <Text style={[type.caption, { color: colors.textSecondary }]} numberOfLines={1}>
                  {formatFileSize(item.sizeBytes)} · {formatDateTime(item.createdAt)}
                </Text>
              </View>
              <Pill label={ACCESS_LABEL[item.technicianAccess as Access]} tone={item.technicianAccess === "none" ? "neutral" : "info"} />
            </View>
          </Surface>
        )}
        ListEmptyComponent={
          <EmptyState
            icon={<FolderOpen size={28} color={colors.primary} />}
            title="Nenhum documento nesta obra"
            description="Plantas e projetos em PDF enviados pelo web aparecem aqui; os técnicos com acesso recebem um aviso."
          />
        }
      />
      <DocumentSheet doc={selected} projectId={id} onClose={() => setSelected(null)} />
    </View>
  );
}

function DocumentSheet({ doc, projectId, onClose }: { doc: Doc | null; projectId: Id<"projects">; onClose: () => void }) {
  const toast = useToast();
  const download = useDocumentDownloader();
  const technicians = useQuery(api.projects.getAssignedTechnicians, doc ? { projectId } : "skip");
  const update = useMutation(api.projectDocuments.update);
  const remove = useMutation(api.projectDocuments.remove);
  const [name, setName] = useState("");
  const [access, setAccess] = useState<Access>("none");
  const [allowed, setAllowed] = useState<string[]>([]);
  const [busy, setBusy] = useState<null | "open" | "save" | "remove">(null);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!doc) return;
    setName(doc.name);
    setAccess(doc.technicianAccess as Access);
    setAllowed(doc.allowedTechnicians.map((t) => t._id));
    setError(null);
  }, [doc]);

  if (!doc) return <Sheet open={false} onClose={onClose} title=""><View /></Sheet>;

  const dirty = name.trim() !== doc.name || access !== doc.technicianAccess || (access === "selected" && allowed.slice().sort().join() !== doc.allowedTechnicians.map((t) => t._id).sort().join());

  async function open() {
    if (!doc) return;
    setBusy("open");
    try {
      const file = await download(doc._id, tempPdfFile(doc._id));
      await openPdf(file, doc.name);
    } catch (err) {
      toast.error(getErrorMessage(err, "Não deu para abrir o PDF"));
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    if (!doc) return;
    setBusy("save");
    setError(null);
    try {
      await update({
        documentId: doc._id,
        name: name.trim(),
        technicianAccess: access,
        allowedTechnicianIds: access === "selected" ? (allowed as Id<"users">[]) : undefined,
      });
      toast.success("Documento salvo");
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, "Não deu para salvar. Tente de novo."));
    } finally {
      setBusy(null);
    }
  }

  async function doRemove() {
    if (!doc) return;
    setBusy("remove");
    try {
      await remove({ documentId: doc._id });
      toast.success("Documento removido");
      setConfirm(false);
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err, "Não deu para remover"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <Sheet
        open
        onClose={onClose}
        title={doc.name}
        subtitle={`${formatFileSize(doc.sizeBytes)}${doc.uploadedBy ? ` · enviado por ${doc.uploadedBy.name}` : ""}`}
        footer={
          <View style={{ gap: space.sm }}>
            <AppButton label="Salvar" block disabled={!dirty || !name.trim() || (access === "selected" && allowed.length === 0)} loading={busy === "save"} onPress={() => void save()} />
            <AppButton label="Remover documento" variant="danger" block disabled={busy !== null} onPress={() => setConfirm(true)} />
          </View>
        }
      >
        <View style={{ gap: space.lg }}>
          <AppButton label="Abrir PDF" variant="secondary" block loading={busy === "open"} loadingLabel="Baixando…" icon={<FileText size={18} color={colors.text} />} onPress={() => void open()} />
          <Field label="Nome" value={name} onChangeText={setName} />
          <ChoiceGroup<Access>
            label="Quem vê no campo"
            value={access}
            onChange={setAccess}
            columns={1}
            options={[
              { value: "none", label: ACCESS_LABEL.none },
              { value: "all", label: ACCESS_LABEL.all },
              { value: "selected", label: ACCESS_LABEL.selected },
            ]}
          />
          {access === "selected" ? (
            technicians && technicians.length > 0 ? (
              <ChoiceChips label="Técnicos" values={allowed} options={technicians.map((t) => ({ value: t._id as string, label: t.name }))} onChange={setAllowed} />
            ) : (
              <Text style={[type.bodySm, { color: colors.textSecondary }]}>Nenhum técnico na obra. Inclua técnicos na Visão geral.</Text>
            )
          ) : null}
          <Text style={[type.caption, { color: colors.textSecondary }]}>Quem passar a ver o documento recebe um aviso no celular.</Text>
          {error ? <Banner tone="danger" title={error} /> : null}
        </View>
      </Sheet>
      <ConfirmDialog
        open={confirm}
        title={`Remover “${doc.name}”?`}
        description="O PDF sai da obra e some do celular dos técnicos. Não dá para desfazer."
        confirmLabel="Remover"
        destructive
        busy={busy === "remove"}
        onConfirm={() => void doRemove()}
        onCancel={() => setConfirm(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  list: { padding: space.screen, paddingBottom: 48, gap: space.sm },
  row: { flexDirection: "row", alignItems: "center", gap: space.md },
  tile: { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
});
