import { useIsFocused, useRouter } from "expo-router";
import { View } from "react-native";

import { QrScannerView } from "@/components/campo/qr-scanner-view";
import { colors } from "@/lib/theme";

/** Aba Escanear do técnico (ficha C3): leitor em tela cheia. */
export default function CampoEscanearScreen() {
  const router = useRouter();
  const focused = useIsFocused();
  if (!focused) return <View style={{ flex: 1, backgroundColor: colors.text }} />;
  return (
    <QrScannerView
      onToken={(token) => router.push({ pathname: "/equipamento/[token]", params: { token } })}
      onClose={() => router.navigate("/campo")}
    />
  );
}
