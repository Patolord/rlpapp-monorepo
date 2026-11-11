import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { Stack, useLocalSearchParams } from "expo-router";

import { EquipmentTokenView } from "@/components/campo/equipment-token-view";
import { useFieldObra } from "@/components/campo/obra";

/** Etiqueta aberta dentro de uma obra: cadastros novos ficam vinculados a ela. */
export default function ObraEquipamentoScreen() {
  const { projectId, token } = useLocalSearchParams<{
    projectId: string;
    token: string;
  }>();
  const projectIdStr = Array.isArray(projectId) ? projectId[0] : projectId;
  const obra = useFieldObra(projectIdStr);
  const tokenStr = Array.isArray(token) ? token[0] : token;
  const obraName = obra?.name?.trim() ? obra.name : "Obra";

  return (
    <>
      <Stack.Screen options={{ title: tokenStr ?? "Equipamento" }} />
      <EquipmentTokenView
        token={tokenStr ?? ""}
        project={
          projectIdStr
            ? { _id: projectIdStr as Id<"projects">, name: obraName }
            : null
        }
      />
    </>
  );
}
