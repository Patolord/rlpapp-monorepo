import { CameraView, useCameraPermissions } from "expo-camera";
import { Camera, X } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppButton } from "@/components/ui";
import { colors, space, type } from "@/lib/theme";

export type PunchPhoto = {
  uri: string;
  capturedAt: number;
};

/**
 * Câmera frontal em tela cheia para a foto da marcação (como no RHID: a foto
 * vale por 5 minutos). Sem edição nem galeria: só captura ao vivo.
 */
export function PunchCamera({
  visible,
  onCapture,
  onClose,
}: {
  visible: boolean;
  onCapture: (photo: PunchPhoto) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [ready, setReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cameraRef = useRef<CameraView>(null);

  async function capture() {
    if (capturing || !cameraRef.current) return;
    setCapturing(true);
    try {
      const picture = await cameraRef.current.takePictureAsync({
        quality: 0.4,
        shutterSound: false,
      });
      if (picture?.uri) {
        onCapture({ uri: picture.uri, capturedAt: Date.now() });
      } else {
        setError("Não foi possível capturar a foto. Tente novamente.");
      }
    } catch (err) {
      console.warn("takePictureAsync failed", err);
      setError("Não foi possível capturar a foto. Tente novamente.");
    } finally {
      setCapturing(false);
    }
  }

  // O Modal desmonta a câmera ao fechar: o obturador volta a esperar onCameraReady.
  useEffect(() => {
    if (!visible) {
      setReady(false);
      setCapturing(false);
      setError(null);
    }
  }, [visible]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      {!permission ? (
        <View style={styles.black} />
      ) : !permission.granted ? (
        <View style={styles.permission}>
          <Camera size={36} color={colors.primary} />
          <Text style={[type.body, { color: colors.text, textAlign: "center" }]}>
            Precisamos da câmera para a foto da marcação de ponto.
          </Text>
          <AppButton label="Permitir câmera" onPress={() => void requestPermission()} />
          <AppButton label="Voltar" variant="ghost" onPress={onClose} trailing={null} />
        </View>
      ) : (
        <View style={styles.black}>
          <CameraView
            ref={cameraRef}
            style={{ flex: 1 }}
            facing="front"
            mirror
            onCameraReady={() => setReady(true)}
          />
          <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
            <View style={styles.frameWrap} pointerEvents="none">
              <View style={styles.frame} />
              <Text style={styles.hint}>{error ?? "Enquadre seu rosto e toque no botão"}</Text>
            </View>
            <View style={[styles.shutterRow, { paddingBottom: insets.bottom + space.xl }]}>
              <Pressable
                onPress={() => void capture()}
                disabled={!ready || capturing}
                accessibilityRole="button"
                accessibilityLabel="Capturar foto"
                style={({ pressed }) => [
                  styles.shutter,
                  { opacity: !ready || capturing ? 0.5 : pressed ? 0.8 : 1 },
                ]}
              >
                {capturing ? (
                  <ActivityIndicator color={colors.navy} />
                ) : (
                  <Camera size={30} color={colors.navy} />
                )}
              </Pressable>
            </View>
          </View>
          <Pressable
            onPress={onClose}
            style={[styles.close, { top: insets.top + 8 }]}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Fechar câmera"
          >
            <X size={22} color="#ffffff" />
          </Pressable>
        </View>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  black: { flex: 1, backgroundColor: "#000" },
  permission: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: space.lg,
    paddingHorizontal: space.xl,
    backgroundColor: colors.bg,
  },
  frameWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: space.lg },
  frame: {
    width: 240,
    height: 300,
    borderRadius: 140,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.85)",
  },
  hint: { color: "#fff", fontSize: 15, textAlign: "center", paddingHorizontal: space.xl },
  shutterRow: { alignItems: "center" },
  shutter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 4,
    borderColor: "rgba(255,255,255,0.5)",
  },
  close: {
    position: "absolute",
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
});
