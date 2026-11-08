import { CameraView, useCameraPermissions } from "expo-camera";
import * as Haptics from "expo-haptics";
import { Camera, Flashlight, FlashlightOff, X } from "lucide-react-native";
import { useRef, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppButton, Field, Sheet } from "@/components/ui";
import { normalizeTypedToken, parseQrToken } from "@/lib/qr-token";
import { colors, radius, space, type } from "@/lib/theme";

interface QrScannerViewProps {
  /** Chamado uma única vez, com o token já extraído da leitura. */
  onToken: (token: string) => void;
  onClose: () => void;
  hint?: string;
  /** "Digitar código" embaixo do leitor (padrão: ligado). */
  allowTyping?: boolean;
}

/** Leitor de QR em tela cheia (ficha C3), com lanterna (decisão 14). */
export function QrScannerView({ onToken, onClose, hint, allowTyping = true }: QrScannerViewProps) {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [torch, setTorch] = useState(false);
  const [typing, setTyping] = useState(false);
  const [code, setCode] = useState("");
  const handledRef = useRef(false);
  const onTypeCode = allowTyping ? () => setTyping(true) : undefined;

  function submitCode() {
    const token = normalizeTypedToken(code);
    if (!token) return;
    handledRef.current = true;
    setTyping(false);
    onToken(token);
  }

  const typeSheet = (
    <Sheet
      open={typing}
      onClose={() => setTyping(false)}
      title="Digitar código"
      subtitle="O código fica embaixo do QR, na etiqueta."
      footer={<AppButton label="Abrir etiqueta" block disabled={!normalizeTypedToken(code)} onPress={submitCode} />}
    >
      <Field
        label="Código da etiqueta"
        value={code}
        onChangeText={setCode}
        autoCapitalize="characters"
        autoCorrect={false}
        autoFocus
        returnKeyType="go"
        onSubmitEditing={submitCode}
      />
    </Sheet>
  );

  function handleScanned(value: string) {
    if (handledRef.current) return;
    handledRef.current = true;
    setScanned(true);
    // Confirma a leitura no tato, sem atrasar a navegação.
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {
      // Falha no haptic não deve afetar a leitura.
    });
    onToken(parseQrToken(value));
  }

  if (!permission) {
    return <View style={styles.black} />;
  }

  if (!permission.granted) {
    const blocked = !permission.canAskAgain;
    return (
      <View style={[styles.permission, { paddingTop: insets.top + space.xl }]}>
        <View style={styles.permissionIcon}>
          <Camera size={28} color={colors.primary} />
        </View>
        <Text style={[type.title, styles.center]}>Câmera para ler as etiquetas</Text>
        <Text style={[type.body, styles.center, { color: colors.textSecondaryOnBg }]}>
          {blocked
            ? "A câmera está bloqueada para o app. Libere nos ajustes do celular para escanear os QR codes."
            : "O app usa a câmera só para ler o QR code das etiquetas dos equipamentos."}
        </Text>
        <View style={styles.permissionActions}>
          {blocked ? (
            <AppButton label="Abrir ajustes do celular" block onPress={() => void Linking.openSettings()} />
          ) : (
            <AppButton label="Permitir câmera" block onPress={() => void requestPermission()} />
          )}
          {onTypeCode ? <AppButton label="Digitar código" variant="secondary" block onPress={onTypeCode} /> : null}
          <AppButton label="Voltar" variant="ghost" block onPress={onClose} />
        </View>
        {typeSheet}
      </View>
    );
  }

  return (
    <View style={styles.black}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        enableTorch={torch}
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={scanned ? undefined : (result) => handleScanned(result.data)}
      />

      <View pointerEvents="none" style={styles.overlay}>
        <View style={styles.frame} />
        <Text style={styles.hint}>{hint ?? "Aponte a câmera para o QR code da etiqueta"}</Text>
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

      {onTypeCode ? (
        <View style={[styles.bottom, { paddingBottom: insets.bottom + space.lg }]}>
          <Pressable onPress={onTypeCode} accessibilityRole="button" style={styles.typeCode}>
            <Text style={[type.bodyStrong, { color: colors.text }]}>Digitar código</Text>
          </Pressable>
        </View>
      ) : null}
      {typeSheet}
    </View>
  );
}

const styles = StyleSheet.create({
  black: { flex: 1, backgroundColor: "#000000" },
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  frame: { width: 248, height: 248, borderRadius: radius.lg, borderWidth: 3, borderColor: "rgba(255,255,255,0.9)" },
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
  bottom: { position: "absolute", left: 0, right: 0, bottom: 0, alignItems: "center" },
  typeCode: {
    height: 48,
    paddingHorizontal: space.xxl,
    borderRadius: radius.sm,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
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
