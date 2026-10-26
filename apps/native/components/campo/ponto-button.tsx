import { api } from "@rlpapp/backend/convex/_generated/api";
import { useQuery } from "convex/react";
import { Clock } from "lucide-react-native";

import { toBrtDateKey } from "@/lib/brt-date";
import { colors } from "@/lib/theme";
import { useOnline } from "@/lib/use-online";
import { BigAction } from "./field-ui";

/** Próxima marcação do dia, pela quantidade de marcações já feitas. */
const NEXT_LABEL = ["Marcar entrada", "Marcar almoço", "Marcar volta", "Marcar saída"] as const;

const KIND_LABEL = {
  entrada: "Entrada",
  almoco_saida: "Almoço",
  almoco_retorno: "Volta",
  saida: "Saída",
} as const;

/** Atalho do ponto na tela inicial. Some para quem não é funcionário. */
export function PontoButton({ onPress }: { onPress: () => void }) {
  const online = useOnline();
  const context = useQuery(api.timeClockPunch.getContext, { date: toBrtDateKey(Date.now()) });
  // Com rede, só aparece depois de confirmar o funcionário. Sem rede a query
  // não responde; o atalho fica (a marcação entra na fila offline).
  if (context ? !context.employee : online) return null;

  const punches = context?.punches ?? [];
  const last = punches[punches.length - 1];
  const label = context
    ? (NEXT_LABEL[punches.length] ?? "Ponto do dia")
    : "Registrar ponto";

  return (
    <BigAction
      variant="outline"
      label={label}
      hint={last ? `${KIND_LABEL[last.kind]} ${last.timeLabel}` : null}
      icon={<Clock size={34} color={colors.primary} strokeWidth={2} />}
      onPress={onPress}
      style={{ justifyContent: "flex-start" }}
    />
  );
}
