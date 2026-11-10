import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import type { FunctionReturnType } from "convex/server";
import { useMutation, useQuery } from "convex/react";
import * as DocumentPicker from "expo-document-picker";
import { useLocalSearchParams } from "expo-router";
import { FileText, FolderOpen, Upload } from "lucide-react-native";
import { useEffect, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";

import { AppButton, Banner, ChoiceChips, ChoiceGroup, ConfirmDialog, EmptyState, Field, LoadingState, Pill, Sheet, Surface, useToast } from "@/components/ui";
import { getErrorMessage } from "@/lib/errors";
import { openPdf, tempPdfFile, useDocumentDownloader } from "@/lib/field-documents";
import { formatDateTime, formatFileSize } from "@/lib/format";
import { colors, radius, space, type } from "@/lib/theme";
import {
  INVALID_PDF_MESSAGE,
  MAX_PDF_BYTES,
  isPdfName,
  suggestDocumentName,
  uploadPdf,
} from "@/lib/upload-pdf";

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
  const [selected, setSelected] = useState<Doc | null>(null);
  const [uploading, setUploading] = useState(false);

  if (docs === undefined) return <LoadingState message="Carregando documentos…" />;

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={docs}
        keyExtractor={(d) => d._id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <AppButton
            label="Enviar PDF"
            block
            icon={<Upload size={18} color={colors.onPrimary} />}
            onPress={() => setUploading(true)}
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
            description="Envie plantas e projetos em PDF. Os técnicos com acesso recebem um aviso."
          />
        }
      />
      <DocumentSheet doc={selected} projectId={id} onClose={() => setSelected(null)} />
      <UploadSheet open={uploading} projectId={id} onClose={() => setUploading(false)} />
    </View>
  );
}

type PickedPdf = { uri: string; name: string; size: number };

function UploadSheet({ open, projectId, onClose }: { open: boolean; projectId: Id<"projects">; onClose: () => void }) {
  const toast = useToast();
  const technicians = useQuery(api.projects.getAssignedTechnicians, open ? { projectId } : "skip");
  const generateUploadUrl = useMutation(api.projectDocuments.generateUploadUrl);
  const discardUpload = useMutation(api.projectDocuments.discardUpload);
  const createDocument = useMutation(api.projectDocuments.create);
  const [file, setFile] = useState<PickedPdf | null>(null);
  const [name, setName] = useState("");
  const [access, setAccess] = useState<Access>("all");
  const [allowed, setAllowed] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setFile(null);
    setName("");
    setAccess("all");
    setAllowed([]);
    setError(null);
  }, [open]);

  async function pick() {
    setError(null);
    const result = await DocumentPicker.getDocumentAsync({
      type: "application/pdf",
      copyToCacheDirectory: true,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset) return;
    if (!isPdfName(asset.name, asset.mimeType)) {
      setError("Apenas arquivos PDF são aceitos");
      return;
    }
    if ((asset.size ?? 0) > MAX_PDF_BYTES) {
      setError("O PDF deve ter no máximo 50 MB");
      return;
    }
    setFile({ uri: asset.uri, name: asset.name, size: asset.size ?? 0 });
    if (!name.trim()) setName(suggestDocumentName(asset.name));
  }

  async function submit() {
    if (!file) {
      setError("Escolha um arquivo PDF");
      return;
    }
    if (access === "selected" && allowed.length === 0) {
      setError("Marque ao menos um técnico");
      return;
    }
    setBusy(true);
    setError(null);
    let storageId: Id<"_storage"> | null = null;
    try {
      storageId = await uploadPdf(generateUploadUrl, file.uri);
      await createDocument({
        projectId,
        storageId,
        name: name.trim(),
        technicianAccess: access,
        allowedTechnicianIds: access === "selected" ? (allowed as Id<"users">[]) : undefined,
      });
      toast.success("PDF enviado");
      onClose();
    } catch (err) {
      if (storageId) await discardUpload({ storageId }).catch(() => undefined);
      setError(getErrorMessage(err, INVALID_PDF_MESSAGE));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Enviar PDF"
      subtitle="Os técnicos com acesso recebem um aviso no celular."
      footer={
        <AppButton
          label="Enviar"
          block
          disabled={!file || !name.trim() || (access === "selected" && allowed.length === 0)}
          loading={busy}
          loadingLabel="Enviando…"
          onPress={() => void submit()}
        />
      }
    >
      <View style={{ gap: space.lg }}>
        <AppButton
          label={file ? "Trocar arquivo" : "Escolher PDF"}
          variant="secondary"
          block
          icon={<FileText size={18} color={colors.text} />}
          onPress={() => void pick()}
        />
        {file ? (
          <Text style={[type.bodySm, { color: colors.textSecondary }]}>
            {file.name} · {formatFileSize(file.size)}
          </Text>
        ) : null}
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
        {error ? <Banner tone="danger" title={error} /> : null}
      </View>
    </Sheet>
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
