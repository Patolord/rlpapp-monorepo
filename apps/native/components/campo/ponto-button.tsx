import { useAuth } from "@clerk/expo";
import { api } from "@rlpapp/backend/convex/_generated/api";
import { formatMinute, PUNCH_ROLE_LABEL } from "@rlpapp/shared/rh/pontoDay";
import { Clock } from "lucide-react-native";

import { toBrtDateKey } from "@/lib/brt-date";
import { planPunch, readToday } from "@/lib/punch-plan";
import { colors } from "@/lib/theme";
import { useCachedQuery } from "@/lib/use-cached-query";
import { useOnline } from "@/lib/use-online";
import { usePendingPunches } from "@/lib/use-pending-punches";
import { BigAction } from "./field-ui";

/**
 * Atalho do ponto na tela inicial: diz o que o próximo toque vai registrar
 * (pela leitura do dia, com a fila offline, igual à tela de marcação). Some
 * para quem não marca ponto pelo app.
 */
export function PontoButton({ onPress }: { onPress: () => void }) {
  const online = useOnline();
  const { userId } = useAuth();
  const now = Date.now();
  // Mesmo cache da tela de marcação: sem rede, vale o último contexto salvo.
  const context = useCachedQuery(
    userId ? `punch-context:${userId}` : null,
    api.timeClockPunch.getContext,
    { date: toBrtDateKey(now) }
  ).data;
  const pending = usePendingPunches(userId);
  // Com rede, só aparece depois de confirmar que o usuário marca ponto. Sem
  // rede e sem cache, o atalho fica (a marcação entra na fila offline).
  if (context ? !context.allowed : online) return null;

  const last = context ? readToday(context, pending, now).last : null;
  const label = context ? planPunch(context, pending, now).actionLabel : "Registrar ponto";

  return (
    <BigAction
      variant="outline"
      label={label}
      hint={last ? `${PUNCH_ROLE_LABEL[last.role]} ${formatMinute(last.minute)}` : null}
      icon={<Clock size={34} color={colors.primary} strokeWidth={2} />}
      onPress={onPress}
      style={{ justifyContent: "flex-start" }}
    />
  );
}
