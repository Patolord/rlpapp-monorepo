import { useState } from "react";
import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getErrorMessage } from "@/lib/errors";
import { formatCentsInput, parsePayrollAmountToCents } from "@/lib/rh/money";

import { CommitInput } from "./commit-input";
import { PAYMENT_METHOD_LABEL, type EmployeeSummary } from "./employee-form";

const emptyAlimonyForm = {
  beneficiaryName: "",
  amount: "",
  paymentMethod: "pix" as EmployeeSummary["paymentMethod"],
  pixKey: "",
};

/**
 * Pensão alimentícia: beneficiários pagos por conta deste funcionário. Cada
 * pensão vira uma linha própria na folha, separada da linha do funcionário.
 */
export function AlimonySection({ employee }: { employee: EmployeeSummary }) {
  const alimonies = useQuery(api.alimonies.listForEmployee, {
    employeeId: employee._id,
  });
  const createAlimony = useMutation(api.alimonies.create);
  const updateAlimony = useMutation(api.alimonies.update);
  const archiveAlimony = useMutation(api.alimonies.archive);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(emptyAlimonyForm);
  const [submitting, setSubmitting] = useState(false);

  function commit(
    alimonyId: Id<"employeeAlimonies">,
    patch: Omit<Parameters<typeof updateAlimony>[0], "alimonyId">
  ) {
    void updateAlimony({ alimonyId, ...patch }).catch((error) =>
      toast.error(getErrorMessage(error, "Erro ao atualizar pensão"))
    );
  }

  async function handleCreate() {
    if (!form.beneficiaryName.trim()) {
      toast.error("Informe o nome do beneficiário");
      return;
    }
    setSubmitting(true);
    try {
      await createAlimony({
        employeeId: employee._id,
        beneficiaryName: form.beneficiaryName,
        amountCents: parsePayrollAmountToCents(form.amount || "0"),
        paymentMethod: form.paymentMethod,
        pixKey: form.pixKey || undefined,
      });
      toast.success("Pensão cadastrada");
      setForm(emptyAlimonyForm);
      setAdding(false);
    } catch (error) {
      toast.error(getErrorMessage(error, "Erro ao cadastrar pensão"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid gap-2 rounded-md border p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
          Pensão alimentícia
        </p>
        {!adding ? (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Plus />
            Beneficiário
          </Button>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        Paga direto ao beneficiário, em linha própria da folha. Não entra nos
        descontos nem no total do funcionário. O valor aqui é o padrão; cada mês
        pode ter o seu.
      </p>
      {alimonies === undefined ? (
        <p className="text-xs text-muted-foreground">Carregando...</p>
      ) : alimonies.length === 0 && !adding ? (
        <p className="text-xs text-muted-foreground">Nenhuma pensão cadastrada.</p>
      ) : (
        <ul className="grid gap-2">
          {alimonies.map((alimony) => (
            <li
              key={alimony._id}
              className="grid gap-2 rounded-md bg-muted/40 p-2 sm:grid-cols-[1fr_110px_88px_auto]"
            >
              <CommitInput
                aria-label="Beneficiário"
                className="h-8"
                value={alimony.beneficiaryName}
                onCommit={(value) =>
                  commit(alimony._id, { beneficiaryName: value })
                }
              />
              <CommitInput
                aria-label="Valor padrão (R$)"
                className="h-8 text-right tabular-nums"
                value={formatCentsInput(alimony.amountCents)}
                onCommit={(value) =>
                  commit(alimony._id, {
                    amountCents: parsePayrollAmountToCents(value || "0"),
                  })
                }
              />
              <Select
                value={alimony.paymentMethod}
                onValueChange={(value) =>
                  commit(alimony._id, {
                    paymentMethod: value as EmployeeSummary["paymentMethod"],
                  })
                }
              >
                <SelectTrigger className="h-8" aria-label="Forma de pagamento">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["pix", "tbi", "other"] as const).map((method) => (
                    <SelectItem key={method} value={method}>
                      {PAYMENT_METHOD_LABEL[method]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="icon-sm"
                variant="ghost"
                className="text-muted-foreground hover:text-destructive"
                title="Encerrar pensão"
                aria-label="Encerrar pensão"
                onClick={() => {
                  if (
                    !confirm(
                      `Encerrar a pensão de ${alimony.beneficiaryName}? Ela sai das folhas em aberto e não entra nos próximos meses.`
                    )
                  ) {
                    return;
                  }
                  void archiveAlimony({ alimonyId: alimony._id })
                    .then(() => toast.success("Pensão encerrada"))
                    .catch((error) =>
                      toast.error(getErrorMessage(error, "Erro ao encerrar pensão"))
                    );
                }}
              >
                <Trash2 />
              </Button>
              <CommitInput
                aria-label="Chave PIX"
                placeholder="Chave PIX"
                className="h-8 sm:col-span-4"
                value={alimony.pixKey ?? ""}
                onCommit={(value) => commit(alimony._id, { pixKey: value || null })}
              />
            </li>
          ))}
        </ul>
      )}
      {adding ? (
        <div className="grid gap-2 rounded-md border border-dashed p-2">
          <div className="grid gap-2 sm:grid-cols-[1fr_110px_88px]">
            <Input
              aria-label="Nome do beneficiário"
              placeholder="Nome do beneficiário"
              className="h-8"
              value={form.beneficiaryName}
              onChange={(event) =>
                setForm({ ...form, beneficiaryName: event.target.value })
              }
            />
            <Input
              aria-label="Valor mensal (R$)"
              placeholder="Valor (R$)"
              className="h-8 text-right tabular-nums"
              value={form.amount}
              onChange={(event) => setForm({ ...form, amount: event.target.value })}
            />
            <Select
              value={form.paymentMethod}
              onValueChange={(value) =>
                setForm({
                  ...form,
                  paymentMethod: value as EmployeeSummary["paymentMethod"],
                })
              }
            >
              <SelectTrigger className="h-8" aria-label="Forma de pagamento">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(["pix", "tbi", "other"] as const).map((method) => (
                  <SelectItem key={method} value={method}>
                    {PAYMENT_METHOD_LABEL[method]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Input
            aria-label="Chave PIX do beneficiário"
            placeholder="Chave PIX do beneficiário"
            className="h-8"
            value={form.pixKey}
            onChange={(event) => setForm({ ...form, pixKey: event.target.value })}
          />
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setAdding(false);
                setForm(emptyAlimonyForm);
              }}
            >
              Cancelar
            </Button>
            <Button size="sm" disabled={submitting} onClick={() => void handleCreate()}>
              Cadastrar pensão
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
