import { api } from "@rlpapp/backend/convex/_generated/api";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Loader2, Plus, Trash2 } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";

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

interface FloorDraft {
  number: number;
  label: string;
}

interface ProjectInput {
  _id: Id<"projects">;
  name: string;
  legacyNumber?: number | null;
  customerId?: Id<"customers"> | null;
  customerName?: string | null;
  floors: { number: number; label: string }[];
}

function defaultFloorLabel(n: number): string {
  return n === 0 ? "Térreo" : `${n}º Andar`;
}

function initialFloors(project?: ProjectInput): FloorDraft[] {
  if (project) {
    return project.floors
      .slice()
      .sort((a, b) => a.number - b.number)
      .map((f) => ({ number: f.number, label: f.label }));
  }
  return [{ number: 0, label: defaultFloorLabel(0) }];
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
  const [floors, setFloors] = useState<FloorDraft[]>(() =>
    initialFloors(project)
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(project?.name ?? "");
      setLegacyNumber(project?.legacyNumber?.toString() ?? "");
      setCustomerId(project?.customerId ?? "");
      setFloors(initialFloors(project));
    }
  }, [open, project]);

  function addFloor() {
    setFloors((prev) => {
      const nextNumber =
        prev.length === 0 ? 0 : Math.max(...prev.map((f) => f.number)) + 1;
      return [...prev, { number: nextNumber, label: defaultFloorLabel(nextNumber) }];
    });
  }

  function removeFloor(index: number) {
    setFloors((prev) => prev.filter((_, i) => i !== index));
  }

  function updateFloor(index: number, label: string) {
    setFloors((prev) =>
      prev.map((f, i) => (i === index ? { ...f, label } : f))
    );
  }

  async function handleSubmit() {
    const parsedLegacyNumber = Number(legacyNumber);
    if (
      !name.trim() ||
      !customerId ||
      !Number.isSafeInteger(parsedLegacyNumber) ||
      parsedLegacyNumber <= 0 ||
      floors.length === 0
    ) {
      return;
    }

    const payloadFloors = floors.map((f) => ({
      number: f.number,
      label: f.label.trim() || defaultFloorLabel(f.number),
    }));

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
          floors: payloadFloors,
        });
      } else {
        await createProject({
          name: name.trim(),
          customerId: customerId as Id<"customers">,
          legacyNumber: parsedLegacyNumber,
          floors: payloadFloors,
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
          Monte o prédio andar por andar. Cada andar recebe um nome.
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

        <View className="gap-2">
          <View className="flex-row items-center justify-between">
            <Label>Andares</Label>
            <Text className="text-sm text-muted-foreground">
              {floors.length} andar{floors.length === 1 ? "" : "es"}
            </Text>
          </View>

          <View className="gap-2">
            {floors.map((floor, index) => (
              <View key={index} className="flex-row items-center gap-2">
                <Input
                  value={floor.label}
                  onChangeText={(v) => updateFloor(index, v)}
                  placeholder={defaultFloorLabel(floor.number)}
                  className="h-12 flex-1"
                />
                <Pressable
                  onPress={() => removeFloor(index)}
                  disabled={floors.length === 1}
                  hitSlop={6}
                  className="h-12 w-12 items-center justify-center rounded-md"
                  style={{ opacity: floors.length === 1 ? 0.4 : 1 }}
                >
                  <Trash2 size={18} color="#ef4444" />
                </Pressable>
              </View>
            ))}
          </View>

          <Button variant="outline" className="w-full" onPress={addFloor}>
            <Plus size={16} color="#1a1a2e" />
            <ButtonText variant="outline" className="ml-1.5">
              Adicionar andar
            </ButtonText>
          </Button>
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
