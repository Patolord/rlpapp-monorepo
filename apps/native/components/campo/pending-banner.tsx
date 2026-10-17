import { ChevronRight, CloudUpload, WifiOff } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { Card } from "@/components/ui/card";
import { useOnline } from "@/lib/use-online";
import { usePendingCount } from "@/lib/use-pending-records";

/** Aviso de registros feitos sem internet ainda não enviados. */
export function PendingBanner({ onPress }: { onPress: () => void }) {
  const count = usePendingCount();
  const online = useOnline();
  if (count === 0) return null;

  return (
    <Pressable onPress={onPress} accessibilityRole="button">
      <Card className="flex-row items-center gap-3 border border-yellow-500/30 bg-yellow-50 p-4">
        {online ? (
          <CloudUpload size={20} color="#d97706" />
        ) : (
          <WifiOff size={20} color="#d97706" />
        )}
        <View className="min-w-0 flex-1">
          <Text className="font-medium text-yellow-800">
            {count} {count === 1 ? "registro pendente" : "registros pendentes"}
          </Text>
          <Text className="text-xs text-yellow-700">
            {online
              ? "Aguardando envio. Toque para ver."
              : "Aguardando conexão para enviar. Toque para ver."}
          </Text>
        </View>
        <ChevronRight size={16} color="#d97706" />
      </Card>
    </Pressable>
  );
}
