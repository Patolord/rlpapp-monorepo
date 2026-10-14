import { CameraView, useCameraPermissions } from "expo-camera";
import { X } from "lucide-react-native";
import { useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button, ButtonText } from "@/components/ui/button";
import { parseQrToken } from "@/lib/qr-token";

interface QrScannerViewProps {
  /** Chamado uma única vez, com o token já extraído da leitura. */
  onToken: (token: string) => void;
  onClose: () => void;
  hint?: string;
}

/** Leitor de QR em tela cheia. Ignora leituras repetidas após a primeira. */
export function QrScannerView({ onToken, onClose, hint }: QrScannerViewProps) {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const handledRef = useRef(false);

  function handleScanned(value: string) {
    if (handledRef.current) return;
    handledRef.current = true;
    setScanned(true);
    onToken(parseQrToken(value));
  }

  if (!permission) {
    return <View className="flex-1 bg-black" />;
  }

  if (!permission.granted) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-background px-8">
        <Text className="text-center text-base text-foreground">
          Precisamos de acesso à câmera para ler os QR codes dos equipamentos.
        </Text>
        <Button onPress={() => void requestPermission()}>
          <ButtonText>Permitir câmera</ButtonText>
        </Button>
        <Button variant="ghost" onPress={onClose}>
          <ButtonText variant="ghost">Voltar</ButtonText>
        </Button>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-black">
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
          {hint ?? "Aponte a câmera para o QR code do equipamento"}
        </Text>
      </View>

      <Pressable
        onPress={onClose}
        style={{ position: "absolute", top: insets.top + 8, right: 16 }}
        className="h-10 w-10 items-center justify-center rounded-full bg-black/50"
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Fechar leitor"
      >
        <X size={22} color="#ffffff" />
      </Pressable>
    </View>
  );
}
