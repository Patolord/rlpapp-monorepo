import { Stack, useLocalSearchParams } from "expo-router";

import { EquipmentTokenView } from "@/components/campo/equipment-token-view";
import { useFieldObra } from "@/components/campo/obra";

/** Etiqueta aberta dentro de uma obra: cadastros novos ficam vinculados a ela. */
export default function ObraEquipamentoScreen() {
  const { projectId, token } = useLocalSearchParams<{
    projectId: string;
    token: string;
  }>();
  const obra = useFieldObra(projectId);
  const tokenStr = Array.isArray(token) ? token[0] : token;

  return (
    <>
      <Stack.Screen options={{ title: tokenStr ?? "Equipamento" }} />
      <EquipmentTokenView
        token={tokenStr ?? ""}
        project={obra ? { _id: obra._id, name: obra.name } : null}
      />
    </>
  );
}
