import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { Camera, ImagePlus, X } from "lucide-react-native";
import { useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { colors, control, radius, space, type } from "@/lib/theme";

interface PhotoPickerProps {
  uris: string[];
  onUrisChange: (uris: string[]) => void;
  label?: string;
}

/** Câmera ou galeria, com miniaturas removíveis. Permissão negada vira aviso no lugar. */
export function PhotoPicker({ uris, onUrisChange, label }: PhotoPickerProps) {
  const [denied, setDenied] = useState<null | "camera" | "library">(null);

  async function takePhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setDenied("camera");
      return;
    }
    setDenied(null);
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.6 });
    if (!result.canceled) onUrisChange([...uris, ...result.assets.map((a) => a.uri)]);
  }

  async function pickFromLibrary() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setDenied("library");
      return;
    }
    setDenied(null);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      quality: 0.6,
    });
    if (!result.canceled) onUrisChange([...uris, ...result.assets.map((a) => a.uri)]);
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.buttons}>
        <Pressable
          onPress={() => void takePhoto()}
          accessibilityRole="button"
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}
        >
          <Camera size={20} color={colors.text} />
          <Text style={styles.buttonText}>{label ?? "Câmera"}</Text>
        </Pressable>
        <Pressable
          onPress={() => void pickFromLibrary()}
          accessibilityRole="button"
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}
        >
          <ImagePlus size={20} color={colors.text} />
          <Text style={styles.buttonText}>Galeria</Text>
        </Pressable>
      </View>

      {denied ? (
        <Pressable onPress={() => void Linking.openSettings()} accessibilityRole="button">
          <Text style={styles.denied}>
            {denied === "camera" ? "A câmera está bloqueada para o app." : "As fotos estão bloqueadas para o app."}{" "}
            <Text style={styles.link}>Abrir ajustes do celular</Text>
          </Text>
        </Pressable>
      ) : null}

      {uris.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbs}>
          {uris.map((uri, index) => (
            <View key={uri}>
              <Image source={{ uri }} style={styles.thumb} contentFit="cover" />
              <Pressable
                onPress={() => onUrisChange(uris.filter((u) => u !== uri))}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`Remover foto ${index + 1}`}
                style={styles.remove}
              >
                <X size={14} color="#FFFFFF" />
              </Pressable>
            </View>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  buttons: { flexDirection: "row", gap: space.sm },
  button: {
    flex: 1,
    height: control.height,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.controlBorder,
    backgroundColor: colors.surface,
  },
  pressed: { backgroundColor: colors.surfacePressed },
  buttonText: { ...type.label, color: colors.text, fontWeight: "600" },
  denied: { ...type.bodySm, color: colors.destructive },
  link: { color: colors.primary, fontWeight: "600" },
  thumbs: { gap: space.sm, paddingTop: 6, paddingRight: 6 },
  thumb: { width: 88, height: 88, borderRadius: radius.sm },
  remove: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.destructive,
    alignItems: "center",
    justifyContent: "center",
  },
});
