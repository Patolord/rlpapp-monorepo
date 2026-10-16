import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { formatCurrency } from "@rlpapp/shared";
import type { FunctionReturnType } from "convex/server";
import { useMutation, useQuery } from "convex/react";
import { Building2, Calendar, FileText, HardHat, Plus, StickyNote, Trash2 } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { AppButton, Field, IconButton, PickerField, SegmentedField, Sheet, Surface, useToast } from "@/components/ui";
import { getErrorMessage } from "@/lib/errors";
import { maskDateInput, parseCurrencyInput, parseDateInput, toCurrencyInput, toDateInput } from "@/lib/format";
import { colors, space, type } from "@/lib/theme";

import { DIRECTION_LABELS, KIND_LABELS, type ContractDirection, type ContractKind } from "./labels";

export type ContractDetail = NonNullable<FunctionReturnType<typeof api.contracts.get>>;

type ItemDraft = { key: string; description: string; value: string };

function newItem(description = "", value = ""): ItemDraft {
  return { key: `${Date.now()}-${Math.random()}`, description, value };
}

/** Criar / editar contrato (base ou aditivo) com itens de serviço. */
export function ContractFormSheet({
  open,
  onClose,
  contract,
  defaultProjectId,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  contract?: ContractDetail | null;
  defaultProjectId?: Id<"projects"> | null;
  onSaved?: (id: Id<"contracts">) => void;
}) {
  const toast = useToast();
  const create = useMutation(api.contracts.create);
  const update = useMutation(api.contracts.update);
  const isEdit = Boolean(contract);

  const [title, setTitle] = useState("");
  const [direction, setDirection] = useState<ContractDirection>("client_sale");
  const [kind, setKind] = useState<ContractKind>("base");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [parentContractId, setParentContractId] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [contractorId, setContractorId] = useState<string | null>(null);
  const [signedAt, setSignedAt] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<ItemDraft[]>([newItem()]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const projects = useQuery(api.projects.list, open ? {} : "skip");
  const customers = useQuery(api.customers.list, open && direction === "client_sale" ? { activeOnly: true } : "skip");
  const contractors = useQuery(api.contractors.list, open && direction === "contractor_hire" ? { activeOnly: true } : "skip");
  const baseOptions = useQuery(
    api.contracts.listBaseOptions,
    open && kind === "addendum"
      ? {
          direction,
          projectId: (projectId as Id<"projects"> | null) ?? null,
          excludeContractId: contract?._id,
        }
      : "skip"
  );

  useEffect(() => {
    if (!open) return;
    setTitle(contract?.title ?? "");
    setDirection(contract?.direction ?? "client_sale");
    setKind(contract?.kind ?? "base");
    setProjectId(contract?.projectId ?? defaultProjectId ?? null);
    setParentContractId(contract?.parentContractId ?? null);
    setCustomerId(contract?.customerId ?? null);
    setContractorId(contract?.contractorId ?? null);
    setSignedAt(toDateInput(contract?.signedAt));
    setNotes(contract?.notes ?? "");
    setItems(
      contract && contract.serviceItems.length > 0
        ? contract.serviceItems.map((item) => newItem(item.description, toCurrencyInput(item.valueCents)))
        : [newItem()]
    );
    setErrors({});
  }, [open, contract, defaultProjectId]);

  const totalCents = useMemo(
    () => items.reduce((sum, item) => sum + (parseCurrencyInput(item.value) ?? 0), 0),
    [items]
  );

  function updateItem(key: string, patch: Partial<ItemDraft>) {
    setItems((current) => current.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }

  async function submit() {
    const nextErrors: Record<string, string> = {};
    if (!title.trim()) nextErrors.title = "Informe o título";
    if (direction === "client_sale" && !customerId) nextErrors.customer = "Informe o cliente";
    if (direction === "contractor_hire" && !contractorId) nextErrors.contractor = "Informe o empreiteiro";
    if (kind === "addendum" && !parentContractId) nextErrors.parent = "Escolha o contrato base";
    if (signedAt && parseDateInput(signedAt) === null) nextErrors.signedAt = "Data inválida (dd/mm/aaaa)";
    const serviceItems = items
      .filter((item) => item.description.trim() || item.value.trim())
      .map((item) => ({ description: item.description.trim(), valueCents: parseCurrencyInput(item.value) }));
    if (serviceItems.length === 0) nextErrors.items = "Adicione pelo menos um item de serviço";
    if (serviceItems.some((item) => !item.description || item.valueCents === null)) {
      nextErrors.items = "Cada item precisa de descrição e valor";
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        direction,
        kind,
        projectId: (projectId as Id<"projects"> | null) ?? null,
        parentContractId: kind === "addendum" ? ((parentContractId as Id<"contracts"> | null) ?? null) : null,
        customerId: direction === "client_sale" ? ((customerId as Id<"customers"> | null) ?? null) : null,
        contractorId: direction === "contractor_hire" ? ((contractorId as Id<"contractors"> | null) ?? null) : null,
        notes: notes.trim(),
        serviceItems: serviceItems.map((item) => ({ description: item.description, valueCents: item.valueCents! })),
      };
      const signed = signedAt ? parseDateInput(signedAt) : null;
      let id: Id<"contracts">;
      if (contract) {
        await update({ contractId: contract._id, ...payload, signedAt: signed });
        id = contract._id;
        toast.success("Contrato atualizado");
      } else {
        id = await create({ ...payload, signedAt: signed ?? undefined });
        toast.success("Contrato criado");
      }
      onClose();
      onSaved?.(id);
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível salvar o contrato"));
    } finally {
      setSaving(false);
    }
  }

  const iconColor = colors.icon;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={isEdit ? "Editar contrato" : "Novo contrato"}
      footer={
        <View style={{ gap: space.sm }}>
          <View style={styles.totalRow}>
            <Text style={[type.bodySm, { color: colors.textSecondary }]}>Valor total</Text>
            <Text style={[type.heading, { color: colors.text }]}>{formatCurrency(totalCents)}</Text>
          </View>
          <AppButton label={isEdit ? "Salvar alterações" : "Criar contrato"} onPress={() => void submit()} loading={saving} />
        </View>
      }
    >
      <SegmentedField<ContractDirection>
        label="Tipo de contrato"
        value={direction}
        onChange={(next) => {
          setDirection(next);
          setParentContractId(null);
        }}
        options={[
          { value: "client_sale", label: DIRECTION_LABELS.client_sale },
          { value: "contractor_hire", label: DIRECTION_LABELS.contractor_hire },
        ]}
      />
      <SegmentedField<ContractKind>
        label="Natureza"
        value={kind}
        onChange={(next) => {
          setKind(next);
          if (next === "base") setParentContractId(null);
        }}
        options={[
          { value: "base", label: KIND_LABELS.base },
          { value: "addendum", label: KIND_LABELS.addendum },
        ]}
      />
      <Field
        label="Título *"
        icon={<FileText size={24} color={iconColor} strokeWidth={1.6} />}
        value={title}
        onChangeText={setTitle}
        error={errors.title}
        placeholder="Instalação VRF — Torre A"
      />
      <PickerField
        label="Obra"
        icon={<Building2 size={24} color={iconColor} strokeWidth={1.6} />}
        value={projectId}
        onChange={(next) => {
          setProjectId(next);
          setParentContractId(null);
        }}
        options={(projects ?? []).map((project) => ({
          value: project._id as string,
          label: project.legacyNumber ? `#${project.legacyNumber} · ${project.name}` : project.name,
          description: project.client,
        }))}
        loading={projects === undefined}
        searchable
        clearable
        placeholder="Sem obra vinculada"
      />
      {kind === "addendum" ? (
        <PickerField
          label="Contrato base *"
          icon={<FileText size={24} color={iconColor} strokeWidth={1.6} />}
          value={parentContractId}
          onChange={setParentContractId}
          options={(baseOptions ?? []).map((option) => ({
            value: option._id as string,
            label: option.title,
            description: formatCurrency(option.valueCents),
          }))}
          loading={baseOptions === undefined}
          searchable
          error={errors.parent}
          emptyText="Nenhum contrato base para esta obra e tipo."
        />
      ) : null}
      {direction === "client_sale" ? (
        <PickerField
          label="Cliente *"
          icon={<Building2 size={24} color={iconColor} strokeWidth={1.6} />}
          value={customerId}
          onChange={setCustomerId}
          options={(customers ?? []).map((customer) => ({
            value: customer._id as string,
            label: customer.name,
            description: customer.legalName,
          }))}
          loading={customers === undefined}
          searchable
          error={errors.customer}
        />
      ) : (
        <PickerField
          label="Empreiteiro *"
          icon={<HardHat size={24} color={iconColor} strokeWidth={1.6} />}
          value={contractorId}
          onChange={setContractorId}
          options={(contractors ?? []).map((contractor) => ({
            value: contractor._id as string,
            label: contractor.name,
            description: contractor.legalName,
          }))}
          loading={contractors === undefined}
          searchable
          error={errors.contractor}
        />
      )}
      <Field
        label="Data de assinatura"
        icon={<Calendar size={24} color={iconColor} strokeWidth={1.6} />}
        value={signedAt}
        onChangeText={(v) => setSignedAt(maskDateInput(v))}
        keyboardType="number-pad"
        placeholder="dd/mm/aaaa"
        error={errors.signedAt}
      />
      <Field
        label="Observações"
        icon={<StickyNote size={24} color={iconColor} strokeWidth={1.6} />}
        value={notes}
        onChangeText={setNotes}
        multiline
      />

      <View style={{ gap: space.md }}>
        <View style={styles.itemsHeader}>
          <Text style={[type.eyebrow, { color: colors.textSecondary }]}>Itens de serviço</Text>
          <AppButton
            label="Adicionar item"
            variant="ghost"
            size="sm"
            icon={<Plus size={18} color={colors.primary} strokeWidth={2} />}
            onPress={() => setItems((current) => [...current, newItem()])}
          />
        </View>
        {errors.items ? <Text style={[type.caption, { color: colors.danger, marginLeft: 4 }]}>{errors.items}</Text> : null}
        {items.map((item, index) => (
          <Surface key={item.key} style={{ gap: space.md }}>
            <View style={styles.itemHead}>
              <Text style={[type.caption, { color: colors.textMuted }]}>Item {index + 1}</Text>
              {items.length > 1 ? (
                <IconButton
                  label="Remover item"
                  size={32}
                  tone="ghost"
                  icon={<Trash2 size={16} color={colors.danger} strokeWidth={2} />}
                  onPress={() => setItems((current) => current.filter((i) => i.key !== item.key))}
                />
              ) : null}
            </View>
            <Field
              label="Descrição"
              size="md"
              value={item.description}
              onChangeText={(v) => updateItem(item.key, { description: v })}
              placeholder="Fornecimento e instalação"
            />
            <Field
              label="Valor (R$)"
              size="md"
              value={item.value}
              onChangeText={(v) => updateItem(item.key, { value: v })}
              keyboardType="decimal-pad"
              placeholder="0,00"
            />
          </Surface>
        ))}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  totalRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 4 },
  itemsHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  itemHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
});
