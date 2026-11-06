import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { parseCurrencyToCents } from "@rlpapp/shared";
import { Loader2 } from "lucide-react";
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
import { runWithToast } from "@/lib/errors";

import {
  ContractContractorField,
  ContractCustomerField,
  ContractDirectionField,
  ContractKindField,
  ContractParentField,
  ContractProjectField,
} from "./contract-form-fields";
import {
  ContractServiceItems,
  newServiceRow,
  type ServiceRow,
} from "./contract-service-items";

export type ContractDirection = "client_sale" | "contractor_hire";
export type ContractKind = "base" | "addendum";

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
              <ContractDirectionField
                value={direction}
                onChange={(next) => {
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
              />
              <ContractKindField
                value={kind}
                onChange={(next) => {
                  setKind(next);
                  if (next === "base") setParentContractId("");
                }}
              />
            </div>

            {!lockedProjectId && (
              <ContractProjectField
                projectId={projectId}
                projects={projects}
                onChange={(next) => {
                  setProjectId(next);
                  setParentContractId("");
                }}
              />
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
                <ContractCustomerField
                  customerId={customerId}
                  customers={customers}
                  currentCustomerName={detail?.customerName}
                  onChange={setCustomerId}
                />
              )
            ) : (
              <ContractContractorField
                contractorId={contractorId}
                contractors={contractors}
                currentContractorName={detail?.contractorName}
                onChange={setContractorId}
              />
            )}

            {kind === "addendum" && (
              <ContractParentField
                parentContractId={parentContractId}
                baseOptions={baseOptions}
                currentParentTitle={detail?.parentTitle}
                onChange={setParentContractId}
              />
            )}

            <ContractServiceItems
              serviceRows={serviceRows}
              setServiceRows={setServiceRows}
            />

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
                {saving && <Loader2 className="animate-spin" />}
                {isEdit ? "Salvar alterações" : "Criar contrato"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
