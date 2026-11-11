import { useLocalSearchParams, useRouter } from "expo-router";

import { QrScannerView } from "@/components/campo/qr-scanner-view";

/** Leitor de QR dentro da obra: a etiqueta lida abre no contexto dela. */
export default function ObraScannerScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const router = useRouter();

  return (
    <QrScannerView
      onToken={(token) =>
        router.replace({
          pathname: "/campo/obra/[projectId]/equipamento/[token]",
          params: { projectId: projectId!, token },
        })
      }
      onClose={() => router.back()}
    />
  );
}
