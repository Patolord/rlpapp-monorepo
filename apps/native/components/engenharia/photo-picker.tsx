import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { Camera, ImagePlus, X } from "lucide-react-native";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";

interface PhotoPickerProps {
  uris: string[];
  onUrisChange: (uris: string[]) => void;
  label?: string;
}

export function PhotoPicker({ uris, onUrisChange, label }: PhotoPickerProps) {
  async function takePhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Permissão necessária",
        "Conceda acesso à câmera para registrar fotos."
      );
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.6,
    });
    if (!result.canceled) {
      onUrisChange([...uris, ...result.assets.map((a) => a.uri)]);
    }
  }

  async function pickFromLibrary() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Permissão necessária",
        "Conceda acesso às fotos para anexar imagens."
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      quality: 0.6,
    });
    if (!result.canceled) {
      onUrisChange([...uris, ...result.assets.map((a) => a.uri)]);
    }
  }

  function removePhoto(uri: string) {
    onUrisChange(uris.filter((u) => u !== uri));
  }

  return (
    <View className="gap-3">
      <View className="flex-row gap-2">
        <Pressable
          onPress={takePhoto}
          className="h-14 flex-1 flex-row items-center justify-center gap-2 rounded-md border border-input bg-card"
        >
          <Camera size={20} color="#1a1a2e" />
          <Text className="text-base font-medium text-foreground">
            {label ?? "Câmera"}
          </Text>
        </Pressable>
        <Pressable
          onPress={pickFromLibrary}
          className="h-14 flex-1 flex-row items-center justify-center gap-2 rounded-md border border-input bg-card"
        >
          <ImagePlus size={20} color="#1a1a2e" />
          <Text className="text-base font-medium text-foreground">Galeria</Text>
        </Pressable>
      </View>

      {uris.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View className="flex-row gap-2">
            {uris.map((uri) => (
              <View key={uri} className="relative">
                <Image
                  source={{ uri }}
                  style={{ width: 88, height: 88, borderRadius: 8 }}
                  contentFit="cover"
                />
                <Pressable
                  onPress={() => removePhoto(uri)}
                  hitSlop={8}
                  className="absolute -right-2 -top-2 h-6 w-6 items-center justify-center rounded-full bg-destructive"
                >
                  <X size={14} color="#fafafa" />
                </Pressable>
              </View>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
}
