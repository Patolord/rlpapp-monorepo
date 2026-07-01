import { CameraView, useCameraPermissions } from "expo-camera";
import { Stack, useRouter } from "expo-router";
import { X } from "lucide-react-native";
import { useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button, ButtonText } from "@/components/ui/button";

/** Extrai o token do QR. Aceita uma URL (.../q/TOKEN) ou o token puro. */
function parseToken(raw: string): string {
  const trimmed = raw.trim();
  const match = trimmed.match(/\/q\/([^/?#]+)/i);
  if (match?.[1]) return decodeURIComponent(match[1]);
  return trimmed;
}

export default function ScannerScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const handledRef = useRef(false);

  function handleScanned(value: string) {
    if (handledRef.current) return;
    handledRef.current = true;
    setScanned(true);
    const token = parseToken(value);
    router.replace({ pathname: "/equipamento/[token]", params: { token } });
  }

  if (!permission) {
    return <View className="flex-1 bg-black" />;
  }

  if (!permission.granted) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-background px-8">
        <Stack.Screen options={{ title: "Escanear QR" }} />
        <Text className="text-center text-base text-foreground">
          Precisamos de acesso à câmera para ler os QR codes dos equipamentos.
        </Text>
        <Button onPress={requestPermission}>
          <ButtonText>Permitir câmera</ButtonText>
        </Button>
        <Button variant="ghost" onPress={() => router.back()}>
          <ButtonText variant="ghost">Voltar</ButtonText>
        </Button>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-black">
      <Stack.Screen options={{ headerShown: false }} />
      <CameraView
        style={{ flex: 1 }}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={
          scanned ? undefined : (result) => handleScanned(result.data)
        }
      />

      <View
        pointerEvents="box-none"
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
        className="items-center justify-center"
      >
        <View className="h-64 w-64 rounded-3xl border-2 border-white/80" />
        <Text className="mt-6 px-8 text-center text-base text-white">
          Aponte a câmera para o QR code do equipamento
        </Text>
      </View>

      <Pressable
        onPress={() => router.back()}
        style={{ position: "absolute", top: insets.top + 8, right: 16 }}
        className="h-10 w-10 items-center justify-center rounded-full bg-black/50"
        hitSlop={8}
      >
        <X size={22} color="#ffffff" />
      </Pressable>
    </View>
  );
}
