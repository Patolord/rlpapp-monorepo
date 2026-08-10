import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Loader2 } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Alert, View } from "react-native";

import { Button, ButtonText } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, type SelectOption } from "@/components/ui/select";
import { getErrorMessage } from "@/lib/errors";

interface ProjectInput {
  _id: Id<"projects">;
  name: string;
  legacyNumber?: number | null;
  customerId?: Id<"customers"> | null;
  customerName?: string | null;
}

export function ProjectFormDialog({
  open,
  onClose,
  project,
}: {
  open: boolean;
  onClose: () => void;
  project?: ProjectInput;
}) {
  const createProject = useMutation(api.projects.create);
  const updateProject = useMutation(api.projects.update);
  const customers = useQuery(api.customers.list, { activeOnly: true });
  const isEdit = Boolean(project);
  const customerOptions: SelectOption[] = (customers ?? []).map((customer) => ({
    value: customer._id,
    label: customer.name,
  }));
  if (
    customers !== undefined &&
    project?.customerId &&
    !customers.some((customer) => customer._id === project.customerId)
  ) {
    customerOptions.unshift({
      value: project.customerId,
      label: `${project.customerName ?? "Cliente atual indisponível"} (inativo)`,
      disabled: true,
    });
  }

  const [name, setName] = useState(project?.name ?? "");
  const [legacyNumber, setLegacyNumber] = useState(
    project?.legacyNumber?.toString() ?? ""
  );
  const [customerId, setCustomerId] = useState<string>(
    project?.customerId ?? ""
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(project?.name ?? "");
      setLegacyNumber(project?.legacyNumber?.toString() ?? "");
      setCustomerId(project?.customerId ?? "");
    }
  }, [open, project]);

  async function handleSubmit() {
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
    try {
      if (isEdit && project) {
        await updateProject({
          projectId: project._id,
          name: name.trim(),
          ...(customerChanged
            ? { customerId: customerId as Id<"customers"> }
            : {}),
          legacyNumber: parsedLegacyNumber,
        });
      } else {
        await createProject({
          name: name.trim(),
          customerId: customerId as Id<"customers">,
          legacyNumber: parsedLegacyNumber,
        });
      }
      onClose();
    } catch (err) {
      Alert.alert(
        "Erro",
        getErrorMessage(
          err,
          isEdit
            ? "Não foi possível atualizar a obra"
            : "Não foi possível criar a obra"
        )
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogHeader>
        <DialogTitle>{isEdit ? "Editar obra" : "Nova obra"}</DialogTitle>
        <DialogDescription>
          Só o essencial agora. Andares, prazos e o restante entram depois.
        </DialogDescription>
      </DialogHeader>

      <View className="gap-5">
        <View className="gap-2">
          <Label>Nome da obra</Label>
          <Input
            placeholder="Ex: Edifício Lorena"
            value={name}
            onChangeText={setName}
            className="h-12"
          />
        </View>

        <View className="gap-2">
          <Label>Número da obra</Label>
          <Input
            placeholder="Ex: 1821"
            value={legacyNumber}
            onChangeText={setLegacyNumber}
            keyboardType="number-pad"
            className="h-12"
          />
        </View>

        <View className="gap-2">
          <Label>Cliente</Label>
          <Select
            value={customerId}
            onValueChange={setCustomerId}
            options={customerOptions}
            placeholder="Selecione um cliente"
            className="h-12"
          />
        </View>
      </View>

      <DialogFooter>
        <Button variant="outline" onPress={onClose}>
          <ButtonText variant="outline">Cancelar</ButtonText>
        </Button>
        <Button
          disabled={
            saving ||
            !name.trim() ||
            !customerId ||
            !Number.isSafeInteger(Number(legacyNumber)) ||
            Number(legacyNumber) <= 0
          }
          onPress={handleSubmit}
        >
          {saving && <Loader2 size={16} color="#fafafa" />}
          <ButtonText className={saving ? "ml-1.5" : ""}>
            {isEdit ? "Salvar" : "Criar obra"}
          </ButtonText>
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
