import { CameraView, useCameraPermissions } from "expo-camera";
import * as Haptics from "expo-haptics";
import { Camera, Flashlight, FlashlightOff, X } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { Linking, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppButton } from "@/components/ui";
import { colors, radius, space, type } from "@/lib/theme";

// Códigos de produto (EAN/UPC), etiquetas logísticas (Code 128/39, ITF) e a
// etiqueta interna com o SKU (QR ou Code 128).
const BARCODE_TYPES = ["ean13", "ean8", "upc_a", "upc_e", "code128", "code39", "code93", "itf14", "codabar", "qr", "datamatrix"] as const;

/** Leitor de código de barras em tela cheia para o cadastro em campo. */
export function BarcodeScannerModal({
  open,
  onClose,
  onCode,
}: {
  open: boolean;
  onClose: () => void;
  onCode: (code: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const handled = useRef(false);

  useEffect(() => {
    if (open) handled.current = false;
    else setTorch(false);
  }, [open]);

  function handleScanned(value: string) {
    const code = value.trim();
    if (handled.current || !code) return;
    handled.current = true;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {
      // Falha no haptic não deve afetar a leitura.
    });
    onCode(code);
  }

  return (
    <Modal visible={open} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      {!permission ? (
        <View style={styles.black} />
      ) : !permission.granted ? (
        <View style={[styles.permission, { paddingTop: insets.top + space.xl }]}>
          <View style={styles.permissionIcon}>
            <Camera size={28} color={colors.primary} />
          </View>
          <Text style={[type.title, styles.center]}>Câmera para ler os códigos</Text>
          <Text style={[type.body, styles.center, { color: colors.textSecondaryOnBg }]}>
            {permission.canAskAgain
              ? "O app usa a câmera só para ler o código de barras ou a etiqueta do item."
              : "A câmera está bloqueada para o app. Libere nos ajustes do celular."}
          </Text>
          <View style={styles.permissionActions}>
            {permission.canAskAgain ? (
              <AppButton label="Permitir câmera" block onPress={() => void requestPermission()} />
            ) : (
              <AppButton label="Abrir ajustes do celular" block onPress={() => void Linking.openSettings()} />
            )}
            <AppButton label="Voltar" variant="ghost" block onPress={onClose} />
          </View>
        </View>
      ) : (
        <View style={styles.black}>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            enableTorch={torch}
            barcodeScannerSettings={{ barcodeTypes: [...BARCODE_TYPES] }}
            onBarcodeScanned={(result) => handleScanned(result.data)}
          />
          <View pointerEvents="none" style={styles.overlay}>
            <View style={styles.frame} />
            <Text style={styles.hint}>Aponte para o código de barras ou a etiqueta do item</Text>
          </View>
          <Pressable
            onPress={onClose}
            style={[styles.round, { top: insets.top + space.sm, left: space.lg }]}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Fechar leitor"
          >
            <X size={22} color="#FFFFFF" />
          </Pressable>
          <Pressable
            onPress={() => setTorch((on) => !on)}
            style={[styles.round, { top: insets.top + space.sm, right: space.lg }, torch && styles.roundOn]}
            hitSlop={8}
            accessibilityRole="switch"
            accessibilityState={{ checked: torch }}
            accessibilityLabel="Lanterna"
          >
            {torch ? <Flashlight size={22} color={colors.text} /> : <FlashlightOff size={22} color="#FFFFFF" />}
          </Pressable>
        </View>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  black: { flex: 1, backgroundColor: "#000000" },
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  frame: { width: 280, height: 180, borderRadius: radius.lg, borderWidth: 3, borderColor: "rgba(255,255,255,0.9)" },
  hint: { ...type.body, color: "#FFFFFF", textAlign: "center", marginTop: space.xl, paddingHorizontal: space.xxl },
  round: {
    position: "absolute",
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  roundOn: { backgroundColor: "#FFFFFF" },
  permission: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: space.xxl, alignItems: "center", gap: space.md },
  permissionIcon: {
    width: 64,
    height: 64,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    marginTop: space.xxl,
  },
  center: { textAlign: "center", color: colors.text },
  permissionActions: { alignSelf: "stretch", gap: space.sm, marginTop: space.lg },
});
