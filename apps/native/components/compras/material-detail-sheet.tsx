import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { formatDate } from "@rlpapp/shared";
import { useMutation, useQuery } from "convex/react";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { Archive, ArchiveRestore, Camera, Pencil, Plus } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  AppButton,
  ConfirmDialog,
  EmptyState,
  Field,
  KeyValueList,
  LoadingState,
  Pill,
  SectionTitle,
  Sheet,
  Surface,
  useToast,
} from "@/components/ui";
import { getErrorMessage } from "@/lib/errors";
import { formatQty } from "@/lib/format";
import { useProfile } from "@/lib/profile";
import { colors, space, type } from "@/lib/theme";
import { uploadPhotos } from "@/lib/upload-photos";

import { MATERIAL_STATUS, REPLENISHMENT } from "./labels";
import { MaterialFormSheet } from "./material-form-sheet";
import { MaterialPriceHistory } from "./material-price-history";
import { MaterialSuppliers } from "./material-suppliers";

/** Detalhe do material: dados, estoque central, apelidos, histórico de preços. */
export function MaterialDetailSheet({ materialId, onClose }: { materialId: Id<"materials"> | null; onClose: () => void }) {
  const toast = useToast();
  const material = useQuery(api.materials.get, materialId ? { materialId } : "skip");
  const aliases = useQuery(api.materials.listAliases, materialId ? { materialId } : "skip");
  const update = useMutation(api.materials.update);
  const addAlias = useMutation(api.materials.addAlias);
  const generateUploadUrl = useMutation(api.materials.generateUploadUrl);
  const me = useProfile();
  // A engenharia consulta Materiais e preços (decisão 44): sem editar.
  const readOnly = me?.profile === "engenharia";
  const [photoBusy, setPhotoBusy] = useState(false);

  async function changePhoto() {
    if (!material) return;
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      toast.error("Libere a câmera nos ajustes do celular para tirar a foto.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.6 });
    if (result.canceled || !result.assets[0]) return;
    setPhotoBusy(true);
    try {
      const [imageId] = await uploadPhotos(generateUploadUrl, [result.assets[0].uri]);
      await update({ materialId: material._id, imageId: imageId as Id<"_storage"> });
      toast.success("Foto atualizada");
    } catch (error) {
      toast.error(getErrorMessage(error, "Não deu para salvar a foto"));
    } finally {
      setPhotoBusy(false);
    }
  }

  const [editing, setEditing] = useState(false);
  const [alias, setAlias] = useState("");
  const [addingAlias, setAddingAlias] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [busy, setBusy] = useState(false);

  const archived = material?.status === "archived" || material?.active === false;

  async function toggleArchive() {
    if (!material) return;
    setBusy(true);
    try {
      await update({ materialId: material._id, status: archived ? "active" : "archived", active: archived });
      toast.success(archived ? "Material reativado" : "Material arquivado");
      setConfirmArchive(false);
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível alterar o status"));
    } finally {
      setBusy(false);
    }
  }

  async function submitAlias() {
    if (!material || !alias.trim()) return;
    setAddingAlias(true);
    try {
      await addAlias({ materialId: material._id, alias: alias.trim() });
      setAlias("");
      toast.success("Apelido adicionado");
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível adicionar o apelido"));
    } finally {
      setAddingAlias(false);
    }
  }

  return (
    <>
      <Sheet
        open={materialId !== null}
        onClose={onClose}
        title={material?.name ?? "Material"}
        subtitle={material ? [material.variantLabel, material.sku].filter(Boolean).join(" · ") || undefined : undefined}
        footer={
          material && !readOnly ? (
            <View style={styles.footer}>
              <AppButton label="Editar" variant="secondary" icon={<Pencil size={20} color={colors.text} strokeWidth={2} />} onPress={() => setEditing(true)} style={{ flex: 1 }} />
              <AppButton
                label={archived ? "Reativar" : "Arquivar"}
                variant="secondary"
                icon={archived ? <ArchiveRestore size={20} color={colors.primary} strokeWidth={2} /> : <Archive size={20} color={colors.danger} strokeWidth={2} />}
                onPress={() => (archived ? void toggleArchive() : setConfirmArchive(true))}
                loading={busy && archived}
                style={{ flex: 1 }}
              />
            </View>
          ) : undefined
        }
      >
        {material === undefined ? (
          <LoadingState style={{ flex: 0, paddingVertical: space.xxl }} />
        ) : material === null ? (
          <EmptyState title="Material não encontrado" />
        ) : (
          <>
            <View style={styles.pills}>
              <Pill label={MATERIAL_STATUS[material.status ?? (material.active ? "active" : "archived")]?.label ?? "—"} tone={MATERIAL_STATUS[material.status ?? "active"]?.tone ?? "neutral"} />
              <Pill label={REPLENISHMENT[material.centralReplenishmentState]?.label ?? material.centralReplenishmentState} tone={REPLENISHMENT[material.centralReplenishmentState]?.tone ?? "neutral"} />
              {material.centralQuantity != null ? <Pill label={`Central: ${formatQty(material.centralQuantity, material.unit)}`} tone="info" /> : null}
            </View>
            {material.imageUrl ? (
              <Image source={{ uri: material.imageUrl }} style={styles.photo} contentFit="cover" accessibilityLabel={`Foto de ${material.name}`} />
            ) : null}
            {!readOnly ? (
              <AppButton label={material.imageUrl ? "Trocar foto" : "Adicionar foto"} variant="ghost" size="sm" icon={<Camera size={16} color={colors.primary} />} loading={photoBusy} onPress={() => void changePhoto()} />
            ) : null}
            <KeyValueList
              items={[
                { label: "Categoria", value: material.category },
                { label: "Unidade", value: material.unit },
                { label: "Fabricante", value: material.manufacturer },
                { label: "Marca preferida", value: material.brandPreference },
                { label: "Código de barras", value: material.barcode },
                { label: "Especificação", value: material.spec },
                {
                  label: "Atributos técnicos",
                  value: material.technicalAttributes && material.technicalAttributes.length > 0 ? material.technicalAttributes.map((a) => `${a.key}: ${a.value}`).join("\n") : null,
                },
                { label: "Criado em", value: formatDate(material.createdAt) },
              ]}
            />

            <View>
              <SectionTitle title="Apelidos" style={styles.section} />
              <Text style={[type.caption, { color: colors.textMuted, marginBottom: space.sm, marginLeft: 4 }]}>
                Outros nomes pelos quais o material é pedido (ajudam a busca e a importação).
              </Text>
              {aliases && aliases.length > 0 ? (
                <View style={styles.aliases}>
                  {aliases.map((a) => (
                    <Pill key={a._id} label={a.alias} tone="neutral" />
                  ))}
                </View>
              ) : null}
              {!readOnly ? <View style={styles.aliasRow}>
                <Field label="Novo apelido" size="md" value={alias} onChangeText={setAlias} containerStyle={{ flex: 1 }} returnKeyType="done" onSubmitEditing={() => void submitAlias()} />
                <AppButton label="Adicionar" size="sm" trailing={null} icon={<Plus size={18} color={colors.onPrimary} strokeWidth={2.2} />} disabled={!alias.trim()} loading={addingAlias} onPress={() => void submitAlias()} />
              </View> : null}
            </View>

            <MaterialSuppliers materialId={material._id} readOnly={readOnly} />
            <MaterialPriceHistory materialId={material._id} />
          </>
        )}
      </Sheet>

      {material ? <MaterialFormSheet open={editing} onClose={() => setEditing(false)} material={material} /> : null}

      <ConfirmDialog
        open={confirmArchive}
        title="Arquivar material?"
        description="Sai das buscas e dos pedidos; o histórico de preços e estoque é mantido. Pode ser reativado depois."
        confirmLabel="Arquivar"
        destructive
        busy={busy}
        onCancel={() => setConfirmArchive(false)}
        onConfirm={() => void toggleArchive()}
      />
    </>
  );
}

const styles = StyleSheet.create({
  footer: { flexDirection: "row", gap: space.md },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  section: { paddingHorizontal: 4, paddingTop: 0, paddingBottom: 6 },
  aliases: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginBottom: space.md },
  aliasRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  photo: { width: "100%", aspectRatio: 4 / 3, borderRadius: 12, backgroundColor: colors.surfaceMuted },
});
