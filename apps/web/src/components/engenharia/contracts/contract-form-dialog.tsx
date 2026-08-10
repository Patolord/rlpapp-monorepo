import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { formatCurrency, parseCurrencyToCents } from "@rlpapp/shared";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { runWithToast } from "@/lib/errors";

export type ContractDirection = "client_sale" | "contractor_hire";
export type ContractKind = "base" | "addendum";

type ServiceRow = {
  key: string;
  description: string;
  value: string;
};

function toDateInput(ts?: number | null): string {
  if (!ts) return "";
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function fromDateInput(value: string): number | null {
  if (!value) return null;
  const ms = new Date(`${value}T00:00:00`).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function toCurrencyInput(cents?: number | null): string {
  if (cents == null) return "";
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

function newServiceRow(seed?: {
  description?: string;
  valueCents?: number;
}): ServiceRow {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    description: seed?.description ?? "",
    value: toCurrencyInput(seed?.valueCents),
  };
}

const DIRECTION_LABELS: Record<ContractDirection, string> = {
  client_sale: "Venda ao cliente",
  contractor_hire: "Contratação de empreiteiro",
};

const KIND_LABELS: Record<ContractKind, string> = {
  base: "Contrato base",
  addendum: "Aditivo",
};

export function ContractFormDialog({
  contractId,
  lockedProjectId,
  defaultCustomerId,
  defaultCustomerName,
  trigger,
  open: controlledOpen,
  onOpenChange,
}: {
  contractId?: Id<"contracts">;
  lockedProjectId?: Id<"projects">;
  defaultCustomerId?: Id<"customers"> | null;
  defaultCustomerName?: string | null;
  trigger: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const createContract = useMutation(api.contracts.create);
  const updateContract = useMutation(api.contracts.update);
  const isEdit = Boolean(contractId);

  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;

  function setOpen(next: boolean) {
    if (isControlled) {
      onOpenChange?.(next);
    } else {
      setInternalOpen(next);
    }
  }

  const detail = useQuery(
    api.contracts.get,
    open && contractId ? { contractId } : "skip"
  );
  const customers = useQuery(
    api.customers.list,
    open ? { activeOnly: true } : "skip"
  );
  const contractors = useQuery(
    api.contractors.list,
    open ? { activeOnly: true } : "skip"
  );
  const projects = useQuery(
    api.projects.list,
    open && !lockedProjectId ? {} : "skip"
  );

  const [title, setTitle] = useState("");
  const [direction, setDirection] = useState<ContractDirection>("client_sale");
  const [kind, setKind] = useState<ContractKind>("base");
  const [projectId, setProjectId] = useState<string>("");
  const [parentContractId, setParentContractId] = useState<string>("");
  const [customerId, setCustomerId] = useState<string>("");
  const [contractorId, setContractorId] = useState<string>("");
  const [signedAt, setSignedAt] = useState("");
  const [notes, setNotes] = useState("");
  const [serviceRows, setServiceRows] = useState<ServiceRow[]>([
    newServiceRow(),
  ]);
  const [saving, setSaving] = useState(false);
  const [hydratedFor, setHydratedFor] = useState<string | null>(null);

  const effectiveProjectId = (lockedProjectId ??
    (projectId || null)) as Id<"projects"> | null;

  const baseOptions = useQuery(
    api.contracts.listBaseOptions,
    open
      ? {
          direction,
          projectId: effectiveProjectId,
          excludeContractId: contractId,
        }
      : "skip"
  );

  useEffect(() => {
    if (!open) {
      setHydratedFor(null);
      return;
    }
    if (contractId) {
      if (!detail || hydratedFor === contractId) return;
      setTitle(detail.title);
      setDirection(detail.direction);
      setKind(detail.kind);
      setProjectId(detail.projectId ?? "");
      setParentContractId(detail.parentContractId ?? "");
      setCustomerId(detail.customerId ?? "");
      setContractorId(detail.contractorId ?? "");
      setSignedAt(toDateInput(detail.signedAt));
      setNotes(detail.notes ?? "");
      setServiceRows(
        detail.serviceItems.length > 0
          ? detail.serviceItems.map((item) => newServiceRow(item))
          : [newServiceRow()]
      );
      setHydratedFor(contractId);
      return;
    }
    if (hydratedFor === "new") return;
    setTitle("");
    setDirection("client_sale");
    setKind("base");
    setProjectId(lockedProjectId ?? "");
    setParentContractId("");
    setCustomerId(defaultCustomerId ?? "");
    setContractorId("");
    setSignedAt("");
    setNotes("");
    setServiceRows([newServiceRow()]);
    setHydratedFor("new");
  }, [
    open,
    contractId,
    detail,
    hydratedFor,
    lockedProjectId,
    defaultCustomerId,
  ]);

  const totalPreview = useMemo(() => {
    let total = 0;
    for (const row of serviceRows) {
      try {
        total += parseCurrencyToCents(row.value || "0");
      } catch {
        // ignore invalid row while typing
      }
    }
    return total;
  }, [serviceRows]);

  const currentCustomerMissing =
    customers !== undefined &&
    Boolean(customerId) &&
    !customers.some((customer) => customer._id === customerId);
  const currentContractorMissing =
    contractors !== undefined &&
    Boolean(contractorId) &&
    !contractors.some((contractor) => contractor._id === contractorId);
  const currentParentMissing =
    baseOptions !== undefined &&
    Boolean(parentContractId) &&
    !baseOptions.some((option) => option._id === parentContractId);

  const directionItems = DIRECTION_LABELS;
  const kindItems = KIND_LABELS;

  const projectItems = Object.fromEntries([
    ["__none__", "Sem obra"] as const,
    ...(projects ?? []).map((project) => {
      const label = project.legacyNumber
        ? `#${project.legacyNumber} · ${project.name}`
        : project.name;
      return [project._id, label] as const;
    }),
  ]);

  const customerItems = Object.fromEntries([
    ...(currentCustomerMissing && customerId
      ? [
          [
            customerId,
            `${detail?.customerName ?? "Cliente atual indisponível"} (inativo)`,
          ] as const,
        ]
      : []),
    ...(customers ?? []).map((customer) => [customer._id, customer.name] as const),
  ]);

  const contractorItems = Object.fromEntries([
    ...(currentContractorMissing && contractorId
      ? [
          [
            contractorId,
            `${detail?.contractorName ?? "Empreiteiro atual indisponível"} (inativo)`,
          ] as const,
        ]
      : []),
    ...(contractors ?? []).map(
      (contractor) => [contractor._id, contractor.name] as const
    ),
  ]);

  const parentContractItems = Object.fromEntries([
    ...(currentParentMissing && parentContractId
      ? [
          [
            parentContractId,
            detail?.parentTitle ?? "Contrato base atual indisponível",
          ] as const,
        ]
      : []),
    ...(baseOptions ?? []).map(
      (option) =>
        [
          option._id,
          `${option.title} · ${formatCurrency(option.valueCents)}`,
        ] as const
    ),
  ]);

  const selectTriggerClassName =
    "w-full bg-transparent [&>span]:min-w-0 [&>span]:flex-1 [&>span]:truncate";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;

    const serviceItems: Array<{ description: string; valueCents: number }> =
      [];
    for (const row of serviceRows) {
      const description = row.description.trim();
      if (!description) {
        toast.error("Informe a descrição de todos os serviços");
        return;
      }
      let valueCents: number;
      try {
        valueCents = parseCurrencyToCents(row.value);
      } catch {
        toast.error(`Valor inválido no serviço "${description}"`);
        return;
      }
      if (valueCents <= 0) {
        toast.error(
          `O valor do serviço "${description}" deve ser maior que zero`
        );
        return;
      }
      serviceItems.push({ description, valueCents });
    }

    if (direction === "client_sale" && !customerId) {
      toast.error("Selecione o cliente");
      return;
    }
    if (direction === "contractor_hire" && !contractorId) {
      toast.error("Selecione o empreiteiro");
      return;
    }
    if (kind === "addendum" && !parentContractId) {
      toast.error("Selecione o contrato base do aditivo");
      return;
    }

    setSaving(true);
    const payload = {
      title: title.trim(),
      direction,
      kind,
      projectId: effectiveProjectId,
      parentContractId:
        kind === "addendum" ? (parentContractId as Id<"contracts">) : null,
      customerId:
        direction === "client_sale" ? (customerId as Id<"customers">) : null,
      contractorId:
        direction === "contractor_hire"
          ? (contractorId as Id<"contractors">)
          : null,
      notes: notes.trim() || undefined,
      serviceItems,
    };

    const ok = await runWithToast(
      () =>
        isEdit && contractId
          ? updateContract({
              contractId,
              ...payload,
              signedAt: fromDateInput(signedAt),
            })
          : createContract({
              ...payload,
              signedAt: fromDateInput(signedAt) ?? undefined,
            }),
      isEdit ? "Contrato atualizado" : "Contrato criado",
      isEdit
        ? "Não foi possível atualizar o contrato"
        : "Não foi possível criar o contrato"
    );
    setSaving(false);

    if (ok) {
      setOpen(false);
    }
  }

  const loadingEdit = Boolean(open && contractId && detail === undefined);
  const usesObraCustomer =
    Boolean(lockedProjectId && defaultCustomerId) &&
    (!isEdit || customerId === defaultCustomerId);
  const obraCustomerLabel =
    defaultCustomerName ??
    customers?.find((customer) => customer._id === defaultCustomerId)?.name ??
    "Cliente da obra";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Editar contrato" : "Novo contrato"}
          </DialogTitle>
          <DialogDescription>
            Cadastre serviços e valores. O total do contrato é a soma dos itens.
          </DialogDescription>
        </DialogHeader>

        {loadingEdit ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" />
            Carregando contrato...
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="contract-title">Título</Label>
              <Input
                id="contract-title"
                placeholder="Ex: Contrato principal, Aditivo 1..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Direção</Label>
                <Select
                  value={direction}
                  items={directionItems}
                  onValueChange={(value) => {
                    const next = value as ContractDirection;
                    setDirection(next);
                    setParentContractId("");
                    if (next === "client_sale") {
                      setContractorId("");
                      if (!isEdit && defaultCustomerId) {
                        setCustomerId(defaultCustomerId);
                      }
                    } else {
                      setCustomerId("");
                    }
                  }}
                >
                  <SelectTrigger className={selectTriggerClassName}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(
                      Object.entries(DIRECTION_LABELS) as Array<
                        [ContractDirection, string]
                      >
                    ).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select
                  value={kind}
                  items={kindItems}
                  onValueChange={(value) => {
                    const next = value as ContractKind;
                    setKind(next);
                    if (next === "base") setParentContractId("");
                  }}
                >
                  <SelectTrigger className={selectTriggerClassName}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(
                      Object.entries(KIND_LABELS) as Array<
                        [ContractKind, string]
                      >
                    ).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {!lockedProjectId && (
              <div className="space-y-2">
                <Label>Obra (opcional)</Label>
                <Select
                  value={projectId || "__none__"}
                  items={projectItems}
                  onValueChange={(value) => {
                    setProjectId(value === "__none__" ? "" : value);
                    setParentContractId("");
                  }}
                >
                  <SelectTrigger className={selectTriggerClassName}>
                    <SelectValue placeholder="Sem obra" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sem obra</SelectItem>
                    {(projects ?? []).map((project) => (
                      <SelectItem key={project._id} value={project._id}>
                        {project.legacyNumber
                          ? `#${project.legacyNumber} · ${project.name}`
                          : project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {direction === "client_sale" ? (
              usesObraCustomer ? (
                <div className="space-y-1.5 rounded-md border border-dashed bg-muted/30 px-3 py-2.5">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Cliente da obra
                  </p>
                  <p className="text-sm font-medium">{obraCustomerLabel}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label>Cliente</Label>
                  <Select
                    value={customerId || undefined}
                    items={customerItems}
                    onValueChange={setCustomerId}
                  >
                    <SelectTrigger className={selectTriggerClassName}>
                      <SelectValue placeholder="Selecione o cliente" />
                    </SelectTrigger>
                    <SelectContent>
                      {currentCustomerMissing && customerId && (
                        <SelectItem value={customerId} disabled>
                          {detail?.customerName ?? "Cliente atual indisponível"}{" "}
                          (inativo)
                        </SelectItem>
                      )}
                      {(customers ?? []).map((customer) => (
                        <SelectItem key={customer._id} value={customer._id}>
                          {customer.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )
            ) : (
              <div className="space-y-2">
                <Label>Empreiteiro</Label>
                <Select
                  value={contractorId || undefined}
                  items={contractorItems}
                  onValueChange={setContractorId}
                >
                  <SelectTrigger className={selectTriggerClassName}>
                    <SelectValue placeholder="Selecione o empreiteiro" />
                  </SelectTrigger>
                  <SelectContent>
                    {currentContractorMissing && contractorId && (
                      <SelectItem value={contractorId} disabled>
                        {detail?.contractorName ??
                          "Empreiteiro atual indisponível"}{" "}
                        (inativo)
                      </SelectItem>
                    )}
                    {(contractors ?? []).map((contractor) => (
                      <SelectItem key={contractor._id} value={contractor._id}>
                        {contractor.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {kind === "addendum" && (
              <div className="space-y-2">
                <Label>Contrato base</Label>
                <Select
                  value={parentContractId || undefined}
                  items={parentContractItems}
                  onValueChange={setParentContractId}
                >
                  <SelectTrigger className={selectTriggerClassName}>
                    <SelectValue placeholder="Selecione o contrato base" />
                  </SelectTrigger>
                  <SelectContent className="min-w-[var(--anchor-width)]">
                    {currentParentMissing && parentContractId && (
                      <SelectItem value={parentContractId} disabled>
                        {detail?.parentTitle ??
                          "Contrato base atual indisponível"}
                      </SelectItem>
                    )}
                    {(baseOptions ?? []).map((option) => (
                      <SelectItem
                        key={option._id}
                        value={option._id}
                        className="items-start py-2"
                      >
                        <span className="flex min-w-0 flex-col gap-0.5">
                          <span className="truncate font-medium leading-tight">
                            {option.title}
                          </span>
                          <span className="text-muted-foreground truncate text-xs leading-tight">
                            {formatCurrency(option.valueCents)}
                          </span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label>Serviços</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setServiceRows((rows) => [...rows, newServiceRow()])
                  }
                >
                  <Plus className="mr-1.5 size-3.5" />
                  Item
                </Button>
              </div>
              <div className="space-y-2">
                {serviceRows.map((row, index) => (
                  <div
                    key={row.key}
                    className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_140px_auto]"
                  >
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">
                        Descrição
                      </Label>
                      <Input
                        value={row.description}
                        placeholder={`Serviço ${index + 1}`}
                        onChange={(e) =>
                          setServiceRows((rows) =>
                            rows.map((r) =>
                              r.key === row.key
                                ? { ...r, description: e.target.value }
                                : r
                            )
                          )
                        }
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">
                        Valor (R$)
                      </Label>
                      <Input
                        value={row.value}
                        placeholder="0,00"
                        onChange={(e) =>
                          setServiceRows((rows) =>
                            rows.map((r) =>
                              r.key === row.key
                                ? { ...r, value: e.target.value }
                                : r
                            )
                          )
                        }
                        required
                      />
                    </div>
                    <div className="flex items-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={serviceRows.length === 1}
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() =>
                          setServiceRows((rows) =>
                            rows.filter((r) => r.key !== row.key)
                          )
                        }
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-sm tabular-nums text-muted-foreground">
                Total:{" "}
                <span className="font-semibold text-foreground">
                  {formatCurrency(totalPreview)}
                </span>
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="contract-signed">Data de assinatura</Label>
                <Input
                  id="contract-signed"
                  type="date"
                  value={signedAt}
                  onChange={(e) => setSignedAt(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contract-notes">Observações</Label>
                <Input
                  id="contract-notes"
                  placeholder="Opcional"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={saving || !title.trim()}>
                {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
                {isEdit ? "Salvar alterações" : "Criar contrato"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
