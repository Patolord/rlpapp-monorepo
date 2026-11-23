import { api } from "@rlpapp/backend/convex/_generated/api";
import { PUNCH_ROLE_LABEL } from "@rlpapp/shared/rh/pontoDay";
import { useQuery } from "convex/react";
import { Clock } from "lucide-react-native";

import { toBrtDateKey } from "@/lib/brt-date";
import { planPunch } from "@/lib/punch-plan";
import { colors } from "@/lib/theme";
import { useOnline } from "@/lib/use-online";
import { BigAction } from "./field-ui";

/**
 * Atalho do ponto na tela inicial: diz o que o próximo toque vai registrar
 * (pela leitura do dia, não pela quantidade de marcações). Some para quem não
 * marca ponto pelo app.
 */
export function PontoButton({ onPress }: { onPress: () => void }) {
  const online = useOnline();
  const now = Date.now();
  const context = useQuery(api.timeClockPunch.getContext, { date: toBrtDateKey(now) });
  // Com rede, só aparece depois de confirmar que o usuário marca ponto. Sem
  // rede a query não responde; o atalho fica (a marcação entra na fila offline).
  if (context ? !context.allowed : online) return null;

  const punches = context?.punches ?? [];
  const last = punches[punches.length - 1];
  const label = context ? planPunch(context, [], now).actionLabel : "Registrar ponto";

  return (
    <BigAction
      variant="outline"
      label={label}
      hint={last ? `${PUNCH_ROLE_LABEL[last.kind]} ${last.timeLabel}` : null}
      icon={<Clock size={34} color={colors.primary} strokeWidth={2} />}
      onPress={onPress}
      style={{ justifyContent: "flex-start" }}
    />
  );
}
