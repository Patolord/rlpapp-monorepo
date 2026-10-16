import { Stack, useRouter } from "expo-router";

import { QrScannerView } from "@/components/campo/qr-scanner-view";

export default function ScannerScreen() {
  const router = useRouter();

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <QrScannerView
        onToken={(token) =>
          router.replace({ pathname: "/equipamento/[token]", params: { token } })
        }
        onClose={() => router.back()}
      />
    </>
  );
}
