import { WifiOff } from "lucide-react-native";
import type { StyleProp, ViewStyle } from "react-native";

import { Banner } from "@/components/ui";
import { tone } from "@/lib/theme";
import { useOnline } from "@/lib/use-online";

/** Aviso fixo quando o aparelho está sem conexão. */
export function OfflineBanner({ detail, style }: { detail?: string; style?: StyleProp<ViewStyle> }) {
  const online = useOnline();
  if (online) return null;
  return (
    <Banner
      tone="warning"
      icon={<WifiOff size={20} color={tone.warning.fg} strokeWidth={2} />}
      title="Sem conexão"
      detail={detail}
      style={style}
    />
  );
}
