import { api } from "@rlpapp/backend/convex/_generated/api";
import { useQuery } from "convex/react";
import { Clock } from "lucide-react-native";

import { toBrtDateKey } from "@/lib/brt-date";
import { colors } from "@/lib/theme";
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
  const context = useQuery(api.timeClockPunch.getContext, { date: toBrtDateKey(Date.now()) });
  // Sem conexão ou carregando: o atalho continua útil, só sem o estado do dia.
  if (context && !context.employee) return null;

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
