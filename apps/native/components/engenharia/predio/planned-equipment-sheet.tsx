import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { formatDate } from "@rlpapp/shared";
import { useMutation, useQuery } from "convex/react";
import { useRouter, type Href } from "expo-router";
import { Check, Link2, Pencil, QrCode, Tag, Unlink } from "lucide-react-native";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { AppButton, Banner, ChoiceGroup, ConfirmDialog, Field, PickerField, Pill, SectionTitle, Sheet, Surface, useToast } from "@/components/ui";
import { EQUIPMENT_STATUS_LABELS, EQUIPMENT_STATUS_TONE, type EquipmentStatus } from "@/lib/equipment-status";
import { getErrorMessage } from "@/lib/errors";
import { normalizeTypedToken } from "@/lib/qr-token";
import { colors, radius, space, type } from "@/lib/theme";

import { KIND_LABELS, equipmentTitle, type HierarchyItem } from "./types";

const STATUS_OPTIONS = (Object.keys(EQUIPMENT_STATUS_LABELS) as EquipmentStatus[]).map((value) => ({
  value,
  label: EQUIPMENT_STATUS_LABELS[value],
  tone: EQUIPMENT_STATUS_TONE[value],
}));

/**
 * Equipamento planejado (fichas O8 e O9): status, prazo, etiqueta QR, cadastro
 * de campo vinculado e checklist. "Editar dados" abre o formulário do item.
 */
export function PlannedEquipmentSheet({
  item,
  environmentName,
  onClose,
  onEdit,
}: {
  item: HierarchyItem | null;
  environmentName: string;
  onClose: () => void;
  onEdit: (item: HierarchyItem) => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const setStatus = useMutation(api.projectEquipment.setStatus);
  const unlink = useMutation(api.projectEquipment.unlinkEquipment);
  const checklist = useQuery(api.checklists.listForEquipment, item ? { equipmentId: item._id } : "skip");
  const toggle = useMutation(api.checklists.toggleItem);
  const [tagOpen, setTagOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [confirmUnlink, setConfirmUnlink] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!item) return <Sheet open={false} onClose={onClose} title=""><View /></Sheet>;
  const overdue = item.deadline !== null && item.deadline < Date.now() && item.status !== "operational";

  async function changeStatus(next: EquipmentStatus) {
    if (!item || next === item.status) return;
    try {
      await setStatus({ itemId: item._id, status: next });
      toast.success(`Status: ${EQUIPMENT_STATUS_LABELS[next]}`);
    } catch (err) {
      toast.error(getErrorMessage(err, "Não deu para mudar o status"));
    }
  }

  async function doUnlink() {
    if (!item) return;
    setBusy(true);
    try {
      await unlink({ itemId: item._id });
      toast.success("Cadastro desvinculado");
      setConfirmUnlink(false);
    } catch (err) {
      toast.error(getErrorMessage(err, "Não deu para desvincular"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Sheet open onClose={onClose} title={equipmentTitle(item)} subtitle={[KIND_LABELS[item.kind], item.system || null, environmentName].filter(Boolean).join(" · ")}>
        <View style={{ gap: space.lg }}>
          <View style={styles.badges}>
            <Pill label={EQUIPMENT_STATUS_LABELS[item.status]} tone={EQUIPMENT_STATUS_TONE[item.status]} />
            {item.deadline !== null ? <Pill label={`Prazo ${formatDate(item.deadline)}`} tone={overdue ? "danger" : "neutral"} /> : null}
            {overdue ? <Pill label="Em atraso" tone="danger" /> : null}
          </View>

          <ChoiceGroup<EquipmentStatus> label="Status" value={item.status} options={STATUS_OPTIONS} onChange={(s) => void changeStatus(s)} />

          <View style={{ gap: space.sm }}>
            <SectionTitle title="Etiqueta QR" />
            {item.token ? (
              <Surface style={styles.row}>
                <QrCode size={20} color={colors.primary} />
                <Text style={[type.bodyStrong, { color: colors.text, flex: 1 }]}>{item.token}</Text>
                <AppButton label="Abrir" variant="ghost" size="sm" onPress={() => router.push(`/equipamento/${item.token}` as Href)} />
              </Surface>
            ) : (
              <AppButton label="Vincular ou gerar etiqueta" variant="secondary" block icon={<QrCode size={18} color={colors.text} />} onPress={() => setTagOpen(true)} />
            )}
          </View>

          <View style={{ gap: space.sm }}>
            <SectionTitle title="Cadastro de campo" />
            {item.linkedEquipmentId ? (
              <Surface style={styles.row}>
                <Tag size={20} color={colors.success} />
                <Text style={[type.body, { color: colors.text, flex: 1 }]}>Vinculado a um equipamento cadastrado em campo</Text>
                <AppButton label="Desvincular" variant="ghost" size="sm" icon={<Unlink size={16} color={colors.destructive} />} onPress={() => setConfirmUnlink(true)} />
              </Surface>
            ) : (
              <AppButton label="Vincular cadastro de campo" variant="secondary" block icon={<Link2 size={18} color={colors.text} />} onPress={() => setLinkOpen(true)} />
            )}
          </View>

          {checklist && checklist.length > 0 ? (
            <View style={{ gap: space.sm }}>
              <SectionTitle title={`Checklist (${checklist.filter((c) => c.completed).length}/${checklist.length})`} />
              <Surface padded={false}>
                {checklist.map((c, index) => (
                  <Pressable
                    key={c._id}
                    onPress={() => void toggle({ itemId: c._id, completed: !c.completed }).catch((err) => toast.error(getErrorMessage(err, "Não deu para marcar")))}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: c.completed }}
                    style={({ pressed }) => [styles.check, index > 0 && styles.border, pressed && { backgroundColor: colors.surfacePressed }]}
                  >
                    <View style={[styles.box, c.completed && styles.boxOn]}>{c.completed ? <Check size={14} color={colors.onPrimary} strokeWidth={3} /> : null}</View>
                    <Text style={[type.body, { color: colors.text, flex: 1 }]}>
                      {c.label}
                      {c.required ? <Text style={{ color: colors.textSecondary }}> · obrigatório</Text> : null}
                    </Text>
                  </Pressable>
                ))}
              </Surface>
            </View>
          ) : null}

          <AppButton label="Editar dados do equipamento" variant="ghost" block icon={<Pencil size={16} color={colors.primary} />} onPress={() => onEdit(item)} />
        </View>
      </Sheet>

      <TagSheet open={tagOpen} itemId={item._id} onClose={() => setTagOpen(false)} />
      <LinkSheet open={linkOpen} itemId={item._id} onClose={() => setLinkOpen(false)} />
      <ConfirmDialog
        open={confirmUnlink}
        title="Desvincular o cadastro de campo?"
        description="O equipamento cadastrado em campo continua existindo, só deixa de ocupar este item planejado."
        confirmLabel="Desvincular"
        destructive
        busy={busy}
        onConfirm={() => void doUnlink()}
        onCancel={() => setConfirmUnlink(false)}
      />
    </>
  );
}

/** Vincular etiqueta por código ou lote, ou gerar uma nova (O9). */
function TagSheet({ open, itemId, onClose }: { open: boolean; itemId: Id<"projectEquipment">; onClose: () => void }) {
  const toast = useToast();
  const batches = useQuery(api.qrCodes.listAvailableBatches, open ? {} : "skip");
  const linkToken = useMutation(api.qrCodes.linkTokenToProjectEquipment);
  const generate = useMutation(api.qrCodes.generateForProjectEquipment);
  const [code, setCode] = useState("");
  const [batchToken, setBatchToken] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "link" | "generate">(null);
  const [error, setError] = useState<string | null>(null);

  const tokenOptions = (batches ?? []).flatMap((b) =>
    b.availableTokens.slice(0, 50).map((t) => ({ value: t, label: t, description: [b.batchName, b.projectName].filter(Boolean).join(" · ") || null }))
  );

  async function link(token: string) {
    setBusy("link");
    setError(null);
    try {
      const result = await linkToken({ token, itemId });
      toast.success(`Etiqueta ${result.token} vinculada`);
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, "Não deu para vincular a etiqueta"));
    } finally {
      setBusy(null);
    }
  }

  async function gen() {
    setBusy("generate");
    setError(null);
    try {
      const result = await generate({ itemId });
      toast.success(result.created ? `Etiqueta ${result.token} gerada` : `Etiqueta ${result.token} já existia`);
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, "Não deu para gerar a etiqueta"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Etiqueta do equipamento">
      <View style={{ gap: space.lg }}>
        <View style={{ gap: space.sm }}>
          <Field label="Código da etiqueta" value={code} onChangeText={setCode} autoCapitalize="characters" autoCorrect={false} />
          <AppButton label="Vincular código" variant="secondary" block disabled={!normalizeTypedToken(code)} loading={busy === "link" && !batchToken} onPress={() => void link(normalizeTypedToken(code))} />
        </View>
        <View style={{ gap: space.sm }}>
          <PickerField label="Ou escolha de um lote" value={batchToken} onChange={setBatchToken} options={tokenOptions} searchable loading={batches === undefined} placeholder="Etiquetas livres dos lotes" emptyText="Nenhuma etiqueta livre." />
          {batchToken ? <AppButton label={`Vincular ${batchToken}`} block loading={busy === "link"} onPress={() => void link(batchToken)} /> : null}
        </View>
        <View style={styles.divider} />
        <AppButton label="Gerar etiqueta nova" variant="ghost" block icon={<QrCode size={18} color={colors.primary} />} loading={busy === "generate"} onPress={() => void gen()} />
        <Text style={[type.caption, { color: colors.textSecondary, textAlign: "center" }]}>A impressão das etiquetas é feita no web.</Text>
        {error ? <Banner tone="danger" title={error} /> : null}
      </View>
    </Sheet>
  );
}

/** Vincular um equipamento cadastrado em campo a este item (O9). */
function LinkSheet({ open, itemId, onClose }: { open: boolean; itemId: Id<"projectEquipment">; onClose: () => void }) {
  const toast = useToast();
  const assignable = useQuery(api.equipment.listAssignable, open ? {} : "skip");
  const link = useMutation(api.projectEquipment.linkEquipment);
  const [equipmentId, setEquipmentId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!equipmentId) return;
    setBusy(true);
    try {
      await link({ itemId, equipmentId: equipmentId as Id<"equipment"> });
      toast.success("Cadastro vinculado");
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err, "Não deu para vincular"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Vincular cadastro de campo" footer={<AppButton label="Vincular" block disabled={!equipmentId} loading={busy} onPress={() => void save()} />}>
      <PickerField
        label="Equipamento cadastrado em campo"
        value={equipmentId}
        onChange={setEquipmentId}
        options={(assignable ?? []).map((e) => ({ value: e._id as string, label: e.description ?? "Equipamento sem descrição", description: [e.token, EQUIPMENT_STATUS_LABELS[e.status as EquipmentStatus]].filter(Boolean).join(" · ") }))}
        searchable
        loading={assignable === undefined}
        placeholder="Escolha o cadastro"
        emptyText="Nenhum cadastro livre."
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  badges: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  row: { flexDirection: "row", alignItems: "center", gap: space.md },
  check: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md, minHeight: 52 },
  border: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider },
  box: { width: 24, height: 24, borderRadius: radius.sm, borderWidth: 2, borderColor: colors.controlBorder, alignItems: "center", justifyContent: "center" },
  boxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  divider: { height: 1, backgroundColor: colors.divider },
});
