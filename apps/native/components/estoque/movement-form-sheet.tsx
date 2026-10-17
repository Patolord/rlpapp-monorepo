import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Building2, FileText, Plus, StickyNote, Trash2 } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { MaterialPickerField, type PickedMaterial } from "@/components/compras/material-picker";
import { AppButton, Field, IconButton, PickerField, Sheet, Surface, useToast } from "@/components/ui";
import { getErrorMessage } from "@/lib/errors";
import { colors, space, type } from "@/lib/theme";

import { MOVEMENT_LABELS, NEEDS_PROJECT, type MovementType } from "./labels";

export type PrefillLine = { materialId: Id<"materials">; name: string; variantLabel: string | null; unit: string | null; quantity: number };

type Line = { key: string; material: PickedMaterial | null; quantity: string };
const newLine = (material: PickedMaterial | null = null, quantity = ""): Line => ({ key: `${Date.now()}-${Math.random()}`, material, quantity });

/**
 * Nova movimentação de estoque: cria o documento e conclui na hora quando
 * o perfil permite; senão fica aguardando aprovação do Estoque.
 */
export function MovementFormSheet({
  open,
  onClose,
  fixedProjectId,
  requestId,
  prefillLines,
  lockType,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  fixedProjectId?: Id<"projects"> | null;
  /** Atendendo um pedido da obra: o documento conclui o pedido ao ser lançado. */
  requestId?: Id<"inventoryRequests"> | null;
  prefillLines?: PrefillLine[];
  lockType?: MovementType;
  onDone?: () => void;
}) {
  const toast = useToast();
  const access = useQuery(api.inventory.getAccess, open ? {} : "skip");
  const projects = useQuery(api.inventory.listProjects, open ? {} : "skip");
  const createDocument = useMutation(api.inventory.createDocument);
  const postDocument = useMutation(api.inventory.postDocument);

  const allowedTypes = useMemo<MovementType[]>(() => {
    if (!access) return [];
    const types: MovementType[] = [];
    if (access.canCreateEntry) types.push("entry");
    if (access.canWriteCentral) types.push("transfer", "adjustment");
    if (access.canCreateProjectMovement) types.push("consumption", "return");
    return [...new Set(types)];
  }, [access]);

  const [movementType, setMovementType] = useState<MovementType | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>([newLine()]);
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMovementType(lockType ?? null);
    setProjectId(fixedProjectId ?? null);
    setLines(prefillLines && prefillLines.length > 0 ? prefillLines.map((l) => newLine({ materialId: l.materialId, name: l.name, variantLabel: l.variantLabel, unit: l.unit }, String(l.quantity))) : [newLine()]);
    setReference("");
    setNotes("");
    setErrors({});
  }, [open, lockType, fixedProjectId, prefillLines]);

  useEffect(() => {
    if (open && !movementType && !lockType && allowedTypes.length > 0) setMovementType(allowedTypes[0]);
  }, [open, movementType, lockType, allowedTypes]);

  const needsProject = movementType ? NEEDS_PROJECT[movementType] : false;

  function updateLine(key: string, patch: Partial<Line>) {
    setLines((current) => current.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  async function submit() {
    const nextErrors: Record<string, string> = {};
    if (!movementType) nextErrors.type = "Escolha o tipo";
    if (needsProject && !projectId) nextErrors.project = "Selecione a obra";
    const parsed = lines.map((l) => ({ materialId: l.material?.materialId, quantity: Number.parseFloat(l.quantity.replace(",", ".")) }));
    if (parsed.length === 0 || parsed.some((l) => !l.materialId || !Number.isFinite(l.quantity) || l.quantity <= 0)) {
      nextErrors.lines = "Preencha material e quantidade em todas as linhas";
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    setSaving(true);
    try {
      const result = await createDocument({
        type: movementType!,
        projectId: needsProject ? (projectId as Id<"projects">) : undefined,
        reference: reference.trim() || undefined,
        notes: notes.trim() || undefined,
        lines: parsed.map((l) => ({ materialId: l.materialId!, quantity: l.quantity })),
      });
      const t = movementType!;
      const canPostImmediately =
        (t === "entry" && access?.canCreateEntry) ||
        ((t === "transfer" || t === "adjustment" || t === "return") && access?.canWriteCentral) ||
        (t === "consumption" && access?.canCreateProjectMovement);
      if (result.status === "pending_approval") {
        toast.show(`${result.issueCount} incompatibilidade(s) encontrada(s). Aguardando o engenheiro responsável.`);
      } else if (canPostImmediately) {
        await postDocument({ documentId: result.documentId, requestId: requestId && t === "transfer" ? requestId : undefined });
        toast.success(requestId ? "Pedido enviado à obra" : "Movimentação concluída");
      } else {
        toast.success("Movimentação registrada para conclusão pelo Estoque");
      }
      onClose();
      onDone?.();
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível registrar a movimentação"));
    } finally {
      setSaving(false);
    }
  }

  const iconColor = colors.icon;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={requestId ? "Atender pedido" : "Nova movimentação"}
      subtitle={movementType ? MOVEMENT_LABELS[movementType] : undefined}
      footer={<AppButton label={requestId ? "Enviar e concluir pedido" : "Registrar movimentação"} onPress={() => void submit()} loading={saving} disabled={access === undefined || allowedTypes.length === 0} />}
    >
      {access && allowedTypes.length === 0 ? (
        <Text style={[type.bodySm, { color: colors.danger }]}>Seu perfil não pode registrar movimentações.</Text>
      ) : null}
      <PickerField<MovementType>
        label="Tipo *"
        icon={<FileText size={24} color={iconColor} strokeWidth={1.6} />}
        value={movementType}
        onChange={(next) => next && setMovementType(next)}
        options={allowedTypes.map((t) => ({ value: t, label: MOVEMENT_LABELS[t] }))}
        disabled={Boolean(lockType)}
        loading={access === undefined}
        error={errors.type}
      />
      {needsProject ? (
        <PickerField
          label="Obra *"
          icon={<Building2 size={24} color={iconColor} strokeWidth={1.6} />}
          value={projectId}
          onChange={setProjectId}
          options={(projects ?? []).map((p) => ({ value: p._id as string, label: p.name }))}
          loading={projects === undefined}
          searchable
          disabled={Boolean(fixedProjectId)}
          error={errors.project}
        />
      ) : null}

      <View style={{ gap: space.md }}>
        <View style={styles.linesHeader}>
          <Text style={[type.eyebrow, { color: colors.textSecondary }]}>Materiais</Text>
          <AppButton label="Adicionar linha" variant="ghost" size="sm" icon={<Plus size={18} color={colors.primary} strokeWidth={2} />} onPress={() => setLines((c) => [...c, newLine()])} />
        </View>
        {errors.lines ? <Text style={[type.caption, { color: colors.danger, marginLeft: 4 }]}>{errors.lines}</Text> : null}
        {lines.map((line, index) => (
          <Surface key={line.key} style={{ gap: space.md }}>
            <View style={styles.lineHead}>
              <Text style={[type.caption, { color: colors.textMuted }]}>Linha {index + 1}</Text>
              {lines.length > 1 ? <IconButton label="Remover linha" size={32} tone="ghost" icon={<Trash2 size={16} color={colors.danger} strokeWidth={2} />} onPress={() => setLines((c) => c.filter((l) => l.key !== line.key))} /> : null}
            </View>
            <MaterialPickerField value={line.material} onChange={(m) => updateLine(line.key, { material: m })} />
            <Field
              label={`Quantidade${line.material?.unit ? ` (${line.material.unit})` : ""}`}
              size="md"
              value={line.quantity}
              onChangeText={(v) => updateLine(line.key, { quantity: v })}
              keyboardType="decimal-pad"
              placeholder="0"
            />
          </Surface>
        ))}
      </View>

      <Field label="Referência (NF, pedido, documento)" icon={<FileText size={24} color={iconColor} strokeWidth={1.6} />} value={reference} onChangeText={setReference} />
      <Field label="Observações" icon={<StickyNote size={24} color={iconColor} strokeWidth={1.6} />} value={notes} onChangeText={setNotes} multiline />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  linesHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  lineHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
});
