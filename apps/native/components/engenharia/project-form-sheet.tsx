import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { formatCurrency } from "@rlpapp/shared";
import { useMutation, useQuery } from "convex/react";
import { useRouter, type Href } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";

import { AppButton, Banner, ChoiceGroup, Field, PickerField, Sheet, useToast } from "@/components/ui";
import { getErrorMessage } from "@/lib/errors";
import { maskDateInput, parseDateInput, toDateInput } from "@/lib/format";
import { space } from "@/lib/theme";

import { PROJECT_STATUS, type ProjectStatus } from "./project-labels";

export type ProjectInput = {
  _id: Id<"projects">;
  name: string;
  legacyNumber: number | null;
  customerId: Id<"customers"> | null;
  address: string | null;
  status: ProjectStatus | null;
  responsibleId: Id<"users"> | null;
  startDate: number | null;
  endDate: number | null;
};

/**
 * Nova obra (ficha O2, com contrato opcional) e editar obra (O3). Editar mostra
 * também endereço, situação, responsável e datas.
 */
export function ProjectFormSheet({ open, onClose, project }: { open: boolean; onClose: () => void; project?: ProjectInput | null }) {
  const router = useRouter();
  const toast = useToast();
  const isEdit = Boolean(project);
  const customers = useQuery(api.customers.list, open ? { activeOnly: true } : "skip");
  const contracts = useQuery(api.contracts.listUnassignedOptions, open && !isEdit ? {} : "skip");
  const users = useQuery(api.users.list, open && isEdit ? { onlyActive: true } : "skip");
  const create = useMutation(api.projects.createWithOptionalContract);
  const update = useMutation(api.projects.update);

  const [name, setName] = useState("");
  const [number, setNumber] = useState("");
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [contractId, setContractId] = useState<string | null>(null);
  const [address, setAddress] = useState("");
  const [status, setStatus] = useState<ProjectStatus>("in_progress");
  const [responsibleId, setResponsibleId] = useState<string | null>(null);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(project?.name ?? "");
    setNumber(project?.legacyNumber != null ? String(project.legacyNumber) : "");
    setCustomerId(project?.customerId ?? null);
    setContractId(null);
    setAddress(project?.address ?? "");
    setStatus(project?.status ?? "in_progress");
    setResponsibleId(project?.responsibleId ?? null);
    setStart(toDateInput(project?.startDate));
    setEnd(toDateInput(project?.endDate));
    setTried(false);
    setError(null);
  }, [open, project]);

  const errors = {
    name: name.trim() ? undefined : "Informe o nome da obra",
    number: /^\d+$/.test(number.trim()) ? undefined : "Informe o número da obra (só dígitos)",
    customer: customerId || isEdit ? undefined : "Escolha o cliente",
    start: start && parseDateInput(start) === null ? "Data inválida" : undefined,
    end: end && parseDateInput(end) === null ? "Data inválida" : undefined,
  };
  const valid = !Object.values(errors).some(Boolean);

  async function submit() {
    setTried(true);
    if (!valid) return;
    setSaving(true);
    setError(null);
    try {
      if (project) {
        await update({
          projectId: project._id,
          name: name.trim(),
          legacyNumber: Number(number),
          customerId: (customerId as Id<"customers"> | null) ?? null,
          address: address.trim() || null,
          status,
          responsibleId: (responsibleId as Id<"users"> | null) ?? null,
          startDate: start ? parseDateInput(start) : null,
          endDate: end ? parseDateInput(end) : null,
        });
        toast.success("Obra salva");
        onClose();
      } else {
        const result = await create({
          name: name.trim(),
          legacyNumber: Number(number),
          customerId: customerId as Id<"customers">,
          contractId: (contractId as Id<"contracts"> | null) ?? undefined,
        });
        toast.success(result.linkedContractId ? "Obra criada com o contrato" : "Obra criada");
        onClose();
        router.push(`/obra/${result.projectId}` as Href);
      }
    } catch (err) {
      setError(getErrorMessage(err, "Não deu para salvar a obra. Tente de novo."));
    } finally {
      setSaving(false);
    }
  }

  const engineers = (users ?? []).filter((u) => u.role === "engenheiro" || u.department === "engenharia" || u.role === "director" || u.role === "admin");

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={isEdit ? "Editar obra" : "Nova obra"}
      footer={<AppButton label={isEdit ? "Salvar" : "Criar obra"} block loading={saving} loadingLabel="Salvando…" onPress={() => void submit()} />}
    >
      <View style={{ gap: space.lg }}>
        <Field label="Nome" value={name} onChangeText={setName} placeholder="Ex.: Edifício Aurora" error={tried ? errors.name : undefined} />
        <Field label="Número da obra" value={number} onChangeText={(v) => setNumber(v.replace(/\D/g, ""))} keyboardType="number-pad" error={tried ? errors.number : undefined} />
        <PickerField
          label="Cliente"
          value={customerId}
          onChange={setCustomerId}
          options={(customers ?? []).map((c) => ({ value: c._id as string, label: c.name }))}
          searchable
          clearable={isEdit}
          loading={customers === undefined}
          placeholder="Escolha o cliente"
          error={tried ? errors.customer : undefined}
        />
        {!isEdit ? (
          <PickerField
            label="Contrato (opcional)"
            value={contractId}
            onChange={setContractId}
            options={(contracts ?? []).map((c) => ({
              value: c._id as string,
              label: c.title,
              description: [c.customerName ?? c.contractorName, formatCurrency(c.valueCents)].filter(Boolean).join(" · "),
            }))}
            searchable
            clearable
            loading={contracts === undefined}
            placeholder="Sem contrato"
            emptyText="Nenhum contrato sem obra."
            helper="Contratos que ainda não estão ligados a uma obra."
          />
        ) : (
          <>
            <Field label="Endereço" value={address} onChangeText={setAddress} placeholder="Rua, número, bairro, cidade" />
            <ChoiceGroup<ProjectStatus>
              label="Situação"
              value={status}
              onChange={setStatus}
              options={(["planning", "in_progress", "paused", "completed"] as ProjectStatus[]).map((s) => ({ value: s, label: PROJECT_STATUS[s].label, tone: PROJECT_STATUS[s].tone }))}
            />
            <PickerField
              label="Engenheiro responsável"
              value={responsibleId}
              onChange={setResponsibleId}
              options={engineers.map((u) => ({ value: u._id as string, label: u.name }))}
              searchable
              clearable
              loading={users === undefined}
              placeholder="Sem responsável"
              helper="Recebe os pedidos de material e decide as exceções de estoque."
            />
            <View style={{ flexDirection: "row", gap: space.sm }}>
              <Field label="Início" value={start} onChangeText={(v) => setStart(maskDateInput(v))} placeholder="dd/mm/aaaa" keyboardType="number-pad" error={tried ? errors.start : undefined} containerStyle={{ flex: 1 }} />
              <Field label="Término" value={end} onChangeText={(v) => setEnd(maskDateInput(v))} placeholder="dd/mm/aaaa" keyboardType="number-pad" error={tried ? errors.end : undefined} containerStyle={{ flex: 1 }} />
            </View>
          </>
        )}
        {error ? <Banner tone="danger" title={error} actionLabel="Tentar de novo" onAction={() => void submit()} /> : null}
      </View>
    </Sheet>
  );
}
