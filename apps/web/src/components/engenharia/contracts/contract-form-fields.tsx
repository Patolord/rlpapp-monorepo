import { api } from "@rlpapp/backend/convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { formatCurrency } from "@rlpapp/shared";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type { ContractDirection, ContractKind } from "./contract-form-dialog";

type ProjectOption = FunctionReturnType<typeof api.projects.list>[number];
type CustomerOption = FunctionReturnType<typeof api.customers.list>[number];
type ContractorOption = FunctionReturnType<typeof api.contractors.list>[number];
type BaseContractOption = FunctionReturnType<
  typeof api.contracts.listBaseOptions
>[number];

const DIRECTION_LABELS: Record<ContractDirection, string> = {
  client_sale: "Venda ao cliente",
  contractor_hire: "Contratação de empreiteiro",
};

const KIND_LABELS: Record<ContractKind, string> = {
  base: "Contrato base",
  addendum: "Aditivo",
};

const selectTriggerClassName =
  "w-full bg-transparent [&>span]:min-w-0 [&>span]:flex-1 [&>span]:truncate";

export function ContractDirectionField({
  value,
  onChange,
}: {
  value: ContractDirection;
  onChange: (next: ContractDirection) => void;
}) {
  const directionItems = DIRECTION_LABELS;
  return (
    <div className="space-y-2">
      <Label>Direção</Label>
      <Select
        value={value}
        items={directionItems}
        onValueChange={(next) => onChange(next as ContractDirection)}
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
  );
}

export function ContractKindField({
  value,
  onChange,
}: {
  value: ContractKind;
  onChange: (next: ContractKind) => void;
}) {
  const kindItems = KIND_LABELS;
  return (
    <div className="space-y-2">
      <Label>Tipo</Label>
      <Select
        value={value}
        items={kindItems}
        onValueChange={(next) => onChange(next as ContractKind)}
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
  );
}

export function ContractProjectField({
  projectId,
  projects,
  onChange,
}: {
  projectId: string;
  projects: ProjectOption[] | undefined;
  onChange: (projectId: string) => void;
}) {
  const projectItems = Object.fromEntries([
    ["__none__", "Sem obra"] as const,
    ...(projects ?? []).map((project) => {
      const label = project.legacyNumber
        ? `#${project.legacyNumber} · ${project.name}`
        : project.name;
      return [project._id, label] as const;
    }),
  ]);

  return (
    <div className="space-y-2">
      <Label>Obra (opcional)</Label>
      <Select
        value={projectId || "__none__"}
        items={projectItems}
        onValueChange={(value) => onChange(value === "__none__" ? "" : value)}
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
  );
}

export function ContractCustomerField({
  customerId,
  customers,
  currentCustomerName,
  onChange,
}: {
  customerId: string;
  customers: CustomerOption[] | undefined;
  /** Nome do cliente gravado no contrato, para quando ele está inativo. */
  currentCustomerName: string | null | undefined;
  onChange: (customerId: string) => void;
}) {
  const currentCustomerMissing =
    customers !== undefined &&
    Boolean(customerId) &&
    !customers.some((customer) => customer._id === customerId);

  const customerItems = Object.fromEntries([
    ...(currentCustomerMissing && customerId
      ? [
          [
            customerId,
            `${currentCustomerName ?? "Cliente atual indisponível"} (inativo)`,
          ] as const,
        ]
      : []),
    ...(customers ?? []).map((customer) => [customer._id, customer.name] as const),
  ]);

  return (
    <div className="space-y-2">
      <Label>Cliente</Label>
      <Select
        value={customerId || undefined}
        items={customerItems}
        onValueChange={onChange}
      >
        <SelectTrigger className={selectTriggerClassName}>
          <SelectValue placeholder="Selecione o cliente" />
        </SelectTrigger>
        <SelectContent>
          {currentCustomerMissing && customerId && (
            <SelectItem value={customerId} disabled>
              {currentCustomerName ?? "Cliente atual indisponível"}{" "}
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
  );
}

export function ContractContractorField({
  contractorId,
  contractors,
  currentContractorName,
  onChange,
}: {
  contractorId: string;
  contractors: ContractorOption[] | undefined;
  /** Nome do empreiteiro gravado no contrato, para quando ele está inativo. */
  currentContractorName: string | null | undefined;
  onChange: (contractorId: string) => void;
}) {
  const currentContractorMissing =
    contractors !== undefined &&
    Boolean(contractorId) &&
    !contractors.some((contractor) => contractor._id === contractorId);

  const contractorItems = Object.fromEntries([
    ...(currentContractorMissing && contractorId
      ? [
          [
            contractorId,
            `${currentContractorName ?? "Empreiteiro atual indisponível"} (inativo)`,
          ] as const,
        ]
      : []),
    ...(contractors ?? []).map(
      (contractor) => [contractor._id, contractor.name] as const
    ),
  ]);

  return (
    <div className="space-y-2">
      <Label>Empreiteiro</Label>
      <Select
        value={contractorId || undefined}
        items={contractorItems}
        onValueChange={onChange}
      >
        <SelectTrigger className={selectTriggerClassName}>
          <SelectValue placeholder="Selecione o empreiteiro" />
        </SelectTrigger>
        <SelectContent>
          {currentContractorMissing && contractorId && (
            <SelectItem value={contractorId} disabled>
              {currentContractorName ??
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
  );
}

export function ContractParentField({
  parentContractId,
  baseOptions,
  currentParentTitle,
  onChange,
}: {
  parentContractId: string;
  baseOptions: BaseContractOption[] | undefined;
  /** Título do contrato base gravado no aditivo, para quando ele não está mais nas opções. */
  currentParentTitle: string | null | undefined;
  onChange: (parentContractId: string) => void;
}) {
  const currentParentMissing =
    baseOptions !== undefined &&
    Boolean(parentContractId) &&
    !baseOptions.some((option) => option._id === parentContractId);

  const parentContractItems = Object.fromEntries([
    ...(currentParentMissing && parentContractId
      ? [
          [
            parentContractId,
            currentParentTitle ?? "Contrato base atual indisponível",
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

  return (
    <div className="space-y-2">
      <Label>Contrato base</Label>
      <Select
        value={parentContractId || undefined}
        items={parentContractItems}
        onValueChange={onChange}
      >
        <SelectTrigger className={selectTriggerClassName}>
          <SelectValue placeholder="Selecione o contrato base" />
        </SelectTrigger>
        <SelectContent className="min-w-[var(--anchor-width)]">
          {currentParentMissing && parentContractId && (
            <SelectItem value={parentContractId} disabled>
              {currentParentTitle ??
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
  );
}
