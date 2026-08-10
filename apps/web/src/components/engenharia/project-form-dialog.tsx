import { useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { formatCurrency } from "@rlpapp/shared";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getErrorMessage, runWithToast } from "@/lib/errors";

interface ProjectInput {
  _id: Id<"projects">;
  name: string;
  legacyNumber?: number | null;
  customerId?: Id<"customers"> | null;
  customerName?: string | null;
}

const DIRECTION_LABELS = {
  client_sale: "Venda",
  contractor_hire: "Contratação",
} as const;

export function ProjectFormDialog({
  project,
  trigger,
}: {
  project?: ProjectInput;
  trigger: ReactNode;
}) {
  const navigate = useNavigate();
  const createProjectWithOptionalContract = useMutation(
    api.projects.createWithOptionalContract
  );
  const updateProject = useMutation(api.projects.update);
  const customers = useQuery(api.customers.list, { activeOnly: true });
  const isEdit = Boolean(project);
  const currentCustomerMissing =
    customers !== undefined &&
    Boolean(project?.customerId) &&
    !customers.some((customer) => customer._id === project?.customerId);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState(project?.name ?? "");
  const [legacyNumber, setLegacyNumber] = useState(
    project?.legacyNumber?.toString() ?? ""
  );
  const [customerId, setCustomerId] = useState<string>(
    project?.customerId ?? ""
  );
  const [contractId, setContractId] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const unassignedContracts = useQuery(
    api.contracts.listUnassignedOptions,
    open && !isEdit ? {} : "skip"
  );

  const customerItems = Object.fromEntries([
    ...(currentCustomerMissing && project?.customerId
      ? [
          [
            project.customerId,
            `${project.customerName ?? "Cliente atual indisponível"} (inativo)`,
          ] as const,
        ]
      : []),
    ...(customers ?? []).map((c) => [c._id, c.name] as const),
  ]);

  const contractItems = Object.fromEntries([
    ["__none__", "Nenhum (criar depois)"] as const,
    ...(unassignedContracts ?? []).map((contract) => {
      const counterparty =
        contract.direction === "client_sale"
          ? contract.customerName
          : contract.contractorName;
      const label = counterparty
        ? `${contract.title} · ${counterparty}`
        : contract.title;
      return [contract._id, label] as const;
    }),
  ]);

  function reset() {
    setName(project?.name ?? "");
    setLegacyNumber(project?.legacyNumber?.toString() ?? "");
    setCustomerId(project?.customerId ?? "");
    setContractId("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsedLegacyNumber = Number(legacyNumber);
    if (
      !name.trim() ||
      !customerId ||
      !Number.isSafeInteger(parsedLegacyNumber) ||
      parsedLegacyNumber <= 0
    ) {
      return;
    }

    const customerChanged =
      (customerId || null) !== (project?.customerId ?? null);

    setSaving(true);

    if (isEdit && project) {
      const ok = await runWithToast(
        () =>
          updateProject({
            projectId: project._id,
            name: name.trim(),
            legacyNumber: parsedLegacyNumber,
            ...(customerChanged
              ? { customerId: customerId as Id<"customers"> }
              : {}),
          }),
        "Obra atualizada",
        "Não foi possível atualizar a obra"
      );
      setSaving(false);
      if (ok) {
        setOpen(false);
      }
      return;
    }

    try {
      const { projectId, linkedContractId } =
        await createProjectWithOptionalContract({
          name: name.trim(),
          legacyNumber: parsedLegacyNumber,
          customerId: customerId as Id<"customers">,
          ...(contractId
            ? { contractId: contractId as Id<"contracts"> }
            : {}),
        });

      toast.success("Obra criada");
      setOpen(false);
      reset();

      void navigate({
        to: "/engenharia/obras/$obraSlug/contratos",
        params: { obraSlug: projectId },
        search: linkedContractId ? {} : { novo: true },
      });
    } catch (error) {
      toast.error(
        getErrorMessage(error, "Não foi possível criar a obra")
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) reset();
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar obra" : "Nova obra"}</DialogTitle>
          <DialogDescription>
            Só o essencial agora. Andares, prazos e o restante entram depois.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
            <div className="space-y-2">
              <Label htmlFor="project-name">Nome da obra</Label>
              <Input
                id="project-name"
                placeholder="Ex: Edifício Lorena"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="project-number">Número da obra</Label>
              <Input
                id="project-number"
                type="number"
                min={1}
                step={1}
                placeholder="Ex: 1821"
                value={legacyNumber}
                onChange={(e) => setLegacyNumber(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="project-customer">Cliente</Label>
            <Select
              value={customerId || undefined}
              items={customerItems}
              onValueChange={setCustomerId}
              required
            >
              <SelectTrigger
                id="project-customer"
                className="w-full bg-transparent [&>span]:min-w-0 [&>span]:flex-1 [&>span]:truncate"
              >
                <SelectValue placeholder="Selecione um cliente" />
              </SelectTrigger>
              <SelectContent>
                {currentCustomerMissing && project?.customerId && (
                  <SelectItem value={project.customerId} disabled>
                    {project.customerName ?? "Cliente atual indisponível"}{" "}
                    (inativo)
                  </SelectItem>
                )}
                {(customers ?? []).map((c) => (
                  <SelectItem key={c._id} value={c._id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!isEdit && (unassignedContracts?.length ?? 0) > 0 && (
            <div className="space-y-2">
              <Label htmlFor="project-contract">Contrato existente</Label>
              <Select
                value={contractId || "__none__"}
                items={contractItems}
                onValueChange={(value) =>
                  setContractId(value === "__none__" ? "" : value)
                }
              >
                <SelectTrigger
                  id="project-contract"
                  className="w-full bg-transparent [&>span]:min-w-0 [&>span]:flex-1 [&>span]:truncate"
                >
                  <SelectValue placeholder="Nenhum (criar depois)" />
                </SelectTrigger>
                <SelectContent className="min-w-[var(--anchor-width)]">
                  <SelectItem value="__none__">Nenhum (criar depois)</SelectItem>
                  {(unassignedContracts ?? []).map((contract) => {
                    const counterparty =
                      contract.direction === "client_sale"
                        ? contract.customerName
                        : contract.contractorName;
                    return (
                      <SelectItem
                        key={contract._id}
                        value={contract._id}
                        className="items-start py-2"
                      >
                        <span className="flex min-w-0 flex-col gap-0.5">
                          <span className="truncate font-medium leading-tight">
                            {contract.title}
                          </span>
                          <span className="text-muted-foreground truncate text-xs leading-tight">
                            {[
                              counterparty,
                              DIRECTION_LABELS[contract.direction],
                              formatCurrency(contract.valueCents),
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={
                saving ||
                !name.trim() ||
                !customerId ||
                !Number.isSafeInteger(Number(legacyNumber)) ||
                Number(legacyNumber) <= 0
              }
            >
              {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
              {isEdit ? "Salvar alterações" : "Criar obra"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
